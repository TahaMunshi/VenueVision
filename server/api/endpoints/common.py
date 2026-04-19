import os
import re
from typing import Dict, List, Optional

from utils.file_manager import UPLOAD_ROOT

SEQ_PATTERN = re.compile(r"^seq_(\d+)\.jpg$", re.IGNORECASE)


def required_photos_for_wall(wall: Dict) -> int:
    """
    Segment photos per wall (feet, same as venue / floor planner).

    Walls under 25 ft need a single capture/upload. Longer walls use roughly
    one segment per 10 ft: ceil(length_ft / 10), minimum 1.
    """
    import math
    length = wall.get("length")
    if length is None:
        return 1
    try:
        length_ft = float(length)
        if length_ft <= 0:
            return 1
        if length_ft < 25:
            return 1
        return max(1, int(math.ceil(length_ft / 10)))
    except (TypeError, ValueError):
        return 1


def captured_segments_for_wall(venue_id: str, wall_id: str) -> int:
    """Count captured wall segments using seq_XX.jpg files only."""
    wall_dir = os.path.join(UPLOAD_ROOT, str(venue_id), str(wall_id))
    if not os.path.isdir(wall_dir):
        return 0
    try:
        with os.scandir(wall_dir) as entries:
            return sum(1 for entry in entries if entry.is_file() and SEQ_PATTERN.match(entry.name))
    except FileNotFoundError:
        return 0


def completed_walls_for_venue(venue_id: str, walls: List[Dict]) -> List[str]:
    """
    Return wall ids that have been fully processed (stitch + remove + corners).
    A wall is complete only when processed_{wall_id}.jpg exists.
    """
    completed: List[str] = []
    for wall in walls:
        wall_dir = os.path.join(UPLOAD_ROOT, str(venue_id), str(wall["id"]))
        processed_path = os.path.join(wall_dir, f"processed_{wall['id']}.jpg")
        if os.path.isfile(processed_path):
            completed.append(wall["id"])
    return completed


def next_wall(walls_metadata: List[Dict], completed_ids: List[str]) -> Optional[Dict]:
    """Return the next wall metadata that is not completed, or None if done."""
    for wall in walls_metadata:
        if wall["id"] not in completed_ids:
            return wall
    return None

