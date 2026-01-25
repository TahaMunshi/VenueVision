"""
Authentication middleware for protected routes.
"""

from functools import wraps
from flask import request, jsonify
import logging

from services.auth_service import verify_token

logger = logging.getLogger(__name__)


def token_required(f):
    """
    Decorator to protect routes that require authentication.
    Extracts and verifies JWT token from Authorization header.
    
    Usage:
        @app.route('/protected')
        @token_required
        def protected_route(current_user):
            # current_user contains user_id and username
            return jsonify({'message': f'Hello {current_user["username"]}'})
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        
        if auth_header:
            try:
                # Expected format: "Bearer <token>"
                token = auth_header.split(' ')[1]
            except IndexError:
                return jsonify({'error': 'Invalid authorization header format'}), 401
        
        if not token:
            return jsonify({'error': 'Authentication token is missing'}), 401
        
        # Verify token
        payload = verify_token(token)
        
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        # Add current user to kwargs
        current_user = {
            'user_id': payload['user_id'],
            'username': payload['username']
        }
        
        return f(*args, current_user=current_user, **kwargs)
    
    return decorated


def optional_token(f):
    """
    Decorator for routes where authentication is optional.
    If token is present and valid, user info is passed; otherwise None.
    
    Usage:
        @app.route('/public-or-protected')
        @optional_token
        def route(current_user):
            if current_user:
                return jsonify({'message': f'Hello {current_user["username"]}'})
            else:
                return jsonify({'message': 'Hello guest'})
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user = None
        
        auth_header = request.headers.get('Authorization')
        
        if auth_header:
            try:
                token = auth_header.split(' ')[1]
                payload = verify_token(token)
                
                if payload:
                    current_user = {
                        'user_id': payload['user_id'],
                        'username': payload['username']
                    }
            except (IndexError, Exception) as e:
                logger.warning(f"Optional token parsing failed: {e}")
        
        return f(*args, current_user=current_user, **kwargs)
    
    return decorated
