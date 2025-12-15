import logging
from io import BytesIO

from flask import Blueprint, jsonify, request

from utils.file_manager import save_floor_plan

logger = logging.getLogger(__name__)

floor_plan_bp = Blueprint("floor_plan", __name__)


@floor_plan_bp.route("/venue/<venue_id>/floor-plan", methods=["POST"])
def upload_floor_plan(venue_id: str):
    """
    Upload a floor plan image for a venue.
    Expects multipart form-data containing:
        - file: image file
        - venue_id: identifier of the venue
    """
    file = request.files.get("file")

    if not file:
        return jsonify({"error": "Missing file upload."}), 400

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Empty file uploaded."}), 400

    try:
        saved_path = save_floor_plan(venue_id, BytesIO(file_bytes))

        floor_plan_url = f"/static/uploads/{venue_id}/floor_plan.jpg"

        return (
            jsonify(
                {
                    "message": "Floor plan uploaded successfully.",
                    "floor_plan_url": floor_plan_url,
                    "path": saved_path.replace("\\", "/"),
                }
            ),
            200,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except IOError as exc:
        logger.error("Failed to store floor plan: %s", exc)
        return jsonify({"error": "Failed to save floor plan. Try again."}), 500

