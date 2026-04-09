"""
Venues management endpoints.

Venue ``width``, ``height``, and ``depth`` are stored and interpreted as **feet** everywhere
in the app (2D planner, layout JSON, 3D viewer). Existing rows created before this convention
may have been entered as meters — migrate by multiplying by ~3.28084 if needed, or reset demo data.
"""

from flask import Blueprint, request, jsonify
import logging

from database import execute_query, execute_insert
from middleware.auth_middleware import token_required
from utils.file_manager import reset_uploads

logger = logging.getLogger(__name__)

venues_bp = Blueprint('venues', __name__)


@venues_bp.route('/venues', methods=['GET'])
@token_required
def get_user_venues(current_user):
    """
    Get all venues for the authenticated user.
    
    Returns:
        200: List of user's venues
        401: Not authenticated
    """
    try:
        venues = execute_query(
            """
            SELECT venue_id, venue_identifier, venue_name, width, height, depth,
                   floor_material_type, floor_material_color,
                   ceiling_material_type, ceiling_material_color,
                   is_public, created_at, updated_at
            FROM venues
            WHERE user_id = %s
            ORDER BY updated_at DESC
            """,
            (current_user['user_id'],),
            fetch=True
        )
        
        return jsonify({
            'status': 'success',
            'venues': venues or []
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching venues: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch venues'}), 500


@venues_bp.route('/venues/<venue_identifier>', methods=['GET'])
@token_required
def get_venue(current_user, venue_identifier: str):
    """
    Get a specific venue by identifier.
    
    Returns:
        200: Venue data
        403: Not authorized to access this venue
        404: Venue not found
    """
    try:
        venue = execute_query(
            """
            SELECT v.*, 
                   (SELECT COUNT(*) FROM venue_walls WHERE venue_id = v.venue_id) as wall_count,
                   (SELECT COUNT(*) FROM venue_assets WHERE venue_id = v.venue_id) as asset_count
            FROM venues v
            WHERE v.venue_identifier = %s
            """,
            (venue_identifier,),
            fetch_one=True
        )
        
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404
        
        # Check if user owns this venue or if it's public
        if venue['user_id'] != current_user['user_id'] and not venue.get('is_public'):
            return jsonify({'error': 'Not authorized to access this venue'}), 403
        
        return jsonify({
            'status': 'success',
            'venue': venue
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching venue: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch venue'}), 500


@venues_bp.route('/venues', methods=['POST'])
@token_required
def create_venue(current_user):
    """
    Create a new venue for the authenticated user.
    
    Expected JSON body (dimensions in feet):
        {
            "venue_identifier": "my-venue-2024",
            "venue_name": "My Conference Hall",
            "width": 40,
            "height": 9,
            "depth": 40
        }
    
    Returns:
        201: Venue created
        400: Invalid input
        409: Venue identifier already exists for this user
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Missing request body'}), 400
        
        venue_identifier = data.get('venue_identifier', '').strip()
        venue_name = data.get('venue_name', '').strip()
        width = data.get('width', 40)
        height = data.get('height', 9)
        depth = data.get('depth', 40)
        
        if not venue_identifier or not venue_name:
            return jsonify({'error': 'venue_identifier and venue_name are required'}), 400
        
        try:
            width = float(width)
            height = float(height)
            depth = float(depth)
        except (TypeError, ValueError):
            return jsonify({'error': 'width, height, and depth must be numbers'}), 400
        
        if not (5 <= width <= 330):
            return jsonify({'error': 'width must be between 5 and 330 feet'}), 400
        if not (6 <= height <= 40):
            return jsonify({'error': 'height must be between 6 and 40 feet'}), 400
        if not (5 <= depth <= 330):
            return jsonify({'error': 'depth must be between 5 and 330 feet'}), 400
        
        # Check if venue identifier already exists for this user
        existing = execute_query(
            "SELECT venue_id FROM venues WHERE user_id = %s AND venue_identifier = %s",
            (current_user['user_id'], venue_identifier),
            fetch_one=True
        )
        
        if existing:
            return jsonify({'error': 'Venue identifier already exists'}), 409
        
        # Create venue
        venue_id = execute_insert(
            """
            INSERT INTO venues (user_id, venue_identifier, venue_name, width, height, depth)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING venue_id
            """,
            (current_user['user_id'], venue_identifier, venue_name, width, height, depth)
        )
        
        logger.info(f"Venue created: {venue_identifier} (ID: {venue_id}) by user {current_user['username']}")
        
        # Create default 4 walls (clockwise: north, east, south, west)
        default_walls = [
            {
                'id': 'wall_north',
                'name': 'North Wall',
                'coordinates': [25, 10, 100, 10],  # Top of floor plan
                'length': width,
                'height': height
            },
            {
                'id': 'wall_east',
                'name': 'East Wall',
                'coordinates': [100, 10, 100, 100],  # Right side
                'length': depth,
                'height': height
            },
            {
                'id': 'wall_south',
                'name': 'South Wall',
                'coordinates': [0, 100, 100, 100],  # Bottom of floor plan
                'length': width,
                'height': height
            },
            {
                'id': 'wall_west',
                'name': 'West Wall',
                'coordinates': [0, 10, 0, 100],  # Left side
                'length': depth,
                'height': height
            }
        ]
        
        for wall in default_walls:
            try:
                execute_insert(
                    """
                    INSERT INTO venue_walls (
                        venue_id, wall_identifier, wall_name, wall_type,
                        length, height,
                        coord_x1, coord_y1, coord_x2, coord_y2
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING wall_id
                    """,
                    (
                        venue_id,
                        wall['id'],
                        wall['name'],
                        'straight',
                        wall['length'],
                        wall['height'],
                        wall['coordinates'][0],
                        wall['coordinates'][1],
                        wall['coordinates'][2],
                        wall['coordinates'][3]
                    )
                )
            except Exception as e:
                logger.warning(f"Could not create default wall {wall['id']}: {e}")
        
        logger.info(f"Created {len(default_walls)} default walls for venue {venue_identifier}")
        
        return jsonify({
            'status': 'success',
            'message': 'Venue created successfully',
            'venue': {
                'venue_id': venue_id,
                'venue_identifier': venue_identifier,
                'venue_name': venue_name,
                'width': width,
                'height': height,
                'depth': depth
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating venue: {e}", exc_info=True)
        return jsonify({'error': 'Failed to create venue'}), 500


@venues_bp.route('/venues/<venue_identifier>', methods=['DELETE'])
@token_required
def delete_venue(current_user, venue_identifier: str):
    """
    Delete a venue (must be owner).
    
    Returns:
        200: Venue deleted
        403: Not authorized
        404: Venue not found
    """
    try:
        # Check ownership
        venue = execute_query(
            "SELECT venue_id, user_id FROM venues WHERE venue_identifier = %s",
            (venue_identifier,),
            fetch_one=True
        )
        
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404
        
        if venue['user_id'] != current_user['user_id']:
            return jsonify({'error': 'Not authorized to delete this venue'}), 403
        
        # Delete venue from DB (cascade will handle walls, assets, floor plans, etc.)
        execute_query(
            "DELETE FROM venues WHERE venue_id = %s",
            (venue['venue_id'],)
        )
        
        # Delete all uploads for this venue (wall images, layout, floor plan, generated GLB)
        try:
            reset_uploads(venue_identifier)
            logger.info(f"Deleted uploads folder for venue: {venue_identifier}")
        except Exception as e:
            logger.warning(f"Could not delete uploads for venue {venue_identifier}: {e}")
        
        logger.info(f"Venue deleted: {venue_identifier} by user {current_user['username']}")
        
        return jsonify({
            'status': 'success',
            'message': 'Venue deleted successfully'
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting venue: {e}", exc_info=True)
        return jsonify({'error': 'Failed to delete venue'}), 500
