"""
Initialize demo data on first run.
This ensures all developers have the same demo venue data.
"""
import os
import shutil
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Paths
DEMO_DATA_DIR = Path(__file__).parent.parent / "data" / "demo"
UPLOAD_ROOT = Path(__file__).parent.parent / "static" / "uploads"
DEMO_VENUE_ID = "demo-venue"


def init_demo_venue():
    """Copy demo venue data to uploads directory if it doesn't exist."""
    try:
        demo_layout_path = DEMO_DATA_DIR / "demo-venue-layout.json"
        target_venue_dir = UPLOAD_ROOT / DEMO_VENUE_ID
        target_layout_path = target_venue_dir / "layout.json"

        # Only initialize if demo data exists and target doesn't
        if not demo_layout_path.exists():
            logger.warning(f"Demo data not found at {demo_layout_path}")
            return

        if target_layout_path.exists():
            logger.debug(f"Demo venue already exists at {target_layout_path}")
            return

        # Create venue directory
        target_venue_dir.mkdir(parents=True, exist_ok=True)

        # Copy layout.json
        shutil.copy2(demo_layout_path, target_layout_path)
        logger.info(f"Initialized demo venue at {target_venue_dir}")

        # Optionally, you could also copy wall images here if needed
        # For now, we just ensure the layout.json exists

    except Exception as e:
        logger.error(f"Error initializing demo venue: {e}", exc_info=True)


if __name__ == "__main__":
    # Run directly for testing
    logging.basicConfig(level=logging.INFO)
    init_demo_venue()

