import os
from typing import Dict, List, Optional

from utils.file_manager import UPLOAD_ROOT


def completed_walls_for_venue(venue_id: str, walls: List[str]) -> List[str]:
    """Return wall ids that already have at least one uploaded capture."""
    completed: List[str] = []
    venue_dir = os.path.join(UPLOAD_ROOT, str(venue_id))
    if not os.path.isdir(venue_dir):
        return completed

    for wall in walls:
        wall_dir = os.path.join(venue_dir, wall)
        if not os.path.isdir(wall_dir):
            continue
        try:
            with os.scandir(wall_dir) as entries:
                has_files = any(entry.is_file() for entry in entries)
        except FileNotFoundError:
            has_files = False

        if has_files:
            completed.append(wall)

    return completed


def next_wall(walls_metadata: List[Dict], completed_ids: List[str]) -> Optional[Dict]:
    """Return the next wall metadata that is not completed, or None if done."""
    for wall in walls_metadata:
        if wall["id"] not in completed_ids:
            return wall
    return None

