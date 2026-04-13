"""
Booking API: create, list, update, cancel bookings.
"""

import logging
from datetime import datetime
from flask import Blueprint, jsonify, request
from database import execute_query, execute_insert
from middleware.auth_middleware import token_required, vendor_required, customer_required

logger = logging.getLogger(__name__)
bookings_bp = Blueprint('bookings', __name__)


@bookings_bp.route('/bookings', methods=['POST'])
@customer_required
def create_booking(current_user):
    """Customer creates a booking."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Missing body'}), 400

    venue_id = data.get('venue_id')
    event_date = data.get('event_date')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    package_id = data.get('package_id')
    preset_id = data.get('preset_id')
    customer_notes = data.get('notes', '')

    if not all([venue_id, event_date, start_time, end_time]):
        return jsonify({'error': 'venue_id, event_date, start_time, end_time are required'}), 400

    try:
        venue = execute_query(
            "SELECT venue_id, user_id FROM venues WHERE venue_id = %s AND is_published = TRUE",
            (venue_id,), fetch_one=True
        )
        if not venue:
            return jsonify({'error': 'Venue not found or not published'}), 404

        vendor_id = venue['user_id']

        st = datetime.strptime(start_time, '%H:%M').time()
        et = datetime.strptime(end_time, '%H:%M').time()
        total_hours = round((datetime.combine(datetime.today(), et) -
                             datetime.combine(datetime.today(), st)).seconds / 3600, 2)
        if total_hours <= 0:
            return jsonify({'error': 'end_time must be after start_time'}), 400

        conflict = execute_query("""
            SELECT booking_id FROM bookings
            WHERE venue_id = %s AND event_date = %s AND status NOT IN ('cancelled', 'rejected')
              AND (start_time < %s AND end_time > %s)
        """, (venue_id, event_date, end_time, start_time), fetch_one=True)
        if conflict:
            return jsonify({'error': 'Time slot conflicts with existing booking'}), 409

        total_price = 0
        if package_id:
            pkg = execute_query(
                "SELECT flat_price FROM venue_packages WHERE package_id=%s AND venue_id=%s AND is_active",
                (package_id, venue_id), fetch_one=True
            )
            if pkg:
                total_price = float(pkg['flat_price'])
        if not total_price:
            pricing = execute_query("""
                SELECT price_per_hour FROM venue_pricing
                WHERE venue_id = %s AND is_active AND min_hours <= %s
                ORDER BY min_hours DESC LIMIT 1
            """, (venue_id, total_hours), fetch_one=True)
            if pricing:
                total_price = round(float(pricing['price_per_hour']) * total_hours, 2)

        booking_id = execute_insert("""
            INSERT INTO bookings (venue_id, customer_id, vendor_id, preset_id, package_id,
                                  event_date, start_time, end_time, total_hours, total_price,
                                  status, customer_notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending',%s) RETURNING booking_id
        """, (venue_id, current_user['user_id'], vendor_id, preset_id, package_id,
              event_date, start_time, end_time, total_hours, total_price, customer_notes))

        return jsonify({'status': 'success', 'booking_id': booking_id, 'total_price': total_price}), 201
    except Exception as e:
        logger.error(f"Create booking error: {e}", exc_info=True)
        return jsonify({'error': 'Booking failed'}), 500


@bookings_bp.route('/bookings', methods=['GET'])
@token_required
def list_bookings(current_user):
    """List bookings for vendor or customer depending on role."""
    role = current_user['role']
    status_filter = request.args.get('status', '')
    page = max(1, request.args.get('page', 1, type=int))
    limit = min(50, max(1, request.args.get('limit', 20, type=int)))
    offset = (page - 1) * limit

    conditions = []
    params = []

    if role == 'vendor':
        conditions.append("b.vendor_id = %s")
    else:
        conditions.append("b.customer_id = %s")
    params.append(current_user['user_id'])

    if status_filter:
        conditions.append("b.status = %s")
        params.append(status_filter)

    where = " AND ".join(conditions)

    try:
        rows = execute_query(f"""
            SELECT b.*, v.venue_name, v.cover_image, v.venue_identifier,
                   cu.username as customer_name, cu.full_name as customer_full_name,
                   COALESCE(
                       NULLIF(TRIM(vu.full_name), ''),
                       NULLIF(TRIM(vu.username), ''),
                       NULLIF(TRIM(vu.business_name), ''),
                       'Host'
                   ) as vendor_name
            FROM bookings b
            JOIN venues v ON v.venue_id = b.venue_id
            JOIN users cu ON cu.user_id = b.customer_id
            JOIN users vu ON vu.user_id = b.vendor_id
            WHERE {where}
            ORDER BY b.event_date DESC, b.start_time DESC
            LIMIT %s OFFSET %s
        """, params + [limit, offset], fetch=True) or []

        bookings = []
        for r in rows:
            bookings.append({
                'booking_id': r['booking_id'],
                'venue_id': r['venue_id'],
                'venue_name': r['venue_name'],
                'venue_identifier': r['venue_identifier'],
                'cover_image': r['cover_image'],
                'customer_name': r['customer_full_name'] or r['customer_name'],
                'vendor_name': r['vendor_name'],
                'event_date': r['event_date'].isoformat() if r['event_date'] else None,
                'start_time': str(r['start_time']) if r['start_time'] else None,
                'end_time': str(r['end_time']) if r['end_time'] else None,
                'total_hours': float(r['total_hours']),
                'total_price': float(r['total_price']),
                'status': r['status'],
                'customer_notes': r['customer_notes'],
                'vendor_notes': r['vendor_notes'],
                'created_at': r['created_at'].isoformat() if r['created_at'] else None,
            })

        return jsonify({'status': 'success', 'bookings': bookings})
    except Exception as e:
        logger.error(f"List bookings error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load bookings'}), 500


@bookings_bp.route('/bookings/<int:booking_id>', methods=['PATCH'])
@token_required
def update_booking(current_user, booking_id):
    """Update booking status (vendor: confirm/reject, customer: cancel)."""
    data = request.get_json() or {}
    new_status = data.get('status', '')

    try:
        booking = execute_query(
            "SELECT * FROM bookings WHERE booking_id = %s", (booking_id,), fetch_one=True
        )
        if not booking:
            return jsonify({'error': 'Booking not found'}), 404

        uid = current_user['user_id']
        role = current_user['role']

        if role == 'vendor' and booking['vendor_id'] != uid:
            return jsonify({'error': 'Not your booking'}), 403
        if role == 'customer' and booking['customer_id'] != uid:
            return jsonify({'error': 'Not your booking'}), 403

        allowed = {
            'vendor': {'confirmed', 'rejected'},
            'customer': {'cancelled'}
        }
        if new_status not in allowed.get(role, set()):
            return jsonify({'error': f'Invalid status transition for {role}'}), 400

        execute_query(
            "UPDATE bookings SET status=%s, vendor_notes=COALESCE(%s, vendor_notes) WHERE booking_id=%s",
            (new_status, data.get('vendor_notes'), booking_id)
        )
        return jsonify({'status': 'success', 'booking_status': new_status})
    except Exception as e:
        logger.error(f"Update booking error: {e}", exc_info=True)
        return jsonify({'error': 'Update failed'}), 500


@bookings_bp.route('/bookings/<int:booking_id>/layout', methods=['PUT'])
@customer_required
def save_booking_layout(current_user, booking_id):
    """Customer saves custom asset layout for their booking."""
    data = request.get_json()
    if not data or 'layout' not in data:
        return jsonify({'error': 'layout JSON required'}), 400

    try:
        booking = execute_query(
            "SELECT * FROM bookings WHERE booking_id=%s AND customer_id=%s",
            (booking_id, current_user['user_id']), fetch_one=True
        )
        if not booking:
            return jsonify({'error': 'Booking not found'}), 404
        if booking['status'] not in ('confirmed', 'pending'):
            return jsonify({'error': 'Cannot edit layout for this booking status'}), 400

        import json as _json
        layout_str = _json.dumps(data['layout']) if not isinstance(data['layout'], str) else data['layout']
        execute_query(
            "UPDATE bookings SET custom_layout=%s WHERE booking_id=%s",
            (layout_str, booking_id)
        )
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Save booking layout error: {e}", exc_info=True)
        return jsonify({'error': 'Save failed'}), 500
