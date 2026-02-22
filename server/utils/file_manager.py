import os
import re
from io import BufferedReader
from typing import Union, IO, Optional

from werkzeug.datastructures import FileStorage

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_ROOT = os.path.join(BASE_DIR, "static", "uploads")

SEQ_PATTERN = re.compile(r"seq_(\d+)\.jpg$", re.IGNORECASE)


def _ensure_directory(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _next_sequence_number(directory: str) -> int:
    existing = [
        int(match.group(1))
        for name in os.listdir(directory)
        if (match := SEQ_PATTERN.match(name))
    ]
    return max(existing, default=0) + 1


def save_wall_photo(
    venue_id: str,
    wall_id: str,
    file_obj: Union[FileStorage, IO[bytes], BufferedReader],
) -> str:
    """
    Save a wall photo following the structure:
        server/static/uploads/{venue_id}/{wall_id}/seq_XX.jpg

    Args:
        venue_id: Identifier for the venue.
        wall_id: Identifier for the wall.
        file_obj: File-like object (FileStorage or IO) positioned at the start.

    Returns:
        Absolute path to the saved photo.

    Raises:
        IOError: When the file cannot be written.
        ValueError: When required identifiers are missing.
    """

    if not venue_id or not wall_id:
        raise ValueError("Both venue_id and wall_id are required.")

    safe_venue = str(venue_id).strip().replace(" ", "_")
    safe_wall = str(wall_id).strip().replace(" ", "_")

    target_dir = os.path.join(UPLOAD_ROOT, safe_venue, safe_wall)
    _ensure_directory(target_dir)

    seq_num = _next_sequence_number(target_dir)
    filename = f"seq_{seq_num:02d}.jpg"
    file_path = os.path.join(target_dir, filename)

    # Normalize file_obj to a readable stream
    if isinstance(file_obj, FileStorage):
        file_stream = file_obj.stream
        file_stream.seek(0)
    else:
        file_stream = file_obj
        if hasattr(file_stream, "seek"):
            file_stream.seek(0)

    try:
        with open(file_path, "wb") as destination:
            chunk = file_stream.read()
            if chunk is None:
                raise IOError("Unable to read uploaded file.")
            destination.write(chunk)
    except OSError as exc:
        raise IOError(f"Failed to save file: {exc}") from exc

    return file_path


def save_floor_plan(
    venue_id: str,
    file_obj: Union[FileStorage, IO[bytes], BufferedReader],
) -> str:
    """
    Save a floor plan image for a venue.
    Structure: server/static/uploads/{venue_id}/floor_plan.jpg

    Args:
        venue_id: Identifier for the venue.
        file_obj: File-like object (FileStorage or IO) positioned at the start.

    Returns:
        Absolute path to the saved floor plan.

    Raises:
        IOError: When the file cannot be written.
        ValueError: When venue_id is missing.
    """
    if not venue_id:
        raise ValueError("venue_id is required.")

    safe_venue = str(venue_id).strip().replace(" ", "_")
    target_dir = os.path.join(UPLOAD_ROOT, safe_venue)
    _ensure_directory(target_dir)

    filename = "floor_plan.jpg"
    file_path = os.path.join(target_dir, filename)

    # Normalize file_obj to a readable stream
    if isinstance(file_obj, FileStorage):
        file_stream = file_obj.stream
        file_stream.seek(0)
    else:
        file_stream = file_obj
        if hasattr(file_stream, "seek"):
            file_stream.seek(0)

    try:
        with open(file_path, "wb") as destination:
            chunk = file_stream.read()
            if chunk is None:
                raise IOError("Unable to read uploaded file.")
            destination.write(chunk)
    except OSError as exc:
        raise IOError(f"Failed to save file: {exc}") from exc

    return file_path


def get_floor_plan_path(venue_id: str) -> Optional[str]:
    """
    Get the path to the floor plan for a venue if it exists.
    
    Returns:
        Absolute path to floor plan, or None if it doesn't exist.
    """
    safe_venue = str(venue_id).strip().replace(" ", "_")
    file_path = os.path.join(UPLOAD_ROOT, safe_venue, "floor_plan.jpg")
    
    if os.path.exists(file_path):
        return file_path
    return None


def reset_uploads(venue_id: Optional[str] = None) -> None:
    """
    Remove all uploads for a venue, or all venues if none specified.
    """
    target = UPLOAD_ROOT if venue_id is None else os.path.join(UPLOAD_ROOT, str(venue_id))
    if not os.path.exists(target):
        return
    # Safety: ensure we're deleting inside static/uploads
    target = os.path.abspath(target)
    if not target.startswith(os.path.abspath(UPLOAD_ROOT)):
        raise ValueError("Invalid reset target")
    import shutil
    shutil.rmtree(target, ignore_errors=True)


def delete_venue_wall_images(venue_id: str) -> int:
    """
    Delete all wall image directories for a venue (wall_north, wall_south, etc.).
    Keeps layout.json, floor_plan.jpg, venue.glb in the venue root.
    Returns number of directories removed.
    """
    import shutil
    safe_venue = str(venue_id).strip().replace(" ", "_")
    venue_path = os.path.join(UPLOAD_ROOT, safe_venue)
    if not os.path.isdir(venue_path):
        return 0
    venue_path = os.path.abspath(venue_path)
    if not venue_path.startswith(os.path.abspath(UPLOAD_ROOT)):
        raise ValueError("Invalid venue path")
    removed = 0
    for name in os.listdir(venue_path):
        item_path = os.path.join(venue_path, name)
        if os.path.isdir(item_path):
            shutil.rmtree(item_path, ignore_errors=True)
            removed += 1
    return removed




