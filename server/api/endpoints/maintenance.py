import logging

from flask import Blueprint, jsonify, request

from utils.file_manager import reset_uploads

logger = logging.getLogger(__name__)

maintenance_bp = Blueprint("maintenance", __name__)


@maintenance_bp.route("/reset", methods=["POST"])
def reset_all():
    """
    Reset all uploads and layouts. Optional JSON body {"venue_id": "..."} to reset one venue.
    """
    try:
        data = request.get_json(silent=True) or {}
        venue_id = data.get("venue_id")
        reset_uploads(venue_id)
        return jsonify({"status": "success", "message": "Reset complete."}), 200
    except Exception as e:
        logger.error(f"Error during reset: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

