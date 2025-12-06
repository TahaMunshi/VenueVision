import os
from typing import List, Dict, Optional

def _get_walls_metadata() -> List[Dict]:
    """
    Returns the standard sequence of walls for any venue.
    """
    return [
        {"id": "wall_north", "name": "North Wall", "direction": "North"},
        {"id": "wall_east", "name": "East Wall", "direction": "East"},
        {"id": "wall_south", "name": "South Wall", "direction": "South"},
        {"id": "wall_west", "name": "West Wall", "direction": "West"}
    ]


def _get_uploads_base_path(venue_id: str) -> str:
    """
    Returns the base path where uploads are stored for a venue.
    """
    return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'uploads', venue_id))


def _get_completed_walls(venue_id: str) -> List[str]:
    """
    Returns a list of wall IDs that have been completed (have at least one file).
    """
    completed_walls = []
    base_path = _get_uploads_base_path(venue_id)
    
    if os.path.exists(base_path):
        walls = _get_walls_metadata()
        for wall in walls:
            wall_path = os.path.join(base_path, wall['id'])
            if os.path.exists(wall_path) and len(os.listdir(wall_path)) > 0:
                completed_walls.append(wall['id'])
    
    return completed_walls


def get_venue_walls(venue_id: str) -> List[Dict]:
    """
    Returns the list of all walls metadata for a venue.
    """
    return _get_walls_metadata()


def get_current_target_wall(venue_id: str) -> Optional[Dict]:
    """
    Returns the current target wall that needs to be photographed next.
    Returns None if all walls are complete.
    Guarantees a valid target for new venues (always returns first wall).
    """
    walls = _get_walls_metadata()
    completed_walls = _get_completed_walls(venue_id)
    
    # Find the first wall that isn't completed
    for wall in walls:
        if wall['id'] not in completed_walls:
            return wall
    
    # All walls are complete
    return None


def get_venue_progress(venue_id):
    """
    Determines which wall needs to be photographed next based on existing files.
    This is a legacy function - consider using get_venue_walls() and get_current_target_wall() instead.
    """
    walls = _get_walls_metadata()
    completed_walls = _get_completed_walls(venue_id)
    current_target = get_current_target_wall(venue_id)
    
    # Legacy format: if no target, return a "done" object
    if current_target is None:
        is_complete = True
        current_target = {"id": "done", "name": "All Done", "direction": "None"}
    else:
        is_complete = False

    return {
        "total_walls": len(walls),
        "completed_count": len(completed_walls),
        "current_target": current_target,
        "is_complete": is_complete
    }