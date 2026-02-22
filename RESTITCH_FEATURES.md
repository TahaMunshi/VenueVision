# Re-Stitching with Smart Overlap Detection & Corner Adjustment

## Overview
This document describes the new re-stitching features added to VenueVision for improved wall image processing.

---

## Feature 1: Smart Overlap Detection via Reference Points & Correlation

### How It Works
Instead of simple MSE-based overlap detection, the new algorithm:

1. **Detects Edges in Both Images**
   - Uses Canny edge detection to find vertical reference points
   - Identifies structural features (roof edges, corners) that should align

2. **Matches Reference Points Using Correlation**
   - Tests overlap widths from 20% to 60% of image width
   - For each overlap width, compares:
     - Edge alignment (how many edge pixels match)
     - Pixel-level MSE (mean squared error)
   - Combines both scores: `score = (edge_score × 0.4) + (pixel_score × 0.6)`

3. **Precise Stitching**
   - Selects overlap with best combined score
   - Left image stays completely intact
   - Right image cropped from left side by detected overlap
   - Simple concatenation with no blending or warping

### Code Location
- **Backend**: `server/services/wall_stitch.py` → `_stitch_two()` function
- **Algorithm**: 
  - Canny edge detection for feature extraction
  - MSE-based template matching
  - Weighted edge + pixel correlation scoring

### Benefits
- More precise overlap detection than raw pixel comparison
- Handles varying lighting and texture better
- Prevents excessive duplication or gaps
- Maintains straight edges (no warping)

---

## Feature 2: Re-Stitch Without Corner Adjustment

### Purpose
Users can re-process existing captured images without adjusting corners, useful for:
- Fixing stitching issues with better algorithm
- Testing different overlap detection parameters
- Re-concatenating images that may have been improperly stitched

### API Endpoint
```
POST /api/v1/wall/restitch
Content-Type: application/json

{
  "venue_id": "venue-123",
  "wall_id": "wall_north"
}
```

### Response
```json
{
  "status": "success",
  "message": "Wall images re-stitched successfully",
  "image_url": "/static/uploads/venue-123/wall_north/stitched_wall_north.jpg"
}
```

### Frontend Button
Located in **WallEditor.tsx**:
- Button: "🔄 Re-stitch"
- Calls existing uploaded sequence images (`seq_01.jpg`, `seq_02.jpg`, etc.)
- Re-runs the stitching algorithm
- Reloads the page with updated stitched image

---

## Feature 3: Re-Stitch WITH Corner Adjustment

### Purpose
After re-stitching, users can manually adjust the four corners of the wall and have the stitching re-done with perspective correction applied.

### Workflow
1. User navigates to **WallEditor** for a wall
2. Clicks **"Adjust Corners"** button to enter corner adjustment mode
3. Drags the 4 corner points to adjust wall boundaries
4. Clicks **"✓ Re-stitch + Corners"** button
5. Backend:
   - Re-stitches existing images with new algorithm
   - Applies perspective transform based on adjusted corners
   - Saves corrected image as `processed_wall_id.jpg`

### API Endpoint
```
POST /api/v1/wall/restitch-with-corners
Content-Type: multipart/form-data

{
  "venue_id": "venue-123",
  "wall_id": "wall_north",
  "corner_points": "[[x1,y1], [x2,y2], [x3,y3], [x4,y4]]"  // JSON string
}
```

### Frontend Modes
In WallEditor.tsx, two modes available:

1. **Crop Mode** (default):
   - Adjust corners with full image visible
   - Intended for initial capture processing

2. **Corner Adjust Mode** (new):
   - Disabled when entering this mode
   - Allows corner adjustment for re-stitching
   - "Re-stitch + Corners" button becomes active

### Code Locations
- **Backend Endpoint**: `server/api/endpoints/capture.py` → `restitch_wall_with_corners()`
- **Processing Function**: `server/services/wall_processing.py` → `process_wall_image_with_corners()`
- **Frontend Button**: `src/pages/guided/WallEditor.tsx` → `handleReStitchWithCorners()`

---

## UI/UX in WallEditor

### Buttons Available
1. **"Crop Mode: On"** - Toggle crop mode for initial corner selection
2. **"Adjust Corners"** - Toggle corner adjustment mode for re-stitching
3. **"Reset to Full Image"** - Reset corners to full image bounds
4. **"Save / Process"** - Process with perspective correction (crop mode only)
5. **"🔄 Re-stitch"** - Re-stitch without corner adjustment
6. **"✓ Re-stitch + Corners"** - Re-stitch AND apply corner adjustment (corner adjust mode only)
7. **"View 3D Space"** - Navigate to 3D viewer

### Mode Selection
- Mutually exclusive: either Crop Mode OR Corner Adjust Mode active
- Buttons appropriately disabled based on active mode
- Instructions update based on current mode

---

## Technical Improvements

### Stitching Algorithm (`_stitch_two` in wall_stitch.py)
```python
# New approach:
1. Detect edges using Canny edge detection
2. Calculate vertical projection (sum of edges per column)
3. For each test overlap width:
   - Compare edge alignment (dot product of edge projections)
   - Compute MSE of overlapping regions
   - Combine scores with weights (0.4 edges + 0.6 pixels)
4. Select overlap with highest combined score
5. Concatenate: [left image] + [right image cropped from left by overlap]
6. Crop output to remove black space
```

### Output Characteristics
- ✓ Straight edges (no warping)
- ✓ No duplication in overlap zone
- ✓ No black spaces or gaps
- ✓ Perfect rectangular shape
- ✓ Precise alignment of features

---

## Usage Instructions

### Scenario: Initial Capture
1. Capture wall images (Photo 1, Photo 2, etc.)
2. Images auto-stitch
3. In WallEditor, use **"Save / Process"** to apply corner perspective correction

### Scenario: Fix Bad Stitching (Re-stitch Only)
1. View existing wall in WallEditor
2. Click **"🔄 Re-stitch"** 
3. Wait for re-stitching with new algorithm
4. Page reloads with improved result

### Scenario: Fix Bad Stitching + Adjust Corners
1. View existing wall in WallEditor
2. Click **"Adjust Corners"** to enter corner adjust mode
3. Drag corner points to adjust wall boundaries
4. Click **"✓ Re-stitch + Corners"**
5. Backend re-stitches AND applies perspective correction
6. Page reloads with result

---

## Testing Checklist

- [ ] Upload 2+ wall images
- [ ] Verify auto-stitching works
- [ ] Click "🔄 Re-stitch" without corner adjustment
- [ ] Verify stitched result improves
- [ ] Enter "Corner Adjust Mode"
- [ ] Drag corners to adjust
- [ ] Click "✓ Re-stitch + Corners"
- [ ] Verify re-stitched image with perspective correction
- [ ] Check final output has no black space, warping, or duplication
- [ ] Verify 3D viewer displays corrected wall

---

## Future Enhancements

1. **Homography-based Alignment**: Could optionally use feature matching + homography for more robust overlap
2. **Batch Re-stitching**: Re-stitch all walls in a venue at once
3. **Stitching Preview**: Show overlap detection visualization before applying
4. **Parameter Tuning**: Allow users to adjust edge weight vs pixel weight in correlation

---

## Commit Information
- **Commit**: `c555ef3`
- **Message**: "Implement smart overlap detection and manual corner adjustment for re-stitching"
- **Files Modified**:
  - `server/api/endpoints/capture.py` - New endpoints
  - `server/services/wall_stitch.py` - Improved `_stitch_two` algorithm
  - `server/services/wall_processing.py` - New `process_wall_image_with_corners` function
  - `src/pages/guided/WallEditor.tsx` - New UI modes and buttons
