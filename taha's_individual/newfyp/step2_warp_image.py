import cv2
import numpy as np

# Load the new test image
image = cv2.imread('test_wall.jpg')

if image is None:
    print("Error: 'test_wall.jpg' not found.")
    print("Please make sure you saved the new image in the correct folder.")
else:
    print("Image 'test_wall.jpg' loaded successfully.")

    # 1. Define the 4 corners of the painting IN THE ORIGINAL IMAGE
    # These are the points we found above
    pts_src = np.array([
        [212, 122],  # Top-Left
        [404, 150],  # Top-Right
        [211, 357],  # Bottom-Left
        [405, 392]   # Bottom-Right
    ], dtype="float32")

    # 2. Define the CONSISTENT SIZE for the output (scaling)
    # We will scale every "flattened wall segment" to 400x600
    width, height = 400, 600

    # 3. Define the 4 corners of the new, flat output (the perfect rectangle)
    pts_dst = np.array([
        [0, 0],              # Top-Left
        [width - 1, 0],      # Top-Right
        [0, height - 1],     # Bottom-Left
        [width - 1, height - 1] # Bottom-Right
    ], dtype="float32")

    # 4. Get the perspective transformation matrix
    # This matrix mathematically describes how to "flatten" the object
    matrix = cv2.getPerspectiveTransform(pts_src, pts_dst)

    # 5. Apply the transformation (orientation + scaling)
    image_warped = cv2.warpPerspective(image, matrix, (width, height))

    # --- Display and Save the Results ---

    # We can draw circles on the original image to see where our points are
    for x, y in pts_src:
        cv2.circle(image, (int(x), int(y)), 5, (0, 0, 255), -1)

    # Show both images
    cv2.imshow('Original Wall (with red dots)', image)
    cv2.imshow('Warped (Flat) Painting', image_warped)
    
    # 6. Save the new flat image
    cv2.imwrite('wall_texture_flat.jpg', image_warped)
    print("Success! 'wall_texture_flat.jpg' has been saved.")
    
    print("Press any key on an image window to close.")
    cv2.waitKey(0)
    cv2.destroyAllWindows()