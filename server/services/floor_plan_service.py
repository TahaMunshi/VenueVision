import os
import json
from typing import List, Dict, Optional

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
UPLOADS_DIR = os.path.join(BASE_DIR, 'static', 'uploads')

DEFAULT_WALLS = [
    {"id": "wall_north", "name": "North Wall", "direction": "North", "length": 20, "height": 8, "type": "straight"},
    {"id": "wall_east", "name": "East Wall", "direction": "East", "length": 20, "height": 8, "type": "straight"},
    {"id": "wall_south", "name": "South Wall", "direction": "South", "length": 20, "height": 8, "type": "straight"},
    {"id": "wall_west", "name": "West Wall", "direction": "West", "length": 20, "height": 8, "type": "straight"}
]
WALL_ORDER = {
    "wall_north": 0,
    "wall_east": 1,
    "wall_south": 2,
    "wall_west": 3,
}


def _load_layout(venue_id: str) -> Optional[Dict]:
    """
    Load layout.json for a venue if it exists.
    """
    layout_path = os.path.join(UPLOADS_DIR, str(venue_id), 'layout.json')
    if not os.path.exists(layout_path):
        return None
    try:
        with open(layout_path, 'r') as f:
            return json.load(f)
    except Exception:
        return None


def _get_walls_metadata(venue_id: str) -> List[Dict]:
    """
    Returns wall metadata, preferring saved layout walls when available.
    """
    layout = _load_layout(venue_id)
    if layout and isinstance(layout.get("walls"), list) and len(layout["walls"]) > 0:
        # Normalize structure: ensure id and name exist
        walls = []
        for idx, wall in enumerate(layout["walls"]):
            wid = wall.get("id") or f"wall_{idx+1}"
            name = wall.get("name") or f"Wall {idx+1}"
            coords = wall.get("coordinates")
            walls.append({
                "id": wid,
                "name": name,
                "direction": wall.get("direction", name),
                "coordinates": coords,
                "length": wall.get("length"),
                "height": wall.get("height"),
                "type": wall.get("type"),
            })
        return sorted(walls, key=lambda w: WALL_ORDER.get(w.get("id"), 999))
    return DEFAULT_WALLS


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
        walls = _get_walls_metadata(venue_id)
        for wall in walls:
            wall_path = os.path.join(base_path, wall['id'])
            if os.path.exists(wall_path) and len(os.listdir(wall_path)) > 0:
                completed_walls.append(wall['id'])
    
    return completed_walls


def get_venue_walls(venue_id: str) -> List[Dict]:
    """
    Returns the list of all walls metadata for a venue.
    """
    return _get_walls_metadata(venue_id)


def get_current_target_wall(venue_id: str) -> Optional[Dict]:
    """
    Returns the current target wall that needs to be photographed next.
    Returns None if all walls are complete.
    Guarantees a valid target for new venues (always returns first wall).
    """
    walls = _get_walls_metadata(venue_id)
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
    walls = _get_walls_metadata(venue_id)
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