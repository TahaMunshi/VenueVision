# 1. Import the libraries we installed
import cv2
import numpy as np

print("Libraries loaded...")

# 2. Load the image from your folder
# 'cv2.imread' means "image read"
image = cv2.imread('test_wall.jpg')

# 3. Check if the image loaded correctly (very important!)
if image is None:
    print("Error: Could not find or open 'test_wall.jpg'.")
    print("Make sure the file is in the same folder as the script.")
else:
    print("Image loaded successfully!")
    
    # 4. Display the image in a new window
    # 'cv2.imshow' means "image show"
    # 'Original Wall' is the name of the pop-up window
    cv2.imshow('Original Wall', image)
    
    # 5. Wait for the user to press any key
    # This keeps the window open until you press a key
    print("Press any key on the image window to close it.")
    cv2.waitKey(0)
    
    # 6. Clean up and close all windows
    cv2.destroyAllWindows()