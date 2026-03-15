# FORYOU – Merge Guide for Partner

**From:** Taha  
**Branch:** `taha`  
**Purpose:** Integrate wall capture pipeline, flawless stitching, and object removal into your branch without losing any functionality.

---

## Instructions for Cursor AI

When you (the partner) read this document:

1. **Merge `taha` into your branch** (e.g. `omer` or `yumman`) using `git merge taha` or by rebasing.
2. **Resolve conflicts** by keeping Taha's implementation for the features listed below. Use the conflict resolution rules in the "Conflict Resolution" section.
3. **Apply all changes** from the "Files to Add/Modify" section. Ensure no file is missed.
4. **Run the setup steps** in "Setup" after merging.
5. **Verify** the flow works end-to-end.

---

## Summary of Changes

### New Features

| Feature | Description |
|---------|-------------|
| **Wall capture pipeline** | Mobile capture → segment review → stitch → object removal → 4 corners → next wall |
| **Flawless stitching** | SIFT + homography + histogram matching (matches Colab notebook, no overlap artifacts) |
| **Object removal** | Click-to-remove objects via Hugging Face Space (SAM2 + LaMa) |
| **Venue auth** | `require_venue_access` for venue ownership checks |

### Removed

- `FloorPlanUpload` component (floor plans created in-app only)
- `floor_plan.py` endpoint

---

## Files to Add/Modify

### New Files (add these)

```
server/services/object_removal_service.py
server/utils/venue_auth.py
src/pages/guided/ObjectRemoval.tsx
src/pages/guided/ObjectRemoval.css
hf_inpaint_space/
  app.py
  requirements.txt
  README.md
  .gitattributes
```

### Modified Files (merge these)

| File | Key Changes |
|------|-------------|
| `requirements.txt` | +scikit-image, +gradio_client |
| `.env.example` | +INPAINT_SPACE_URL, object removal notes |
| `docker-compose.yml` | +INPAINT_SPACE_URL, +HF_TOKEN env |
| `server/api/endpoints/__init__.py` | Remove floor_plan import if present |
| `server/api/endpoints/walls.py` | +remove_object, +apply_corners, +restitch, +venue_auth |
| `server/api/endpoints/capture.py` | Capture progress, photo count logic |
| `server/api/endpoints/common.py` | required_photos_for_wall, completed_walls_for_venue |
| `server/api/endpoints/venues.py` | Venue CRUD, auth |
| `server/api/endpoints/layout.py` | Layout endpoints |
| `server/services/wall_stitch.py` | _flawless_stitch_two (SIFT+homography), stitch_segments |
| `server/utils/file_manager.py` | save_wall_photo (append seq_XX), etc. |
| `src/App.tsx` | +ObjectRemoval route, +/remove/:venueId/:wallId |
| `src/pages/guided/MobileCapture.tsx` | Progress, nav to SegmentReview |
| `src/pages/guided/SegmentReview.tsx` | Stitch UI, nav to ObjectRemoval |
| `src/pages/guided/WallEditor.tsx` | Apply corners, re-stitch |
| `src/pages/guided/WallSelector.tsx` | Wall selection |
| `src/pages/guided/WallUpload.tsx` | Corner upload flow |
| `src/pages/planner/FloorPlanner.tsx` | Floor plan creation |
| `src/pages/venues/VenueHome.tsx` | Venue list |
| `src/pages/viewer/Space3DViewer.tsx` | 3D viewer |
| `src/utils/api.ts` | getAuthHeaders, getApiBaseUrl |

### Deleted Files (remove these)

```
server/api/endpoints/floor_plan.py
src/components/FloorPlanUpload.tsx
src/components/FloorPlanUpload.css
```

---

## Setup (Required After Merge)

### 1. Install Dependencies

```bash
pip install -r requirements.txt
# Key new deps: scikit-image, gradio_client
```

### 2. Environment Variables

Add to `.env`:

```env
# Object removal (HF Space)
INPAINT_SPACE_URL=TahaMunshi03/venuevision-inpaint
# HF_TOKEN=  # Optional, for gated Spaces
```

### 3. Hugging Face Space

The object removal uses **TahaMunshi03/venuevision-inpaint** on Hugging Face. It must be deployed and running. If you need to deploy your own:

- Copy `hf_inpaint_space/` or `venuevision-inpaint/` to a new HF Space
- Push to `https://huggingface.co/spaces/YOUR_USERNAME/venuevision-inpaint`
- Update `INPAINT_SPACE_URL` in `.env`

### 4. Database

No schema changes. Run migrations if your branch has any.

---

## API Endpoints Added

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/venue/<id>/wall/<id>/remove-object` | Remove object at (x, y) |
| POST | `/api/v1/venue/<id>/wall/<id>/apply-corners` | Apply 4 corner points |
| POST | `/api/v1/venue/<id>/wall/<id>/restitch` | Re-stitch with corners |

---

## Frontend Routes Added

| Path | Component |
|------|-----------|
| `/remove/:venueId/:wallId` | ObjectRemoval – click to remove objects |

---

## Conflict Resolution

When merging, if conflicts occur:

1. **For `server/services/wall_stitch.py`**: Keep `_flawless_stitch_two` and the new stitch order (flawless → OpenCV → correlation).
2. **For `server/api/endpoints/walls.py`**: Keep all new routes (remove-object, apply-corners, restitch) and `require_venue_access` usage.
3. **For `src/App.tsx`**: Add the ObjectRemoval route; keep your other routes.
4. **For `src/pages/guided/*`**: Keep Taha's navigation flow (capture → review → remove → edit).
5. **For `requirements.txt`**: Merge dependency lists; ensure scikit-image and gradio_client are present.

---

## Flow Verification

1. Create a venue → create floor plan in planner
2. Go to capture → select wall → take photos (1 per 10m)
3. Segment Review → Stitch
4. Remove Objects → click on furniture to remove
5. Proceed to 4 Corners → drag corners → Apply Corners
6. Next wall or finish

---

## Quick Merge Commands

```bash
# From your branch (e.g. omer or yumman)
git fetch origin
git merge origin/taha
# Resolve conflicts using rules above
# Then:
pip install -r requirements.txt
# Add INPAINT_SPACE_URL to .env
```

---

*If anything is unclear, the implementation in `taha` branch is the source of truth.*
*Good luck with the merge!*
