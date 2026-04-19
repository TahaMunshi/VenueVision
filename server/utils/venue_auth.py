"""
Venue ownership and authorization helpers.
Used to protect venue-scoped endpoints (layout, walls, capture, floor-plan).
"""

from typing import Optional, Tuple, Any
from flask import jsonify

from database import execute_query


def get_venue_by_identifier(venue_identifier: str) -> Optional[dict]:
    """
    Resolve venue slug or numeric venue_id (from URL) to venue record.
    """
    venue = execute_query(
        """
        SELECT venue_id, venue_identifier, user_id, is_public, is_published
        FROM venues
        WHERE venue_identifier = %s
        """,
        (venue_identifier,),
        fetch_one=True,
    )
    if venue:
        return venue
    # Links that used numeric id (e.g. /planner/1) still work
    if venue_identifier and venue_identifier.isdigit():
        venue = execute_query(
            """
            SELECT venue_id, venue_identifier, user_id, is_public, is_published
            FROM venues
            WHERE venue_id = %s
            """,
            (int(venue_identifier),),
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
        # Read access: owner, legacy public flag, or marketplace-published venue
        is_owner = venue["user_id"] == current_user["user_id"]
        can_public_read = bool(venue.get("is_public") or venue.get("is_published"))
        if not is_owner and not can_public_read:
            return None, (jsonify({"error": "Not authorized to access this venue"}), 403)

    return venue, None
