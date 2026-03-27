"""
Resolve the public base URL for this server (e.g. ngrok).
Used for mobile share links and for Tripo3D image URLs.
"""
import os
try:
    import requests
except ImportError:
    requests = None

# Fallback when env/file/ngrok API are not set. Update if your ngrok URL changes.
DEFAULT_PUBLIC_URL = "https://osteitic-tucker-springily.ngrok-free.dev"

# Project root (parent of server/). In Docker: /app. Locally: VenueVision/.
_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_ROOT = os.path.dirname(_SERVER_DIR)
_NGROK_URL_FILE = os.path.join(_PROJECT_ROOT, ".ngrok", "public_url")


def get_public_base_url() -> str:
    """
    Return the public base URL so external services (and share links) can reach this app.
    - Uses PUBLIC_URL or NGROK_URL if set.
    - Else tries ngrok local API (when app and ngrok on same host).
    - Else reads .ngrok/public_url (written by start-ngrok when app runs in Docker).
    """
    url = (os.environ.get("PUBLIC_URL") or os.environ.get("NGROK_URL") or "").strip()
    if url:
        return url.rstrip("/")
    # File written by start-ngrok.bat / start-ngrok.sh when app runs in Docker
    try:
        if os.path.isfile(_NGROK_URL_FILE):
            with open(_NGROK_URL_FILE, "r", encoding="utf-8") as f:
                u = (f.read() or "").strip()
            if u.startswith("http"):
                return u.rstrip("/")
    except Exception:
        pass
    if requests is None:
        return ""
    # Ngrok local API (works when app runs on host, not from inside Docker)
    for host in ("127.0.0.1", "host.docker.internal"):
        try:
            r = requests.get(f"http://{host}:4040/api/tunnels", timeout=2)
            if r.status_code == 200:
                data = r.json()
                tunnels = data.get("tunnels") or []
                for t in tunnels:
                    u = (t.get("public_url") or "").strip()
                    if u.startswith("https://"):
                        return u.rstrip("/")
                if tunnels:
                    u = (tunnels[0].get("public_url") or "").strip()
                    if u:
                        return u.rstrip("/")
        except Exception:
            continue
    return DEFAULT_PUBLIC_URL.rstrip("/") if DEFAULT_PUBLIC_URL else ""
