import json
import logging
import os

from flask import Blueprint, jsonify, request

from utils.file_manager import UPLOAD_ROOT

logger = logging.getLogger(__name__)

layout_bp = Blueprint("layout", __name__)


@layout_bp.route("/venue/<venue_id>/layout", methods=["GET"])
def get_layout(venue_id: str):
    """Get the layout (dimensions, walls, assets, materials) for a venue."""
    try:
        layout_path = os.path.join(UPLOAD_ROOT, venue_id, "layout.json")

        if os.path.exists(layout_path):
            with open(layout_path, "r") as f:
                layout_data = json.load(f)
            return (
                jsonify(
                    {
                        "status": "success",
                        "name": layout_data.get("name"),
                        "dimensions": layout_data.get("dimensions", {"width": 20, "height": 8, "depth": 20}),
                        "assets": layout_data.get("assets", []),
                        "polygon": layout_data.get("polygon"),
                        "walls": layout_data.get("walls"),
                        "materials": layout_data.get("materials"),
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
                        "name": None,
                        "dimensions": {"width": 20, "height": 8, "depth": 20},
                        "assets": [],
                        "polygon": None,
                        "walls": None,
                        "materials": {"floor": {"type": "carpet", "color": "#cccccc"}, "ceiling": {"type": "plain"}},
                        "generated_glb": None,
                    }
                ),
                200,
            )

    except Exception as e:
        logger.error(f"Error getting layout: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@layout_bp.route("/venue/<venue_id>/layout", methods=["POST"])
def save_layout(venue_id: str):
    """
    Save the layout (dimensions, walls, materials, assets) for a venue.
    Expects JSON body with:
        - name: venue name
        - dimensions: {width, height, depth}
        - assets: array of asset objects
        - polygon: array of points (optional)
        - walls: array of walls (optional, supports curved metadata)
        - materials: {floor: {type, color}, ceiling: {type, color?}}
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "Missing layout data."}), 400

        name = data.get("name")
        dimensions = data.get("dimensions", {"width": 20, "height": 8, "depth": 20})
        assets = data.get("assets", [])
        polygon = data.get("polygon")
        walls = data.get("walls")
        materials = data.get(
            "materials",
            {"floor": {"type": "carpet", "color": "#cccccc"}, "ceiling": {"type": "plain"}},
        )

        venue_dir = os.path.join(UPLOAD_ROOT, venue_id)
        os.makedirs(venue_dir, exist_ok=True)

        layout_path = os.path.join(venue_dir, "layout.json")
        layout_data = {
            "name": name,
            "dimensions": dimensions,
            "assets": assets,
            "polygon": polygon,
            "walls": walls,
            "materials": materials,
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


@layout_bp.route("/venue/<venue_id>/generate-glb", methods=["POST"])
def generate_glb(venue_id: str):
    """
    Stub GLB generator. Writes a placeholder GLB marker file and records path.
    In a future iteration, replace with real mesh export.
    """
    try:
        venue_dir = os.path.join(UPLOAD_ROOT, venue_id)
        os.makedirs(venue_dir, exist_ok=True)
        glb_path = os.path.join(venue_dir, "venue.glb")
        # Write a minimal placeholder so the viewer can detect presence
        with open(glb_path, "wb") as f:
            f.write(b"venue-glb-placeholder")

        # Update layout to record generated_glb path
        layout_path = os.path.join(venue_dir, "layout.json")
        layout_data = {}
        if os.path.exists(layout_path):
            try:
                with open(layout_path, "r") as f:
                    layout_data = json.load(f)
            except Exception:
                layout_data = {}
        layout_data["generated_glb"] = f"/static/uploads/{venue_id}/venue.glb"
        with open(layout_path, "w") as f:
            json.dump(layout_data, f, indent=2)

        return jsonify({"status": "success", "glb": layout_data["generated_glb"]}), 200
    except Exception as e:
        logger.error(f"Error generating GLB: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

