"""
Asset service for managing user's 3D assets.
Handles database operations for user_assets table.
"""

import os
import json
import logging
from typing import Optional, Dict, List
from datetime import datetime

from database import execute_query, execute_insert

logger = logging.getLogger(__name__)


def create_user_asset(
    user_id: int,
    asset_name: str,
    file_path: str,
    source_image_path: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
    generation_status: str = 'completed',
    generation_error: Optional[str] = None,
    metadata: Optional[Dict] = None
) -> Optional[int]:
    """
    Create a new user asset record in the database.
    
    Args:
        user_id: User's database ID
        asset_name: Name of the asset
        file_path: Relative path to the GLB file
        source_image_path: Relative path to source image
        thumbnail_url: Relative path to thumbnail
        file_size_bytes: Size of the GLB file in bytes
        generation_status: Status of generation ('pending', 'processing', 'completed', 'failed')
        generation_error: Error message if generation failed
        metadata: Additional metadata as dict
        
    Returns:
        Asset ID if successful, None otherwise
    """
    try:
        metadata_json = json.dumps(metadata) if metadata else '{}'
        
        asset_id = execute_insert(
            """
            INSERT INTO user_assets (
                user_id, asset_name, file_path, source_image_path,
                thumbnail_url, file_size_bytes, generation_status,
                generation_error, metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING asset_id
            """,
            (
                user_id, asset_name, file_path, source_image_path,
                thumbnail_url, file_size_bytes, generation_status,
                generation_error, metadata_json
            )
        )
        
        logger.info(f"Created user asset: {asset_id} for user {user_id}")
        return asset_id
        
    except Exception as e:
        logger.error(f"Error creating user asset: {e}")
        return None


def create_pending_asset(user_id: int, asset_name: str) -> Optional[int]:
    """
    Create a pending asset record before starting generation.
    
    Args:
        user_id: User's database ID
        asset_name: Name of the asset
        
    Returns:
        Asset ID if successful, None otherwise
    """
    try:
        asset_id = execute_insert(
            """
            INSERT INTO user_assets (user_id, asset_name, file_path, generation_status)
            VALUES (%s, %s, %s, %s)
            RETURNING asset_id
            """,
            (user_id, asset_name, '', 'pending')
        )
        
        logger.info(f"Created pending asset: {asset_id} for user {user_id}")
        return asset_id
        
    except Exception as e:
        logger.error(f"Error creating pending asset: {e}")
        return None


def update_asset_status(
    asset_id: int,
    status: str,
    file_path: Optional[str] = None,
    source_image_path: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
    error: Optional[str] = None,
    metadata: Optional[Dict] = None,
    asset_layer: Optional[str] = None,
    width_m: Optional[float] = None,
    depth_m: Optional[float] = None,
    height_m: Optional[float] = None,
    is_table: Optional[bool] = None,
) -> bool:
    """
    Update asset generation status and related fields.
    
    Args:
        asset_id: Asset's database ID
        status: New status
        file_path: Updated file path
        source_image_path: Source image path
        thumbnail_url: Thumbnail URL
        file_size_bytes: File size
        error: Error message if failed
        metadata: Additional metadata
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Build dynamic UPDATE query
        updates = ["generation_status = %s"]
        params = [status]
        
        if file_path is not None:
            updates.append("file_path = %s")
            params.append(file_path)
        
        if source_image_path is not None:
            updates.append("source_image_path = %s")
            params.append(source_image_path)
        
        if thumbnail_url is not None:
            updates.append("thumbnail_url = %s")
            params.append(thumbnail_url)
        
        if file_size_bytes is not None:
            updates.append("file_size_bytes = %s")
            params.append(file_size_bytes)
        
        if error is not None:
            updates.append("generation_error = %s")
            params.append(error)
        
        if metadata is not None:
            updates.append("metadata = %s")
            params.append(json.dumps(metadata))
        
        if asset_layer is not None:
            updates.append("asset_layer = %s")
            params.append(asset_layer)
        
        if width_m is not None:
            updates.append("width_m = %s")
            params.append(width_m)
        
        if depth_m is not None:
            updates.append("depth_m = %s")
            params.append(depth_m)
        
        if height_m is not None:
            updates.append("height_m = %s")
            params.append(height_m)

        if is_table is not None:
            updates.append("is_table = %s")
            params.append(bool(is_table))

        params.append(asset_id)
        
        query = f"""
            UPDATE user_assets
            SET {', '.join(updates)}
            WHERE asset_id = %s
        """
        
        execute_query(query, tuple(params))
        logger.info(f"Updated asset {asset_id} status to {status}")
        return True
        
    except Exception as e:
        logger.error(f"Error updating asset status: {e}")
        return False


def get_user_assets(user_id: int, include_failed: bool = False) -> List[Dict]:
    """
    Get all assets for a specific user.
    
    Args:
        user_id: User's database ID
        include_failed: Whether to include failed assets
        
    Returns:
        List of asset dictionaries
    """
    try:
        if include_failed:
            query = """
                SELECT asset_id, user_id, asset_name, file_path, source_image_path,
                       thumbnail_url, file_size_bytes, generation_status, generation_error,
                       COALESCE(asset_layer, 'surface') as asset_layer,
                       COALESCE(width_m, 1.0) as width_m,
                       COALESCE(depth_m, 1.0) as depth_m,
                       COALESCE(height_m, 1.0) as height_m,
                       COALESCE(brightness, 1.0) as brightness,
                       COALESCE(is_table, false) as is_table,
                       metadata, created_at, updated_at
                FROM user_assets
                WHERE user_id = %s
                ORDER BY created_at DESC
            """
        else:
            query = """
                SELECT asset_id, user_id, asset_name, file_path, source_image_path,
                       thumbnail_url, file_size_bytes, generation_status, generation_error,
                       COALESCE(asset_layer, 'surface') as asset_layer,
                       COALESCE(width_m, 1.0) as width_m,
                       COALESCE(depth_m, 1.0) as depth_m,
                       COALESCE(height_m, 1.0) as height_m,
                       COALESCE(brightness, 1.0) as brightness,
                       COALESCE(is_table, false) as is_table,
                       metadata, created_at, updated_at
                FROM user_assets
                WHERE user_id = %s AND generation_status = 'completed'
                ORDER BY created_at DESC
            """
        
        assets = execute_query(query, (user_id,), fetch=True)
        
        if assets:
            # Convert datetime objects to ISO strings for JSON serialization
            for asset in assets:
                if asset.get('created_at'):
                    asset['created_at'] = asset['created_at'].isoformat()
                if asset.get('updated_at'):
                    asset['updated_at'] = asset['updated_at'].isoformat()
                # Parse metadata JSON if it's a string
                if asset.get('metadata') and isinstance(asset['metadata'], str):
                    try:
                        asset['metadata'] = json.loads(asset['metadata'])
                    except json.JSONDecodeError:
                        asset['metadata'] = {}
            
            return assets
        
        return []
        
    except Exception as e:
        logger.error(f"Error getting user assets: {e}")
        return []


def get_asset_by_id(asset_id: int) -> Optional[Dict]:
    """
    Get a specific asset by ID.
    
    Args:
        asset_id: Asset's database ID
        
    Returns:
        Asset dictionary or None
    """
    try:
        asset = execute_query(
            """
            SELECT asset_id, user_id, asset_name, file_path, source_image_path,
                   thumbnail_url, file_size_bytes, generation_status, generation_error,
                   COALESCE(asset_layer, 'surface') as asset_layer,
                   COALESCE(width_m, 1.0) as width_m,
                   COALESCE(depth_m, 1.0) as depth_m,
                   COALESCE(height_m, 1.0) as height_m,
                   COALESCE(brightness, 1.0) as brightness,
                   COALESCE(is_table, false) as is_table,
                   metadata, created_at, updated_at
            FROM user_assets
            WHERE asset_id = %s
            """,
            (asset_id,),
            fetch_one=True
        )
        
        if asset:
            if asset.get('created_at'):
                asset['created_at'] = asset['created_at'].isoformat()
            if asset.get('updated_at'):
                asset['updated_at'] = asset['updated_at'].isoformat()
            if asset.get('metadata') and isinstance(asset['metadata'], str):
                try:
                    asset['metadata'] = json.loads(asset['metadata'])
                except json.JSONDecodeError:
                    asset['metadata'] = {}
        
        return asset
        
    except Exception as e:
        logger.error(f"Error getting asset by ID: {e}")
        return None


def update_asset_properties(
    asset_id: int,
    user_id: int,
    asset_layer: Optional[str] = None,
    width_m: Optional[float] = None,
    depth_m: Optional[float] = None,
    height_m: Optional[float] = None,
    brightness: Optional[float] = None,
    is_table: Optional[bool] = None,
) -> bool:
    """
    Update asset layer, dimensions, or brightness (verifies ownership).
    
    Returns:
        True if updated, False otherwise
    """
    try:
        updates = []
        params = []
        if asset_layer is not None:
            if asset_layer not in ('floor', 'surface', 'ceiling'):
                asset_layer = 'surface'
            updates.append("asset_layer = %s")
            params.append(asset_layer)
        if width_m is not None:
            updates.append("width_m = %s")
            params.append(width_m)
        if depth_m is not None:
            updates.append("depth_m = %s")
            params.append(depth_m)
        if height_m is not None:
            updates.append("height_m = %s")
            params.append(height_m)
        if brightness is not None:
            updates.append("brightness = %s")
            params.append(max(0.1, min(3.0, float(brightness))))
        if is_table is not None:
            updates.append("is_table = %s")
            params.append(bool(is_table))
        if not updates:
            return True
        params.extend([asset_id, user_id])
        execute_query(
            f"UPDATE user_assets SET {', '.join(updates)} WHERE asset_id = %s AND user_id = %s",
            tuple(params)
        )
        return True
    except Exception as e:
        logger.error(f"Error updating asset properties: {e}")
        return False


def delete_user_asset(asset_id: int, user_id: int) -> bool:
    """
    Delete a user's asset (verifies ownership).
    
    Args:
        asset_id: Asset's database ID
        user_id: User's ID (for ownership verification)
        
    Returns:
        True if deleted, False otherwise
    """
    try:
        # First get the asset to verify ownership and get file paths
        asset = execute_query(
            """
            SELECT asset_id, file_path, source_image_path, thumbnail_url
            FROM user_assets
            WHERE asset_id = %s AND user_id = %s
            """,
            (asset_id, user_id),
            fetch_one=True
        )
        
        if not asset:
            logger.warning(f"Asset {asset_id} not found or not owned by user {user_id}")
            return False
        
        # Delete from database
        execute_query(
            "DELETE FROM user_assets WHERE asset_id = %s AND user_id = %s",
            (asset_id, user_id)
        )
        
        # Delete associated files
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        static_dir = os.path.join(base_dir, "static")
        
        for path_key in ['file_path', 'source_image_path', 'thumbnail_url']:
            if asset.get(path_key):
                full_path = os.path.join(static_dir, asset[path_key])
                if os.path.exists(full_path):
                    try:
                        os.remove(full_path)
                        logger.info(f"Deleted file: {full_path}")
                    except Exception as e:
                        logger.warning(f"Failed to delete file {full_path}: {e}")
        
        logger.info(f"Deleted asset {asset_id} for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error deleting asset: {e}")
        return False


def get_user_asset_count(user_id: int) -> int:
    """
    Get count of completed assets for a user.
    
    Args:
        user_id: User's database ID
        
    Returns:
        Number of completed assets
    """
    try:
        result = execute_query(
            """
            SELECT COUNT(*) as count
            FROM user_assets
            WHERE user_id = %s AND generation_status = 'completed'
            """,
            (user_id,),
            fetch_one=True
        )
        
        return result['count'] if result else 0
        
    except Exception as e:
        logger.error(f"Error getting asset count: {e}")
        return 0


def get_pending_assets(max_age_minutes: int = 30) -> List[Dict]:
    """
    Get assets that have been pending/processing for too long.
    Useful for cleanup or retry logic.
    
    Args:
        max_age_minutes: Maximum age in minutes for pending assets
        
    Returns:
        List of stale pending assets
    """
    try:
        assets = execute_query(
            """
            SELECT asset_id, user_id, asset_name, generation_status, created_at
            FROM user_assets
            WHERE generation_status IN ('pending', 'processing')
            AND created_at < NOW() - INTERVAL '%s minutes'
            ORDER BY created_at ASC
            """,
            (max_age_minutes,),
            fetch=True
        )
        
        return assets or []
        
    except Exception as e:
        logger.error(f"Error getting pending assets: {e}")
        return []


def mark_stale_assets_as_failed(max_age_minutes: int = 30) -> int:
    """
    Mark assets that have been pending/processing too long as failed.
    
    Args:
        max_age_minutes: Maximum age before marking as failed
        
    Returns:
        Number of assets marked as failed
    """
    try:
        # Get count first
        stale_assets = get_pending_assets(max_age_minutes)
        count = len(stale_assets)
        
        if count > 0:
            execute_query(
                """
                UPDATE user_assets
                SET generation_status = 'failed',
                    generation_error = 'Generation timed out'
                WHERE generation_status IN ('pending', 'processing')
                AND created_at < NOW() - INTERVAL '%s minutes'
                """,
                (max_age_minutes,)
            )
            
            logger.info(f"Marked {count} stale assets as failed")
        
        return count
        
    except Exception as e:
        logger.error(f"Error marking stale assets: {e}")
        return 0
