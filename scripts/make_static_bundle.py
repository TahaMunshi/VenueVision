#!/usr/bin/env python3
"""
Build a .tar.gz of uploads + user_assets for copying onto Render (or any server).

Why: `pg_restore` only moves Postgres rows. Wall photos, layout JSON, GLBs, and
thumbnails live on disk under server/static/uploads and server/static/user_assets.

After creating the bundle, upload it to Render:

  1) Paid web service: add a Persistent Disk (Render Dashboard -> your Web service ->
     Disks) mounted at:  /app/server/static/persist
     Set env on that service:  VENUEVISION_PERSIST_STATIC=/app/server/static/persist
     (start.sh will symlink uploads + user_assets into that disk.)

  2) From your laptop, serve the folder that contains the .tgz, e.g.:
       cd scripts/.migration_dump
       python -m http.server 8765
     Expose with ngrok:  ngrok http 8765
     Copy the https URL to static_bundle.tgz

  3) Render Dashboard -> Web service -> Shell:

     If you use VENUEVISION_PERSIST_STATIC (disk at /app/server/static/persist):
       cd /app/server/static/persist
       curl -fL "https://YOUR-NGROK/static_bundle.tgz" -o /tmp/static_bundle.tgz
       tar xzf /tmp/static_bundle.tgz

     If you did NOT set that env (ephemeral disk on free tier):
       cd /app/server/static
       curl -fL "https://YOUR-NGROK/static_bundle.tgz" -o /tmp/static_bundle.tgz
       tar xzf /tmp/static_bundle.tgz

  On free tier, files survive until the next deploy/restart (ephemeral). Use a disk
  (paid) so media survives redeploys.

Output: scripts/.migration_dump/static_bundle.tgz
"""

from __future__ import annotations

import os
import sys
import tarfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "scripts" / ".migration_dump"
OUT_FILE = OUT_DIR / "static_bundle.tgz"
UPLOADS = REPO_ROOT / "server" / "static" / "uploads"
USER_ASSETS = REPO_ROOT / "server" / "static" / "user_assets"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT_FILE.exists():
        OUT_FILE.unlink()

    members: list[tuple[Path, str]] = []
    if UPLOADS.is_dir():
        members.append((UPLOADS, "uploads"))
    if USER_ASSETS.is_dir():
        members.append((USER_ASSETS, "user_assets"))

    if not members:
        print("[WARN] Neither uploads nor user_assets exists; writing empty archive.", file=sys.stderr)

    with tarfile.open(OUT_FILE, "w:gz") as tar:
        for src, arcname in members:
            tar.add(src, arcname=arcname)

    size_mb = OUT_FILE.stat().st_size / (1024 * 1024)
    print(f"[OK] Wrote {OUT_FILE} ({size_mb:.2f} MiB)")
    print("Next: see docstring at top of this file for Render Shell + curl steps.")


if __name__ == "__main__":
    main()
