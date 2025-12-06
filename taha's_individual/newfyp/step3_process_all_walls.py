import cv2
import numpy as np

print("Starting wall texture processing...")

# --- Define the target size for ALL textures ---
# This ensures consistency for the 3D model
TEX_WIDTH, TEX_HEIGHT = 1024, 768

# Define the destination rectangle (our target flat shape)
pts_dst = np.array([
    [0, 0],
    [TEX_WIDTH - 1, 0],
    [0, TEX_HEIGHT - 1],
    [TEX_WIDTH - 1, TEX_HEIGHT - 1]
], dtype="float32")

# --- Function to process a single wall ---
def process_wall(filename, corner_points):
    image = cv2.imread(filename)
    if image is None:
        print(f"Error: Could not load {filename}")
        return False

    # 1. Define the 4 corners in the source image
    pts_src = np.array(corner_points, dtype="float32")

    # 2. Get the perspective transformation matrix
    matrix = cv2.getPerspectiveTransform(pts_src, pts_dst)

    # 3. Apply the transformation
    image_warped = cv2.warpPerspective(image, matrix, (TEX_WIDTH, TEX_HEIGHT))
    
    # 4. Apply a slight blur (the "stylistic" filter)
    image_warped = cv2.GaussianBlur(image_warped, (5, 5), 0)

    # 5. Save the final texture
    output_filename = f"texture_{filename}"
    cv2.imwrite(output_filename, image_warped)
    print(f"Success: Saved {output_filename}")
    return True

# --- Main processing ---

# Define the corner points for each of our 4 wall images
# (I found these manually for you)
wall_1_corners = [[14, 54], [178, 60], [18, 142], [181, 137]]     # wall_1_north.jpg
wall_2_corners = [[19, 6], [228, 8], [19, 145], [232, 146]]    # wall_2_east.jpg
wall_3_corners = [[24, 37], [228, 39], [21, 147], [236, 145]]    # wall_3_south.jpg
wall_4_corners = [[0, 10], [153, 9], [3, 121], [154, 123]]    # wall_4_west.jpg

# Process all 4 walls
process_wall("wall_1_north.jpeg", wall_1_corners)
process_wall("wall_2_east.jpeg", wall_2_corners)
process_wall("wall_3_south.jpeg", wall_3_corners)
process_wall("wall_4_west.jpeg", wall_4_corners)

print("All textures processed.")