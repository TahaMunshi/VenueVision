import os
from io import BytesIO

from flask import Blueprint, jsonify, current_app, request
from services.image_analysis import analyze_quality
from services.floor_plan_service import get_venue_walls, get_current_target_wall
from services.wall_processing import auto_detect_corners, process_wall_image, decode_image_from_bytes
from utils.file_manager import save_wall_photo, save_floor_plan, get_floor_plan_path, UPLOAD_ROOT, reset_uploads
import logging
import json
import os
from typing import Dict, List, Optional

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__)

@api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint to verify the API is working"""
    return jsonify({
        "status": "healthy",
        "message": "API is running"
    })


def _completed_walls_for_venue(venue_id: str, walls: List[str]) -> List[str]:
    """
    Determine which walls already have at least one uploaded capture.
    """

    completed = []
    venue_dir = os.path.join(UPLOAD_ROOT, str(venue_id))
    if not os.path.isdir(venue_dir):
        return completed

    for wall in walls:
        wall_dir = os.path.join(venue_dir, wall)
        if not os.path.isdir(wall_dir):
            continue
        try:
            with os.scandir(wall_dir) as entries:
                has_files = any(entry.is_file() for entry in entries)
        except FileNotFoundError:
            has_files = False

        if has_files:
            completed.append(wall)

    return completed


def _next_wall(walls_metadata: List[Dict], completed_ids: List[str]) -> Optional[Dict]:
    for wall in walls_metadata:
        if wall["id"] not in completed_ids:
            return wall
    return None


@api_bp.route('/venue/<venue_id>/floor-plan', methods=['POST'])
def upload_floor_plan(venue_id: str):
    """
    Upload a floor plan image for a venue.
    Expects multipart form-data containing:
        - file: image file
        - venue_id: identifier of the venue
    """
    file = request.files.get('file')
    
    if not file:
        return jsonify({"error": "Missing file upload."}), 400

    file_bytes = file.read()
    if not file_bytes:
        return jsonify({"error": "Empty file uploaded."}), 400

    try:
        saved_path = save_floor_plan(venue_id, BytesIO(file_bytes))
        
        # Generate URL for the floor plan
        # Assuming the floor plan is served from /static/uploads/{venue_id}/floor_plan.jpg
        floor_plan_url = f"/static/uploads/{venue_id}/floor_plan.jpg"
        
        return jsonify({
            "message": "Floor plan uploaded successfully.",
            "floor_plan_url": floor_plan_url,
            "path": saved_path.replace("\\", "/"),
        }), 200
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except IOError as exc:
        logger.error("Failed to store floor plan: %s", exc)
        return jsonify({"error": "Failed to save floor plan. Try again."}), 500


@api_bp.route('/venue/<venue_id>/progress', methods=['GET'])
def get_venue_progress(venue_id: str):
    """
    Return capture progress for a venue to guide the wall-by-wall workflow.
    Guarantees a valid current_target for new venues (always returns first wall).
    Includes floor plan URL and wall regions if floor plan exists.
    """

    walls_metadata = get_venue_walls(venue_id)
    wall_ids = [wall["id"] for wall in walls_metadata]
    completed = _completed_walls_for_venue(venue_id, wall_ids)
    # Use the service function that guarantees a valid target for new venues
    current_target = get_current_target_wall(venue_id)

    # Check if floor plan exists
    floor_plan_path = get_floor_plan_path(venue_id)
    floor_plan_url = None
    if floor_plan_path:
        # Generate URL for the floor plan
        floor_plan_url = f"/static/uploads/{venue_id}/floor_plan.jpg"
    
    # Convert walls to regions; normalize to percentages if possible
    wall_regions = []
    if walls_metadata:
        for idx, wall in enumerate(walls_metadata):
            region = {"id": wall["id"], "name": wall.get("name", wall["id"])}
            region.update({
                "x": 10 + (idx * 10) % 60,
                "y": 10 + (idx * 15) % 60,
                "width": 20,
                "height": 15
            })
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


@api_bp.route('/capture/upload', methods=['POST'])
def upload_capture():
    """
    Accepts a photo capture, validates quality, and saves it for reconstruction.
    Expects multipart form-data containing:
        - file: image file
        - venue_id: identifier of the venue
        - wall_id: identifier of the wall section
    """
    file = request.files.get('file')
    venue_id = request.form.get('venue_id')
    wall_id = request.form.get('wall_id')

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
        return jsonify({
            "error": analysis.get("error", "Image failed quality checks.")
        }), 400

    try:
        saved_path = save_wall_photo(venue_id, wall_id, BytesIO(file_bytes))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except IOError as exc:
        logger.error("Failed to store capture: %s", exc)
        return jsonify({"error": "Failed to save capture. Try again."}), 500

    walls_metadata = get_venue_walls(venue_id)
    wall_ids = [wall["id"] for wall in walls_metadata]
    completed = _completed_walls_for_venue(venue_id, wall_ids)
    current_target = _next_wall(walls_metadata, completed)

    payload = {
        "message": "Capture stored successfully.",
        "filename": os.path.basename(saved_path),
        "path": saved_path.replace("\\", "/"),
    }

    if current_target:
        payload.update({
            "status": "success",
            "next_wall": current_target["id"],
            "current_target": {
                "id": current_target["id"],
                "name": current_target["name"],
            }
        })
    else:
        payload.update({
            "status": "complete",
            "next_wall": None,
            "current_target": None,
        })

    return jsonify(payload), 200


@api_bp.route('/reset', methods=['POST'])
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


@api_bp.route('/wall/auto-detect', methods=['POST'])
def auto_detect_wall_corners():
    """
    Automatically detect the 4 corners of a wall in an uploaded image.
    Expects multipart form-data containing:
        - file: image file
    """
    file = request.files.get('file')
    
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
            return jsonify({
                "status": "error",
                "message": "Could not detect wall corners automatically. Please select corners manually.",
                "points": None
            }), 200
        
        return jsonify({
            "status": "success",
            "points": points,
            "message": "Corner detection successful"
        }), 200
    except Exception as e:
        logger.error(f"Error in auto-detect: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@api_bp.route('/wall/process', methods=['POST'])
def process_wall():
    """
    Process a wall image: warp perspective, stylize, and save.
    Expects multipart form-data containing:
        - file: image file
        - venue_id: identifier of the venue
        - wall_id: identifier of the wall
        - corner_points: JSON string of 4 corner points [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    """
    file = request.files.get('file')
    venue_id = request.form.get('venue_id')
    wall_id = request.form.get('wall_id')
    corner_points_json = request.form.get('corner_points')
    
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
        
        # Determine output path
        venue_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
        os.makedirs(venue_dir, exist_ok=True)
        output_filename = f"processed_{wall_id}.jpg"
        output_path = os.path.join(venue_dir, output_filename)
        
        # Process the wall
        result = process_wall_image(file_bytes, corner_points, output_path)
        
        if result["status"] == "error":
            return jsonify(result), 500
        
        # Generate URL for the processed image
        result["url"] = f"/static/uploads/{venue_id}/{wall_id}/{output_filename}"
        
        return jsonify(result), 200
        
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON in corner_points."}), 400
    except Exception as e:
        logger.error(f"Error processing wall: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@api_bp.route('/venue/<venue_id>/wall-images', methods=['GET'])
def get_wall_images(venue_id: str):
    """
    Get the image URLs for all walls of a venue.
    Returns processed images if available, otherwise returns the latest captured image.
    
    Query parameters:
        original: if 'true', returns only original captured images (seq_XX.jpg), not processed ones
    """
    try:
        # Check if original images are requested
        request_original = request.args.get('original', 'false').lower() == 'true'
        
        walls_metadata = get_venue_walls(venue_id)
        wall_images = {}
        
        for wall in walls_metadata:
            wall_id = wall["id"]
            wall_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
            
            if not os.path.isdir(wall_dir):
                continue
            
            # If original is requested, skip processed images
            if request_original:
                # Find the latest seq_XX.jpg file
                seq_files = []
                try:
                    for entry in os.scandir(wall_dir):
                        if entry.is_file() and entry.name.startswith("seq_") and entry.name.endswith(".jpg"):
                            seq_files.append(entry.name)
                except (FileNotFoundError, PermissionError):
                    pass
                
                if seq_files:
                    # Sort by sequence number (extract number from seq_XX.jpg)
                    seq_files.sort(key=lambda x: int(x.split('_')[1].split('.')[0]) if '_' in x else 0, reverse=True)
                    latest_file = seq_files[0]
                    wall_images[wall_id] = f"/static/uploads/{venue_id}/{wall_id}/{latest_file}"
            else:
                # Check for processed image first
                processed_path = os.path.join(wall_dir, f"processed_{wall_id}.jpg")
                if os.path.exists(processed_path):
                    wall_images[wall_id] = f"/static/uploads/{venue_id}/{wall_id}/processed_{wall_id}.jpg"
                else:
                    # Find the latest seq_XX.jpg file
                    seq_files = []
                    try:
                        for entry in os.scandir(wall_dir):
                            if entry.is_file() and entry.name.startswith("seq_") and entry.name.endswith(".jpg"):
                                seq_files.append(entry.name)
                    except (FileNotFoundError, PermissionError):
                        pass
                    
                    if seq_files:
                        # Sort by sequence number (extract number from seq_XX.jpg)
                        seq_files.sort(key=lambda x: int(x.split('_')[1].split('.')[0]) if '_' in x else 0, reverse=True)
                        latest_file = seq_files[0]
                        wall_images[wall_id] = f"/static/uploads/{venue_id}/{wall_id}/{latest_file}"
        
        return jsonify({
            "status": "success",
            "wall_images": wall_images
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting wall images: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@api_bp.route('/venue/<venue_id>/layout', methods=['GET'])
def get_layout(venue_id: str):
    """
    Get the layout (dimensions and placed assets) for a venue.
    """
    try:
        layout_path = os.path.join(UPLOAD_ROOT, venue_id, 'layout.json')
        
        if os.path.exists(layout_path):
            with open(layout_path, 'r') as f:
                layout_data = json.load(f)
            return jsonify({
                "status": "success",
                "dimensions": layout_data.get("dimensions", {"width": 20, "height": 8, "depth": 20}),
                "assets": layout_data.get("assets", []),
                "polygon": layout_data.get("polygon"),
                "walls": layout_data.get("walls")
            }), 200
        else:
            # Return default layout if file doesn't exist
            return jsonify({
                "status": "success",
                "dimensions": {"width": 20, "height": 8, "depth": 20},
                "assets": [],
                "polygon": None,
                "walls": None
            }), 200
        
    except Exception as e:
        logger.error(f"Error getting layout: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@api_bp.route('/venue/<venue_id>/layout', methods=['POST'])
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
        
        # Ensure venue directory exists
        venue_dir = os.path.join(UPLOAD_ROOT, venue_id)
        os.makedirs(venue_dir, exist_ok=True)
        
        # Save layout to JSON file
        layout_path = os.path.join(venue_dir, 'layout.json')
        layout_data = {
            "dimensions": dimensions,
            "assets": assets,
            "polygon": polygon,
            "walls": walls
        }
        
        with open(layout_path, 'w') as f:
            json.dump(layout_data, f, indent=2)
        
        return jsonify({
            "status": "success",
            "message": "Layout saved successfully."
        }), 200
        
    except Exception as e:
        logger.error(f"Error saving layout: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

