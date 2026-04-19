from flask import Blueprint, jsonify

from utils.public_url import get_public_base_url

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify the API is working."""
    return jsonify({"status": "healthy", "message": "API is running"})


@health_bp.route("/public-url", methods=["GET"])
def public_url():
    """
    Return the public base URL (e.g. ngrok) for share/QR links and Tripo3D.
    Uses PUBLIC_URL / NGROK_URL if set, otherwise auto-detects from ngrok local API.
    """
    url = get_public_base_url()
    return jsonify({"url": url})

