import json
import logging
import os
from io import BytesIO

from flask import Blueprint, jsonify, request

from services.image_analysis import analyze_quality
from services.wall_processing import (
    auto_detect_corners,
    decode_image_from_bytes,
    process_wall_image,
)
from utils.file_manager import save_wall_photo, UPLOAD_ROOT
from .common import completed_walls_for_venue, next_wall
from services.floor_plan_service import get_venue_walls

logger = logging.getLogger(__name__)

capture_bp = Blueprint("capture", __name__)


@capture_bp.route("/capture/upload", methods=["POST"])
def upload_capture():
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
        saved_path = save_wall_photo(venue_id, wall_id, BytesIO(file_bytes))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except IOError as exc:
        logger.error("Failed to store capture: %s", exc)
        return jsonify({"error": "Failed to save capture. Try again."}), 500

    walls_metadata = get_venue_walls(venue_id)
    wall_ids = [wall["id"] for wall in walls_metadata]
    completed = completed_walls_for_venue(venue_id, wall_ids)
    current_target = next_wall(walls_metadata, completed)

    payload = {
        "message": "Capture stored successfully.",
        "filename": os.path.basename(saved_path),
        "path": saved_path.replace("\\", "/"),
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
def process_wall():
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

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Empty file uploaded."}), 400

    try:
        corner_points = json.loads(corner_points_json)
        if len(corner_points) != 4:
            return jsonify({"error": "Exactly 4 corner points are required."}), 400

        venue_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
        os.makedirs(venue_dir, exist_ok=True)
        output_filename = f"processed_{wall_id}.jpg"
        output_path = os.path.join(venue_dir, output_filename)

        result = process_wall_image(file_bytes, corner_points, output_path)

        if result["status"] == "error":
            return jsonify(result), 500

        result["url"] = f"/static/uploads/{venue_id}/{wall_id}/{output_filename}"

        return jsonify(result), 200

    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON in corner_points."}), 400
    except Exception as e:
        logger.error(f"Error processing wall: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

