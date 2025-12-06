import cv2
import numpy as np

# Load the new test image of a full wall
image = cv2.imread('test_full_wall.jpg')

if image is None:
    print("Error: 'test_full_wall.jpg' not found.")
    print("Please make sure you saved the new image in the correct folder.")
else:
    print("Image 'test_full_wall.jpg' loaded successfully.")

    # --- Define the 4 corners of the WALL IN THE ORIGINAL IMAGE ---
    # These points define the entire surface of the wall you want to flatten.
    # You will need to adjust these for YOUR specific image if it's different.
    pts_src = np.array([
        [15, 60],    # Approximate Top-Left of the main brick wall
        [750, 20],   # Approximate Top-Right of the main brick wall
        [20, 680],   # Approximate Bottom-Left of the main brick wall
        [750, 710]   # Approximate Bottom-Right of the main brick wall
    ], dtype="float32")

    # --- Define the CONSISTENT TARGET SIZE for the output texture (for all walls) ---
    # This ensures all wall textures, regardless of original photo resolution,
    # are scaled to a standard size for your 3D model.
    # A common texture size for web is 1024x1024 or 2048x2048.
    # Let's target 1024x768 for a rectangular wall.
    target_texture_width, target_texture_height = 1024, 768

    # --- Define the 4 corners of the new, perfectly flat texture ---
    # This will be a perfect rectangle of your target_texture_width x target_texture_height
    pts_dst = np.array([
        [0, 0],                                 # Top-Left
        [target_texture_width - 1, 0],          # Top-Right
        [0, target_texture_height - 1],         # Bottom-Left
        [target_texture_width - 1, target_texture_height - 1] # Bottom-Right
    ], dtype="float32")

    # --- Get the perspective transformation matrix ---
    # This matrix tells OpenCV how to "un-skew" and resize the wall
    matrix = cv2.getPerspectiveTransform(pts_src, pts_dst)

    # --- Apply the transformation (Flattening and Scaling) ---
    # The 'image_warped' is your final flat, scaled wall texture
    image_warped = cv2.warpPerspective(image, matrix, (target_texture_width, target_texture_height))

    # --- Apply basic stylistic alterations (as per requirement: "improved/altered such that it does not look bad and maybe not even real") ---
    # 1. Gaussian Blur: Smooths out fine details, making it less "real" and reducing noise.
    image_warped = cv2.GaussianBlur(image_warped, (5, 5), 0) # (5,5) is the kernel size, 0 is sigmaX

    # 2. Adjust Brightness/Contrast (Optional, but can make textures more uniform)
    # You can play with alpha (contrast) and beta (brightness)
    # image_warped = cv2.convertScaleAbs(image_warped, alpha=1.1, beta=10) # alpha > 1 increases contrast, beta > 0 increases brightness

    # --- Display and Save the Results ---

    # Draw circles on the original image to show the selected wall corners
    for x, y in pts_src:
        cv2.circle(image, (int(x), int(y)), 8, (0, 0, 255), -1) # Red circles

    # Show both images
    cv2.imshow('Original Wall Photo (with selected corners)', image)
    cv2.imshow('Processed Flat Wall Texture', image_warped)
    
    # Save the processed texture
    output_filename = 'processed_wall_texture.jpg'
    cv2.imwrite(output_filename, image_warped)
    print(f"Success! '{output_filename}' has been saved in your project folder.")
    
    print("Press any key on an image window to close.")
    cv2.waitKey(0)
    cv2.destroyAllWindows()