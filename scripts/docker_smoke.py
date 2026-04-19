"""
API smoke tests against the Flask app inside the Docker app container.

Usage (from project root, with compose up):
  docker cp scripts/docker_smoke.py venuevision-app:/app/docker_smoke.py
  docker exec venuevision-app python /app/docker_smoke.py
"""

import json
import sys
import uuid

import requests

BASE = "http://127.0.0.1:5000"


def main() -> int:
    results = []

    r = requests.get(f"{BASE}/api/v1/health", timeout=10)
    ok = r.status_code == 200 and r.json().get("status") == "healthy"
    results.append(["GET /api/v1/health", ok, r.status_code, r.text[:200]])

    r = requests.get(f"{BASE}/mobile", timeout=10)
    ok = r.status_code == 200 and "html" in r.text.lower()
    results.append(["GET /mobile", ok, r.status_code, f"len={len(r.text)}"])

    r = requests.post(
        f"{BASE}/api/v1/login",
        json={"username": "demo", "password": "demo123"},
        timeout=10,
    )
    token = None
    if r.status_code == 200:
        token = r.json().get("token")
    ok = bool(token)
    results.append(["POST /api/v1/login", ok, r.status_code, r.text[:300]])

    if token:
        r = requests.get(
            f"{BASE}/api/v1/venues",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        ok = r.status_code == 200
        results.append(["GET /api/v1/venues", ok, r.status_code, r.text[:400]])
    else:
        results.append(["GET /api/v1/venues", False, None, "skipped (no token)"])

    venue_identifier = None
    if token:
        vid = f"smoke-{uuid.uuid4().hex[:8]}"
        payload = {
            "venue_identifier": vid,
            "venue_name": "Docker smoke venue",
            "width": 40,
            "depth": 32,
            "height": 9,
        }
        r = requests.post(
            f"{BASE}/api/v1/venues",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=30,
        )
        ok = r.status_code in (200, 201)
        if ok:
            venue_identifier = r.json().get("venue", {}).get("venue_identifier")
        results.append(["POST /api/v1/venues", ok, r.status_code, r.text[:400]])
    else:
        results.append(["POST /api/v1/venues", False, None, "skipped (no token)"])

    if token and venue_identifier:
        r = requests.get(
            f"{BASE}/api/v1/venue/{venue_identifier}/progress",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        ok = r.status_code == 200 and r.json().get("total_walls", 0) >= 1
        results.append(
            [
                f"GET /api/v1/venue/{venue_identifier}/progress",
                ok,
                r.status_code,
                r.text[:350],
            ]
        )
    else:
        results.append(
            [
                "GET /api/v1/venue/…/progress",
                False,
                None,
                "skipped (no venue)",
            ]
        )

    print(json.dumps(results, indent=2))
    return 0 if all(x[1] for x in results) else 1


if __name__ == "__main__":
    sys.exit(main())
