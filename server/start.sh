#!/bin/sh
set -e

echo "Setting up database..."
python server/setup_database.py

echo "Seeding demo data..."
python server/seed_data.py || echo "Seed skipped (data may already exist)"

echo "Starting Flask server..."
python server/app.py
