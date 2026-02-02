"""
Authentication service for user management.
Handles user registration, login, password hashing, and JWT token generation.
"""

import bcrypt
import jwt
import os
from datetime import datetime, timedelta
from typing import Optional, Dict
import logging

from database import execute_query, execute_insert

logger = logging.getLogger(__name__)

# JWT Secret Key (in production, use environment variable)
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt.
    
    Args:
        password: Plain text password
        
    Returns:
        Hashed password string
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify a password against its hash.
    
    Args:
        password: Plain text password
        password_hash: Stored password hash
        
    Returns:
        True if password matches, False otherwise
    """
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


def generate_token(user_id: int, username: str) -> str:
    """
    Generate a JWT token for a user.
    
    Args:
        user_id: User's database ID
        username: User's username
        
    Returns:
        JWT token string
    """
    payload = {
        'user_id': user_id,
        'username': username,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token


def verify_token(token: str) -> Optional[Dict]:
    """
    Verify and decode a JWT token.
    
    Args:
        token: JWT token string
        
    Returns:
        Decoded token payload dict or None if invalid
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return None


def register_user(username: str, email: str, password: str, full_name: Optional[str] = None) -> Optional[Dict]:
    """
    Register a new user.
    
    Args:
        username: Unique username
        email: Unique email address
        password: Plain text password (will be hashed)
        full_name: Optional full name
        
    Returns:
        User dict with user_id, username, email, token or None if failed
    """
    try:
        # Check if username or email already exists
        existing = execute_query(
            "SELECT user_id FROM users WHERE username = %s OR email = %s",
            (username, email),
            fetch=True
        )
        
        if existing:
            logger.warning(f"Username or email already exists: {username}, {email}")
            return None
        
        # Hash password
        password_hash = hash_password(password)
        
        # Insert user
        user_id = execute_insert(
            """
            INSERT INTO users (username, email, password_hash, full_name)
            VALUES (%s, %s, %s, %s)
            RETURNING user_id
            """,
            (username, email, password_hash, full_name)
        )
        
        if user_id:
            # Generate token
            token = generate_token(user_id, username)
            logger.info(f"User registered successfully: {username} (ID: {user_id})")
            return {
                'user_id': user_id,
                'username': username,
                'email': email,
                'full_name': full_name,
                'token': token
            }
        
        return None
    except Exception as e:
        logger.error(f"Error registering user: {e}")
        return None


def login_user(username: str, password: str) -> Optional[Dict]:
    """
    Authenticate a user and generate token.
    
    Args:
        username: Username or email
        password: Plain text password
        
    Returns:
        User dict with token or None if authentication failed
    """
    try:
        # Find user by username or email
        user = execute_query(
            """
            SELECT user_id, username, email, password_hash, full_name
            FROM users
            WHERE username = %s OR email = %s
            """,
            (username, username),
            fetch_one=True
        )
        
        if not user:
            logger.warning(f"User not found: {username}")
            return None
        
        # Verify password
        if not verify_password(password, user['password_hash']):
            logger.warning(f"Invalid password for user: {username}")
            return None
        
        # Generate token
        token = generate_token(user['user_id'], user['username'])
        logger.info(f"User logged in successfully: {user['username']} (ID: {user['user_id']})")
        
        return {
            'user_id': user['user_id'],
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'token': token
        }
    except Exception as e:
        logger.error(f"Error logging in user: {e}")
        return None


def get_user_by_id(user_id: int) -> Optional[Dict]:
    """
    Get user information by user ID.
    
    Args:
        user_id: User's database ID
        
    Returns:
        User dict or None
    """
    try:
        user = execute_query(
            """
            SELECT user_id, username, email, full_name, created_at
            FROM users
            WHERE user_id = %s
            """,
            (user_id,),
            fetch_one=True
        )
        return user
    except Exception as e:
        logger.error(f"Error fetching user: {e}")
        return None
