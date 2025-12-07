"""
Wall processing service for corner detection, warping, and stylization.
"""
import cv2
import numpy as np
import os
from typing import List, Tuple, Dict, Any, Optional
from io import BytesIO
import logging

logger = logging.getLogger(__name__)

def auto_detect_corners(image: np.ndarray) -> Optional[List[List[float]]]:
    """
    Automatically detect the 4 corners of a wall in an image.
    Uses CamScanner-like logic: blur, edge detection, morphological operations.
    
    Args:
        image: OpenCV image (BGR format)
        
    Returns:
        List of 4 corner points [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
        Ordered as: Top-Left, Top-Right, Bottom-Right, Bottom-Left
    """
    # 1. Resize to a fixed manageable size (speeds up processing & reduces noise)
    target_height = 600
    h, w = image.shape[:2]
    scale = target_height / float(h)
    new_width = int(w * scale)
    img_w, img_h = new_width, target_height  # Store for later comparisons
    small_image = cv2.resize(image, (new_width, target_height))
    
    # 2. Pre-processing (The "Squint")
    gray = cv2.cvtColor(small_image, cv2.COLOR_BGR2GRAY)
    
    # Moderate blur: preserve important edges while reducing noise
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)

    # Canny Edge Detection
    # Use slightly higher thresholds to avoid excessive noisy edges
    low_thresh = 50
    high_thresh = 150
    edged = cv2.Canny(blurred, low_thresh, high_thresh)

    # 3. Morphological Operations (The "Bridge")
    # Use a smaller kernel so we don't merge separate features unintentionally
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    # 4. Find Contours
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Sort by Area (Largest first)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    logger.debug("Auto-Detect: Found %d contours", len(contours))
    
    best_quad_points = None
    
    for i, c in enumerate(contours[:8]):
        area = cv2.contourArea(c)
        logger.debug("Auto-Detect: Contour %d area=%d", i, int(area))

        # Filter: Must be at least 5% of the image (lowered from 10%)
        if area < (new_width * target_height) * 0.05:
            continue
            
        # Hull & Approx
        hull = cv2.convexHull(c)
        epsilon = 0.02 * cv2.arcLength(hull, True)
        approx = cv2.approxPolyDP(hull, epsilon, True)
        
        # We need exactly 4 points for the Perspective Transform
        if len(approx) == 4:
            points = approx.reshape(4, 2)
        else:
            # Fallback: Use bounding box
            x, y, w_box, h_box = cv2.boundingRect(hull)
            points = np.array([
                [x, y],
                [x + w_box, y],
                [x + w_box, y + h_box],
                [x, y + h_box]
            ], dtype="float32")

        # 5. Scale points back up to original image size
        points = points / scale
        
        # 6. Order points: TL, TR, BR, BL
        rect = np.zeros((4, 2), dtype="float32")
        s = points.sum(axis=1)
        rect[0] = points[np.argmin(s)]  # TL
        rect[2] = points[np.argmax(s)]  # BR

        diff = np.diff(points, axis=1)
        rect[1] = points[np.argmin(diff)]  # TR
        rect[3] = points[np.argmax(diff)]  # BL
        
        # Reject quads that cover almost the whole original image (likely fallback bounding box)
        # Use stricter threshold: reject if covers more than 85% of image
        # NOTE: rect is already in original image coordinates, so compare against original dimensions
        x_coords = rect[:, 0]
        y_coords = rect[:, 1]
        minx, maxx = x_coords.min(), x_coords.max()
        miny, maxy = y_coords.min(), y_coords.max()
        box_w = maxx - minx
        box_h = maxy - miny
        # Use original image dimensions for comparison
        img_w_orig, img_h_orig = w, h
        
        # Calculate coverage percentage against original image
        coverage_w = box_w / img_w_orig if img_w_orig > 0 else 1.0
        coverage_h = box_h / img_h_orig if img_h_orig > 0 else 1.0
        
        # Reject if covers more than 85% in either dimension
        if coverage_w >= 0.85 or coverage_h >= 0.85:
            logger.debug("Auto-Detect: Rejected full-image quad (w=%.1f/%.1f=%.1f%%, h=%.1f/%.1f=%.1f%%)", 
                        box_w, img_w_orig, coverage_w*100, box_h, img_h_orig, coverage_h*100)
            # skip this candidate and continue searching
        else:
            # Additional check: ensure the quad is not too close to image edges (at least 5% margin)
            margin_threshold = 0.05
            if (minx / img_w_orig < margin_threshold or miny / img_h_orig < margin_threshold or
                (img_w_orig - maxx) / img_w_orig < margin_threshold or (img_h_orig - maxy) / img_h_orig < margin_threshold):
                logger.debug("Auto-Detect: Rejected quad too close to edges")
                continue
            best_quad_points = rect.tolist()
            logger.info("Auto-Detect: Found valid quad with coverage w=%.1f%%, h=%.1f%%", 
                       coverage_w*100, coverage_h*100)
            break
    # If no contours found, attempt alternate strategies and save debug images for inspection
    if best_quad_points is None:
        logger.debug("Auto-Detect: No suitable quad found, attempting alternate methods")

        debug_dir = os.path.join(os.path.dirname(__file__), '..', 'static', 'debug')
        try:
            os.makedirs(debug_dir, exist_ok=True)
        except Exception:
            debug_dir = None

        # Strategy 1: Adaptive thresholding -> morphological -> contours
        try:
            adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                             cv2.THRESH_BINARY, 11, 2)
            kernel2 = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            closed2 = cv2.morphologyEx(adaptive, cv2.MORPH_CLOSE, kernel2, iterations=2)
            contours2, _ = cv2.findContours(closed2, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            contours2 = sorted(contours2, key=cv2.contourArea, reverse=True)
            logger.debug("Auto-Detect: adaptive contours=%d", len(contours2))
            if contours2:
                for c in contours2[:8]:
                    area = cv2.contourArea(c)
                    if area < (new_width * target_height) * 0.03:
                        continue
                    hull = cv2.convexHull(c)
                    epsilon = 0.02 * cv2.arcLength(hull, True)
                    approx = cv2.approxPolyDP(hull, epsilon, True)
                    if len(approx) == 4:
                        pts = approx.reshape(4, 2) / scale
                        # order
                        rect = np.zeros((4, 2), dtype="float32")
                        s = pts.sum(axis=1)
                        rect[0] = pts[np.argmin(s)]
                        rect[2] = pts[np.argmax(s)]
                        diff = np.diff(pts, axis=1)
                        rect[1] = pts[np.argmin(diff)]
                        rect[3] = pts[np.argmax(diff)]
                        # Reject full-image boxes (stricter threshold)
                        # NOTE: rect is in original image coordinates
                        x_coords = rect[:, 0]
                        y_coords = rect[:, 1]
                        box_w = x_coords.max() - x_coords.min()
                        box_h = y_coords.max() - y_coords.min()
                        # Compare against original image dimensions
                        coverage_w = box_w / w if w > 0 else 1.0
                        coverage_h = box_h / h if h > 0 else 1.0
                        if coverage_w >= 0.85 or coverage_h >= 0.85:
                            logger.debug("Auto-Detect (adaptive): rejected full-image quad (w=%.1f%%, h=%.1f%%)", 
                                        coverage_w*100, coverage_h*100)
                            continue
                        best_quad_points = rect.tolist()
                        logger.info("Auto-Detect (adaptive): Success! %s", best_quad_points)
                        break

            # Save debug images
            if debug_dir:
                ts = int(np.floor(cv2.getTickCount() % 1e9))
                try:
                    cv2.imwrite(os.path.join(debug_dir, f"small_{ts}.jpg"), small_image)
                    cv2.imwrite(os.path.join(debug_dir, f"blur_{ts}.jpg"), blurred)
                    cv2.imwrite(os.path.join(debug_dir, f"edged_{ts}.jpg"), edged)
                    cv2.imwrite(os.path.join(debug_dir, f"closed_{ts}.jpg"), closed)
                    cv2.imwrite(os.path.join(debug_dir, f"adaptive_{ts}.jpg"), adaptive)
                    cv2.imwrite(os.path.join(debug_dir, f"closed2_{ts}.jpg"), closed2)
                    logger.info("Auto-Detect: Saved debug images to %s", debug_dir)
                except Exception:
                    logger.exception("Auto-Detect: Failed to write debug images")
        except Exception:
            logger.exception("Auto-Detect: adaptive threshold fallback failed")
        # If still no quad, try Hough-lines based rectangle detection
        if best_quad_points is None:
            try:
                logger.debug("Auto-Detect: Trying Hough-lines fallback")
                # Use the edged image computed earlier
                lines = cv2.HoughLinesP(edged, rho=1, theta=np.pi/180, threshold=80, minLineLength=int(min(new_width, target_height)*0.3), maxLineGap=20)
                if lines is not None:
                    horiz = []
                    vert = []
                    for x1, y1, x2, y2 in lines.reshape(-1, 4):
                        angle = abs(np.degrees(np.arctan2((y2 - y1), (x2 - x1))))
                        if angle < 20:  # near horizontal
                            horiz.append((x1, y1, x2, y2))
                        elif angle > 70:  # near vertical
                            vert.append((x1, y1, x2, y2))
                    logger.debug("Auto-Detect: Hough found horiz=%d vert=%d", len(horiz), len(vert))
                    if horiz and vert:
                        xs = []
                        ys = []
                        for x1, y1, x2, y2 in vert:
                            xs.extend([x1, x2])
                        for x1, y1, x2, y2 in horiz:
                            ys.extend([y1, y2])
                        minx = max(0, min(xs))
                        maxx = min(new_width, max(xs))
                        miny = max(0, min(ys))
                        maxy = min(target_height, max(ys))
                        # Sanity check size - must be reasonable but not too large
                        # Scale to original image coordinates first
                        rect = np.array([[minx, miny],[maxx, miny],[maxx, maxy],[minx, maxy]], dtype="float32")
                        rect = rect / scale
                        # Now check coverage against original image dimensions
                        box_w = rect[:, 0].max() - rect[:, 0].min()
                        box_h = rect[:, 1].max() - rect[:, 1].min()
                        coverage_w = box_w / w if w > 0 else 1.0
                        coverage_h = box_h / h if h > 0 else 1.0
                        if (box_w > w*0.1 and box_h > h*0.1 and 
                            coverage_w < 0.85 and coverage_h < 0.85):
                            best_quad_points = rect.tolist()
                            logger.info("Auto-Detect (hough): Success! %s", best_quad_points)
                        else:
                            logger.debug("Auto-Detect (hough): Rejected (coverage w=%.1f%%, h=%.1f%%)", 
                                        coverage_w*100, coverage_h*100)
            except Exception:
                logger.exception("Auto-Detect: Hough fallback failed")
    if best_quad_points:
        logger.info("Auto-Detect: Success! Detected quad: %s", best_quad_points)
        return best_quad_points
    else:
        # If detection completely fails, return None instead of defaulting to full image
        # This allows the frontend to handle the failure gracefully
        h_orig, w_orig = image.shape[:2]
        logger.warning("Auto-Detect: Failed to detect valid wall corners. Detection returned no suitable quad.")
        # Return None to indicate failure - the API will handle this appropriately
        return None


def process_wall_image(
    image_bytes: bytes,
    corner_points: List[List[float]],
    output_path: str,
    texture_width: int = 1024,
    texture_height: int = 768
) -> Dict[str, Any]:
    """
    Process a wall image: warp perspective, stylize, and save.
    
    Args:
        image_bytes: Raw image bytes
        corner_points: List of 4 corner points [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
        output_path: Full path where processed image should be saved
        texture_width: Output texture width
        texture_height: Output texture height
        
    Returns:
        Dict with status and file information
    """
    try:
        # Decode image
        npimg = np.frombuffer(image_bytes, np.uint8)
        image_orig = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

        if image_orig is None:
            return {"status": "error", "message": "Could not decode image"}

        # Define output size
        pts_dst = np.array([
            [0, 0],
            [texture_width - 1, 0],
            [texture_width - 1, texture_height - 1],
            [0, texture_height - 1]
        ], dtype="float32")

        # Parse corner points
        pts_src = np.array(corner_points, dtype="float32")
        
        # Calculate the natural aspect ratio from the corner points
        # This preserves the wall's proportions when length/width is adjusted
        # Calculate width and height from corner points
        top_width = np.linalg.norm(pts_src[1] - pts_src[0])  # Top edge
        bottom_width = np.linalg.norm(pts_src[2] - pts_src[3])  # Bottom edge
        left_height = np.linalg.norm(pts_src[3] - pts_src[0])  # Left edge
        right_height = np.linalg.norm(pts_src[2] - pts_src[1])  # Right edge
        
        # Use average dimensions to get aspect ratio
        avg_width = (top_width + bottom_width) / 2
        avg_height = (left_height + right_height) / 2
        
        # Calculate aspect ratio
        if avg_height > 0:
            aspect_ratio = avg_width / avg_height
        else:
            aspect_ratio = texture_width / texture_height  # Fallback to default
        
        # Adjust output dimensions to maintain aspect ratio
        # Use a base height and calculate width from aspect ratio
        base_height = 1024  # Higher resolution base
        calculated_width = int(base_height * aspect_ratio)
        
        # Ensure minimum dimensions and reasonable maximum
        calculated_width = max(512, min(calculated_width, 2048))
        calculated_height = max(512, min(base_height, 2048))
        
        # Update destination points with calculated dimensions
        pts_dst = np.array([
            [0, 0],
            [calculated_width - 1, 0],
            [calculated_width - 1, calculated_height - 1],
            [0, calculated_height - 1]
        ], dtype="float32")
        
        logger.info(f"Wall processing: Calculated dimensions {calculated_width}x{calculated_height} (aspect ratio: {aspect_ratio:.2f})")

        # Get the matrix and warp the image
        matrix = cv2.getPerspectiveTransform(pts_src, pts_dst)
        image_warped = cv2.warpPerspective(image_orig, matrix, (calculated_width, calculated_height))
        
        # Use the warped image directly without posterization or filters
        # This preserves the original image quality and proportions
        image_final = image_warped
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save the final texture
        cv2.imwrite(output_path, image_final)
        logger.info(f"Success: Saved processed wall to {output_path}")
        
        return {
            "status": "success",
            "filename": os.path.basename(output_path),
            "path": output_path,
            "points": corner_points
        }

    except Exception as e:
        logger.error(f"Error processing image: {e}")
        return {"status": "error", "message": str(e)}


def decode_image_from_bytes(image_bytes: bytes) -> Optional[np.ndarray]:
    """Helper to decode image bytes to OpenCV format."""
    try:
        npimg = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        return image
    except Exception as e:
        logger.error(f"Error decoding image: {e}")
        return None

