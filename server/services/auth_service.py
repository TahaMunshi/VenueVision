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


def generate_token(user_id: int, username: str, role: str = 'customer') -> str:
    payload = {
        'user_id': user_id,
        'username': username,
        'role': role,
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


def register_user(username: str, email: str, password: str, full_name: Optional[str] = None,
                   role: str = 'customer', phone: Optional[str] = None,
                   business_name: Optional[str] = None) -> Optional[Dict]:
    try:
        existing = execute_query(
            "SELECT user_id FROM users WHERE username = %s OR email = %s",
            (username, email),
            fetch=True
        )
        if existing:
            logger.warning(f"Username or email already exists: {username}, {email}")
            return None

        if role not in ('vendor', 'customer'):
            role = 'customer'

        password_hash = hash_password(password)
        user_id = execute_insert(
            """
            INSERT INTO users (username, email, password_hash, full_name, role, phone, business_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING user_id
            """,
            (username, email, password_hash, full_name, role, phone, business_name)
        )

        if user_id:
            token = generate_token(user_id, username, role)
            logger.info(f"User registered: {username} (ID: {user_id}, role: {role})")
            return {
                'user_id': user_id,
                'username': username,
                'email': email,
                'full_name': full_name,
                'role': role,
                'token': token
            }
        return None
    except Exception as e:
        logger.error(f"Error registering user: {e}")
        return None


def login_user(username: str, password: str) -> Optional[Dict]:
    try:
        user = execute_query(
            """
            SELECT user_id, username, email, password_hash, full_name,
                   COALESCE(role, 'customer') as role
            FROM users
            WHERE username = %s OR email = %s
            """,
            (username, username),
            fetch_one=True
        )
        if not user:
            logger.warning(f"User not found: {username}")
            return None

        if not verify_password(password, user['password_hash']):
            logger.warning(f"Invalid password for user: {username}")
            return None

        token = generate_token(user['user_id'], user['username'], user['role'])
        logger.info(f"User logged in: {user['username']} (ID: {user['user_id']}, role: {user['role']})")

        return {
            'user_id': user['user_id'],
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'role': user['role'],
            'token': token
        }
    except Exception as e:
        logger.error(f"Error logging in user: {e}")
        return None


def get_user_by_id(user_id: int) -> Optional[Dict]:
    try:
        user = execute_query(
            """
            SELECT user_id, username, email, full_name,
                   COALESCE(role, 'customer') as role,
                   phone, profile_image, business_name, business_description,
                   address, city, country, created_at
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
