# Session log — single source of truth

**Purpose:** API/frontend inventory, how to run, smoke results, coordination with teammate, and an append-only changelog for today’s work until code is pushed.

**Merge rule:** Prefer **append-only** changelog entries with timestamps. For the **Coordination** section, avoid overwriting someone else’s lines; add a new dated subsection.

---

## Meta

| Field | Value |
|--------|--------|
| Date | 2026-04-10 |
| This log created | 2026-04-10 (agent) |
| Branch | _(fill when you start)_ |
| Last sync with `main` / friend’s branch | _(fill)_ |

**Smoke run A (2026-04-10, earlier):** Local `venv` + `npm run build`; Docker was off and Postgres was down, so only health + `/mobile` were verified from the host.

**Smoke run B (2026-04-10, Docker up):** `docker compose` services **venuevision-app** and **venuevision-db** healthy. Automated checks were executed **inside** the app container (so they hit the Compose-linked DB and the Flask process in the container — see **Decisions & blockers** for Windows port **5000**). **`demo` / `demo123`:** an existing DB volume had a **`demo` row whose password no longer matched** `demo123` (`setup_database.py` does not rotate the hash when the user already exists). Password was reset inside the stack with a one-off `bcrypt` + `UPDATE users` run in the **app** container. **Repeatable script:** [`scripts/docker_smoke.py`](scripts/docker_smoke.py) (`docker cp` … `venuevision-app:/app/docker_smoke.py` then `docker exec venuevision-app python /app/docker_smoke.py`).

---

## API catalog

Base URL prefix: **`/api/v1`** (see [`server/app.py`](server/app.py)).

| Method | Path | File | Auth | Notes |
|--------|------|------|------|--------|
| GET | `/api/v1/health` | `server/api/endpoints/health.py` | N | Health JSON |
| GET | `/api/v1/public-url` | `server/api/endpoints/health.py` | N | Public/ngrok base URL for links |
| POST | `/api/v1/signup` | `server/api/endpoints/auth.py` | N | Register user |
| POST | `/api/v1/login` | `server/api/endpoints/auth.py` | N | JWT |
| GET | `/api/v1/me` | `server/api/endpoints/auth.py` | Y | Current user |
| GET | `/api/v1/verify` | `server/api/endpoints/auth.py` | Y | Token check |
| GET | `/api/v1/venues` | `server/api/endpoints/venues.py` | Y | List venues |
| GET | `/api/v1/venues/<venue_identifier>` | `server/api/endpoints/venues.py` | Y | Venue detail |
| POST | `/api/v1/venues` | `server/api/endpoints/venues.py` | Y | Create venue |
| DELETE | `/api/v1/venues/<venue_identifier>` | `server/api/endpoints/venues.py` | Y | Delete venue |
| GET | `/api/v1/venue/<venue_id>/layout` | `server/api/endpoints/layout.py` | Y | Load layout |
| POST | `/api/v1/venue/<venue_id>/layout` | `server/api/endpoints/layout.py` | Y | Save layout |
| POST | `/api/v1/venue/<venue_id>/generate-glb` | `server/api/endpoints/layout.py` | Y | Generate GLB |
| GET | `/api/v1/venue/<venue_id>/progress` | `server/api/endpoints/walls.py` | Y | Capture progress |
| GET | `/api/v1/venue/<venue_id>/wall-images` | `server/api/endpoints/walls.py` | Y | List wall images |
| DELETE | `/api/v1/venue/<venue_id>/wall-images` | `server/api/endpoints/walls.py` | Y | Clear wall images |
| POST | `/api/v1/venue/<venue_id>/wall/<wall_id>/reset` | `server/api/endpoints/walls.py` | Y | Reset one wall |
| GET | `/api/v1/venue/<venue_id>/wall/<wall_id>/segments` | `server/api/endpoints/walls.py` | Y | Segment list |
| POST | `/api/v1/venue/<venue_id>/wall/<wall_id>/stitch` | `server/api/endpoints/walls.py` | Y | Stitch segments |
| POST | `/api/v1/venue/<venue_id>/wall/<wall_id>/restitch-with-corners` | `server/api/endpoints/walls.py` | Y | Restitch with corners |
| POST | `/api/v1/venue/<venue_id>/wall/<wall_id>/remove-object` | `server/api/endpoints/walls.py` | Y | Inpaint / remove object |
| POST | `/api/v1/venue/<venue_id>/wall/<wall_id>/apply-corners` | `server/api/endpoints/walls.py` | Y | Apply corner geometry |
| POST | `/api/v1/venue/<venue_id>/reset` | `server/api/endpoints/walls.py` | Y | Reset venue walls |
| POST | `/api/v1/capture/upload` | `server/api/endpoints/capture.py` | Y | Upload capture segment |
| POST | `/api/v1/wall/auto-detect` | `server/api/endpoints/capture.py` | N | Corner auto-detect (image only) |
| POST | `/api/v1/wall/process` | `server/api/endpoints/capture.py` | Y | Process/warp wall image |
| POST | `/api/v1/assets/generate` | `server/api/endpoints/assets.py` | Y | Generate asset (e.g. 3D pipeline) |
| GET | `/api/v1/assets` | `server/api/endpoints/assets.py` | Y | List assets |
| GET | `/api/v1/assets/user/<user_id>` | `server/api/endpoints/assets.py` | Y | User’s assets |
| GET | `/api/v1/assets/detail/<asset_id>` | `server/api/endpoints/assets.py` | Y | Asset detail |
| PATCH | `/api/v1/assets/detail/<asset_id>` | `server/api/endpoints/assets.py` | Y | Update asset |
| DELETE | `/api/v1/assets/detail/<asset_id>` | `server/api/endpoints/assets.py` | Y | Delete asset |
| GET | `/api/v1/assets/count` | `server/api/endpoints/assets.py` | Y | Asset count |
| GET | `/api/v1/assets/status/<asset_id>` | `server/api/endpoints/assets.py` | Y | Generation status |
| POST | `/api/v1/reset` | `server/api/endpoints/maintenance.py` | Y | Maintenance reset |
| POST | `/api/v1/cleanup/temp` | `server/api/endpoints/maintenance.py` | Y | Temp cleanup |
| POST | `/api/v1/cleanup/stale-assets` | `server/api/endpoints/maintenance.py` | Y | Stale assets |
| GET | `/api/v1/cleanup/orphans` | `server/api/endpoints/maintenance.py` | Y | List orphans |
| DELETE | `/api/v1/cleanup/orphans` | `server/api/endpoints/maintenance.py` | Y | Delete orphans |
| POST | `/api/v1/cleanup/full` | `server/api/endpoints/maintenance.py` | Y | Full cleanup |
| GET | `/api/v1/storage/stats` | `server/api/endpoints/maintenance.py` | Y | Storage stats |

**Non-API Flask routes** ([`server/app.py`](server/app.py)):

| URL | Purpose |
|-----|---------|
| `GET /` | Plain text: API running; points to `/mobile` |
| `GET /mobile`, `GET /mobile/<path>` | SPA + static from `dist/` |
| `GET /static/...` | Static files from `server/static` |

---

## Frontend routes

From [`src/App.tsx`](src/App.tsx). Base in dev: Vite (`npm run dev`); in Docker/prod: **`/mobile`** prefix in browser (e.g. `http://localhost:5000/mobile/venues`).

| Path | Component |
|------|-----------|
| `/login` | `Login` |
| `/signup` | `Signup` |
| `/venues` | `VenuesList` |
| `/venue/:venueId` | `VenueHome` |
| `/assets` | `AssetLibrary` |
| `/` | Redirect → `/venues` |
| `/capture/:venueId` | `MobileCapture` |
| `/review/:venueId/:wallId` | `SegmentReview` |
| `/remove/:venueId/:wallId` | `ObjectRemoval` |
| `/upload/:venueId/:wallId` | `WallUpload` |
| `/editor/:venueId` | `WallSelector` |
| `/edit/:venueId/:wallId` | `WallEditor` |
| `/planner/:venueId` | `FloorPlanner` |
| `/view/:venueId` | `Space3DViewer` |
| `*` | Redirect → `/venues` |

---

## How to run (manual)

**Docker (recommended)** — from repo root:

```bash
docker compose up --build
```

- App: `http://localhost:5000/mobile`
- Demo login (per README): **demo** / **demo123** (if login fails on an old volume, reset the hash — see Meta **Smoke run B**)

**Windows / port 5000:** If a local **`python server/app.py`** is still bound to `0.0.0.0:5000`, `http://127.0.0.1:5000` from the host may hit that process (wrong DB / wrong app) while Docker is also “healthy”. Stop the stray Flask process or confirm with `Get-NetTCPConnection -LocalPort 5000` before trusting host-side curls.

**Local stack**

1. Python venv; `pip install -r requirements.txt` (on **Python 3.13 / Windows**, if `psycopg2-binary==2.9.9` fails to build, install a newer binary wheel, e.g. `pip install "psycopg2-binary>=2.9.10"`, or use Docker)
2. PostgreSQL running and reachable at `DATABASE_URL` (default in [`server/database.py`](server/database.py)); `cd server && python setup_database.py`
3. `npm install && npm run build` (updates `dist/` for `/mobile`)
4. `python server/app.py` (or activate venv first)

Without PostgreSQL, **health** and **static/SPA** may still work; **login, signup, venues**, and other DB-backed routes will fail.

**Frontend dev only:** `npm run dev` — set `VITE_API_BASE_URL` if API is on another host/port (see [`src/utils/api.ts`](src/utils/api.ts)).

---

## Smoke test checklist

Results below are from **Smoke run B** (requests to `http://127.0.0.1:5000` **inside** `venuevision-app`). For browser/UI confirmation, open `http://localhost:5000/mobile` after ensuring **Docker** owns port **5000** (see **How to run**).

| # | Check | Result | Notes |
|---|--------|--------|-------|
| 1 | `GET /api/v1/health` healthy JSON | **PASS** | |
| 2 | `GET /mobile` serves SPA | **PASS** | HTML ~1.3KB (built image `dist`) |
| 3 | `POST /api/v1/login` **demo** / **demo123** returns JWT | **PASS** | After password hash reset on persistent volume |
| 4 | `GET /api/v1/venues` with `Authorization: Bearer …` | **PASS** | |
| 5 | `POST /api/v1/venues` (body: `venue_identifier`, `venue_name`, `width`, `depth`, `height`) | **PASS** | HTTP 201; creates default walls |
| 6 | `GET /api/v1/venue/<new_identifier>/progress` | **PASS** | `total_walls` ≥ 1, capture_requirements present |

**Not run in this pass:** full UI click through; **capture → stitch → planner → 3D viewer** end-to-end (use [`src/App.tsx`](src/App.tsx) routes when ready).

---

## Decisions & blockers

- **Host vs container URL:** On Windows, another Flask on **:5000** can make host-side tests lie; prefer **in-container** smoke ([`scripts/docker_smoke.py`](scripts/docker_smoke.py)) or stop the extra process.
- **Stale `demo` password:** [`server/setup_database.py`](server/setup_database.py) prints “Demo user already exists” and **does not** verify or refresh `demo123`. Consider updating the hash on startup or documenting reset steps.

---

## Prioritized backlog (after smoke)

| Priority | Item | Owner | Status |
|----------|------|-------|--------|
| P0 | — | | *(none blocking after Docker smoke B)* |
| P1 | **Browser smoke:** login at `/mobile/login`, confirm `localStorage.token`, create/list venues | | open |
| P1 | **Full journey:** capture → stitch → `/planner/:id` → `/view/:id` (note exact URLs in changelog) | | open |
| P1 | **Signup error mapping**: when DB is unavailable, `/signup` can return **409** “already exists” because `register_user` returns `None` on any error | | open |
| P2 | **setup_database.py:** refresh demo password when user exists but hash is wrong | | open |
| P2 | **Windows + Python 3.13** / `psycopg2-binary` pin vs wheels | | open |
| P2 | Keep this file and [`README.md`](README.md) in sync for API lists | | done |

---

## Coordination (friend)

_Add branches, files, or features you are touching; ask teammate to add theirs._

- **Me:** _(branch, areas)_
- **Teammate:** _(branch, areas)_
- **Avoid / reserved:** _(optional)_

---

## Changelog (append-only)

- **2026-04-10** — Created `SESSION_TODAY.md` with full API and frontend route catalog; smoke table initialized.
- **2026-04-10** — Ran partial smoke: `npm run build`; Flask `GET /api/v1/health` and `GET /mobile` **PASS**; Docker engine unavailable here; Postgres not running so auth/venues **NOT RUN**; documented P0 backlog and signup/409 quirk.
- **2026-04-10** — Docker Compose up: in-container API smoke **PASS** for health, `/mobile`, login (**demo** / **demo123** after hash reset), venues list + create, `…/progress`; added [`scripts/docker_smoke.py`](scripts/docker_smoke.py); documented Windows **:5000** conflict and stale demo user behavior.
