# Demo Data

This folder contains demo/seed data that is **tracked in git** and shared with all developers.

## Purpose

When you pull the latest code, the demo venue data (including walls, assets, etc.) is automatically initialized on first run. This ensures everyone has the same starting point.

## How It Works

1. Demo data is stored in `server/data/demo/`
2. On server startup, `init_demo_data.py` copies demo data to `server/static/uploads/`
3. This only happens if the demo venue doesn't already exist (won't overwrite your changes)

## Demo Venue

The `demo-venue` includes:
- **Walls**: 5 walls with coordinates (North, South, East, West, plus one custom wall)
- **Assets**: 4 tables placed in the venue
- **Materials**: Wood floor, plain ceiling
- **Dimensions**: 20m x 20m x 8m

## Adding More Demo Data

To add more demo venues:
1. Create a layout.json file in `server/data/demo/`
2. Update `init_demo_data.py` to copy it on startup
3. Commit the files to git

## Important Notes

- Demo data is **read-only** in this folder
- Your actual venue data lives in `server/static/uploads/` (gitignored)
- Demo data is only copied if it doesn't exist (won't overwrite your work)

