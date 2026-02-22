import os
import re
from typing import Dict, List, Optional

from utils.file_manager import UPLOAD_ROOT

SEQ_PATTERN = re.compile(r"^seq_(\d+)\.jpg$", re.IGNORECASE)


def required_photos_for_wall(wall: Dict) -> int:
    """
    Fallback mode: force single photo per wall for reliability.
    """
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
    """Return wall ids that already reached required segment count."""
    completed: List[str] = []
    for wall in walls:
        required = required_photos_for_wall(wall)
        captured = captured_segments_for_wall(venue_id, wall["id"])
        if captured >= required:
            completed.append(wall["id"])

    return completed


def next_wall(walls_metadata: List[Dict], completed_ids: List[str]) -> Optional[Dict]:
    """Return the next wall metadata that is not completed, or None if done."""
    for wall in walls_metadata:
        if wall["id"] not in completed_ids:
            return wall
    return None

