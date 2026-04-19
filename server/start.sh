#!/bin/sh
set -e

# Optional: persistent disk for uploads + user_assets (Render paid, or any host).
# Mount disk at this path, then set env to the same value, e.g.:
#   VENUEVISION_PERSIST_STATIC=/app/server/static/persist
if [ -n "$VENUEVISION_PERSIST_STATIC" ]; then
  echo "=== Linking static media to persistent dir: $VENUEVISION_PERSIST_STATIC ==="
  mkdir -p "$VENUEVISION_PERSIST_STATIC/uploads" "$VENUEVISION_PERSIST_STATIC/user_assets"
  rm -rf /app/server/static/uploads /app/server/static/user_assets
  ln -sfn "$VENUEVISION_PERSIST_STATIC/uploads" /app/server/static/uploads
  ln -sfn "$VENUEVISION_PERSIST_STATIC/user_assets" /app/server/static/user_assets
fi

echo "=== Initializing database tables and migrations ==="
python server/init_db.py

echo "=== Seeding demo data ==="
python server/seed_data.py || echo "[SKIP] Seed skipped (data may already exist)"

echo "=== Starting Flask server ==="
exec python server/app.py
