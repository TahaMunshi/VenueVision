"""
Authentication middleware for protected routes.
Provides decorators: token_required, optional_token, vendor_required, customer_required.
"""

from functools import wraps
from flask import request, jsonify
import logging

from services.auth_service import verify_token

logger = logging.getLogger(__name__)


def token_required(f):
    """Require valid JWT. Injects current_user with user_id, username, role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            try:
                token = auth_header.split(' ')[1]
            except IndexError:
                return jsonify({'error': 'Invalid authorization header format'}), 401

        if not token:
            return jsonify({'error': 'Authentication token is missing'}), 401

        payload = verify_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401

        current_user = {
            'user_id': payload['user_id'],
            'username': payload['username'],
            'role': payload.get('role', 'customer')
        }
        return f(*args, current_user=current_user, **kwargs)
    return decorated


def optional_token(f):
    """If token present and valid, pass user info; otherwise None."""
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
                        'username': payload['username'],
                        'role': payload.get('role', 'customer')
                    }
            except (IndexError, Exception) as e:
                logger.warning(f"Optional token parsing failed: {e}")
        return f(*args, current_user=current_user, **kwargs)
    return decorated


def vendor_required(f):
    """Require valid JWT with role='vendor'."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            try:
                token = auth_header.split(' ')[1]
            except IndexError:
                return jsonify({'error': 'Invalid authorization header format'}), 401

        if not token:
            return jsonify({'error': 'Authentication token is missing'}), 401

        payload = verify_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401

        role = payload.get('role', 'customer')
        if role != 'vendor':
            return jsonify({'error': 'Vendor access required'}), 403

        current_user = {
            'user_id': payload['user_id'],
            'username': payload['username'],
            'role': role
        }
        return f(*args, current_user=current_user, **kwargs)
    return decorated


def customer_required(f):
    """Require valid JWT with role='customer'."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            try:
                token = auth_header.split(' ')[1]
            except IndexError:
                return jsonify({'error': 'Invalid authorization header format'}), 401

        if not token:
            return jsonify({'error': 'Authentication token is missing'}), 401

        payload = verify_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401

        role = payload.get('role', 'customer')
        if role != 'customer':
            return jsonify({'error': 'Customer access required'}), 403

        current_user = {
            'user_id': payload['user_id'],
            'username': payload['username'],
            'role': role
        }
        return f(*args, current_user=current_user, **kwargs)
    return decorated
