"""Layout API. ``dimensions`` width/height/depth are in **feet** (same as the floor planner and 3D viewer)."""
import json
import logging
import os
import time

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from middleware.auth_middleware import token_required
from utils.file_manager import UPLOAD_ROOT
from utils.venue_auth import require_venue_access
from services.glb_export import generate_glb

logger = logging.getLogger(__name__)

layout_bp = Blueprint("layout", __name__)

TEXTURE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@layout_bp.route("/venue/<venue_id>/layout", methods=["GET"])
@token_required
def get_layout(current_user, venue_id: str):
    """Get the layout (dimensions in feet, walls, assets, materials) for a venue."""
    venue, err = require_venue_access(venue_id, current_user, require_owner=False)
    if err:
        return err[0], err[1]
    fs_venue = venue["venue_identifier"]
    try:
        layout_path = os.path.join(UPLOAD_ROOT, fs_venue, "layout.json")

        if os.path.exists(layout_path):
            with open(layout_path, "r") as f:
                layout_data = json.load(f)
            return (
                jsonify(
                    {
                        "status": "success",
                        "layout_file_exists": True,
                        "name": layout_data.get("name"),
                        "dimensions": layout_data.get("dimensions", {"width": 40, "height": 9, "depth": 40}),
                        "assets": layout_data.get("assets", []),
                        "polygon": layout_data.get("polygon"),
                        "walls": layout_data.get("walls"),
                        "materials": layout_data.get("materials"),
                        "lighting": layout_data.get("lighting", {"preset": "neutral"}),
                        "generated_glb": layout_data.get("generated_glb"),
                    }
                ),
                200,
            )
        else:
            return (
                jsonify(
                    {
                        "status": "success",
                        "layout_file_exists": False,
                        "name": None,
                        "dimensions": {"width": 40, "height": 9, "depth": 40},
                        "assets": [],
                        "polygon": None,
                        "walls": None,
                        "materials": {"floor": {"type": "carpet", "color": "#cccccc"}, "ceiling": {"type": "plain"}},
                        "lighting": {"preset": "neutral"},
                        "generated_glb": None,
                    }
                ),
                200,
            )

    except Exception as e:
        logger.error(f"Error getting layout: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@layout_bp.route("/venue/<venue_id>/layout", methods=["POST"])
@token_required
def save_layout(current_user, venue_id: str):
    """
    Save the layout (dimensions, walls, materials, assets) for a venue.
    Expects JSON body with:
        - name: venue name
        - dimensions: {width, height, depth} in feet
        - assets: array of asset objects
        - polygon: array of points (optional)
        - walls: array of walls (optional, supports curved metadata)
        - materials: {floor: {type, color}, ceiling: {type, color?}}
    """
    venue, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    fs_venue = venue["venue_identifier"]
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "Missing layout data."}), 400

        name = data.get("name")
        dimensions = data.get("dimensions", {"width": 40, "height": 9, "depth": 40})
        assets = data.get("assets", [])
        polygon = data.get("polygon")
        walls = data.get("walls")
        materials = data.get(
            "materials",
            {"floor": {"type": "carpet", "color": "#cccccc"}, "ceiling": {"type": "plain"}},
        )
        lighting = data.get("lighting", {"preset": "neutral"})

        venue_dir = os.path.join(UPLOAD_ROOT, fs_venue)
        os.makedirs(venue_dir, exist_ok=True)

        layout_path = os.path.join(venue_dir, "layout.json")
        layout_data = {
            "name": name,
            "dimensions": dimensions,
            "assets": assets,
            "polygon": polygon,
            "walls": walls,
            "materials": materials,
            "lighting": lighting,
            # Preserve previous generated_glb if exists
            "generated_glb": data.get("generated_glb"),
        }

        # If a previous layout exists, preserve generated_glb unless explicitly overridden
        if os.path.exists(layout_path):
            try:
                with open(layout_path, "r") as f:
                    prev = json.load(f)
                if layout_data.get("generated_glb") is None:
                    layout_data["generated_glb"] = prev.get("generated_glb")
            except Exception:
                pass

        with open(layout_path, "w") as f:
            json.dump(layout_data, f, indent=2)

        return jsonify({"status": "success", "message": "Layout saved successfully."}), 200

    except Exception as e:
        logger.error(f"Error saving layout: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@layout_bp.route("/venue/<venue_id>/texture-sample", methods=["POST"])
@token_required
def upload_texture_sample(current_user, venue_id: str):
    """Upload a venue-scoped floor/ceiling texture sample and return a material value."""
    venue, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    fs_venue = venue["venue_identifier"]

    file = request.files.get("file")
    layer = (request.form.get("layer") or "ceiling").strip().lower()
    if layer not in ("floor", "ceiling"):
        return jsonify({"status": "error", "message": "layer must be floor or ceiling"}), 400
    if not file:
        return jsonify({"status": "error", "message": "Missing texture image."}), 400

    original_name = secure_filename(file.filename or "texture.jpg")
    _, ext = os.path.splitext(original_name)
    ext = ext.lower()
    if ext not in TEXTURE_EXTENSIONS:
        return jsonify({"status": "error", "message": "Use a JPG, PNG, or WebP image."}), 400

    try:
        texture_dir = os.path.join(UPLOAD_ROOT, fs_venue, "textures", layer)
        os.makedirs(texture_dir, exist_ok=True)
        stem = os.path.splitext(original_name)[0] or "texture"
        filename = secure_filename(f"{stem}_{int(time.time())}{ext}")
        output_path = os.path.join(texture_dir, filename)
        file.save(output_path)

        rel_path = f"{fs_venue}/textures/{layer}/{filename}"
        return jsonify({
            "status": "success",
            "message": "Texture sample uploaded.",
            "layer": layer,
            "filename": filename,
            "url": f"/static/uploads/{rel_path}",
            "texture_value": f"texture-upload:{rel_path}",
        }), 200
    except Exception as e:
        logger.error("Error uploading texture sample: %s", e, exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


@layout_bp.route("/venue/<venue_id>/generate-glb", methods=["POST"])
@token_required
def generate_glb_endpoint(current_user, venue_id: str):
    """
    Generate a simple GLB for the venue using saved dimensions/walls/materials.
    """
    venue, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    fs_venue = venue["venue_identifier"]
    try:
        venue_dir = os.path.join(UPLOAD_ROOT, fs_venue)
        os.makedirs(venue_dir, exist_ok=True)
        layout_path = os.path.join(venue_dir, "layout.json")
        layout_data = {}
        if os.path.exists(layout_path):
            try:
                with open(layout_path, "r") as f:
                    layout_data = json.load(f)
            except Exception:
                layout_data = {}
        else:
            return jsonify({"status": "error", "message": "No layout saved yet."}), 400

        dims = layout_data.get("dimensions", {"width": 40, "height": 9, "depth": 40})
        walls = layout_data.get("walls", [])
        materials = layout_data.get("materials", {})
        glb_path = generate_glb(venue_dir, dims, walls=walls, materials=materials)

        layout_data["generated_glb"] = f"/static/uploads/{fs_venue}/venue.glb"
        with open(layout_path, "w") as f:
            json.dump(layout_data, f, indent=2)

        return jsonify({"status": "success", "glb": layout_data["generated_glb"]}), 200
    except Exception as e:
        logger.error(f"Error generating GLB: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

