"""
Reviews API: customers leave reviews after completed bookings.
"""

import logging
from flask import Blueprint, jsonify, request
from database import execute_query, execute_insert
from middleware.auth_middleware import customer_required

logger = logging.getLogger(__name__)
reviews_bp = Blueprint('reviews', __name__)


@reviews_bp.route('/reviews', methods=['POST'])
@customer_required
def create_review(current_user):
    """Create a review for a booking the customer completed."""
    data = request.get_json() or {}
    booking_id = data.get('booking_id')
    rating = data.get('rating')
    title = data.get('title', '').strip()
    body = data.get('body', '').strip()

    if not booking_id or not rating:
        return jsonify({'error': 'booking_id and rating required'}), 400
    if rating < 1 or rating > 5:
        return jsonify({'error': 'Rating must be 1-5'}), 400

    try:
        booking = execute_query("""
            SELECT booking_id, venue_id, customer_id, status FROM bookings
            WHERE booking_id=%s AND customer_id=%s
        """, (booking_id, current_user['user_id']), fetch_one=True)

        if not booking:
            return jsonify({'error': 'Booking not found'}), 404
        if booking['status'] != 'confirmed':
            return jsonify({'error': 'Can only review confirmed bookings'}), 400

        existing = execute_query(
            "SELECT review_id FROM reviews WHERE booking_id=%s", (booking_id,), fetch_one=True
        )
        if existing:
            return jsonify({'error': 'Already reviewed'}), 409

        rid = execute_insert("""
            INSERT INTO reviews (venue_id, customer_id, booking_id, rating, title, body)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING review_id
        """, (booking['venue_id'], current_user['user_id'], booking_id, rating, title, body))

        execute_query("""
            UPDATE venues SET
                rating_count = rating_count + 1,
                rating_avg = (rating_avg * rating_count + %s) / (rating_count + 1)
            WHERE venue_id = %s
        """, (rating, booking['venue_id']))

        return jsonify({'status': 'success', 'review_id': rid}), 201
    except Exception as e:
        logger.error(f"Create review error: {e}", exc_info=True)
        return jsonify({'error': 'Review failed'}), 500
