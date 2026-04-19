#!/usr/bin/env python3
"""
Initialize database tables and run migrations.
Works on both local PostgreSQL and managed services like Render/Supabase
where the database already exists and DATABASE_URL is provided.
"""

import psycopg2
import os
import sys

DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/fyp_db')


def run():
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = False
        cur = conn.cursor()
    except Exception as e:
        print(f"[ERROR] Cannot connect to database: {e}")
        sys.exit(1)

    # 1. Run schema.sql (all CREATE TABLE IF NOT EXISTS — safe to re-run)
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    if os.path.exists(schema_path):
        try:
            with open(schema_path, 'r') as f:
                cur.execute(f.read())
            conn.commit()
            print("[OK] schema.sql applied")
        except psycopg2.Error as e:
            conn.rollback()
            print(f"[WARN] schema.sql: {e}")

    # 2. Run migrations in order
    migrations_dir = os.path.join(os.path.dirname(__file__), 'migrations')
    if os.path.isdir(migrations_dir):
        for fname in sorted(os.listdir(migrations_dir)):
            if fname.endswith('.sql'):
                path = os.path.join(migrations_dir, fname)
                try:
                    with open(path, 'r') as f:
                        cur.execute(f.read())
                    conn.commit()
                    print(f"[OK] {fname}")
                except psycopg2.Error as e:
                    conn.rollback()
                    print(f"[SKIP] {fname}: {e}")

    cur.close()
    conn.close()
    print("[OK] Database initialization complete")


if __name__ == '__main__':
    run()
