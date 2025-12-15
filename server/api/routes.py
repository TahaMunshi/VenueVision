import logging

logging.basicConfig(level=logging.DEBUG)

# Re-export the grouped blueprint so existing imports keep working
from api.endpoints import api_bp  # noqa: E402,F401

__all__ = ["api_bp"]

