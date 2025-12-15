import json
import logging
import os

from flask import Blueprint, jsonify, request

from utils.file_manager import UPLOAD_ROOT

logger = logging.getLogger(__name__)

layout_bp = Blueprint("layout", __name__)


@layout_bp.route("/venue/<venue_id>/layout", methods=["GET"])
def get_layout(venue_id: str):
    """Get the layout (dimensions and placed assets) for a venue."""
    try:
        layout_path = os.path.join(UPLOAD_ROOT, venue_id, "layout.json")

        if os.path.exists(layout_path):
            with open(layout_path, "r") as f:
                layout_data = json.load(f)
            return (
                jsonify(
                    {
                        "status": "success",
                        "dimensions": layout_data.get("dimensions", {"width": 20, "height": 8, "depth": 20}),
                        "assets": layout_data.get("assets", []),
                        "polygon": layout_data.get("polygon"),
                        "walls": layout_data.get("walls"),
                    }
                ),
                200,
            )
        else:
            return (
                jsonify(
                    {
                        "status": "success",
                        "dimensions": {"width": 20, "height": 8, "depth": 20},
                        "assets": [],
                        "polygon": None,
                        "walls": None,
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
    Save the layout (dimensions and placed assets) for a venue.
    Expects JSON body with:
        - dimensions: {width, height, depth}
        - assets: array of asset objects
        - polygon: array of points (optional)
        - walls: array of walls (optional)
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "Missing layout data."}), 400

        dimensions = data.get("dimensions", {"width": 20, "height": 8, "depth": 20})
        assets = data.get("assets", [])
        polygon = data.get("polygon")
        walls = data.get("walls")

        venue_dir = os.path.join(UPLOAD_ROOT, venue_id)
        os.makedirs(venue_dir, exist_ok=True)

        layout_path = os.path.join(venue_dir, "layout.json")
        layout_data = {
            "dimensions": dimensions,
            "assets": assets,
            "polygon": polygon,
            "walls": walls,
        }

        with open(layout_path, "w") as f:
            json.dump(layout_data, f, indent=2)

        return jsonify({"status": "success", "message": "Layout saved successfully."}), 200

    except Exception as e:
        logger.error(f"Error saving layout: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

