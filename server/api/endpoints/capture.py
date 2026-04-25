import json
import logging
import os
from io import BytesIO

from flask import Blueprint, jsonify, request

from middleware.auth_middleware import token_required
from utils.venue_auth import require_venue_access
from services.image_analysis import analyze_quality
from services.wall_processing import (
    auto_detect_corners,
    decode_image_from_bytes,
    process_wall_image,
)
from utils.file_manager import save_wall_photo, UPLOAD_ROOT
from .common import completed_walls_for_venue, next_wall, required_photos_for_wall, captured_segments_for_wall
from services.floor_plan_service import get_venue_walls

logger = logging.getLogger(__name__)

capture_bp = Blueprint("capture", __name__)


@capture_bp.route("/capture/upload", methods=["POST"])
@token_required
def upload_capture(current_user):
    """
    Accepts a photo capture, validates quality, and saves it for reconstruction.
    Expects multipart form-data containing:
        - file: image file
        - venue_id: identifier of the venue
        - wall_id: identifier of the wall section
    """
    file = request.files.get("file")
    venue_id = request.form.get("venue_id")
    wall_id = request.form.get("wall_id")

    if not file:
        return jsonify({"error": "Missing file upload."}), 400

    if not venue_id or not wall_id:
        return jsonify({"error": "venue_id and wall_id are required."}), 400

    venue, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    fs_venue = venue["venue_identifier"]

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Empty file uploaded."}), 400

    analysis = analyze_quality(file_bytes)
    if not analysis.get("valid"):
        logger.info("Image rejected for quality reasons: %s", analysis.get("error"))
        return (
            jsonify({"error": analysis.get("error", "Image failed quality checks.")}),
            400,
        )

    try:
        saved_path = save_wall_photo(fs_venue, wall_id, BytesIO(file_bytes))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except IOError as exc:
        logger.error("Failed to store capture: %s", exc)
        return jsonify({"error": "Failed to save capture. Try again."}), 500

    walls_metadata = get_venue_walls(fs_venue)
    completed = completed_walls_for_venue(fs_venue, walls_metadata)
    current_target = next_wall(walls_metadata, completed)
    active_wall_meta = next((w for w in walls_metadata if w["id"] == wall_id), {"id": wall_id})
    active_required = required_photos_for_wall(active_wall_meta)
    active_captured = captured_segments_for_wall(fs_venue, wall_id)

    payload = {
        "message": "Capture stored successfully.",
        "filename": os.path.basename(saved_path),
        "path": saved_path.replace("\\", "/"),
        "wall_id": wall_id,
        "captured_segments": active_captured,
        "required_segments": active_required,
        "wall_capture_complete": active_captured >= active_required,
    }

    if current_target:
        payload.update(
            {
                "status": "success",
                "next_wall": current_target["id"],
                "current_target": {
                    "id": current_target["id"],
                    "name": current_target["name"],
                },
            }
        )
    else:
        payload.update(
            {
                "status": "complete",
                "next_wall": None,
                "current_target": None,
            }
        )

    return jsonify(payload), 200


@capture_bp.route("/wall/auto-detect", methods=["POST"])
def auto_detect_wall_corners():
    """
    Automatically detect the 4 corners of a wall in an uploaded image.
    Expects multipart form-data containing:
        - file: image file
    """
    file = request.files.get("file")

    if not file:
        return jsonify({"error": "Missing file upload."}), 400

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Empty file uploaded."}), 400

    try:
        image = decode_image_from_bytes(file_bytes)
        if image is None:
            return jsonify({"error": "Could not decode image"}), 400

        points = auto_detect_corners(image)

        if points is None:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "Could not detect wall corners automatically. Please select corners manually.",
                        "points": None,
                    }
                ),
                200,
            )

        return (
            jsonify(
                {"status": "success", "points": points, "message": "Corner detection successful"}
            ),
            200,
        )
    except Exception as e:
        logger.error(f"Error in auto-detect: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@capture_bp.route("/wall/process", methods=["POST"])
@token_required
def process_wall(current_user):
    """
    Process a wall image: warp perspective, stylize, and save.
    Expects multipart form-data containing:
        - file: image file
        - venue_id: identifier of the venue
        - wall_id: identifier of the wall
        - corner_points: JSON string of 4 corner points [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    """
    file = request.files.get("file")
    venue_id = request.form.get("venue_id")
    wall_id = request.form.get("wall_id")
    corner_points_json = request.form.get("corner_points")

    if not file:
        return jsonify({"error": "Missing file upload."}), 400

    if not venue_id or not wall_id:
        return jsonify({"error": "venue_id and wall_id are required."}), 400

    if not corner_points_json:
        return jsonify({"error": "corner_points are required."}), 400

    venue, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    fs_venue = venue["venue_identifier"]

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Empty file uploaded."}), 400

    try:
        corner_points = json.loads(corner_points_json)
        if len(corner_points) != 4:
            return jsonify({"error": "Exactly 4 corner points are required."}), 400

        venue_dir = os.path.join(UPLOAD_ROOT, fs_venue, wall_id)
        os.makedirs(venue_dir, exist_ok=True)
        output_filename = f"processed_{wall_id}.jpg"
        output_path = os.path.join(venue_dir, output_filename)

        # Stretch final processed texture to the wall's real aspect ratio (length/height) when available.
        wall_ratio = None
        try:
            walls = get_venue_walls(fs_venue)
            wall_meta = next((w for w in walls if w.get("id") == wall_id), None)
            if wall_meta:
                length = float(wall_meta.get("length") or 0)
                height = float(wall_meta.get("height") or 0)
                if length > 0 and height > 0:
                    wall_ratio = length / height
        except Exception:
            wall_ratio = None

        result = process_wall_image(
            file_bytes,
            corner_points,
            output_path,
            target_aspect_ratio=wall_ratio,
        )

        if result["status"] == "error":
            return jsonify(result), 500

        result["url"] = f"/static/uploads/{fs_venue}/{wall_id}/{output_filename}"

        return jsonify(result), 200

    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON in corner_points."}), 400
    except Exception as e:
        logger.error(f"Error processing wall: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

