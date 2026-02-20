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
from services.asset_service import (
    create_user_asset,
    create_pending_asset,
    update_asset_status,
    get_user_assets,
    get_asset_by_id,
    delete_user_asset,
    get_user_asset_count
)

logger = logging.getLogger(__name__)

assets_bp = Blueprint("assets", __name__)


@assets_bp.route("/assets/generate", methods=["POST"])
@token_required
def generate_asset(current_user):
    """
    Generate a 3D asset from an uploaded image using InstantMesh.
    
    Expects multipart form-data containing:
        - file: Image file (jpg, jpeg, png, webp)
        - asset_name: (Optional) Name for the asset
        
    The authenticated user's ID is extracted from the JWT token.
    
    Returns:
        JSON response with asset details or error
    """
    user_id = current_user['user_id']
    
    # Get uploaded file
    file = request.files.get("file")
    if not file:
        return jsonify({
            "status": "error",
            "error": "No image file provided"
        }), 400
    
    # Get optional asset name
    asset_name = request.form.get("asset_name", "").strip()
    if not asset_name:
        # Generate default name from filename
        original_filename = file.filename or "asset"
        asset_name = os.path.splitext(original_filename)[0][:50]  # Limit to 50 chars
        if not asset_name:
            asset_name = "Untitled Asset"
    
    # Read file content
    file_bytes = file.read()
    if not file_bytes:
        return jsonify({
            "status": "error",
            "error": "Empty file uploaded"
        }), 400
    
    # Get InstantMesh service
    instantmesh = get_instantmesh_service()
    
    # Validate image
    is_valid, error_msg = instantmesh.validate_image(file_bytes, file.filename or "image.jpg")
    if not is_valid:
        return jsonify({
            "status": "error",
            "error": error_msg
        }), 400
    
    # Create pending asset record
    asset_id = create_pending_asset(user_id, asset_name)
    if not asset_id:
        return jsonify({
            "status": "error",
            "error": "Failed to create asset record"
        }), 500
    
    # Update status to processing
    update_asset_status(asset_id, 'processing')
    
    try:
        # Convert image to 3D
        result = instantmesh.convert_image_to_3d(
            user_id=user_id,
            file_bytes=file_bytes,
            original_filename=file.filename or "image.jpg",
            asset_name=asset_name
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
        
        # Update asset with generated file info
        update_asset_status(
            asset_id,
            'completed',
            file_path=result['glb_path'],
            source_image_path=result.get('source_image_path'),
            thumbnail_url=result.get('thumbnail_url'),
            file_size_bytes=result.get('file_size_bytes')
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
    
    # Transform assets for response
    response_assets = []
    for asset in assets:
        response_assets.append({
            "asset_id": asset['asset_id'],
            "asset_name": asset['asset_name'],
            "file_url": f"/static/{asset['file_path']}" if asset.get('file_path') else None,
            "thumbnail_url": f"/static/{asset['thumbnail_url']}" if asset.get('thumbnail_url') else None,
            "source_image_url": f"/static/{asset['source_image_path']}" if asset.get('source_image_path') else None,
            "file_size_bytes": asset.get('file_size_bytes'),
            "generation_status": asset['generation_status'],
            "generation_error": asset.get('generation_error'),
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
            "metadata": asset.get('metadata', {}),
            "created_at": asset.get('created_at'),
            "updated_at": asset.get('updated_at')
        }
    }), 200


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
