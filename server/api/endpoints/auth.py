"""
Authentication endpoints: signup, login, user info.
"""

from flask import Blueprint, request, jsonify
import logging

from services.auth_service import register_user, login_user, get_user_by_id
from middleware.auth_middleware import token_required

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/signup', methods=['POST'])
def signup():
    """
    Register a new user.
    
    Expected JSON body:
        {
            "username": "john_doe",
            "email": "john@example.com",
            "password": "securepassword",
            "full_name": "John Doe" (optional)
        }
    
    Returns:
        201: User created with token
        400: Invalid input
        409: Username or email already exists
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Missing request body'}), 400
        
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        full_name = data.get('full_name', '').strip() or None
        
        # Validation
        if not username or len(username) < 3:
            return jsonify({'error': 'Username must be at least 3 characters'}), 400
        
        if not email or '@' not in email:
            return jsonify({'error': 'Valid email is required'}), 400
        
        if not password or len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        # Register user
        user = register_user(username, email, password, full_name)
        
        if not user:
            return jsonify({'error': 'Username or email already exists'}), 409
        
        logger.info(f"New user registered: {username}")
        return jsonify({
            'status': 'success',
            'message': 'User registered successfully',
            'user': {
                'user_id': user['user_id'],
                'username': user['username'],
                'email': user['email'],
                'full_name': user['full_name']
            },
            'token': user['token']
        }), 201
        
    except Exception as e:
        logger.error(f"Signup error: {e}", exc_info=True)
        return jsonify({'error': 'Registration failed'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Authenticate a user and return token.
    
    Expected JSON body:
        {
            "username": "john_doe",  (or email)
            "password": "securepassword"
        }
    
    Returns:
        200: Success with token
        400: Invalid input
        401: Invalid credentials
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Missing request body'}), 400
        
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        # Authenticate user
        user = login_user(username, password)
        
        if not user:
            return jsonify({'error': 'Invalid username or password'}), 401
        
        logger.info(f"User logged in: {username}")
        return jsonify({
            'status': 'success',
            'message': 'Login successful',
            'user': {
                'user_id': user['user_id'],
                'username': user['username'],
                'email': user['email'],
                'full_name': user['full_name']
            },
            'token': user['token']
        }), 200
        
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        return jsonify({'error': 'Login failed'}), 500


@auth_bp.route('/me', methods=['GET'])
@token_required
def get_current_user(current_user):
    """
    Get current authenticated user's information.
    Requires valid JWT token in Authorization header.
    
    Returns:
        200: User information
        401: Invalid or missing token
    """
    try:
        user = get_user_by_id(current_user['user_id'])
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'status': 'success',
            'user': {
                'user_id': user['user_id'],
                'username': user['username'],
                'email': user['email'],
                'full_name': user['full_name'],
                'created_at': user['created_at'].isoformat() if user['created_at'] else None
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Get user error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch user information'}), 500


@auth_bp.route('/verify', methods=['GET'])
@token_required
def verify_token_endpoint(current_user):
    """
    Verify if a token is valid.
    
    Returns:
        200: Token is valid
        401: Invalid or expired token
    """
    return jsonify({
        'status': 'success',
        'message': 'Token is valid',
        'user_id': current_user['user_id'],
        'username': current_user['username']
    }), 200
