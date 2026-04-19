#!/usr/bin/env python3
"""
Copy your local VenueVision Postgres (venues, assets rows, users, etc.) to Render Postgres.

- Source: `venuevision-db` Docker container (docker-compose) or LOCAL_DATABASE_URL + pg_dump on PATH.
- Target: RENDER_DATABASE_URL (Render Dashboard -> Postgres -> External Database URL).

Uses pg_dump -Fc and pg_restore --clean --if-exists --no-owner --no-acl.

Important: This migrates the database only. Files under server/static/uploads and
server/static/user_assets are not uploaded; image/GLB URLs in the DB may 404 on Render
until those files exist there (persistent disk or manual copy).

Usage (PowerShell):

  $env:RENDER_DATABASE_URL = "postgresql://user:pass@host:5432/fyp_db?sslmode=require"
  python scripts/push_local_db_to_render.py --yes

Dump only (no Render credentials):

  python scripts/push_local_db_to_render.py --dump-only
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
DUMP_DIR = REPO_ROOT / "scripts" / ".migration_dump"
DEFAULT_LOCAL = "postgresql://postgres:postgres@localhost:5432/fyp_db"
CONTAINER_NAME = "venuevision-db"
DB_NAME_IN_CONTAINER = "fyp_db"
DUMP_FILENAME = "venuevision_local.dump"


def _mask(s: str) -> str:
    p = urlparse(s)
    if p.password:
        return s.replace(unquote(p.password), "***")
    return s


def _docker_available() -> bool:
    try:
        r = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return r.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _container_running(name: str) -> bool:
    try:
        r = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", name],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return r.returncode == 0 and r.stdout.strip() == "true"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _run(cmd: list[str], env: dict | None = None) -> None:
    display = []
    for c in cmd:
        if c.startswith(("postgresql://", "postgres://")):
            display.append(_mask(c))
        else:
            display.append(c)
    print("+", " ".join(display))
    merged = {**os.environ, **(env or {})}
    r = subprocess.run(cmd, env=merged)
    if r.returncode != 0:
        sys.exit(r.returncode)


def _which(exe: str) -> str | None:
    return shutil.which(exe)


def _load_render_url_from_dotenv() -> None:
    """If RENDER_DATABASE_URL is not set, read it from repo .env (single line KEY=value)."""
    if os.environ.get("RENDER_DATABASE_URL"):
        return
    path = REPO_ROOT / ".env"
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("RENDER_DATABASE_URL="):
            val = line.split("=", 1)[1].strip().strip('"').strip("'")
            if val:
                os.environ["RENDER_DATABASE_URL"] = val
            return


def export_dump(local_url: str, dump_path: Path) -> None:
    DUMP_DIR.mkdir(parents=True, exist_ok=True)
    if dump_path.exists():
        dump_path.unlink()

    in_container = "/tmp/venuevision_migrate.dump"

    if _docker_available() and _container_running(CONTAINER_NAME):
        _run(
            [
                "docker",
                "exec",
                CONTAINER_NAME,
                "pg_dump",
                "-U",
                "postgres",
                "-Fc",
                "-f",
                in_container,
                DB_NAME_IN_CONTAINER,
            ]
        )
        _run(["docker", "cp", f"{CONTAINER_NAME}:{in_container}", str(dump_path)])
        subprocess.run(
            ["docker", "exec", CONTAINER_NAME, "rm", "-f", in_container],
            capture_output=True,
        )
        print(f"[OK] Dump written to {dump_path}")
        return

    pg_dump = _which("pg_dump")
    if not pg_dump:
        print(
            f"[ERROR] No running Postgres container named {CONTAINER_NAME!r} and pg_dump not on PATH.\n"
            "  Start local DB:  docker compose up -d db\n"
            "  Or install PostgreSQL client tools and retry.",
            file=sys.stderr,
        )
        sys.exit(1)

    _run([pg_dump, "-Fc", f"--dbname={local_url}", "-f", str(dump_path)])
    print(f"[OK] Dump written to {dump_path}")


def import_dump(render_url: str, dump_path: Path) -> None:
    if not dump_path.is_file():
        print(f"[ERROR] Dump not found: {dump_path}", file=sys.stderr)
        sys.exit(1)

    env = {**os.environ, "PGSSLMODE": os.environ.get("PGSSLMODE", "require")}

    pg_restore = _which("pg_restore")
    if pg_restore:
        _run(
            [
                pg_restore,
                "--no-owner",
                "--no-acl",
                "--clean",
                "--if-exists",
                "-d",
                render_url,
                str(dump_path),
            ],
            env=env,
        )
        print("[OK] pg_restore completed.")
        return

    if not _docker_available():
        print("[ERROR] pg_restore not on PATH and Docker not available.", file=sys.stderr)
        sys.exit(1)

    parent = str(dump_path.resolve().parent)
    inner = f"/dump/{dump_path.name}"
    _run(
        [
            "docker",
            "run",
            "--rm",
            "-e",
            f"PGSSLMODE={env['PGSSLMODE']}",
            "-v",
            f"{parent}:/dump:ro",
            "postgres:15-alpine",
            "pg_restore",
            "--no-owner",
            "--no-acl",
            "--clean",
            "--if-exists",
            "-d",
            render_url,
            inner,
        ],
        env=env,
    )
    print("[OK] pg_restore via Docker completed.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--local-url",
        default=os.environ.get("LOCAL_DATABASE_URL", DEFAULT_LOCAL),
        help="Source Postgres URL (used only if pg_dump runs on host).",
    )
    ap.add_argument(
        "--render-url",
        default=os.environ.get("RENDER_DATABASE_URL", ""),
        help="Render Postgres URL (overrides RENDER_DATABASE_URL).",
    )
    ap.add_argument(
        "--dump-only",
        action="store_true",
        help="Only write the local dump file; do not connect to Render.",
    )
    ap.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="Skip confirmation before pg_restore --clean on Render.",
    )
    args = ap.parse_args()

    dump_path = DUMP_DIR / DUMP_FILENAME

    if args.dump_only:
        export_dump(args.local_url, dump_path)
        return

    _load_render_url_from_dotenv()
    render_url = (args.render_url or os.environ.get("RENDER_DATABASE_URL", "")).strip()
    if not render_url:
        print(
            "[ERROR] Set RENDER_DATABASE_URL or pass --render-url.\n"
            "  Render Dashboard -> your PostgreSQL -> Connections -> External Database URL\n"
            "  Tip: append ?sslmode=require if connections fail without it.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not args.yes:
        print(
            "This will run pg_restore --clean on:\n"
            f"  {_mask(render_url)}\n"
            "Tables and related objects in that database may be dropped and replaced."
        )
        if input("Type YES to continue: ").strip() != "YES":
            print("Aborted.")
            sys.exit(1)

    export_dump(args.local_url, dump_path)
    import_dump(render_url, dump_path)
    print("\nDone. If the Render web service was running, redeploy or restart it once.")


if __name__ == "__main__":
    main()
