# This branch — merge & implementation notes (vs `omer`)

This document inventories **features and file-level changes on the current workspace branch** (e.g. `taha`) so you can compare them with [Omer’s `omer` branch guide](#omer-branch-readme--summary) and merge **without dropping** either the guided venue pipeline work here or Omer’s **assets / scaling / materials** work.

**Related:** [FORYOU.md](FORYOU.md) is the **taha → partner** pipeline merge guide (wall capture, stitch, object removal). This file complements it with **this-branch-only** UX/API work and a **conflict matrix** against Omer’s README.

**Suggested merge order (same as Omer’s doc):** database migrations → backend → frontend → env / Docker.

---

## 1. Purpose

Use this README together with Omer’s handoff doc: **diff section-by-section**, then reconcile **high-risk files** ([`src/pages/planner/FloorPlanner.tsx`](src/pages/planner/FloorPlanner.tsx), [`src/pages/viewer/Space3DViewer.tsx`](src/pages/viewer/Space3DViewer.tsx), asset generation, migrations) so the final app has **venue-driven room dimensions** from this branch **and** Omer’s **true-size placement, materials, lighting, brightness, Tripo path**.

---

## 2. Summary — what this branch adds (inventory)

| Area | What changed |
|------|----------------|
| **Guided capture & media** | Stronger camera constraints and JPEG quality; HUD replaced by centered auto-dismiss hints; `ScannerOverlay` (green brackets) and minimap removed from capture; faster segment review (two-phase fetch, server-side overlap on downscaled images, overlap slider tuning). |
| **Stitching** | [`server/services/wall_stitch.py`](server/services/wall_stitch.py): guards for empty OpenCV outputs, overlap performance, safer `imwrite`; rebuild Docker image after server changes. |
| **Object removal** | [`server/services/object_removal_service.py`](server/services/object_removal_service.py) + guided UI: HF Space UX (timers, realistic wait copy). |
| **Wall editor** | [`src/pages/guided/WallEditor.tsx`](src/pages/guided/WallEditor.tsx): `?step=corners` flow; `canDragCorners`; image load does not force crop mode on corner step. |
| **Venue hub** | [`src/pages/venues/VenueHome.tsx`](src/pages/venues/VenueHome.tsx): workflow steps from real data (`layout_file_exists`, polygons/walls, guided completion, assets / `generated_glb`); CTA progression and “all recommendations completed.” |
| **Layout API** | [`server/api/endpoints/layout.py`](server/api/endpoints/layout.py): `layout_file_exists` on GET layout responses. |
| **Floor planner** | [`src/pages/planner/FloorPlanner.tsx`](src/pages/planner/FloorPlanner.tsx): **`roomDimsFromVenue`**, **`roomDimsFromSavedLayout`**, **`FALLBACK_ROOM`** — room dimensions **synced from venue DB** when there is no saved `layout.json`; saved layout wins when layout exists; reset reloads dims from venue. |
| **3D / Three** | [`src/utils/threeLoader.ts`](src/utils/threeLoader.ts) (shared loader usage from planner/viewer as applicable). |

Cross-check with [FORYOU.md](FORYOU.md) **Files to Add/Modify** for the core pipeline files (`walls.py`, `ObjectRemoval`, `wall_stitch`, etc.).

---

## 3. Key files (this branch — grouped)

### Server

| File | Why |
|------|-----|
| [`server/services/wall_stitch.py`](server/services/wall_stitch.py) | Stitching robustness and performance. |
| [`server/services/object_removal_service.py`](server/services/object_removal_service.py) | Object removal API contract and HF Space client. |
| [`server/api/endpoints/layout.py`](server/api/endpoints/layout.py) | `layout_file_exists` and layout CRUD. |
| [`server/api/endpoints/walls.py`](server/api/endpoints/walls.py) | Wall pipeline endpoints (with venue auth per FORYOU). |
| [`server/migrations/`](server/migrations/) | `001`–`003` present in tree; see snapshot below for `004`. |

### Guided flow

| File | Why |
|------|-----|
| [`src/pages/guided/MobileCapture.tsx`](src/pages/guided/MobileCapture.tsx) | Capture UX and navigation. |
| [`src/pages/guided/SegmentReview.tsx`](src/pages/guided/SegmentReview.tsx) | Stitch trigger, segment review. |
| [`src/pages/guided/ObjectRemoval.tsx`](src/pages/guided/ObjectRemoval.tsx) | Removal UX. |
| [`src/pages/guided/WallEditor.tsx`](src/pages/guided/WallEditor.tsx) | Corners / re-stitch. |
| [`src/pages/guided/WallSelector.tsx`](src/pages/guided/WallSelector.tsx), [`WallUpload.tsx`](src/pages/guided/WallUpload.tsx) | Wall selection and upload. |
| Matching `.css` files | Styling for the above. |

### Venues & planner & viewer

| File | Why |
|------|-----|
| [`src/pages/venues/VenueHome.tsx`](src/pages/venues/VenueHome.tsx) | Workflow + CTA from real venue state. |
| [`src/pages/planner/FloorPlanner.tsx`](src/pages/planner/FloorPlanner.tsx) | Venue dimension sync + layout save behavior. |
| [`src/pages/viewer/Space3DViewer.tsx`](src/pages/viewer/Space3DViewer.tsx) | 3D layout + GLBs (overlaps with Omer scaling). |

---

## 4. Merge checklist — reconcile with `omer`

### Take from Omer (verify by diff)

- **Database:** [`server/migrations/004_add_brightness.sql`](server/migrations/004_add_brightness.sql) (and any Omer-only migration tweaks) if `brightness` column is missing.
- **Tripo / generation:** Omer may use [`server/services/tripo3d_service.py`](server/services/tripo3d_service.py) and STS/S3 upload; this tree may implement Tripo inside [`server/services/instantmesh_service.py`](server/services/instantmesh_service.py) — **unify** after merge so `POST /assets/generate` matches one contract.
- **Public URL:** [`server/utils/public_url.py`](server/utils/public_url.py), ngrok scripts — port if mobile/external links need a stable base URL.
- **Floor planner:** Omer’s **material presets**, **custom textures**, **lighting preset** in layout JSON, **true-size 2D** asset scaling, **brightness** on catalog/user assets — merge **without removing** `roomDimsFromVenue` / `layout_file_exists` behavior.
- **3D viewer:** Omer’s **meter-accurate** rules (footprint vs height by layer), **brightness** multiply, layout **materials** / **generated GLB** loading — merge **without regressing** venue-synced room dimensions.

### Prefer this branch unless Omer’s README supersedes

- Guided pipeline: stitch, object removal, wall editor corners, `VenueHome` workflow, `layout_file_exists`.
- **Floor planner default room size from venue** when no saved layout (avoid falling back to a generic 20×20×8 for new venues).

### Scaling (explicit target)

- **Room size:** from **venue DB** when no `layout.json` (this branch).
- **Placed assets:** Omer’s **true-size** rules in 2D and 3D (footprint/height by layer, brightness).
- **Validate** on a **new venue** without a stale `layout.json`.

---

## 5. Verification (this branch + post-merge)

1. New venue → **Venue home** stats and recommendations match expectations.
2. Open **Floor planner** → room dimensions match **venue** when no layout file; after save, **saved layout** wins.
3. **Guided flow:** capture → segment review → stitch → optional object removal → corners.
4. **3D viewer:** placed assets and GLB **scale** and **brightness** look correct (after Omer merge).
5. **Docker:** rebuild backend image after Python changes; see [DOCKER_GUIDE.md](DOCKER_GUIDE.md).

---

## 6. Environment / Docker

- [DOCKER_GUIDE.md](DOCKER_GUIDE.md) — compose, ports, rebuild.
- Object removal: `INPAINT_SPACE_URL` (see [FORYOU.md](FORYOU.md)).
- Omer-side: `TRIPO_API_KEY`, `PUBLIC_URL` / `NGROK_URL` — merge [`.env.example`](.env.example) and [`docker-compose.yml`](docker-compose.yml) without breaking inpaint or guided flows.

---

## Omer branch README — summary

**Themes:** DB columns on `user_assets` (`asset_layer`, `width_m`, `depth_m`, `height_m`, `brightness`); Tripo3D multiview + STS vs InstantMesh single-image; asset API PATCH; Asset Library edit layer/dimensions/brightness; floor planner materials + custom textures + lighting preset + true-size 2D; Space3DViewer meter-accurate scaling, brightness multiply, GLTFLoader, layout materials + generated GLB; `PUBLIC_URL` / ngrok.

**Omer merge order:** migrations `002`–`004` → Python (`tripo3d_service.py`, `public_url.py`, `asset_service.py`, `assets.py`, …) → React (`Space3DViewer`, `FloorPlanner`, `AssetLibrary`, `MobileCapture`) → `docker-compose`, `.env.example`.

**Omer pitfalls:** WebGL environment issues; Tripo task failures; planner `lighting` preset may not fully drive 3D until viewer reads `data.lighting`.

---

## Workspace snapshot (for merge planning)

Checked against this repo at doc creation time:

| Item | Status |
|------|--------|
| Migrations `001`–`003` | Present under [`server/migrations/`](server/migrations/) |
| Migration `004` (brightness) | Present after merging `origin/omer` — run DB migrations if not applied |
| `server/services/tripo3d_service.py` | Present after merge with `origin/omer` (alongside [`instantmesh_service.py`](server/services/instantmesh_service.py)) |
| `server/utils/public_url.py` | **Not** present — may come from `omer` |
| [`FloorPlanner.tsx`](src/pages/planner/FloorPlanner.tsx) | Contains `roomDimsFromVenue` and related helpers |
| [`Space3DViewer.tsx`](src/pages/viewer/Space3DViewer.tsx) | GLTF paths / `width_m`-style scaling — **diff against `omer`** for full parity |

---

## Conflict matrix (this branch vs `omer`)

| Area | This branch | Omer (`omer`) | Resolution (target) |
|------|-------------|---------------|---------------------|
| **DB** | `002`, `003` in tree; `004` may be missing | `004` brightness | Add/run **`004`** if column missing; keep idempotent migrations |
| **Tripo / generate** | Tripo in `instantmesh_service` | `tripo3d_service.py`, STS/S3, multiview order | Diff `omer`; unify `assets.py` `POST /assets/generate` |
| **public URL / ngrok** | May be absent | `public_url.py`, scripts | Port if guided/mobile need external base URL |
| **Asset API** | `asset_layer`, dimensions | + **brightness**, clamped update | Merge schemas; PATCH + list/detail include brightness after `004` |
| **FloorPlanner** | Venue-driven default room dims; saved layout wins | Materials, lighting preset, true-size 2D, brightness | **Combine**: keep `roomDimsFromVenue` + Omer materials/lighting/2D/brightness |
| **Space3DViewer** | Partial overlap | Footprint vs height by layer, brightness, materials, generated GLB | Merge Omer scaling + brightness with this branch’s layout/GLB fixes |
| **AssetLibrary** | Layer + dimensions | Brightness UI, Tripo when key set | Merge Omer UI + API fields |
| **Guided / walls / venues** | Stitch, WallEditor, VenueHome, `layout_file_exists`, object removal | MobileCapture multiview; minor WallEditor | Preserve Taha pipeline; fold Omer capture where it does not drop stitch/venue behavior |
| **Docker / env** | DOCKER_GUIDE, inpaint | `TRIPO_API_KEY`, `PUBLIC_URL`/`NGROK_URL` | Merge `.env.example` and compose without breaking inpaint/guided |

---

## Next steps after this doc

1. **`git merge omer`** (or merge `origin/omer`) into this branch; resolve conflicts using the matrix and checklist.
2. Run migrations; `pip install -r requirements.txt` (e.g. `boto3` if Tripo STS requires it).
3. Smoke test: Omer’s list (InstantMesh, Tripo with key, planner materials, 3D scale/brightness) **plus** this branch’s guided + venue + floor-planner venue sync.

---

*Update this file when file paths or APIs change.*
