#!/bin/sh

echo "=== Initializing database tables and migrations ==="
python server/init_db.py

echo "=== Seeding demo data ==="
python server/seed_data.py || echo "[SKIP] Seed skipped (data may already exist)"

echo "=== Starting Flask server ==="
exec python server/app.py
