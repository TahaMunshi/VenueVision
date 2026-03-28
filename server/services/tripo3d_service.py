"""
Tripo3D API service: upload images to Tripo STS, then create image_to_model or multiview_to_model task.
Uses native API only (no public URLs, ngrok, or TempFile). API key: TRIPO_API_KEY from https://www.tripo3d.ai (Tripo issues tsk_ or tcli_ prefixes).
"""

import io
import logging
import os
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from PIL import Image

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_ASSETS_ROOT = os.path.join(BASE_DIR, "static", "user_assets")

TRIPO_API_BASE = "https://api.tripo3d.ai/v2/openapi"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_SIZE_MB = 10
POLL_INTERVAL_SEC = 4
POLL_TIMEOUT_SEC = 300  # 5 min

# Tripo multiview expects exactly: Front, Left, Back, Right (in that order).
TRIPO_VIEW_ORDER = ["front", "left", "back", "right"]
# Our frontend sends: [front, right, back, left] -> indices 0, 1, 2, 3.
OUR_VIEW_ORDER = ["front", "right", "back", "left"]


def _get_api_key() -> Optional[str]:
    key = os.getenv("TRIPO_API_KEY", "").strip()
    if not key:
        return None
    # Tripo dashboard keys may be tsk_* (legacy docs) or tcli_* (current clients).
    if key.startswith(("tsk_", "tcli_")):
        return key
    return None


TRIPO_MAX_IMAGE_DIM = 1024
TRIPO_JPEG_QUALITY = 88


def _resize_for_tripo(file_bytes: bytes, filename: str) -> bytes:
    """Resize image to keep upload size reasonable; return JPEG bytes."""
    try:
        img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        w, h = img.size
        if w <= TRIPO_MAX_IMAGE_DIM and h <= TRIPO_MAX_IMAGE_DIM:
            out = io.BytesIO()
            img.save(out, "JPEG", quality=TRIPO_JPEG_QUALITY)
            return out.getvalue()
        if w > h:
            new_w = TRIPO_MAX_IMAGE_DIM
            new_h = int(h * (TRIPO_MAX_IMAGE_DIM / w))
        else:
            new_h = TRIPO_MAX_IMAGE_DIM
            new_w = int(w * (TRIPO_MAX_IMAGE_DIM / h))
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, "JPEG", quality=TRIPO_JPEG_QUALITY)
        return out.getvalue()
    except Exception as e:
        logger.warning("Resize for Tripo failed, using original: %s", e)
        return file_bytes


def _get_sts_token(api_key: str, format: str = "jpeg") -> Optional[Dict]:
    """Step 1: Get temporary S3 credentials from Tripo. Doc: POST .../upload/sts/token with format."""
    try:
        r = requests.post(
            f"{TRIPO_API_BASE}/upload/sts/token",
            json={"format": format},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            timeout=30,
        )
        if r.status_code != 200:
            logger.warning("Tripo STS token HTTP %s: %s", r.status_code, (r.text or "")[:200])
            return None
        data = r.json()
        if data.get("code") != 0:
            return None
        payload = data.get("data") or {}
        if not all(k in payload for k in ("resource_bucket", "resource_uri", "session_token", "sts_ak", "sts_sk")):
            logger.warning("Tripo STS token missing fields: %s", list(payload.keys()))
            return None
        return payload
    except Exception as e:
        logger.warning("Tripo STS token failed: %s", e)
        return None


def _upload_to_s3(sts: Dict, body: bytes, content_type: str = "image/jpeg") -> bool:
    """Step 2: Upload file to Tripo's S3 bucket using temporary credentials."""
    try:
        import boto3
        client = boto3.client(
            "s3",
            region_name="us-west-2",
            aws_access_key_id=sts["sts_ak"],
            aws_secret_access_key=sts["sts_sk"],
            aws_session_token=sts["session_token"],
        )
        client.put_object(
            Bucket=sts["resource_bucket"],
            Key=sts["resource_uri"],
            Body=body,
            ContentType=content_type,
        )
        return True
    except Exception as e:
        logger.warning("Tripo S3 upload failed: %s", e)
        return False


def _upload_to_tripo_sts(api_key: str, file_bytes: bytes, filename: str) -> Optional[Dict]:
    """
    Upload image per Tripo docs: (1) get STS token, (2) upload to S3.
    Returns {"bucket": str, "key": str} for use in task as file.object (STS format).
    """
    jpeg_bytes = _resize_for_tripo(file_bytes, filename)
    sts = _get_sts_token(api_key, "jpeg")
    if not sts:
        return None
    if not _upload_to_s3(sts, jpeg_bytes):
        return None
    return {"bucket": sts["resource_bucket"], "key": sts["resource_uri"]}


def validate_image(file_bytes: bytes, filename: str) -> Tuple[bool, str]:
    ext = Path(filename.lower()).suffix
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_IMAGE_SIZE_MB:
        return False, f"File too large. Maximum size: {MAX_IMAGE_SIZE_MB}MB"
    if len(file_bytes) < 100:
        return False, "File appears to be empty or corrupted"
    return True, ""


def multiview_to_3d(
    user_id: int,
    image_files: List[Tuple[bytes, str]],
    asset_name: str,
) -> Dict:
    """
    Generate 3D model via Tripo3D: upload images to STS, then create task.
    image_files: (file_bytes, filename). Order: [front, right, back, left] or [front] only.
    Multiview task uses type "multiview_to_model" with files array in order: Front, Left, Back, Right.
    """
    api_key = _get_api_key()
    if not api_key:
        return {"success": False, "error": "Tripo3D API key not set. Add TRIPO_API_KEY to .env"}

    if not image_files:
        return {"success": False, "error": "At least one image is required (front view)."}

    for i, (data, name) in enumerate(image_files):
        ok, msg = validate_image(data, name)
        if not ok:
            return {"success": False, "error": f"Image {i + 1} ({name}): {msg}"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 1) Upload all images to Tripo STS. Each result is {"bucket": str, "key": str} for STS "object" format.
    tokens_by_view: Dict[str, Dict] = {}
    for i, (data, name) in enumerate(image_files):
        if i >= len(OUR_VIEW_ORDER):
            break
        view = OUR_VIEW_ORDER[i]
        obj = _upload_to_tripo_sts(api_key, data, name or f"{view}.jpg")
        if not obj:
            return {"success": False, "error": f"Failed to upload image {i + 1} to Tripo. Check logs."}
        tokens_by_view[view] = obj

    # 2) Build task payload. API requires exact structure: use "object" (bucket + key) for STS; files = exactly 4 items [front, left, back, right].
    if len(image_files) == 1:
        task_payload = {
            "type": "image_to_model",
            "files": [{"type": "jpeg", "object": tokens_by_view["front"]}],
        }
    else:
        # Exactly 4 entries in order [front, left, back, right]. Omitted views get { "type": "jpeg" } only (no object).
        files = []
        for view in TRIPO_VIEW_ORDER:
            if view in tokens_by_view:
                files.append({"type": "jpeg", "object": tokens_by_view[view]})
            else:
                files.append({"type": "jpeg"})
        task_payload = {
            "type": "multiview_to_model",
            "files": files,
            "model_version": "v2.5-20250123",
            "texture": True,
            "pbr": True,
        }

    logger.info("Tripo task payload: type=%s files_count=%s", task_payload["type"], len(task_payload.get("files", [])))
    try:
        r = requests.post(
            f"{TRIPO_API_BASE}/task",
            json=task_payload,
            headers=headers,
            timeout=60,
        )
        if r.status_code >= 400:
            try:
                err_body = r.json()
                logger.warning("Tripo API %s response: %s", r.status_code, err_body)
                msg = (
                    err_body.get("message") or err_body.get("error") or err_body.get("msg")
                    or err_body.get("detail") or err_body.get("code") or str(err_body)[:400]
                )
            except Exception:
                msg = (r.text or f"HTTP {r.status_code}")[:500]
            return {"success": False, "error": f"Tripo3D API: {msg}"}

        data = r.json()
        task_id = (data.get("data") or data).get("task_id") or data.get("task_id")
        if not task_id:
            return {"success": False, "error": "No task_id in Tripo3D response"}
        logger.info("Tripo3D task created: %s", task_id)

        # 3) Poll for completion
        started = time.time()
        model_url = None
        while time.time() - started < POLL_TIMEOUT_SEC:
            status_r = requests.get(f"{TRIPO_API_BASE}/task/{task_id}", headers=headers, timeout=15)
            status_r.raise_for_status()
            status_data = status_r.json()
            info = status_data.get("data") or status_data
            status = (info.get("status") or "").lower()
            if status == "success":
                output = info.get("output") or {}
                model_raw = output.get("model")
                if isinstance(model_raw, dict):
                    model_url = model_raw.get("url")
                elif isinstance(model_raw, str) and model_raw.strip():
                    model_url = model_raw.strip()
                else:
                    model_url = None
                if not model_url:
                    # Fallback: base_model or pbr_model (Tripo docs list these)
                    for key in ("base_model", "pbr_model"):
                        val = output.get(key)
                        if isinstance(val, str) and val.strip():
                            model_url = val.strip()
                            break
                        if isinstance(val, dict) and val.get("url"):
                            model_url = val.get("url")
                            break
                if not model_url:
                    logger.warning("Tripo success but no model URL; output keys: %s", list(output.keys()))
                    return {"success": False, "error": "No model URL in Tripo3D result"}
                break
            if status in ("failed", "error", "canceled"):
                err_msg = info.get("message") or info.get("error") or str(info)
                return {"success": False, "error": f"Tripo3D task failed: {err_msg}"}
            time.sleep(POLL_INTERVAL_SEC)
        else:
            return {"success": False, "error": "Tripo3D task timed out"}

        # 4) Download GLB and save
        glb_resp = requests.get(model_url, timeout=60)
        glb_resp.raise_for_status()
        glb_bytes = glb_resp.content

        os.makedirs(os.path.join(USER_ASSETS_ROOT, str(user_id)), exist_ok=True)
        ts = int(time.time() * 1000)
        glb_filename = f"user_{user_id}_{ts}.glb"
        glb_path = os.path.join(USER_ASSETS_ROOT, str(user_id), glb_filename)
        with open(glb_path, "wb") as f:
            f.write(glb_bytes)
        glb_relative = f"user_assets/{user_id}/{glb_filename}"

        source_rel = None
        if image_files:
            first_bytes, first_name = image_files[0]
            ext = Path(first_name.lower()).suffix
            source_filename = f"source_{user_id}_{ts}{ext}"
            source_path = os.path.join(USER_ASSETS_ROOT, str(user_id), source_filename)
            with open(source_path, "wb") as f:
                f.write(first_bytes)
            source_rel = f"user_assets/{user_id}/{source_filename}"

        return {
            "success": True,
            "glb_path": glb_relative,
            "source_image_path": source_rel,
            "thumbnail_url": source_rel,
            "file_size_bytes": len(glb_bytes),
        }
    except requests.RequestException as e:
        err = str(e)
        if hasattr(e, "response") and e.response is not None:
            try:
                body = e.response.json()
                err = body.get("message") or body.get("error") or err
            except Exception:
                pass
        logger.exception("Tripo3D request error")
        return {"success": False, "error": err}
    except Exception as e:
        logger.exception("Tripo3D error")
        return {"success": False, "error": str(e)}
