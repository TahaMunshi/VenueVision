import psycopg2
import os
from typing import List, Dict, Any
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

