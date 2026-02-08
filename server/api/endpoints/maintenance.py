import logging

from flask import Blueprint, jsonify, request

from utils.file_manager import reset_uploads
from utils.asset_cleanup import (
    cleanup_temp_files,
    cleanup_stale_assets,
    cleanup_orphaned_files,
    delete_orphaned_files,
    run_full_cleanup,
    get_storage_stats
)

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


@maintenance_bp.route("/cleanup/temp", methods=["POST"])
def cleanup_temp():
    """
    Clean up temporary files older than specified age.
    
    JSON body (optional):
        - max_age_hours: Maximum age of files in hours (default: 24)
    """
    try:
        data = request.get_json(silent=True) or {}
        max_age_hours = data.get("max_age_hours", 24)
        
        result = cleanup_temp_files(max_age_hours)
        
        return jsonify({
            "status": "success",
            "message": "Temp cleanup complete",
            "result": result
        }), 200
    except Exception as e:
        logger.error(f"Error during temp cleanup: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@maintenance_bp.route("/cleanup/stale-assets", methods=["POST"])
def cleanup_stale():
    """
    Mark assets that have been processing too long as failed.
    
    JSON body (optional):
        - max_age_minutes: Maximum processing time in minutes (default: 30)
    """
    try:
        data = request.get_json(silent=True) or {}
        max_age_minutes = data.get("max_age_minutes", 30)
        
        count = cleanup_stale_assets(max_age_minutes)
        
        return jsonify({
            "status": "success",
            "message": f"Marked {count} stale assets as failed",
            "count": count
        }), 200
    except Exception as e:
        logger.error(f"Error during stale asset cleanup: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@maintenance_bp.route("/cleanup/orphans", methods=["GET"])
def check_orphans():
    """
    Check for orphaned files (files without database records).
    Does not delete - just reports.
    """
    try:
        result = cleanup_orphaned_files()
        
        return jsonify({
            "status": "success",
            "orphaned_files_count": len(result['orphaned_files']),
            "orphaned_directories_count": len(result['orphaned_directories']),
            "total_orphaned_size_mb": result['total_orphaned_size'] / 1024 / 1024,
            "orphaned_files": result['orphaned_files'][:50],  # Limit to 50 for response size
            "orphaned_directories": result['orphaned_directories']
        }), 200
    except Exception as e:
        logger.error(f"Error checking orphans: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@maintenance_bp.route("/cleanup/orphans", methods=["DELETE"])
def delete_orphans():
    """
    Delete orphaned files (files without database records).
    
    Query params:
        - confirm: Must be 'true' to actually delete
    """
    try:
        confirm = request.args.get('confirm', 'false').lower() == 'true'
        
        if not confirm:
            return jsonify({
                "status": "error",
                "message": "Add ?confirm=true to actually delete orphaned files"
            }), 400
        
        result = delete_orphaned_files(dry_run=False)
        
        return jsonify({
            "status": "success",
            "message": "Orphaned files deleted",
            "deleted_count": result.get('deleted_count', 0),
            "deleted_size_mb": result.get('deleted_size', 0) / 1024 / 1024
        }), 200
    except Exception as e:
        logger.error(f"Error deleting orphans: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@maintenance_bp.route("/cleanup/full", methods=["POST"])
def full_cleanup():
    """
    Run a complete cleanup process.
    
    JSON body (optional):
        - temp_max_age_hours: Max age for temp files (default: 24)
        - stale_asset_minutes: Max processing time for assets (default: 30)
        - delete_orphans: Whether to delete orphaned files (default: false)
    """
    try:
        data = request.get_json(silent=True) or {}
        
        result = run_full_cleanup(
            temp_max_age_hours=data.get("temp_max_age_hours", 24),
            stale_asset_minutes=data.get("stale_asset_minutes", 30),
            delete_orphans=data.get("delete_orphans", False)
        )
        
        return jsonify({
            "status": "success",
            "message": "Full cleanup complete",
            "result": result
        }), 200
    except Exception as e:
        logger.error(f"Error during full cleanup: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@maintenance_bp.route("/storage/stats", methods=["GET"])
def storage_stats():
    """
    Get storage usage statistics for user assets.
    """
    try:
        stats = get_storage_stats()
        
        return jsonify({
            "status": "success",
            "total_size_mb": stats['total_size_bytes'] / 1024 / 1024,
            "total_files": stats['total_files'],
            "by_type": {
                k: {
                    'count': v['count'],
                    'size_mb': v['size'] / 1024 / 1024
                }
                for k, v in stats['by_type'].items()
            },
            "users_count": len(stats['by_user'])
        }), 200
    except Exception as e:
        logger.error(f"Error getting storage stats: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

