import psycopg2
import psycopg2.extras
import os
from typing import List, Dict, Any, Optional
import logging

# Set up logging
logger = logging.getLogger(__name__)

# Database connection string
# Try to get from environment variable first, otherwise use default
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:Tennis123@localhost:5432/fyp_db')

def get_db_connection():
    """
    Establishes and returns a PostgreSQL database connection.
    
    Returns:
        psycopg2.connection: Database connection object
    
    Raises:
        psycopg2.Error: If connection fails
    """
    try:
        logger.info(f"Attempting to connect to database: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'hidden'}")
        conn = psycopg2.connect(DATABASE_URL)
        logger.info("Database connection successful")
        return conn
    except psycopg2.OperationalError as e:
        logger.error(f"Database connection failed: {e}")
        logger.error("Please check:")
        logger.error("1. PostgreSQL is running")
        logger.error("2. Database credentials are correct")
        logger.error("3. Database 'fyp_db' exists")
        raise
    except psycopg2.Error as e:
        logger.error(f"Database error: {e}")
        raise


def execute_query(query: str, params: tuple = None, fetch: bool = False, fetch_one: bool = False) -> Optional[List[Dict]]:
    """
    Execute a database query with optional parameters.
    
    Args:
        query: SQL query string
        params: Query parameters tuple
        fetch: Whether to fetch results
        fetch_one: Whether to fetch only one result
        
    Returns:
        List of dicts if fetch=True, single dict if fetch_one=True, None otherwise
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(query, params)
        
        if fetch_one:
            result = cur.fetchone()
            conn.commit()
            return dict(result) if result else None
        elif fetch:
            results = cur.fetchall()
            conn.commit()
            return [dict(row) for row in results]
        else:
            conn.commit()
            return None
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database query error: {e}")
        raise
    finally:
        if conn:
            conn.close()


def execute_insert(query: str, params: tuple) -> Optional[int]:
    """
    Execute an INSERT query and return the inserted ID.
    
    Args:
        query: SQL INSERT query with RETURNING clause
        params: Query parameters tuple
        
    Returns:
        Inserted ID or None
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(query, params)
        inserted_id = cur.fetchone()[0] if cur.rowcount > 0 else None
        conn.commit()
        return inserted_id
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database insert error: {e}")
        raise
    finally:
        if conn:
            conn.close()

