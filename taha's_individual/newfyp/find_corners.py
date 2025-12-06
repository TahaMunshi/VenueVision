import cv2
import numpy as np
import sys

# This list will store the (x, y) coordinates
points = []

# This function will be called every time you click the mouse
def click_event(event, x, y, flags, params):
    global points
    
    # Check for left mouse click
    if event == cv2.EVENT_LBUTTONDOWN:
        # Add the (x,y) coordinate to our list
        points.append([x, y])
        
        # Draw a small circle on the image to show where you clicked
        cv2.circle(img, (x, y), 5, (0, 0, 255), -1)
        cv2.imshow('image', img)
        
        print(f"Clicked: [{x}, {y}]")
        
        # If we have 4 points, print the final list
        if len(points) == 4:
            print("\n--- All 4 points selected! ---")
            print("Copy this list into your 'step3_process_all_walls.py' script:")
            print(np.array(points).tolist())
            print("---------------------------------")
            print("Press any key to close this image.")

# --- Main script ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Error: You must provide an image file to process.")
        print("Usage: python find_corners.py wall_1_north.jpg")
    else:
        filename = sys.argv[1]
        img = cv2.imread(filename)
        
        if img is None:
            print(f"Error: Could not load image {filename}")
        else:
            print(f"--- Processing: {filename} ---")
            print("Please click the 4 corners in this order:")
            print("1. Top-Left")
            print("2. Top-Right")
            print("3. Bottom-Left")
            print("4. Bottom-Right")
            print("---------------------------------")
            
            # Create a window and set the mouse callback function
            cv2.imshow('image', img)
            cv2.setMouseCallback('image', click_event)
            
            cv2.waitKey(0)
            cv2.destroyAllWindows()