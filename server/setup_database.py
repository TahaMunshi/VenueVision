#!/usr/bin/env python3
"""
Database setup script for FYP Event Space Visualizer
This script will:
1. Create the database if it doesn't exist
2. Create tables from schema.sql (if defined)
3. Set up database connection

Usage:
    python setup_database.py
    
Or with custom credentials:
    DATABASE_URL="postgresql://user:password@localhost:5432/fyp_db" python setup_database.py
"""

import psycopg2
import os
import sys
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Default database connection (without database name for initial connection)
DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/postgres'
DATABASE_NAME = 'fyp_db'

def get_connection_string():
    """Get database connection string from environment or use default"""
    db_url = os.getenv('DATABASE_URL', DEFAULT_DB_URL)
    
    # Extract components from URL
    if '@' in db_url:
        # Format: postgresql://user:password@host:port/dbname
        parts = db_url.split('@')
        if len(parts) == 2:
            auth_part = parts[0].replace('postgresql://', '')
            host_part = parts[1]
            
            # Split auth
            if ':' in auth_part:
                user, password = auth_part.split(':', 1)
            else:
                user = auth_part
                password = ''
            
            # Split host
            if '/' in host_part:
                host_port, _ = host_part.split('/', 1)
            else:
                host_port = host_part
            
            if ':' in host_port:
                host, port = host_port.split(':')
            else:
                host = host_port
                port = '5432'
            
            # Return connection to postgres database for creating fyp_db
            return {
                'user': user,
                'password': password,
                'host': host,
                'port': port,
                'database': 'postgres'  # Connect to default postgres DB first
            }
    
    # Fallback to default
    return {
        'user': 'postgres',
        'password': 'postgres',
        'host': 'localhost',
        'port': '5432',
        'database': 'postgres'
    }

def create_database(conn_params):
    """Create the database if it doesn't exist"""
    try:
        # Connect to postgres database to create new database
        conn = psycopg2.connect(**conn_params)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (DATABASE_NAME,)
        )
        exists = cursor.fetchone()
        
        if not exists:
            print(f"Creating database '{DATABASE_NAME}'...")
            cursor.execute(f'CREATE DATABASE {DATABASE_NAME}')
            print(f"[OK] Database '{DATABASE_NAME}' created successfully!")
        else:
            print(f"[OK] Database '{DATABASE_NAME}' already exists.")
        
        cursor.close()
        conn.close()
        return True
        
    except psycopg2.Error as e:
        print(f"[ERROR] Error creating database: {e}")
        print("\nTroubleshooting:")
        print("1. Make sure PostgreSQL is running")
        print("2. Check your database credentials")
        print("3. Make sure the user has permission to create databases")
        return False

def create_tables(conn_params):
    """Create database tables from schema.sql"""
    # Update connection params to use fyp_db
    conn_params['database'] = DATABASE_NAME
    
    try:
        conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor()
        
        print("Creating database tables...")
        
        # Read and execute schema.sql
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        if os.path.exists(schema_path):
            with open(schema_path, 'r') as f:
                schema_sql = f.read()
            # Only execute if there are actual SQL statements (not just comments)
            if schema_sql.strip() and not schema_sql.strip().startswith('--'):
                cursor.execute(schema_sql)
                conn.commit()
                print("[OK] Database tables created successfully!")
            else:
                print("[INFO] No tables defined in schema.sql (file-based storage mode)")
        else:
            print("[INFO] schema.sql not found, skipping table creation")
        
        cursor.close()
        conn.close()
        return True
        
    except psycopg2.Error as e:
        print(f"[ERROR] Error creating tables: {e}")
        return False

def insert_sample_data(conn_params):
    """Insert sample data into database tables (if any)"""
    conn_params['database'] = DATABASE_NAME
    
    try:
        conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor()
        
        # Check if assets table exists (for backward compatibility)
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'assets'
            )
        """)
        table_exists = cursor.fetchone()[0]
        
        if not table_exists:
            print("[INFO] No sample data to insert (using file-based storage)")
        else:
            print("[INFO] Sample data insertion skipped (3D asset features removed)")
        
        cursor.close()
        conn.close()
        return True
        
    except psycopg2.Error as e:
        print(f"[WARNING] Could not check for sample data: {e}")
        return True  # Non-critical, return True

def update_database_url_file(conn_params):
    """Update database.py with the correct connection string"""
    db_file = os.path.join(os.path.dirname(__file__), 'database.py')
    
    try:
        with open(db_file, 'r') as f:
            content = f.read()
        
        # Create the new database URL
        new_url = f"postgresql://{conn_params['user']}:{conn_params['password']}@{conn_params['host']}:{conn_params['port']}/{DATABASE_NAME}"
        
        # Update the DATABASE_URL line
        import re
        pattern = r"DATABASE_URL = os\.getenv\('DATABASE_URL', '[^']+'\)"
        replacement = f"DATABASE_URL = os.getenv('DATABASE_URL', '{new_url}')"
        
        new_content = re.sub(pattern, replacement, content)
        
        if new_content != content:
            with open(db_file, 'w') as f:
                f.write(new_content)
            print(f"[OK] Updated database.py with connection string")
        else:
            print("[INFO] database.py already has the correct connection string")
            
    except Exception as e:
        print(f"[WARNING] Could not update database.py: {e}")
        print(f"   Please manually update DATABASE_URL in server/database.py to:")
        print(f"   postgresql://{conn_params['user']}:{conn_params['password']}@{conn_params['host']}:{conn_params['port']}/{DATABASE_NAME}")

def main():
    print("=" * 60)
    print("FYP Event Space Visualizer - Database Setup")
    print("=" * 60)
    print()
    
    # Get connection parameters
    conn_params = get_connection_string()
    
    print("Database Configuration:")
    print(f"  Host: {conn_params['host']}")
    print(f"  Port: {conn_params['port']}")
    print(f"  User: {conn_params['user']}")
    print(f"  Database: {DATABASE_NAME}")
    print()
    
    # Step 1: Create database
    if not create_database(conn_params):
        print("\n[ERROR] Database setup failed!")
        print("\nPlease make sure PostgreSQL is installed and running.")
        print("You can download it from: https://www.postgresql.org/download/")
        sys.exit(1)
    
    # Step 2: Create tables
    if not create_tables(conn_params):
        print("\n[ERROR] Table creation failed!")
        sys.exit(1)
    
    # Step 3: Insert sample data
    if not insert_sample_data(conn_params):
        print("\n[WARNING] Sample data insertion failed (non-critical)")
    
    # Step 4: Update database.py
    update_database_url_file(conn_params)
    
    print()
    print("=" * 60)
    print("[SUCCESS] Database setup completed successfully!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Start your Flask server: python server/app.py")
    print("2. Test the API: http://localhost:5000/api/v1/health")
    print("3. Access mobile interface: http://localhost:5000/mobile")

if __name__ == '__main__':
    main()

