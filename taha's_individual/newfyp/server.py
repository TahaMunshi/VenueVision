import cv2
import numpy as np
import flask
import json
import os
import shutil
import subprocess
import time
from flask_cors import CORS

# Initialize our Flask application
app = flask.Flask(__name__)

# Enable CORS to allow requests from http://localhost:8000
CORS(app) 

# --- Path to your COLMAP executable (Placeholder) ---
COLMAP_EXE_PATH = os.path.join('.', 'COLMAP', 'bin', 'colmap.bat')

# --- UPDATED FUNCTION: Automatic Corner Detection (CamScanner Logic) ---
def auto_detect_corners(image):
    """
    1. Heavy Blur: Removes floor tiles and curtain details.
    2. Morphological Closing: Bridges gaps behind furniture.
    3. Largest 4-Sided Approx: Finds the wall.
    """
    # 1. Resize to a fixed manageable size (speeds up processing & reduces noise)
    # We define a fixed height of 600px, calculating width to keep aspect ratio
    target_height = 600
    h, w = image.shape[:2]
    scale = target_height / float(h)
    new_width = int(w * scale)
    small_image = cv2.resize(image, (new_width, target_height))
    
    # 2. Pre-processing (The "Squint")
    gray = cv2.cvtColor(small_image, cv2.COLOR_BGR2GRAY)
    
    # AGGRESSIVE BLUR: (11, 11) kernel wipes out floor tiles/grout lines
    blurred = cv2.GaussianBlur(gray, (11, 11), 0)
    
    # Canny Edge Detection
    # Lower thresholds to catch the faint wall-ceiling boundary
    edged = cv2.Canny(blurred, 10, 80) 
    
    # 3. Morphological Operations (The "Bridge")
    # This rectangular kernel helps connect horizontal and vertical gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    
    # MORPH_CLOSE = Dilate then Erode. 
    # It fills small black holes inside white objects (connects broken lines)
    closed = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    # DEBUG: Overwrite the previous debug file to see the difference
    cv2.imwrite("debug_view.jpg", closed)

    # 4. Find Contours
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Sort by Area (Largest first)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    
    best_quad_points = None
    
    for c in contours[:5]:
        area = cv2.contourArea(c)
        
        # Filter: Must be at least 10% of the image
        if area < (new_width * target_height) * 0.1:
            continue
            
        # Hull & Approx
        hull = cv2.convexHull(c)
        epsilon = 0.02 * cv2.arcLength(hull, True)
        approx = cv2.approxPolyDP(hull, epsilon, True)
        
        # We need exactly 4 points for the Perspective Transform
        # If approx has 4, use it. If not, force the Hull to 4 corners.
        if len(approx) == 4:
            points = approx.reshape(4, 2)
        else:
            # Fallback: Find the 4 most extreme points of the hull
            # This handles cases where the wall has a slight curve or extra bumps
            hull_points = hull.reshape(-1, 2)
            
            # Use a bounding rect logic to approximate the 4 corners
            # (Simple heuristic: TopLeft, TopRight, BotRight, BotLeft)
            # Note: This is a simplification; for complex shapes, more math is needed.
            # But for a wall, the standard Sum/Diff sorting usually works on the hull extremes.
            
            # For simplicity in fallback, let's just grab the bounding box 
            # (This creates a perfect rectangle, which might be slightly off but is a safe fallback)
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
        rect[0] = points[np.argmin(s)] # TL
        rect[2] = points[np.argmax(s)] # BR

        diff = np.diff(points, axis=1)
        rect[1] = points[np.argmin(diff)] # TR
        rect[3] = points[np.argmax(diff)] # BL
        
        best_quad_points = rect.tolist()
        break 

    if best_quad_points:
        print("Auto-Detect: Success!")
        return best_quad_points
    else:
        # If detection completely fails, default to the image corners
        # This prevents the UI from crashing or showing nothing
        h_orig, w_orig = image.shape[:2]
        print("Auto-Detect: Failed. Defaulting to full image.")
        return [
            [0, 0],             # TL
            [w_orig, 0],        # TR
            [w_orig, h_orig],   # BR
            [0, h_orig]         # BL
        ]

# --- Wall Processing Function (Stylizes and Saves) ---
def process_wall(image_file, corner_points, wall_name):
    # This function is responsible for the final heavy lifting (warping, styling, saving)
    try:
        # Read the image file from the web request
        filestr = image_file.read()
        npimg = np.frombuffer(filestr, np.uint8)
        image_orig = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

        if image_orig is None:
            return {"status": "error", "message": "Could not decode image"}

        # Define output size
        TEX_WIDTH, TEX_HEIGHT = 1024, 768
        # Destination points are TL, TR, BR, BL
        pts_dst = np.array([
            [0, 0],
            [TEX_WIDTH - 1, 0],
            [TEX_WIDTH - 1, TEX_HEIGHT - 1],
            [0, TEX_HEIGHT - 1] 
        ], dtype="float32") 

        # Parse corner points (input from manual click or auto-detect)
        pts_src = np.array(corner_points, dtype="float32")

        # Get the matrix and warp the image
        matrix = cv2.getPerspectiveTransform(pts_src, pts_dst)
        image_warped = cv2.warpPerspective(image_orig, matrix, (TEX_WIDTH, TEX_HEIGHT))
        
        # --- Posterization Logic (Stylization) ---
        pixel_data = image_warped.reshape((-1, 3))
        pixel_data = np.float32(pixel_data)
        
        K = 8 # Number of colors
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        
        if len(pixel_data) < K:
            K = 4 
        
        compactness, labels, center = cv2.kmeans(pixel_data, K, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)

        center = np.uint8(center)
        poster_data = center[labels.flatten()]
        image_posterized = poster_data.reshape((TEX_HEIGHT, TEX_WIDTH, 3))
        
        image_final = cv2.bilateralFilter(image_posterized, 5, 50, 50)
        
        # Save the final texture
        output_filename = f"texture_wall_{wall_name}.jpg"
        if os.path.exists(output_filename):
            os.remove(output_filename)
            
        cv2.imwrite(output_filename, image_final)
        print(f"Success: Saved {output_filename}")
        
        return {"status": "success", "filename": output_filename, "points": corner_points}

    except Exception as e:
        print(f"Error processing image: {e}")
        return {"status": "error", "message": str(e)}

# --- Wall Processing API Endpoint ---
@app.route("/process_wall", methods=["POST"])
def handle_request():
    print("Received a /process_wall request...")
    wall_name = flask.request.form.get("wall_name")
    image_file = flask.request.files.get("image")
    points_mode = flask.request.form.get("points_mode") 
    points_json = flask.request.form.get("points_data") # Can be null or contains final points
    
    # 1. Handle Auto-Detect Request (Just for preview)
    if points_mode == "auto" and not points_json: 
        print("Running auto-detection...")
        # Read image to memory for auto-detection
        image_file.seek(0)
        filestr = image_file.read()
        npimg = np.frombuffer(filestr, np.uint8)
        image_for_detect = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

        if image_for_detect is None:
            return flask.jsonify({"status": "error", "message": "Could not decode image for auto-detection"}), 400
            
        points_to_use = auto_detect_corners(image_for_detect)
        
        if points_to_use is None:
            # Tell frontend to switch to manual mode
            return flask.jsonify({"status": "fail_auto", "message": "Auto-detection failed. Please click the 4 corners manually."}), 200
        
        # Success in detection, return points for frontend preview
        return flask.jsonify({"status": "success", "points": points_to_use, "message": "Detection successful. Ready to confirm."})
        
    # 2. Handle Manual/Confirm Processing Request
    elif points_mode == "manual" or (points_mode == "auto" and points_json):
        points_to_use = json.loads(points_json)
        
        # Reset file pointer to the beginning for the main processing function
        image_file.seek(0)
        
        # Call the main processing function
        result = process_wall(image_file, points_to_use, wall_name)
        return flask.jsonify(result)
    
    else:
        return flask.jsonify({"status": "error", "message": "Invalid request mode."}), 400

# --- Asset Processing API Endpoint (Placeholder) ---
@app.route("/process_asset", methods=["POST"])
def handle_asset_request():
    # Placeholder for the removed photogrammetry pipeline
    return flask.jsonify({"status": "error", "message": "Asset Generation is disabled for PoC"}), 500

# --- Start the server ---
if __name__ == "__main__":
    print("Starting the CV processing server...")
    print("Visit http://localhost:8000/uploader.html to start.")
    app.run(port=5000, debug=True)