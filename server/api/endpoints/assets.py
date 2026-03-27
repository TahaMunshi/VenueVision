"""
Asset management API endpoints for user 3D assets.
Handles image-to-3D conversion and asset retrieval.
"""

import logging
import os
from io import BytesIO

from flask import Blueprint, jsonify, request

from middleware.auth_middleware import token_required
from services.instantmesh_service import get_instantmesh_service
from services.tripo3d_service import multiview_to_3d as tripo3d_multiview_to_3d, validate_image as tripo3d_validate_image, _get_api_key as tripo3d_get_api_key
from services.asset_service import (
    create_user_asset,
    create_pending_asset,
    update_asset_status,
    get_user_assets,
    get_asset_by_id,
    delete_user_asset,
    get_user_asset_count,
    update_asset_properties
)

logger = logging.getLogger(__name__)

assets_bp = Blueprint("assets", __name__)


@assets_bp.route("/assets/generate", methods=["POST"])
@token_required
def generate_asset(current_user):
    """
    Generate a 3D asset from one or more images.
    - If TRIPO_API_KEY is set: uses Tripo3D (v2.5 turbo, standard texture).
      Accepts multiple images for multiview-to-3D (order: front, right, back, left) or a single image.
    - Otherwise: uses InstantMesh (single image only).

    Expects multipart form-data:
        - file: single image (jpg, png, webp) OR
        - files: multiple images (same order as view labels)
    Optional: asset_name, asset_layer, height_m
    """
    user_id = current_user['user_id']

    # Collect images: multiple "files[]" or "file"
    files_list = request.files.getlist("files") or request.files.getlist("files[]")
    if not files_list:
        single = request.files.get("file")
        if single:
            files_list = [single]
    if not files_list or not any(f.filename for f in files_list):
        return jsonify({
            "status": "error",
            "error": "No image file(s) provided. Use 'file' or 'files'."
        }), 400

    # Read all files (keep order: front, right, back, left)
    image_files = []
    for f in files_list:
        if not f.filename:
            continue
        data = f.read()
        if data:
            image_files.append((data, f.filename))

    if not image_files:
        return jsonify({
            "status": "error",
            "error": "No valid image data uploaded"
        }), 400

    asset_name = request.form.get("asset_name", "").strip()
    asset_layer = request.form.get("asset_layer", "surface").strip().lower()
    if asset_layer not in ("floor", "surface", "ceiling"):
        asset_layer = "surface"
    height_m = request.form.get("height_m", type=float) or 1.0
    width_m = depth_m = height_m
    if not asset_name:
        first_name = image_files[0][1]
        asset_name = os.path.splitext(first_name)[0][:50] or "Untitled Asset"

    # Prefer Tripo3D when API key is set (supports 1 or more images)
    use_tripo = bool(tripo3d_get_api_key())
    if use_tripo:
        for i, (data, name) in enumerate(image_files):
            ok, msg = tripo3d_validate_image(data, name)
            if not ok:
                return jsonify({"status": "error", "error": msg}), 400
    else:
        if len(image_files) > 1:
            return jsonify({
                "status": "error",
                "error": "Multiple images require Tripo3D. Set TRIPO_API_KEY in .env."
            }), 400
        instantmesh = get_instantmesh_service()
        file_bytes, orig_name = image_files[0]
        is_valid, error_msg = instantmesh.validate_image(file_bytes, orig_name)
        if not is_valid:
            return jsonify({"status": "error", "error": error_msg}), 400

    asset_id = create_pending_asset(user_id, asset_name)
    if not asset_id:
        return jsonify({"status": "error", "error": "Failed to create asset record"}), 500
    update_asset_status(asset_id, 'processing')

    try:
        if use_tripo:
            result = tripo3d_multiview_to_3d(
                user_id=user_id,
                image_files=image_files,
                asset_name=asset_name,
            )
        else:
            file_bytes, orig_name = image_files[0]
            instantmesh = get_instantmesh_service()
            result = instantmesh.convert_image_to_3d(
                user_id=user_id,
                file_bytes=file_bytes,
                original_filename=orig_name,
                asset_name=asset_name,
            )

        if not result['success']:
            # Update asset as failed
            update_asset_status(
                asset_id,
                'failed',
                error=result.get('error', 'Unknown error')
            )
            return jsonify({
                "status": "error",
                "error": result.get('error', 'Failed to generate 3D model'),
                "asset_id": asset_id
            }), 500
        
        # Update asset with generated file info and layer/dimensions
        update_asset_status(
            asset_id,
            'completed',
            file_path=result['glb_path'],
            source_image_path=result.get('source_image_path'),
            thumbnail_url=result.get('thumbnail_url'),
            file_size_bytes=result.get('file_size_bytes'),
            asset_layer=asset_layer,
            width_m=width_m,
            depth_m=depth_m,
            height_m=height_m
        )
        
        # Get the complete asset record
        asset = get_asset_by_id(asset_id)
        
        logger.info(f"Asset generated successfully: {asset_id} for user {user_id}")
        
        return jsonify({
            "status": "success",
            "message": "3D asset generated successfully",
            "asset": {
                "asset_id": asset_id,
                "asset_name": asset_name,
                "file_path": result['glb_path'],
                "file_url": f"/static/{result['glb_path']}",
                "thumbnail_url": f"/static/{result['thumbnail_url']}" if result.get('thumbnail_url') else None,
                "source_image_url": f"/static/{result['source_image_path']}" if result.get('source_image_path') else None,
                "file_size_bytes": result.get('file_size_bytes'),
                "created_at": asset.get('created_at') if asset else None
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error generating asset: {e}")
        update_asset_status(asset_id, 'failed', error=str(e))
        return jsonify({
            "status": "error",
            "error": "An unexpected error occurred during 3D generation",
            "asset_id": asset_id
        }), 500


@assets_bp.route("/assets", methods=["GET"])
@token_required
def get_my_assets(current_user):
    """
    Get all 3D assets for the authenticated user.
    
    Query parameters:
        - include_failed: (Optional) Include failed assets (default: false)
        
    Returns:
        JSON response with list of assets
    """
    user_id = current_user['user_id']
    include_failed = request.args.get('include_failed', 'false').lower() == 'true'
    
    assets = get_user_assets(user_id, include_failed=include_failed)
    
    # Transform assets for response (include file_path for 3D loading in planner/viewer)
    response_assets = []
    for asset in assets:
        fp = asset.get('file_path') or ''
        response_assets.append({
            "asset_id": asset['asset_id'],
            "asset_name": asset['asset_name'],
            "file_url": f"/static/{fp}" if fp else None,
            "file_path": fp,
            "thumbnail_url": f"/static/{asset['thumbnail_url']}" if asset.get('thumbnail_url') else None,
            "source_image_url": f"/static/{asset['source_image_path']}" if asset.get('source_image_path') else None,
            "file_size_bytes": asset.get('file_size_bytes'),
            "generation_status": asset['generation_status'],
            "generation_error": asset.get('generation_error'),
            "asset_layer": asset.get('asset_layer') or 'surface',
            "width_m": asset.get('width_m') if asset.get('width_m') is not None else 1.0,
            "depth_m": asset.get('depth_m') if asset.get('depth_m') is not None else 1.0,
            "height_m": asset.get('height_m') if asset.get('height_m') is not None else 1.0,
            "brightness": asset.get('brightness') if asset.get('brightness') is not None else 1.0,
            "metadata": asset.get('metadata', {}),
            "created_at": asset.get('created_at'),
            "updated_at": asset.get('updated_at')
        })
    
    return jsonify({
        "status": "success",
        "user_id": user_id,
        "total_count": len(response_assets),
        "assets": response_assets
    }), 200


@assets_bp.route("/assets/user/<int:user_id>", methods=["GET"])
@token_required
def get_user_assets_by_id(current_user, user_id):
    """
    Get all 3D assets for a specific user.
    
    Note: Users can only access their own assets unless expanded for public assets.
    
    Args:
        user_id: Target user's ID
        
    Returns:
        JSON response with list of assets
    """
    # Verify user can only access their own assets
    if current_user['user_id'] != user_id:
        return jsonify({
            "status": "error",
            "error": "Access denied. You can only view your own assets."
        }), 403
    
    include_failed = request.args.get('include_failed', 'false').lower() == 'true'
    
    assets = get_user_assets(user_id, include_failed=include_failed)
    
    # Transform assets for response
    response_assets = []
    for asset in assets:
        response_assets.append({
            "asset_id": asset['asset_id'],
            "asset_name": asset['asset_name'],
            "file_url": f"/static/{asset['file_path']}" if asset.get('file_path') else None,
            "file_path": asset['file_path'],  # Include raw path for scene loading
            "thumbnail_url": f"/static/{asset['thumbnail_url']}" if asset.get('thumbnail_url') else None,
            "source_image_url": f"/static/{asset['source_image_path']}" if asset.get('source_image_path') else None,
            "file_size_bytes": asset.get('file_size_bytes'),
            "generation_status": asset['generation_status'],
            "asset_layer": asset.get('asset_layer') or 'surface',
            "width_m": asset.get('width_m') if asset.get('width_m') is not None else 1.0,
            "depth_m": asset.get('depth_m') if asset.get('depth_m') is not None else 1.0,
            "height_m": asset.get('height_m') if asset.get('height_m') is not None else 1.0,
            "brightness": asset.get('brightness') if asset.get('brightness') is not None else 1.0,
            "metadata": asset.get('metadata', {}),
            "created_at": asset.get('created_at'),
            "updated_at": asset.get('updated_at')
        })
    
    return jsonify({
        "status": "success",
        "user_id": user_id,
        "total_count": len(response_assets),
        "assets": response_assets
    }), 200


@assets_bp.route("/assets/detail/<int:asset_id>", methods=["GET"])
@token_required
def get_single_asset(current_user, asset_id):
    """
    Get details of a specific asset.
    
    Args:
        asset_id: Asset's database ID
        
    Returns:
        JSON response with asset details
    """
    asset = get_asset_by_id(asset_id)
    
    if not asset:
        return jsonify({
            "status": "error",
            "error": "Asset not found"
        }), 404
    
    # Verify ownership
    if asset['user_id'] != current_user['user_id']:
        return jsonify({
            "status": "error",
            "error": "Access denied"
        }), 403
    
    return jsonify({
        "status": "success",
        "asset": {
            "asset_id": asset['asset_id'],
            "asset_name": asset['asset_name'],
            "file_url": f"/static/{asset['file_path']}" if asset.get('file_path') else None,
            "file_path": asset['file_path'],
            "thumbnail_url": f"/static/{asset['thumbnail_url']}" if asset.get('thumbnail_url') else None,
            "source_image_url": f"/static/{asset['source_image_path']}" if asset.get('source_image_path') else None,
            "file_size_bytes": asset.get('file_size_bytes'),
            "generation_status": asset['generation_status'],
            "generation_error": asset.get('generation_error'),
            "asset_layer": asset.get('asset_layer', 'surface'),
            "width_m": asset.get('width_m', 1.0),
            "depth_m": asset.get('depth_m', 1.0),
            "height_m": asset.get('height_m', 1.0),
            "brightness": asset.get('brightness', 1.0),
            "metadata": asset.get('metadata', {}),
            "created_at": asset.get('created_at'),
            "updated_at": asset.get('updated_at')
        }
    }), 200


@assets_bp.route("/assets/detail/<int:asset_id>", methods=["PATCH"])
@token_required
def update_asset(current_user, asset_id):
    """
    Update asset layer, width, depth, height, or brightness.
    Expects JSON: { "asset_layer": "floor"|"surface"|"ceiling", "width_m": 1.5, "depth_m": 1.2, "height_m": 0.8, "brightness": 1.2 }
    """
    user_id = current_user['user_id']
    data = request.get_json() or {}
    layer = data.get('asset_layer')
    width_m = data.get('width_m')
    depth_m = data.get('depth_m')
    height_m = data.get('height_m')
    brightness = data.get('brightness')
    if layer is None and width_m is None and depth_m is None and height_m is None and brightness is None:
        return jsonify({"status": "error", "error": "No update fields provided"}), 400
    success = update_asset_properties(asset_id, user_id, asset_layer=layer, width_m=width_m, depth_m=depth_m, height_m=height_m, brightness=brightness)
    if not success:
        return jsonify({"status": "error", "error": "Asset not found or update failed"}), 404
    return jsonify({"status": "success", "message": "Asset updated", "asset_id": asset_id}), 200


@assets_bp.route("/assets/detail/<int:asset_id>", methods=["DELETE"])
@token_required
def delete_asset(current_user, asset_id):
    """
    Delete a user's asset.
    
    Args:
        asset_id: Asset's database ID
        
    Returns:
        JSON response confirming deletion
    """
    user_id = current_user['user_id']
    
    success = delete_user_asset(asset_id, user_id)
    
    if not success:
        return jsonify({
            "status": "error",
            "error": "Asset not found or could not be deleted"
        }), 404
    
    return jsonify({
        "status": "success",
        "message": "Asset deleted successfully",
        "asset_id": asset_id
    }), 200


@assets_bp.route("/assets/count", methods=["GET"])
@token_required
def get_asset_count(current_user):
    """
    Get count of completed assets for the authenticated user.
    
    Returns:
        JSON response with asset count
    """
    user_id = current_user['user_id']
    count = get_user_asset_count(user_id)
    
    return jsonify({
        "status": "success",
        "user_id": user_id,
        "count": count
    }), 200


@assets_bp.route("/assets/status/<int:asset_id>", methods=["GET"])
@token_required
def check_asset_status(current_user, asset_id):
    """
    Check the generation status of an asset.
    Useful for polling during async generation.
    
    Args:
        asset_id: Asset's database ID
        
    Returns:
        JSON response with status information
    """
    asset = get_asset_by_id(asset_id)
    
    if not asset:
        return jsonify({
            "status": "error",
            "error": "Asset not found"
        }), 404
    
    # Verify ownership
    if asset['user_id'] != current_user['user_id']:
        return jsonify({
            "status": "error",
            "error": "Access denied"
        }), 403
    
    response = {
        "status": "success",
        "asset_id": asset_id,
        "generation_status": asset['generation_status']
    }
    
    if asset['generation_status'] == 'completed':
        response.update({
            "file_url": f"/static/{asset['file_path']}" if asset.get('file_path') else None,
            "thumbnail_url": f"/static/{asset['thumbnail_url']}" if asset.get('thumbnail_url') else None
        })
    elif asset['generation_status'] == 'failed':
        response["error"] = asset.get('generation_error', 'Unknown error')
    
    return jsonify(response), 200
