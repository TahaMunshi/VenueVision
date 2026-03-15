"""
Venue ownership and authorization helpers.
Used to protect venue-scoped endpoints (layout, walls, capture, floor-plan).
"""

from typing import Optional, Tuple, Any
from flask import jsonify

from database import execute_query


def get_venue_by_identifier(venue_identifier: str) -> Optional[dict]:
    """
    Resolve venue_identifier to venue record.
    Returns venue dict or None if not found.
    """
    venue = execute_query(
        """
        SELECT venue_id, venue_identifier, user_id, is_public
        FROM venues
        WHERE venue_identifier = %s
        """,
        (venue_identifier,),
        fetch_one=True,
    )
    return venue


def require_venue_access(
    venue_identifier: str,
    current_user: dict,
    require_owner: bool = True,
) -> Tuple[Optional[dict], Optional[tuple]]:
    """
    Check that the current user can access the venue.
    
    Args:
        venue_identifier: Venue identifier from URL
        current_user: Dict with user_id from token
        require_owner: If True, only owner can access. If False, owner or public read.
    
    Returns:
        (venue, None) if authorized
        (None, (response, status_code)) if unauthorized (to return from route)
    """
    venue = get_venue_by_identifier(venue_identifier)
    if not venue:
        return None, (jsonify({"error": "Venue not found"}), 404)

    if require_owner:
        if venue["user_id"] != current_user["user_id"]:
            return None, (jsonify({"error": "Not authorized to access this venue"}), 403)
    else:
        # Read access: owner or public
        if venue["user_id"] != current_user["user_id"] and not venue.get("is_public"):
            return None, (jsonify({"error": "Not authorized to access this venue"}), 403)

    return venue, None
