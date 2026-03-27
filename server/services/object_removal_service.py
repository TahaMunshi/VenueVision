"""
Object removal service: SAM + LaMa inpainting.
Removes objects from wall images by clicking on them.
Uses Hugging Face Spaces via gradio_client when configured.
"""
import logging
import os
import tempfile
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Configurable HF Space for SAM + LaMa inpainting
INPAINT_SPACE_URL = os.getenv("INPAINT_SPACE_URL", "").strip()


def _save_any_image_as_jpeg(src_path: str, dst_path: str) -> None:
    """Read PNG/JPEG/etc. from disk and write as JPEG (wall pipeline expects .jpg)."""
    from PIL import Image

    with Image.open(src_path) as img:
        img.convert("RGB").save(dst_path, "JPEG", quality=92)


def _download_url_to_temp(url: str) -> Optional[str]:
    try:
        import urllib.request

        fd, tmp = tempfile.mkstemp(suffix=".bin")
        os.close(fd)
        with urllib.request.urlopen(url, timeout=120) as resp:
            if resp.status != 200:
                logger.warning("Object removal: URL returned %s", resp.status)
                return None
            data = resp.read()
        with open(tmp, "wb") as f:
            f.write(data)
        logger.info("Object removal: Downloaded %s bytes from URL", len(data))
        return tmp
    except Exception as e:
        logger.warning("Object removal: URL download failed: %s", e)
        return None


def _safe_copy(src: str, dst: str) -> None:
    if os.path.abspath(os.path.normpath(src)) == os.path.abspath(os.path.normpath(dst)):
        return
    import shutil

    shutil.copy2(src, dst)


def remove_object_at_point(
    image_path: str,
    x: int,
    y: int,
    output_path: str,
) -> Dict[str, Any]:
    """
    Remove object at (x, y) from image using the configured HF Space.
    Saves result to output_path (JPEG).

    Returns:
        {
          "success": bool,       # False only on hard errors (I/O)
          "error": str | None,   # Set when success is False
          "inpainted": bool,     # True only if the Space actually returned a new image
          "message": str,        # Human-readable status for API / UI
        }
    """
    if not os.path.isfile(image_path):
        return {
            "success": False,
            "error": "Image file not found",
            "inpainted": False,
            "message": "Image file not found",
        }

    if not INPAINT_SPACE_URL:
        msg = (
            "Object removal is disabled: set INPAINT_SPACE_URL to your Hugging Face Space "
            "(e.g. username/venuevision-inpaint) in .env or docker-compose."
        )
        logger.warning(msg)
        return {
            "success": True,
            "error": None,
            "inpainted": False,
            "message": msg,
        }

    try:
        from gradio_client import Client, handle_file
    except ImportError:
        msg = "gradio_client is not installed; cannot call inpainting Space."
        logger.warning(msg)
        return {
            "success": True,
            "error": None,
            "inpainted": False,
            "message": msg,
        }

    hf_token = os.getenv("HF_TOKEN") or None
    download_dir = os.path.join(tempfile.gettempdir(), "gradio")
    os.makedirs(download_dir, exist_ok=True)

    try:
        import httpx

        httpx_kwargs = {"timeout": httpx.Timeout(300.0, connect=60.0)}
    except Exception:
        httpx_kwargs = {"timeout": 300.0}

    try:
        client = Client(
            INPAINT_SPACE_URL,
            token=hf_token,
            verbose=False,
            download_files=download_dir,
            httpx_kwargs=httpx_kwargs,
        )
        logger.info(
            "Object removal: calling Space %s at (%s, %s) image=%s",
            INPAINT_SPACE_URL,
            x,
            y,
            image_path,
        )

        result = None
        last_err: Optional[Exception] = None
        for api_name in ("/predict", "predict"):
            try:
                result = client.predict(
                    handle_file(image_path),
                    int(x),
                    int(y),
                    api_name=api_name,
                )
                logger.info("Object removal: predict succeeded with api_name=%s", api_name)
                break
            except Exception as e:
                last_err = e
                logger.warning(
                    "Object removal: predict failed api_name=%s: %s",
                    api_name,
                    e,
                    exc_info=False,
                )

        if result is None and last_err is not None:
            msg = f"Inpainting Space failed: {last_err!s}. Check logs, HF_TOKEN, and that the Space is running."
            logger.error(msg, exc_info=True)
            return {
                "success": True,
                "error": None,
                "inpainted": False,
                "message": msg,
            }

        if result is None:
            msg = "Inpainting Space returned no result (predict is None)."
            logger.warning(msg)
            return {
                "success": True,
                "error": None,
                "inpainted": False,
                "message": msg,
            }

        out_file = result
        if isinstance(result, (tuple, list)):
            out_file = result[0] if result else None
        if isinstance(out_file, dict):
            out_file = (
                out_file.get("path")
                or out_file.get("url")
                or out_file.get("value")
                or out_file.get("name")
            )

        if not out_file or not isinstance(out_file, str):
            msg = f"Inpainting returned an unexpected value: {type(result)!r}"
            logger.warning(msg)
            return {
                "success": True,
                "error": None,
                "inpainted": False,
                "message": msg,
            }

        tmp_for_convert: Optional[str] = None
        try:
            if out_file.startswith("http://") or out_file.startswith("https://"):
                tmp_for_convert = _download_url_to_temp(out_file)
                if not tmp_for_convert:
                    msg = "Could not download inpainting result URL."
                    return {
                        "success": True,
                        "error": None,
                        "inpainted": False,
                        "message": msg,
                    }
                _save_any_image_as_jpeg(tmp_for_convert, output_path)
            elif os.path.exists(out_file) and os.path.isfile(out_file):
                logger.info("Object removal: writing result from %s", out_file)
                _save_any_image_as_jpeg(out_file, output_path)
            else:
                msg = f"Inpainting result path not accessible: {out_file[:120]!s}"
                logger.warning(msg)
                return {
                    "success": True,
                    "error": None,
                    "inpainted": False,
                    "message": msg,
                }
        finally:
            if tmp_for_convert and os.path.isfile(tmp_for_convert):
                try:
                    os.remove(tmp_for_convert)
                except OSError:
                    pass

        return {
            "success": True,
            "error": None,
            "inpainted": True,
            "message": "Object removed.",
        }

    except ValueError as e:
        err_s = str(e)
        if "Could not fetch config" in err_s or "Could not get Gradio config" in err_s:
            msg = (
                "The Hugging Face Space is not serving a valid Gradio app (often HTTP 500 on /config). "
                "Open your Space on huggingface.co → Logs, and fix build/runtime errors (OOM, missing deps, "
                "Gradio version). Until the Space runs, object removal cannot run."
            )
            logger.error("Object removal: HF Space unreachable or broken: %s", err_s)
        else:
            msg = f"Inpainting error: {err_s}"
            logger.exception("Object removal failed: %s", e)
        return {
            "success": True,
            "error": None,
            "inpainted": False,
            "message": msg,
        }
    except Exception as e:
        msg = f"Inpainting error: {e!s}. If the Space was asleep, retry in 1–2 minutes."
        logger.exception("Object removal failed: %s", e)
        return {
            "success": True,
            "error": None,
            "inpainted": False,
            "message": msg,
        }
