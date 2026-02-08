"""
Asset cleanup utilities for managing temporary files and stale assets.
Provides scheduled cleanup and manual cleanup functions.
"""

import os
import shutil
import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict

from services.asset_service import mark_stale_assets_as_failed, get_pending_assets
from services.instantmesh_service import get_instantmesh_service

logger = logging.getLogger(__name__)

# Configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(BASE_DIR, "temp")
USER_ASSETS_ROOT = os.path.join(BASE_DIR, "static", "user_assets")


def cleanup_temp_files(max_age_hours: int = 24) -> Dict:
    """
    Clean up old temporary files from the temp directory.
    
    Args:
        max_age_hours: Maximum age of temp files before deletion
        
    Returns:
        Dict with cleanup statistics
    """
    stats = {
        'directories_cleaned': 0,
        'files_cleaned': 0,
        'bytes_freed': 0,
        'errors': []
    }
    
    if not os.path.exists(TEMP_DIR):
        return stats
    
    cutoff_time = time.time() - (max_age_hours * 3600)
    
    try:
        for root, dirs, files in os.walk(TEMP_DIR, topdown=False):
            # Clean up old files
            for name in files:
                file_path = os.path.join(root, name)
                try:
                    if os.path.getmtime(file_path) < cutoff_time:
                        file_size = os.path.getsize(file_path)
                        os.remove(file_path)
                        stats['files_cleaned'] += 1
                        stats['bytes_freed'] += file_size
                        logger.debug(f"Deleted temp file: {file_path}")
                except Exception as e:
                    stats['errors'].append(f"Failed to delete {file_path}: {e}")
            
            # Clean up empty directories
            for name in dirs:
                dir_path = os.path.join(root, name)
                try:
                    if os.path.getmtime(dir_path) < cutoff_time:
                        # Only remove if empty
                        if not os.listdir(dir_path):
                            os.rmdir(dir_path)
                            stats['directories_cleaned'] += 1
                            logger.debug(f"Deleted empty temp dir: {dir_path}")
                except Exception as e:
                    stats['errors'].append(f"Failed to delete dir {dir_path}: {e}")
    
    except Exception as e:
        stats['errors'].append(f"Error during temp cleanup: {e}")
        logger.error(f"Error during temp cleanup: {e}")
    
    logger.info(
        f"Temp cleanup complete: {stats['files_cleaned']} files, "
        f"{stats['directories_cleaned']} dirs, "
        f"{stats['bytes_freed'] / 1024 / 1024:.2f} MB freed"
    )
    
    return stats


def cleanup_instantmesh_temp(max_age_hours: int = 24) -> int:
    """
    Clean up InstantMesh-specific temporary files.
    
    Args:
        max_age_hours: Maximum age of temp files
        
    Returns:
        Number of directories cleaned
    """
    instantmesh = get_instantmesh_service()
    return instantmesh.cleanup_old_temp_files(max_age_hours)


def cleanup_stale_assets(max_age_minutes: int = 30) -> int:
    """
    Mark assets that have been processing for too long as failed.
    
    Args:
        max_age_minutes: Maximum processing time before marking as failed
        
    Returns:
        Number of assets marked as failed
    """
    return mark_stale_assets_as_failed(max_age_minutes)


def cleanup_orphaned_files() -> Dict:
    """
    Find and optionally remove files that don't have corresponding database records.
    
    Returns:
        Dict with list of orphaned files (doesn't delete automatically)
    """
    from database import execute_query
    
    stats = {
        'orphaned_files': [],
        'orphaned_directories': [],
        'total_orphaned_size': 0
    }
    
    if not os.path.exists(USER_ASSETS_ROOT):
        return stats
    
    try:
        # Get all file paths from database
        db_assets = execute_query(
            """
            SELECT file_path, source_image_path, thumbnail_url
            FROM user_assets
            WHERE file_path IS NOT NULL
            """,
            fetch=True
        )
        
        # Build set of known file paths
        known_paths = set()
        for asset in (db_assets or []):
            for key in ['file_path', 'source_image_path', 'thumbnail_url']:
                if asset.get(key):
                    known_paths.add(asset[key])
        
        # Walk user assets directory
        for user_dir in os.listdir(USER_ASSETS_ROOT):
            user_path = os.path.join(USER_ASSETS_ROOT, user_dir)
            if not os.path.isdir(user_path):
                continue
            
            for filename in os.listdir(user_path):
                file_path = os.path.join(user_path, filename)
                relative_path = f"user_assets/{user_dir}/{filename}"
                
                if relative_path not in known_paths:
                    file_size = os.path.getsize(file_path) if os.path.isfile(file_path) else 0
                    stats['orphaned_files'].append({
                        'path': file_path,
                        'relative_path': relative_path,
                        'size': file_size
                    })
                    stats['total_orphaned_size'] += file_size
        
        # Check for empty user directories
        for user_dir in os.listdir(USER_ASSETS_ROOT):
            user_path = os.path.join(USER_ASSETS_ROOT, user_dir)
            if os.path.isdir(user_path) and not os.listdir(user_path):
                stats['orphaned_directories'].append(user_path)
    
    except Exception as e:
        logger.error(f"Error checking for orphaned files: {e}")
    
    return stats


def delete_orphaned_files(dry_run: bool = True) -> Dict:
    """
    Delete orphaned files that don't have database records.
    
    Args:
        dry_run: If True, only report what would be deleted
        
    Returns:
        Dict with deletion results
    """
    stats = cleanup_orphaned_files()
    
    if dry_run:
        stats['action'] = 'dry_run'
        return stats
    
    deleted_count = 0
    deleted_size = 0
    
    for orphan in stats['orphaned_files']:
        try:
            os.remove(orphan['path'])
            deleted_count += 1
            deleted_size += orphan['size']
            logger.info(f"Deleted orphaned file: {orphan['path']}")
        except Exception as e:
            logger.error(f"Failed to delete orphaned file {orphan['path']}: {e}")
    
    for dir_path in stats['orphaned_directories']:
        try:
            os.rmdir(dir_path)
            logger.info(f"Deleted empty directory: {dir_path}")
        except Exception as e:
            logger.error(f"Failed to delete empty directory {dir_path}: {e}")
    
    stats['action'] = 'deleted'
    stats['deleted_count'] = deleted_count
    stats['deleted_size'] = deleted_size
    
    return stats


def run_full_cleanup(
    temp_max_age_hours: int = 24,
    stale_asset_minutes: int = 30,
    delete_orphans: bool = False
) -> Dict:
    """
    Run a complete cleanup process.
    
    Args:
        temp_max_age_hours: Max age for temp files
        stale_asset_minutes: Max processing time for assets
        delete_orphans: Whether to delete orphaned files
        
    Returns:
        Dict with all cleanup statistics
    """
    logger.info("Starting full cleanup process...")
    
    results = {
        'timestamp': datetime.utcnow().isoformat(),
        'temp_cleanup': cleanup_temp_files(temp_max_age_hours),
        'instantmesh_cleanup': cleanup_instantmesh_temp(temp_max_age_hours),
        'stale_assets_marked': cleanup_stale_assets(stale_asset_minutes),
        'orphan_check': delete_orphaned_files(dry_run=not delete_orphans)
    }
    
    logger.info(f"Full cleanup complete: {results}")
    return results


def get_storage_stats() -> Dict:
    """
    Get storage usage statistics for user assets.
    
    Returns:
        Dict with storage statistics
    """
    stats = {
        'total_size_bytes': 0,
        'total_files': 0,
        'by_user': {},
        'by_type': {
            'glb': {'count': 0, 'size': 0},
            'images': {'count': 0, 'size': 0},
            'thumbnails': {'count': 0, 'size': 0},
            'other': {'count': 0, 'size': 0}
        }
    }
    
    if not os.path.exists(USER_ASSETS_ROOT):
        return stats
    
    try:
        for user_dir in os.listdir(USER_ASSETS_ROOT):
            user_path = os.path.join(USER_ASSETS_ROOT, user_dir)
            if not os.path.isdir(user_path):
                continue
            
            user_stats = {'size': 0, 'files': 0}
            
            for filename in os.listdir(user_path):
                file_path = os.path.join(user_path, filename)
                if not os.path.isfile(file_path):
                    continue
                
                file_size = os.path.getsize(file_path)
                stats['total_size_bytes'] += file_size
                stats['total_files'] += 1
                user_stats['size'] += file_size
                user_stats['files'] += 1
                
                # Categorize by type
                ext = os.path.splitext(filename.lower())[1]
                if ext == '.glb':
                    stats['by_type']['glb']['count'] += 1
                    stats['by_type']['glb']['size'] += file_size
                elif ext in ['.jpg', '.jpeg', '.png', '.webp']:
                    if filename.startswith('thumb_'):
                        stats['by_type']['thumbnails']['count'] += 1
                        stats['by_type']['thumbnails']['size'] += file_size
                    else:
                        stats['by_type']['images']['count'] += 1
                        stats['by_type']['images']['size'] += file_size
                else:
                    stats['by_type']['other']['count'] += 1
                    stats['by_type']['other']['size'] += file_size
            
            stats['by_user'][user_dir] = user_stats
    
    except Exception as e:
        logger.error(f"Error getting storage stats: {e}")
    
    return stats
