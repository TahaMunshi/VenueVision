"""
Object removal service: SAM + LaMa inpainting.
Removes objects from wall images by clicking on them.
Uses Hugging Face Spaces via gradio_client when configured.
Falls back to no-op (return original) if unavailable.
"""
import logging
import os
import tempfile
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Configurable HF Space for SAM + LaMa inpainting
# Set INPAINT_SPACE_URL env var, e.g. "InpaintAI/Inpaint-Anything" or full URL
INPAINT_SPACE_URL = os.getenv("INPAINT_SPACE_URL", "").strip()


def _download_url_to_path(url: str, output_path: str) -> bool:
    """Download file from URL and write to output_path. Returns True on success."""
    try:
        import urllib.request
        with urllib.request.urlopen(url, timeout=60) as resp:
            if resp.status != 200:
                logger.warning(f"Object removal: URL returned {resp.status}")
                return False
            data = resp.read()
        with open(output_path, "wb") as f:
            f.write(data)
        logger.info(f"Object removal: Downloaded {len(data)} bytes from URL to {output_path}")
        return True
    except Exception as e:
        logger.warning(f"Object removal: URL download failed: {e}")
        return False


def _safe_copy(src: str, dst: str) -> None:
    """Copy src to dst, skipping if they are the same file (avoids shutil error)."""
    if os.path.abspath(os.path.normpath(src)) == os.path.abspath(os.path.normpath(dst)):
        return  # Same file, no-op
    import shutil
    shutil.copy2(src, dst)


def _write_result_to_path(result_path: str, output_path: str) -> None:
    """
    Write result file to output_path. Uses byte copy to always overwrite,
    even when paths might resolve to same file (e.g. symlinks, Docker).
    """
    with open(result_path, "rb") as f:
        data = f.read()
    with open(output_path, "wb") as f:
        f.write(data)


def remove_object_at_point(
    image_path: str,
    x: int,
    y: int,
    output_path: str,
) -> Tuple[bool, Optional[str]]:
    """
    Remove object at (x, y) from image using SAM + LaMa.
    Saves result to output_path.

    Returns:
        (success, error_message)
    """
    if not os.path.isfile(image_path):
        return False, "Image file not found"

    if not INPAINT_SPACE_URL:
        logger.warning(
            "INPAINT_SPACE_URL not set. Object removal disabled. "
            "Set INPAINT_SPACE_URL to a Hugging Face Space (e.g. 'InpaintAI/Inpaint-Anything') to enable."
        )
        try:
            _safe_copy(image_path, output_path)
        except OSError as e:
            return False, str(e)
        return True, None

    try:
        from gradio_client import Client, handle_file
    except ImportError:
        logger.warning("gradio_client not installed. Copying original image.")
        _safe_copy(image_path, output_path)
        return True, None

    try:
        hf_token = os.getenv("HF_TOKEN") or None
        download_dir = os.path.join(tempfile.gettempdir(), "gradio")
        os.makedirs(download_dir, exist_ok=True)
        client = Client(
            INPAINT_SPACE_URL,
            token=hf_token,
            verbose=False,
            download_files=download_dir,
        )
        logger.info(f"Object removal: Connected to {INPAINT_SPACE_URL}")

        result = client.predict(
            handle_file(image_path),
            int(x), int(y),
            api_name="/predict"
        )

        if result is None:
            logger.warning("Object removal: predict returned None, using original")
            _safe_copy(image_path, output_path)
            return True, None

        # Extract file path/URL from various gradio_client result formats
        out_file = result
        if isinstance(result, (tuple, list)):
            out_file = result[0] if result else None
        if isinstance(out_file, dict):
            out_file = out_file.get("path") or out_file.get("url") or out_file.get("value") or out_file.get("name")

        if not out_file or not isinstance(out_file, str):
            logger.warning(f"Object removal: No valid result file (got {type(out_file)}), using original")
            _safe_copy(image_path, output_path)
            return True, None

        # Handle URL (gradio sometimes returns download URLs instead of local paths)
        if out_file.startswith("http://") or out_file.startswith("https://"):
            if _download_url_to_path(out_file, output_path):
                return True, None
            logger.warning("Object removal: URL download failed, using original")
            _safe_copy(image_path, output_path)
            return True, None

        # Handle local file path (client downloads to temp)
        if os.path.exists(out_file) and os.path.isfile(out_file):
            logger.info(f"Object removal: Writing result from {out_file} to {output_path}")
            _write_result_to_path(out_file, output_path)
            return True, None

        logger.warning(f"Object removal: Result path not accessible: {out_file[:100]}, using original")
        _safe_copy(image_path, output_path)
        return True, None

    except Exception as e:
        logger.warning(f"Object removal failed (Space may be building): {e}. Using original.")
        try:
            _safe_copy(image_path, output_path)
            return True, None
        except OSError as err:
            logger.error(f"Fallback copy failed: {err}")
            return False, str(err)
