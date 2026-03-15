"""
Wall segment stitching: merge multiple photos of a wall into one seamless image.
- Primary: flawless_stitch (SIFT + homography + histogram matching) - matches Colab notebook.
- Fallback: OpenCV Stitcher, then correlation-based overlap.
"""
import logging
import os
from typing import List, Optional, Tuple

import cv2
import numpy as np

from utils.file_manager import UPLOAD_ROOT

logger = logging.getLogger(__name__)


def _flawless_stitch_two(img_left: np.ndarray, img_right: np.ndarray) -> Optional[np.ndarray]:
    """
    Stitch two images using SIFT + homography + histogram matching.
    Matches the Colab notebook's flawless_stitch: no overlap artifacts, clean crop.
    Returns stitched image or None if stitching fails.
    """
    if img_left is None or img_right is None or img_left.size == 0 or img_right.size == 0:
        return None

    try:
        from skimage.exposure import match_histograms
    except ImportError:
        logger.warning("scikit-image not installed, skipping histogram matching")
        img_left_matched = img_left
    else:
        img_left_matched = match_histograms(img_left, img_right, channel_axis=-1).astype(np.uint8)

    gray_left = cv2.cvtColor(img_left_matched, cv2.COLOR_BGR2GRAY)
    gray_right = cv2.cvtColor(img_right, cv2.COLOR_BGR2GRAY)

    try:
        sift = cv2.SIFT_create()
    except AttributeError:
        return None  # SIFT not available (e.g. old opencv), fall back to other methods
    kp_left, des_left = sift.detectAndCompute(gray_left, None)
    kp_right, des_right = sift.detectAndCompute(gray_right, None)
    if des_left is None or des_right is None or len(kp_left) < 4 or len(kp_right) < 4:
        return None

    bf = cv2.BFMatcher()
    matches = bf.knnMatch(des_right, des_left, k=2)
    good_matches = [m for m, n in matches if m.distance < 0.75 * n.distance]
    if len(good_matches) < 4:
        return None

    src_pts = np.float32([kp_right[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp_left[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    if M is None:
        return None

    h_left, w_left = img_left_matched.shape[:2]
    h_right, w_right = img_right.shape[:2]

    panorama = cv2.warpPerspective(img_right, M, (w_left + w_right, h_left))
    right_mask = cv2.warpPerspective(
        np.ones_like(img_right, dtype=np.uint8) * 255, M, (w_left + w_right, h_left)
    )
    panorama[0:h_left, 0:w_left] = np.where(
        right_mask[0:h_left, 0:w_left] == 0,
        img_left_matched,
        panorama[0:h_left, 0:w_left],
    )

    gray_pano = cv2.cvtColor(panorama, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray_pano, 1, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if contours:
        x, y, w, h = cv2.boundingRect(contours[0])
        inset = 5
        final_canvas = panorama[y + inset : y + h - inset, x + inset : x + w - inset]
    else:
        final_canvas = panorama

    return final_canvas


def _order_quad_points(points: np.ndarray) -> np.ndarray:
    """Order 4 points as TL, TR, BR, BL."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s = points.sum(axis=1)
    rect[0] = points[np.argmin(s)]
    rect[2] = points[np.argmax(s)]
    diff = np.diff(points, axis=1)
    rect[1] = points[np.argmin(diff)]
    rect[3] = points[np.argmax(diff)]
    return rect


def _rectify_from_valid_mask(img: np.ndarray, black_threshold: int = 18) -> np.ndarray:
    """
    Detect stitched valid region and perspective-warp it to fill full frame.
    This removes black/dark triangular voids left by stitching.
    """
    if img is None or img.size == 0:
        return img

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Only rectify when border voids are significant.
    border = max(8, min(h, w) // 30)
    border_mask = np.zeros_like(gray, dtype=np.uint8)
    border_mask[:border, :] = 1
    border_mask[-border:, :] = 1
    border_mask[:, :border] = 1
    border_mask[:, -border:] = 1
    border_dark_ratio = float(np.mean((gray <= black_threshold)[border_mask == 1]))
    if border_dark_ratio < 0.08:
        return img

    _, mask = cv2.threshold(gray, black_threshold, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img

    c = max(contours, key=cv2.contourArea)
    if cv2.contourArea(c) < (h * w * 0.2):
        return img

    peri = cv2.arcLength(c, True)
    approx = cv2.approxPolyDP(c, 0.02 * peri, True)
    if len(approx) == 4:
        quad = approx.reshape(4, 2).astype(np.float32)
    else:
        rect = cv2.minAreaRect(c)
        quad = cv2.boxPoints(rect).astype(np.float32)

    src = _order_quad_points(quad)
    dst = np.array(
        [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]],
        dtype=np.float32,
    )
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    logger.info("Applied mask-based rectification (border_dark_ratio=%.3f)", border_dark_ratio)
    return warped


def _crop_black_borders(img: np.ndarray, black_threshold: int = 8) -> np.ndarray:
    """
    Remove black border/void regions then stretch valid content to full frame.
    This is useful for stitched panoramas that contain black triangular corners.
    """
    if img is None or img.size == 0:
        return img

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = (gray > black_threshold).astype(np.uint8) * 255
    points = cv2.findNonZero(mask)
    if points is None:
        return img

    x, y, cw, ch = cv2.boundingRect(points)
    if cw <= 1 or ch <= 1:
        return img

    cropped = img[y : y + ch, x : x + cw]
    # Keep natural geometry: crop only, do not stretch.
    if (cw, ch) != (w, h):
        logger.info("Applied border crop (%dx%d -> %dx%d)", w, h, cw, ch)
        return cropped
    return cropped


def _postprocess_stitched(img: np.ndarray) -> np.ndarray:
    """
    Conservative post-process for demo stability:
    - crop black borders only
    - avoid geometric rectification/inpainting that can hallucinate/warp
    """
    out = _crop_black_borders(img)
    return out


def _fill_border_voids(img: np.ndarray, dark_threshold: int = 20) -> np.ndarray:
    """
    Fill remaining border-connected dark voids (black wedges/corners) via inpainting.
    Only affects dark regions connected to image borders, so interior dark objects remain.
    """
    if img is None or img.size == 0:
        return img

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    dark = (gray <= dark_threshold).astype(np.uint8) * 255
    h, w = gray.shape
    flood = dark.copy()

    # Flood-fill only from border pixels to isolate border-connected voids.
    ff_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    for x in range(w):
        if flood[0, x] == 255:
            cv2.floodFill(flood, ff_mask, (x, 0), 128)
        if flood[h - 1, x] == 255:
            cv2.floodFill(flood, ff_mask, (x, h - 1), 128)
    for y in range(h):
        if flood[y, 0] == 255:
            cv2.floodFill(flood, ff_mask, (0, y), 128)
        if flood[y, w - 1] == 255:
            cv2.floodFill(flood, ff_mask, (w - 1, y), 128)

    void_mask = np.where(flood == 128, 255, 0).astype(np.uint8)
    void_ratio = float(np.count_nonzero(void_mask)) / float(h * w)
    if void_ratio < 0.002:
        return img

    # Expand slightly to avoid thin dark seams at edges.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    void_mask = cv2.dilate(void_mask, kernel, iterations=1)
    filled = cv2.inpaint(img, void_mask, 7, cv2.INPAINT_TELEA)
    logger.info("Applied border-void inpaint (void_ratio=%.3f)", void_ratio)
    return filled


def _try_opencv_stitcher(images: List[np.ndarray]) -> Optional[np.ndarray]:
    """
    Try OpenCV's built-in Stitcher (feature-based, homography).
    Works well when images have distinct features; may fail on flat/repetitive walls.
    Requires opencv-contrib-python for full Stitcher support.
    """
    if not images or len(images) < 2:
        return None
    try:
        Stitcher = getattr(cv2, "Stitcher", None)
        if Stitcher is None:
            return None
        Stitcher_OK = getattr(cv2, "Stitcher_OK", 0)
        Stitcher_PANORAMA = getattr(cv2, "Stitcher_PANORAMA", 0)
        Stitcher_SCANS = getattr(cv2, "Stitcher_SCANS", 1)

        stitcher = Stitcher.create(Stitcher_PANORAMA)
        status, pano = stitcher.stitch(images)
        if status == Stitcher_OK and pano is not None and pano.size > 0:
            logger.info("OpenCV Stitcher succeeded (PANORAMA)")
            return _postprocess_stitched(pano)
        logger.info("OpenCV Stitcher PANORAMA failed, trying SCANS")
        stitcher = Stitcher.create(Stitcher_SCANS)
        status, pano = stitcher.stitch(images)
        if status == Stitcher_OK and pano is not None and pano.size > 0:
            logger.info("OpenCV Stitcher succeeded (SCANS)")
            return _postprocess_stitched(pano)
    except Exception as e:
        logger.warning("OpenCV Stitcher failed: %s", e)
    return None


def _find_overlap_correlation(img_left: np.ndarray, img_right: np.ndarray) -> int:
    """
    Find overlap width using template matching.
    Take a strip from right edge of left image, find best match in left part of right image.
    Returns pixel width of overlap (how much to crop from right image's left side).
    """
    h1, w1 = img_left.shape[:2]
    h2, w2 = img_right.shape[:2]
    gray_left = img_left if len(img_left.shape) == 2 else cv2.cvtColor(img_left, cv2.COLOR_BGR2GRAY)
    gray_right = img_right if len(img_right.shape) == 2 else cv2.cvtColor(img_right, cv2.COLOR_BGR2GRAY)

    # Overlap is typically 20-60% of smaller image width
    min_w = min(w1, w2)
    min_overlap = max(50, int(min_w * 0.15))
    max_overlap = min(int(min_w * 0.65), w1 - 50, w2 - 50)
    if max_overlap <= min_overlap:
        max_overlap = min_overlap + 50

    best_overlap = int(min_w * 0.35)  # fallback
    best_score = -1.0

    # Use template matching: template = rightmost strip of left image
    # Step of 2 for finer overlap detection
    for overlap in range(min_overlap, max_overlap, 2):
        if w1 - overlap < 0 or overlap > w2:
            continue
        template = gray_left[:, w1 - overlap : w1]
        if template.size == 0:
            continue
        search_region = gray_right[:, : min(overlap + 50, w2)]
        if search_region.shape[1] < template.shape[1]:
            continue
        try:
            result = cv2.matchTemplate(search_region, template, cv2.TM_CCOEFF_NORMED)
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
            if max_val > best_score:
                best_score = max_val
                best_overlap = overlap
        except cv2.error:
            continue

    logger.info(f"Correlation overlap: {best_overlap}px (score={best_score:.3f})")
    return best_overlap


def _estimate_vertical_shift(
    img_left: np.ndarray,
    img_right: np.ndarray,
    overlap: int,
) -> int:
    """
    Estimate vertical offset (dy) between left and right images around the seam.
    Positive dy means right image should be moved UP.
    """
    h1, w1 = img_left.shape[:2]
    h2, w2 = img_right.shape[:2]
    if overlap <= 8:
        return 0

    gray_left = cv2.cvtColor(img_left, cv2.COLOR_BGR2GRAY)
    gray_right = cv2.cvtColor(img_right, cv2.COLOR_BGR2GRAY)

    # Use seam strips only.
    left_strip = gray_left[:, max(0, w1 - overlap) : w1]
    right_strip = gray_right[:, : min(overlap, w2)]
    if left_strip.size == 0 or right_strip.size == 0:
        return 0

    # Edge profile along Y is robust for horizontal structural lines (e.g., trim/ceiling line).
    grad_left = np.abs(cv2.Sobel(left_strip, cv2.CV_32F, 0, 1, ksize=3))
    grad_right = np.abs(cv2.Sobel(right_strip, cv2.CV_32F, 0, 1, ksize=3))
    prof_left = grad_left.mean(axis=1)
    prof_right = grad_right.mean(axis=1)

    # Normalize to reduce exposure/contrast differences.
    prof_left = (prof_left - prof_left.mean()) / (prof_left.std() + 1e-6)
    prof_right = (prof_right - prof_right.mean()) / (prof_right.std() + 1e-6)

    max_shift = int(max(8, min(h1, h2) * 0.18))
    best_dy = 0
    best_score = -1e9

    for dy in range(-max_shift, max_shift + 1):
        # Compare left[y] with right[y - dy]
        y0 = max(0, dy)
        y1 = min(h1, h2 + dy)
        if y1 - y0 < 30:
            continue
        left_seg = prof_left[y0:y1]
        right_seg = prof_right[y0 - dy : y1 - dy]
        score = float(np.dot(left_seg, right_seg)) / max(1, (y1 - y0))
        if score > best_score:
            best_score = score
            best_dy = dy

    # Internal search dy aligns left[y] with right[y - dy], which corresponds to
    # moving the right image DOWN when dy > 0 in placement coordinates.
    # We expose/publicly use the opposite convention: positive = move UP.
    user_dy = -int(best_dy)
    logger.info("Vertical seam shift: %dpx (score=%.3f)", user_dy, best_score)
    return user_dy


def _stitch_two(
    img_left: np.ndarray,
    img_right: np.ndarray,
    right_rotation_deg: float = 0,
    manual_overlap: Optional[int] = None,
) -> Optional[np.ndarray]:
    """
    Stitch right image onto left.
    - Left image: shown fully.
    - Right image: optionally rotated, cropped at overlap, concatenated.
    - manual_overlap: if provided, use this instead of auto-detect.
    """
    if right_rotation_deg != 0:
        h2, w2 = img_right.shape[:2]
        M = cv2.getRotationMatrix2D((w2 / 2, h2 / 2), right_rotation_deg, 1.0)
        img_right = cv2.warpAffine(img_right, M, (w2, h2), borderMode=cv2.BORDER_REPLICATE)

    h1, w1 = img_left.shape[:2]
    h2, w2 = img_right.shape[:2]

    overlap = manual_overlap if manual_overlap is not None else _find_overlap_correlation(img_left, img_right)
    overlap = max(0, min(overlap, w2 - 1, w1 - 1))
    dy = _estimate_vertical_shift(img_left, img_right, overlap)

    right_cropped = img_right[:, overlap:, :]
    # Place left at y=0 and right at y=dy, expanding canvas as needed.
    min_y = min(0, dy)
    max_y = max(h1, dy + h2)
    target_h = max_y - min_y
    out_w = w1 + (w2 - overlap)
    out = np.zeros((target_h, out_w, 3), dtype=np.uint8)

    y_left = -min_y
    y_right = dy - min_y
    out[y_left : y_left + h1, :w1] = img_left
    out[y_right : y_right + h2, w1:] = right_cropped

    gray_out = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
    nz = np.nonzero(gray_out > 5)
    if len(nz[0]) > 0:
        y0, y1 = nz[0].min(), nz[0].max() + 1
        out = out[y0:y1, :]
    return out




def stitch_segments(
    venue_id: str,
    wall_id: str,
    rotations: Optional[List[float]] = None,
    manual_overlaps: Optional[List[int]] = None,
) -> Tuple[bool, str]:
    """
    Stitch all seq_XX.jpg for a wall into one image.
    rotations: [0, r2, r3, ...] rotation in degrees for 2nd, 3rd, ... images.
    manual_overlaps: [o1, o2, ...] overlap px for each seam (1st seam = between img1 and img2).

    Returns (success, message_or_path).
    """
    wall_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
    if not os.path.isdir(wall_dir):
        return False, f"Wall directory not found: {wall_id}"

    seq_files = []
    for f in os.listdir(wall_dir):
        if f.startswith("seq_") and f.endswith(".jpg"):
            try:
                n = int(f.split("_")[1].split(".")[0])
                seq_files.append((n, f))
            except (IndexError, ValueError):
                pass
    seq_files.sort(key=lambda x: x[0])
    if not seq_files:
        return False, "No segment images found"
    if len(seq_files) == 1:
        # Single image: copy as stitched (master before object removal + corners)
        src = os.path.join(wall_dir, seq_files[0][1])
        stitched_path = os.path.join(wall_dir, f"stitched_{wall_id}.jpg")
        import shutil
        shutil.copy2(src, stitched_path)
        return True, f"/static/uploads/{venue_id}/{wall_id}/stitched_{wall_id}.jpg"

    images = []
    for _, fname in seq_files:
        path = os.path.join(wall_dir, fname)
        img = cv2.imread(path)
        if img is None:
            return False, f"Could not read {fname}"
        images.append(img)

    # Primary: flawless_stitch (SIFT + homography) - matches Colab notebook, no overlap artifacts
    result = images[0]
    flawless_ok = True
    for i in range(1, len(images)):
        stitched = _flawless_stitch_two(result, images[i])
        if stitched is not None:
            result = stitched
            logger.info("Flawless stitch succeeded for segment %d", i + 1)
        else:
            flawless_ok = False
            break

    # Fallback 1: OpenCV Stitcher
    if not flawless_ok:
        logger.info("Flawless stitch failed, trying OpenCV Stitcher")
        result = _try_opencv_stitcher(images)

    # Fallback 2: correlation-based overlap stitching
    if result is None:
        logger.info("OpenCV Stitcher failed, trying correlation-based overlap")
        rotations = rotations or [0.0] * len(images)
        while len(rotations) < len(images):
            rotations.append(0.0)
        manual_overlaps = manual_overlaps or []
        result = images[0]
        for i in range(1, len(images)):
            m_overlap = manual_overlaps[i - 1] if i - 1 < len(manual_overlaps) else None
            result = _stitch_two(
                result,
                images[i],
                right_rotation_deg=rotations[i],
                manual_overlap=m_overlap,
            )
            if result is None:
                break

    # Final fallback: use first image
    if result is None:
        logger.warning("All stitching methods failed. Using first image.")
        result = images[0]

    # Write to stitched_ (master before object removal + corners)
    stitched_path = os.path.join(wall_dir, f"stitched_{wall_id}.jpg")
    result = _postprocess_stitched(result)
    cv2.imwrite(stitched_path, result)
    return True, f"/static/uploads/{venue_id}/{wall_id}/stitched_{wall_id}.jpg"


def get_overlap_estimates(venue_id: str, wall_id: str) -> List[int]:
    """
    Return estimated overlap (px) for each seam between consecutive segments.
    Used for UI preview before stitching.
    """
    wall_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
    if not os.path.isdir(wall_dir):
        return []
    seq_files = []
    for f in os.listdir(wall_dir):
        if f.startswith("seq_") and f.endswith(".jpg"):
            try:
                n = int(f.split("_")[1].split(".")[0])
                seq_files.append((n, f))
            except (IndexError, ValueError):
                pass
    seq_files.sort(key=lambda x: x[0])
    if len(seq_files) < 2:
        return []
    overlaps = []
    prev_img = None
    for _, fname in seq_files:
        path = os.path.join(wall_dir, fname)
        img = cv2.imread(path)
        if img is None:
            return []
        if prev_img is not None:
            overlap = _find_overlap_correlation(prev_img, img)
            overlaps.append(overlap)
        prev_img = img
    return overlaps


def get_segment_images(venue_id: str, wall_id: str) -> List[str]:
    """Return sorted list of seq_XX.jpg paths (relative URLs) for a wall."""
    wall_dir = os.path.join(UPLOAD_ROOT, venue_id, wall_id)
    if not os.path.isdir(wall_dir):
        return []
    seq_files = []
    for f in os.listdir(wall_dir):
        if f.startswith("seq_") and f.endswith(".jpg"):
            try:
                n = int(f.split("_")[1].split(".")[0])
                seq_files.append((n, f))
            except (IndexError, ValueError):
                pass
    seq_files.sort(key=lambda x: x[0])
    base = f"/static/uploads/{venue_id}/{wall_id}"
    return [f"{base}/{f[1]}" for f in seq_files]
