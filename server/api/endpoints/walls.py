import logging
import os
from typing import Dict, List

from flask import Blueprint, jsonify, request

from services.floor_plan_service import get_current_target_wall, get_venue_walls
from utils.file_manager import get_floor_plan_path, UPLOAD_ROOT
from .common import completed_walls_for_venue, next_wall

logger = logging.getLogger(__name__)

walls_bp = Blueprint("walls", __name__)


@walls_bp.route("/venue/<venue_id>/progress", methods=["GET"])
def get_venue_progress(venue_id: str):
    """
    Return capture progress for a venue to guide the wall-by-wall workflow.
    Guarantees a valid current_target for new venues (always returns first wall).
    Includes floor plan URL and wall regions if floor plan exists.
    """

    walls_metadata = get_venue_walls(venue_id)
    wall_ids = [wall["id"] for wall in walls_metadata]
    completed = completed_walls_for_venue(venue_id, wall_ids)
    current_target = get_current_target_wall(venue_id)

    floor_plan_path = get_floor_plan_path(venue_id)
    floor_plan_url = None
    if floor_plan_path:
        floor_plan_url = f"/static/uploads/{venue_id}/floor_plan.jpg"

    wall_regions: List[Dict] = []
    if walls_metadata:
        for idx, wall in enumerate(walls_metadata):
            region = {"id": wall["id"], "name": wall.get("name", wall["id"])}
            region.update(
                {
                    "x": 10 + (idx * 10) % 60,
                    "y": 10 + (idx * 15) % 60,
                    "width": 20,
                    "height": 15,
                }
            )
            wall_regions.append(region)

    response = {
        "total_walls": len(walls_metadata),
        "completed_walls": completed,
        "current_target": (
            {"id": current_target["id"], "name": current_target["name"]}
            if current_target
            else None
        ),
        "is_complete": current_target is None,
        "walls": walls_metadata,
        "floor_plan_url": floor_plan_url,
        "wall_regions": wall_regions,
    }

    return jsonify(response), 200


@walls_bp.route("/venue/<venue_id>/wall-images", methods=["GET"])
def get_wall_images(venue_id: str):
    """
    Get the image URLs for all walls of a venue.
    Returns processed images if available, otherwise returns the latest captured image.

    Query parameters:
        original: if 'true', returns only original captured images (seq_XX.jpg), not processed ones
    """
    try:
        request_original = request.args.get("original", "false").lower() == "true"

        walls_metadata = get_venue_walls(venue_id)
        wall_images: Dict[str, str] = {}

        for wall in walls_metadata:
            wall_id = wall["id"]
            wall_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)

            if not os.path.isdir(wall_dir):
                continue

            if request_original:
                seq_files = []
                try:
                    for entry in os.scandir(wall_dir):
                        if entry.is_file() and entry.name.startswith("seq_") and entry.name.endswith(".jpg"):
                            seq_files.append(entry.name)
                except (FileNotFoundError, PermissionError):
                    pass

                if seq_files:
                    seq_files.sort(
                        key=lambda x: int(x.split("_")[1].split(".")[0]) if "_" in x else 0,
                        reverse=True,
                    )
                    latest_file = seq_files[0]
                    wall_images[wall_id] = f"/static/uploads/{venue_id}/{wall_id}/{latest_file}"
            else:
                processed_path = os.path.join(wall_dir, f"processed_{wall_id}.jpg")
                if os.path.exists(processed_path):
                    wall_images[wall_id] = f"/static/uploads/{venue_id}/{wall_id}/processed_{wall_id}.jpg"
                else:
                    seq_files = []
                    try:
                        for entry in os.scandir(wall_dir):
                            if entry.is_file() and entry.name.startswith("seq_") and entry.name.endswith(".jpg"):
                                seq_files.append(entry.name)
                    except (FileNotFoundError, PermissionError):
                        pass

                    if seq_files:
                        seq_files.sort(
                            key=lambda x: int(x.split("_")[1].split(".")[0]) if "_" in x else 0,
                            reverse=True,
                        )
                        latest_file = seq_files[0]
                        wall_images[wall_id] = f"/static/uploads/{venue_id}/{wall_id}/{latest_file}"

        return jsonify({"status": "success", "wall_images": wall_images}), 200

    except Exception as e:
        logger.error(f"Error getting wall images: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

