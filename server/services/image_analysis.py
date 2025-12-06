import logging
from typing import Dict, Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def analyze_quality(image_bytes: bytes) -> Dict[str, Any]:
    """
    Analyze an uploaded image for overall quality.

    Checks performed:
        1. Brightness: Mean grayscale intensity must exceed threshold.
        2. Blur: Variance of Laplacian must exceed threshold.
        3. Structural integrity: Ensure the image is not blank/empty.

    Args:
        image_bytes: Raw bytes of the uploaded image file.

    Returns:
        Dict describing analysis result. Example:
            {"valid": True}
            {"valid": False, "error": "Too Dark: ..."}
    """

    if not image_bytes:
        return {"valid": False, "error": "Invalid image data."}

    np_arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if image is None:
        logger.warning("Failed to decode image for quality analysis.")
        return {"valid": False, "error": "Unsupported image format or corrupted file."}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 1. Brightness check
    average_brightness = float(np.mean(gray))
    logger.debug("Image brightness: %.2f", average_brightness)
    BRIGHTNESS_THRESHOLD = 50.0
    if average_brightness < BRIGHTNESS_THRESHOLD:
        return {"valid": False, "error": "Too Dark: Please turn on lights or flash."}

    # 2. Blur check (Variance of Laplacian)
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    logger.debug("Laplacian variance: %.2f", laplacian_var)
    BLUR_THRESHOLD = 100.0
    if laplacian_var < BLUR_THRESHOLD:
        return {"valid": False, "error": "Blurry: Hold the camera steady."}

    # 3. Structural / edge presence check
    edges = cv2.Canny(gray, threshold1=50, threshold2=150)
    edge_pixels = int(np.sum(edges > 0))
    total_pixels = edges.size
    edge_ratio = edge_pixels / float(total_pixels)
    logger.debug("Edge ratio: %.4f", edge_ratio)

    MIN_EDGE_RATIO = 0.005  # Avoid nearly blank images
    MAX_EDGE_RATIO = 0.5    # Avoid extremely noisy captures

    if edge_ratio < MIN_EDGE_RATIO:
        return {"valid": False, "error": "Structure Missing: Aim at a detailed wall surface."}
    if edge_ratio > MAX_EDGE_RATIO:
        return {"valid": False, "error": "Too Noisy: Move closer and avoid clutter."}

    return {"valid": True}




