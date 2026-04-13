import logging
import os
import time
from typing import Dict, List

from flask import Blueprint, jsonify, request

from middleware.auth_middleware import token_required
from utils.venue_auth import require_venue_access
from services.floor_plan_service import get_venue_walls
from services.wall_stitch import get_overlap_estimates, get_segment_images, stitch_segments
from services.wall_processing import process_wall_image
from services.object_removal_service import remove_object_at_point
from utils.file_manager import UPLOAD_ROOT, delete_venue_wall_images
from .common import completed_walls_for_venue, next_wall, required_photos_for_wall, captured_segments_for_wall

logger = logging.getLogger(__name__)

walls_bp = Blueprint("walls", __name__)


@walls_bp.route("/venue/<venue_id>/progress", methods=["GET"])
@token_required
def get_venue_progress(current_user, venue_id: str):
    """
    Return capture progress for a venue to guide the wall-by-wall workflow.
    Guarantees a valid current_target for new venues (always returns first wall).
    Includes floor plan URL and wall regions if floor plan exists.
    """
    venue, err = require_venue_access(venue_id, current_user, require_owner=False)
    if err:
        return err[0], err[1]
    fs_venue = venue["venue_identifier"]
    walls_metadata = get_venue_walls(fs_venue)
    completed = completed_walls_for_venue(fs_venue, walls_metadata)
    current_target = next_wall(walls_metadata, completed)

    floor_plan_url = None  # Floor plan upload removed; plans are created in-app only

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
        "capture_requirements": {
            wall["id"]: {
                "required_segments": required_photos_for_wall(wall),
                "captured_segments": captured_segments_for_wall(fs_venue, wall["id"]),
            }
            for wall in walls_metadata
        },
    }

    return jsonify(response), 200


@walls_bp.route("/venue/<venue_id>/wall-images", methods=["GET"])
@token_required
def get_wall_images(current_user, venue_id: str):
    """
    Get the image URLs for all walls of a venue.
    Returns processed images if available, otherwise returns the latest captured image.

    Query parameters:
        original: if 'true', returns only original captured images (seq_XX.jpg), not processed ones
    """
    venue, err = require_venue_access(venue_id, current_user, require_owner=False)
    if err:
        return err[0], err[1]
    fs_venue = venue["venue_identifier"]
    try:
        request_original = request.args.get("original", "false").lower() == "true"

        walls_metadata = get_venue_walls(fs_venue)
        wall_images: Dict[str, str] = {}

        for wall in walls_metadata:
            wall_id = wall["id"]
            wall_dir = os.path.join(UPLOAD_ROOT, fs_venue, wall_id)

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
                    wall_images[wall_id] = f"/static/uploads/{fs_venue}/{wall_id}/{latest_file}"
            else:
                # Prefer processed (final), then stitched (master for corners/removal)
                processed_path = os.path.join(wall_dir, f"processed_{wall_id}.jpg")
                stitched_path = os.path.join(wall_dir, f"stitched_{wall_id}.jpg")
                if os.path.exists(processed_path):
                    ts = int(os.path.getmtime(processed_path)) if os.path.exists(processed_path) else int(time.time())
                    wall_images[wall_id] = f"/static/uploads/{fs_venue}/{wall_id}/processed_{wall_id}.jpg?v={ts}"
                elif os.path.exists(stitched_path):
                    ts = int(os.path.getmtime(stitched_path)) if os.path.exists(stitched_path) else int(time.time())
                    wall_images[wall_id] = f"/static/uploads/{fs_venue}/{wall_id}/stitched_{wall_id}.jpg?v={ts}"
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
                        seq_path = os.path.join(wall_dir, latest_file)
                        ts = int(os.path.getmtime(seq_path)) if os.path.exists(seq_path) else int(time.time())
                        wall_images[wall_id] = f"/static/uploads/{fs_venue}/{wall_id}/{latest_file}?v={ts}"

        return jsonify({"status": "success", "wall_images": wall_images}), 200

    except Exception as e:
        logger.error(f"Error getting wall images: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@walls_bp.route("/venue/<venue_id>/wall/<wall_id>/reset", methods=["POST"])
@token_required
def reset_wall_image(current_user, venue_id: str, wall_id: str):
    """
    Reset a wall's image by deleting the processed version.
    This allows the wall to be retaken from scratch.
    Only deletes processed_{wall_id}.jpg, leaves seq_*.jpg files intact.
    """
    _, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    try:
        wall_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
        
        if not os.path.isdir(wall_dir):
            return jsonify({"status": "error", "message": "Wall directory not found"}), 404
        
        # Delete processed and stitched (so user can re-capture / re-stitch)
        for fname in [f"processed_{wall_id}.jpg", f"stitched_{wall_id}.jpg"]:
            p = os.path.join(wall_dir, fname)
            if os.path.exists(p):
                try:
                    os.remove(p)
                    logger.info(f"Deleted {fname} for {venue_id}/{wall_id}")
                except OSError as e:
                    logger.error(f"Failed to delete {fname}: {e}")
                    return jsonify({"status": "error", "message": str(e)}), 500

        return jsonify({"status": "success", "message": "Wall reset successfully"}), 200
    
    except Exception as e:
        logger.error(f"Error resetting wall image: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@walls_bp.route("/venue/<venue_id>/wall/<wall_id>/segments", methods=["GET"])
@token_required
def get_wall_segments(current_user, venue_id: str, wall_id: str):
    """
    Get segment image URLs for a wall (seq_01, seq_02, ...).
    Query param overlaps=true includes overlap estimates for stitching preview.
    """
    _, err = require_venue_access(venue_id, current_user, require_owner=False)
    if err:
        return err[0], err[1]
    try:
        segments = get_segment_images(venue_id, wall_id)
        if not segments:
            return jsonify({"status": "error", "message": "No segment images found", "segments": []}), 404

        resp = {"status": "success", "segments": segments}
        if request.args.get("overlaps", "false").lower() == "true":
            resp["overlap_estimates"] = get_overlap_estimates(venue_id, wall_id)
        return jsonify(resp), 200
    except Exception as e:
        logger.error(f"Error getting segments for {venue_id}/{wall_id}: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@walls_bp.route("/venue/<venue_id>/wall/<wall_id>/stitch", methods=["POST"])
@token_required
def stitch_wall(current_user, venue_id: str, wall_id: str):
    """
    Stitch all segment images for a wall into one seamless image.
    Body: optional { "rotations": [0, r2, ...], "manual_overlaps": [o1, o2, ...] }
    """
    _, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    try:
        data = request.get_json() or {}
        rotations = data.get("rotations")
        manual_overlaps = data.get("manual_overlaps")

        success, result = stitch_segments(venue_id, wall_id, rotations=rotations, manual_overlaps=manual_overlaps)
        if not success:
            return jsonify({"status": "error", "message": result}), 400
        return jsonify({"status": "success", "image_url": f"{result}?v={int(time.time() * 1000)}"}), 200
    except Exception as e:
        logger.error(f"Error stitching {venue_id}/{wall_id}: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


@walls_bp.route("/venue/<venue_id>/wall-images", methods=["DELETE"])
@token_required
def delete_all_wall_images(current_user, venue_id: str):
    """
    Delete all wall image folders for this venue.
    Keeps layout.json, floor_plan.jpg, and generated GLB in the venue root.
    """
    _, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    try:
        removed = delete_venue_wall_images(venue_id)
        return jsonify({
            "status": "success",
            "message": f"Deleted {removed} wall image folder(s).",
            "removed_count": removed
        }), 200
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        logger.error(f"Error deleting wall images for {venue_id}: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


@walls_bp.route("/venue/<venue_id>/wall/<wall_id>/restitch-with-corners", methods=["POST"])
@token_required
def restitch_with_corners(current_user, venue_id: str, wall_id: str):
    """
    Re-stitch segment images and apply perspective correction from adjusted corners.
    Expects multipart form-data:
        - corner_points: JSON string of 4 corner points [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    """
    import json

    _, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]

    corner_points_json = request.form.get("corner_points")
    if not corner_points_json:
        return jsonify({"error": "corner_points are required."}), 400

    try:
        corner_points = json.loads(corner_points_json)
        if len(corner_points) != 4:
            return jsonify({"error": "Exactly 4 corner points are required."}), 400
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON in corner_points."}), 400

    success, result = stitch_segments(venue_id, wall_id)
    if not success:
        return jsonify({"status": "error", "message": result}), 400

    # Stitch writes to stitched_{wall_id}.jpg
    stitched_path = os.path.join(UPLOAD_ROOT, venue_id, wall_id, f"stitched_{wall_id}.jpg")
    if not os.path.exists(stitched_path):
        return jsonify({"status": "error", "message": "Stitching succeeded but output file not found."}), 500

    with open(stitched_path, "rb") as f:
        stitched_bytes = f.read()

    output_path = os.path.join(UPLOAD_ROOT, venue_id, wall_id, f"processed_{wall_id}.jpg")

    wall_ratio = None
    try:
        walls = get_venue_walls(venue_id)
        wall_meta = next((w for w in walls if w.get("id") == wall_id), None)
        if wall_meta:
            length = float(wall_meta.get("length") or 0)
            height = float(wall_meta.get("height") or 0)
            if length > 0 and height > 0:
                wall_ratio = length / height
    except Exception:
        wall_ratio = None

    process_result = process_wall_image(
        stitched_bytes,
        corner_points,
        output_path,
        target_aspect_ratio=wall_ratio,
    )
    if process_result.get("status") == "error":
        return jsonify(process_result), 500

    return jsonify({
        "status": "success",
        "message": "Re-stitched and applied perspective correction.",
        "url": f"/static/uploads/{venue_id}/{wall_id}/processed_{wall_id}.jpg",
    }), 200


@walls_bp.route("/venue/<venue_id>/wall/<wall_id>/remove-object", methods=["POST"])
@token_required
def remove_object(current_user, venue_id: str, wall_id: str):
    """
    Remove object at (x, y) from the stitched wall image using SAM + LaMa.
    Expects JSON body: { "x": int, "y": int }
    Overwrites stitched_{wall_id}.jpg with the cleaned result.
    """
    import json

    _, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]

    try:
        data = request.get_json() or {}
        x = int(data.get("x", 0))
        y = int(data.get("y", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "x and y (integers) are required."}), 400

    wall_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
    stitched_path = os.path.join(wall_dir, f"stitched_{wall_id}.jpg")
    if not os.path.isfile(stitched_path):
        return jsonify({"status": "error", "message": "No stitched image found. Stitch first."}), 404

    outcome = remove_object_at_point(stitched_path, x, y, stitched_path)
    if not outcome.get("success"):
        return jsonify(
            {"status": "error", "message": outcome.get("error") or "Object removal failed"}
        ), 500

    if not outcome.get("inpainted"):
        return jsonify(
            {
                "status": "success",
                "inpainted": False,
                "message": outcome.get("message", "Inpainting did not run."),
                "warning": outcome.get("message", "Inpainting did not run."),
            }
        ), 200

    return jsonify(
        {
            "status": "success",
            "inpainted": True,
            "message": outcome.get("message", "Object removed."),
            "url": f"/static/uploads/{venue_id}/{wall_id}/stitched_{wall_id}.jpg?v={int(time.time() * 1000)}",
        }
    ), 200


@walls_bp.route("/venue/<venue_id>/wall/<wall_id>/apply-corners", methods=["POST"])
@token_required
def apply_corners(current_user, venue_id: str, wall_id: str):
    """
    Apply 4 corner points to stitched (or cleaned) image and save as processed.
    Use this after object removal. Expects multipart form-data:
        - corner_points: JSON string of 4 corner points [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    """
    import json

    _, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]

    corner_points_json = request.form.get("corner_points")
    if not corner_points_json:
        return jsonify({"error": "corner_points are required."}), 400

    try:
        corner_points = json.loads(corner_points_json)
        if len(corner_points) != 4:
            return jsonify({"error": "Exactly 4 corner points are required."}), 400
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON in corner_points."}), 400

    wall_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
    stitched_path = os.path.join(wall_dir, f"stitched_{wall_id}.jpg")
    if not os.path.isfile(stitched_path):
        return jsonify({"status": "error", "message": "No stitched image. Stitch first."}), 404

    with open(stitched_path, "rb") as f:
        stitched_bytes = f.read()

    output_path = os.path.join(wall_dir, f"processed_{wall_id}.jpg")
    wall_ratio = None
    try:
        walls = get_venue_walls(venue_id)
        wall_meta = next((w for w in walls if w.get("id") == wall_id), None)
        if wall_meta:
            length = float(wall_meta.get("length") or 0)
            height = float(wall_meta.get("height") or 0)
            if length > 0 and height > 0:
                wall_ratio = length / height
    except Exception:
        wall_ratio = None

    process_result = process_wall_image(
        stitched_bytes,
        corner_points,
        output_path,
        target_aspect_ratio=wall_ratio,
    )
    if process_result.get("status") == "error":
        return jsonify(process_result), 500

    return jsonify({
        "status": "success",
        "message": "Corners applied. Wall complete.",
        "url": f"/static/uploads/{venue_id}/{wall_id}/processed_{wall_id}.jpg",
    }), 200


@walls_bp.route("/venue/<venue_id>/reset", methods=["POST"])
@token_required
def reset_venue(current_user, venue_id: str):
    """
    Completely reset a venue: delete all walls, layout, and captured images.
    Starts fresh from scratch.
    """
    import shutil

    _, err = require_venue_access(venue_id, current_user, require_owner=True)
    if err:
        return err[0], err[1]
    try:
        venue_path = os.path.join(UPLOAD_ROOT, venue_id)
        logger.info(f"[Reset] Attempting to reset venue {venue_id} at path: {venue_path}")
        
        if not os.path.isdir(venue_path):
            logger.warning(f"[Reset] Venue directory not found: {venue_path}")
            return jsonify({"status": "error", "message": "Venue directory not found"}), 404
        
        # Delete entire venue directory contents but keep the directory
        try:
            files_deleted = 0
            dirs_deleted = 0
            
            for item in os.listdir(venue_path):
                item_path = os.path.join(venue_path, item)
                if os.path.isdir(item_path):
                    logger.info(f"[Reset] Deleting directory: {item_path}")
                    shutil.rmtree(item_path)
                    dirs_deleted += 1
                else:
                    logger.info(f"[Reset] Deleting file: {item_path}")
                    os.remove(item_path)
                    files_deleted += 1
            
            logger.info(f"[Reset] Successfully reset venue {venue_id}: deleted {files_deleted} files and {dirs_deleted} directories")
            return jsonify({"status": "success", "message": f"Venue reset successfully (deleted {files_deleted} files and {dirs_deleted} directories)"}), 200
        
        except Exception as e:
            logger.error(f"[Reset] Error clearing venue directory for {venue_id}: {str(e)}", exc_info=True)
            return jsonify({"status": "error", "message": f"Error clearing venue directory: {str(e)}"}), 500
    
    except Exception as e:
        logger.error(f"[Reset] Unexpected error resetting venue {venue_id}: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": f"Unexpected error: {str(e)}"}), 500
