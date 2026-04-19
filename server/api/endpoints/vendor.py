"""
Vendor-only API: manage venues, pricing, packages, presets, reviews, publishing.
"""

import glob
import json
import logging
import os

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from database import execute_query, execute_insert
from middleware.auth_middleware import vendor_required
from utils.file_manager import UPLOAD_ROOT

logger = logging.getLogger(__name__)
vendor_bp = Blueprint('vendor', __name__)

MAX_VENUE_COVER_BYTES = 8 * 1024 * 1024
_VENUE_COVER_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}


def _remove_existing_venue_cover_files(venue_id: int) -> None:
    covers_dir = os.path.join(UPLOAD_ROOT, 'venue_covers')
    for path in glob.glob(os.path.join(covers_dir, f'venue_{venue_id}_cover.*')):
        try:
            os.remove(path)
        except OSError:
            pass


# --------------- Venue CRUD (vendor-scoped) ---------------

@vendor_bp.route('/vendor/venues', methods=['GET'])
@vendor_required
def list_vendor_venues(current_user):
    """List all venues owned by this vendor."""
    rows = execute_query("""
        SELECT v.venue_id, v.venue_identifier, v.venue_name, v.description,
               v.city, v.category, v.capacity, v.width, v.height, v.depth,
               v.cover_image, v.is_published, v.status,
               v.rating_avg, v.rating_count, v.created_at,
               (SELECT MIN(vp.price_per_hour) FROM venue_pricing vp
                WHERE vp.venue_id = v.venue_id AND vp.is_active) as min_price,
               (SELECT COUNT(*) FROM bookings bk
                WHERE bk.venue_id = v.venue_id AND bk.status = 'confirmed') as total_bookings
        FROM venues v WHERE v.user_id = %s ORDER BY v.updated_at DESC
    """, (current_user['user_id'],), fetch=True) or []

    venues = []
    for r in rows:
        venues.append({
            'venue_id': r['venue_id'],
            'venue_identifier': r['venue_identifier'],
            'name': r['venue_name'],
            'description': r['description'],
            'city': r['city'],
            'category': r['category'],
            'capacity': r['capacity'],
            'dimensions': {'width': r['width'], 'height': r['height'], 'depth': r['depth']},
            'cover_image': r['cover_image'],
            'is_published': r['is_published'],
            'status': r['status'],
            'rating': r['rating_avg'],
            'review_count': r['rating_count'],
            'min_price': float(r['min_price']) if r['min_price'] else None,
            'total_bookings': r['total_bookings'],
            'created_at': r['created_at'].isoformat() if r['created_at'] else None,
        })

    return jsonify({'status': 'success', 'venues': venues})


@vendor_bp.route('/vendor/venues', methods=['POST'])
@vendor_required
def create_vendor_venue(current_user):
    """Create a new venue."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Missing body'}), 400

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Venue name required'}), 400

    identifier = data.get('identifier', '').strip() or name.lower().replace(' ', '-')[:80]
    try:
        width = float(data.get('width', 40))
        height = float(data.get('height', 9))
        depth = float(data.get('depth', 40))
    except (TypeError, ValueError):
        return jsonify({'error': 'width, height, and depth must be numbers'}), 400

    try:
        venue_id = execute_insert("""
            INSERT INTO venues (user_id, venue_identifier, venue_name, description,
                address, city, country, category, capacity,
                width, height, depth, is_published, status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,FALSE,'draft')
            RETURNING venue_id
        """, (
            current_user['user_id'], identifier, name,
            data.get('description', ''), data.get('address', ''),
            data.get('city', ''), data.get('country', ''),
            data.get('category', 'event_hall'), data.get('capacity'),
            width, height, depth
        ))

        default_walls = [
            {'id': 'wall_north', 'name': 'North Wall', 'coordinates': [25, 10, 100, 10], 'length': width, 'height': height},
            {'id': 'wall_east', 'name': 'East Wall', 'coordinates': [100, 10, 100, 100], 'length': depth, 'height': height},
            {'id': 'wall_south', 'name': 'South Wall', 'coordinates': [0, 100, 100, 100], 'length': width, 'height': height},
            {'id': 'wall_west', 'name': 'West Wall', 'coordinates': [0, 10, 0, 100], 'length': depth, 'height': height},
        ]
        for wall in default_walls:
            try:
                execute_insert(
                    """
                    INSERT INTO venue_walls (
                        venue_id, wall_identifier, wall_name, wall_type,
                        length, height, coord_x1, coord_y1, coord_x2, coord_y2
                    )
                    VALUES (%s,%s,%s,'straight',%s,%s,%s,%s,%s,%s)
                    RETURNING wall_id
                    """,
                    (venue_id, wall['id'], wall['name'], wall['length'], wall['height'],
                     wall['coordinates'][0], wall['coordinates'][1],
                     wall['coordinates'][2], wall['coordinates'][3]),
                )
            except Exception as werr:
                logger.warning("Could not create default wall %s: %s", wall['id'], werr)

        return jsonify({'status': 'success', 'venue_id': venue_id, 'venue_identifier': identifier}), 201
    except Exception as e:
        logger.error(f"Create venue error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to create venue'}), 500


@vendor_bp.route('/vendor/venues/<int:venue_id>', methods=['PATCH'])
@vendor_required
def update_vendor_venue(current_user, venue_id):
    """Update venue info (dimensions, description, etc.)."""
    data = request.get_json() or {}
    try:
        venue = execute_query(
            "SELECT venue_id FROM venues WHERE venue_id=%s AND user_id=%s",
            (venue_id, current_user['user_id']), fetch_one=True
        )
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404

        allowed = ['venue_name', 'description', 'address', 'city', 'country',
                    'category', 'capacity', 'width', 'height', 'depth',
                    'cover_image', 'gallery_images', 'amenities',
                    'floor_material_type', 'floor_material_color',
                    'ceiling_material_type', 'ceiling_material_color']
        sets = []
        params = []
        for key in allowed:
            if key not in data:
                continue
            val = data[key]
            if key == 'cover_image' and val is None:
                _remove_existing_venue_cover_files(venue_id)
                sets.append('cover_image = %s')
                params.append(None)
                continue
            if key in ('gallery_images', 'amenities') and isinstance(val, (list, dict)):
                val = json.dumps(val)
            sets.append(f'{key} = %s')
            params.append(val)

        if not sets:
            return jsonify({'error': 'Nothing to update'}), 400

        params.append(venue_id)
        execute_query(f"UPDATE venues SET {', '.join(sets)} WHERE venue_id = %s", params)
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Update venue error: {e}", exc_info=True)
        return jsonify({'error': 'Update failed'}), 500


@vendor_bp.route('/vendor/venues/<int:venue_id>/cover', methods=['POST'])
@vendor_required
def upload_venue_cover(current_user, venue_id):
    """Upload a marketplace / listing cover image (JPG, PNG, or WebP, max 8MB)."""
    try:
        venue = execute_query(
            'SELECT venue_id FROM venues WHERE venue_id=%s AND user_id=%s',
            (venue_id, current_user['user_id']),
            fetch_one=True,
        )
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404

        if request.content_length and request.content_length > MAX_VENUE_COVER_BYTES:
            return jsonify({'error': 'Image too large (max 8MB)'}), 413

        f = request.files.get('file')
        if not f or not f.filename:
            return jsonify({'error': 'No file uploaded'}), 400

        safe_name = secure_filename(f.filename)
        ext = os.path.splitext(safe_name)[1].lower()
        if ext == '.jpeg':
            ext = '.jpg'
        if ext not in _VENUE_COVER_EXTS:
            return jsonify({'error': 'Use JPG, PNG, or WebP'}), 400

        covers_dir = os.path.join(UPLOAD_ROOT, 'venue_covers')
        os.makedirs(covers_dir, exist_ok=True)
        _remove_existing_venue_cover_files(venue_id)

        fname = f'venue_{venue_id}_cover{ext}'
        dest = os.path.join(covers_dir, fname)
        f.save(dest)

        try:
            if os.path.getsize(dest) > MAX_VENUE_COVER_BYTES:
                os.remove(dest)
                return jsonify({'error': 'Image too large (max 8MB)'}), 413
        except OSError:
            pass

        public_url = f'/static/uploads/venue_covers/{fname}'
        execute_query(
            'UPDATE venues SET cover_image=%s WHERE venue_id=%s',
            (public_url, venue_id),
        )
        return jsonify({'status': 'success', 'cover_image': public_url})
    except Exception as e:
        logger.error('Upload venue cover error: %s', e, exc_info=True)
        return jsonify({'error': 'Upload failed'}), 500


@vendor_bp.route('/vendor/venues/<int:venue_id>/publish', methods=['POST'])
@vendor_required
def toggle_publish(current_user, venue_id):
    """Toggle venue published status."""
    data = request.get_json() or {}
    publish = data.get('publish', True)
    try:
        venue = execute_query(
            "SELECT venue_id FROM venues WHERE venue_id=%s AND user_id=%s",
            (venue_id, current_user['user_id']), fetch_one=True
        )
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404

        status = 'published' if publish else 'draft'
        execute_query(
            "UPDATE venues SET is_published=%s, status=%s WHERE venue_id=%s",
            (publish, status, venue_id)
        )
        return jsonify({'status': 'success', 'is_published': publish})
    except Exception as e:
        logger.error(f"Publish toggle error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


@vendor_bp.route('/vendor/venues/<int:venue_id>', methods=['DELETE'])
@vendor_required
def delete_vendor_venue(current_user, venue_id):
    """Delete a venue and all its data (cascades)."""
    try:
        venue = execute_query(
            "SELECT venue_id FROM venues WHERE venue_id=%s AND user_id=%s",
            (venue_id, current_user['user_id']), fetch_one=True
        )
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404

        execute_query("DELETE FROM venues WHERE venue_id=%s", (venue_id,))
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Delete venue error: {e}", exc_info=True)
        return jsonify({'error': 'Delete failed'}), 500


# --------------- Pricing ---------------

@vendor_bp.route('/vendor/venues/<int:venue_id>/pricing', methods=['GET'])
@vendor_required
def list_pricing(current_user, venue_id):
    rows = execute_query("""
        SELECT vp.* FROM venue_pricing vp
        JOIN venues v ON v.venue_id = vp.venue_id
        WHERE vp.venue_id = %s AND v.user_id = %s ORDER BY vp.min_hours
    """, (venue_id, current_user['user_id']), fetch=True) or []
    return jsonify({'pricing': [dict(r) for r in rows]})


@vendor_bp.route('/vendor/venues/<int:venue_id>/pricing', methods=['POST'])
@vendor_required
def add_pricing(current_user, venue_id):
    data = request.get_json() or {}
    try:
        venue = execute_query("SELECT venue_id FROM venues WHERE venue_id=%s AND user_id=%s",
                              (venue_id, current_user['user_id']), fetch_one=True)
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404
        pid = execute_insert("""
            INSERT INTO venue_pricing (venue_id, label, min_hours, max_hours, price_per_hour)
            VALUES (%s,%s,%s,%s,%s) RETURNING pricing_id
        """, (venue_id, data.get('label', 'Standard'), data.get('min_hours', 1),
              data.get('max_hours', 24), data.get('price_per_hour', 0)))
        return jsonify({'status': 'success', 'pricing_id': pid}), 201
    except Exception as e:
        logger.error(f"Add pricing error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


@vendor_bp.route('/vendor/pricing/<int:pricing_id>', methods=['PATCH'])
@vendor_required
def patch_pricing(current_user, pricing_id):
    """Update a pricing tier (label, hours, hourly rate)."""
    data = request.get_json() or {}
    uid = current_user['user_id']
    try:
        row = execute_query(
            """
            SELECT vp.label, vp.min_hours, vp.max_hours, vp.price_per_hour
            FROM venue_pricing vp
            JOIN venues v ON v.venue_id = vp.venue_id
            WHERE vp.pricing_id = %s AND v.user_id = %s
            """,
            (pricing_id, uid),
            fetch_one=True,
        )
        if not row:
            return jsonify({'error': 'Not found'}), 404
        label = data.get('label', row['label'])
        min_h = int(data['min_hours']) if 'min_hours' in data else row['min_hours']
        max_h = int(data['max_hours']) if 'max_hours' in data else row['max_hours']
        price = float(data['price_per_hour']) if 'price_per_hour' in data else float(row['price_per_hour'])
        if min_h < 1 or max_h < min_h or price < 0:
            return jsonify({'error': 'Invalid values'}), 400
        execute_query(
            """
            UPDATE venue_pricing SET label = %s, min_hours = %s, max_hours = %s,
                price_per_hour = %s, updated_at = CURRENT_TIMESTAMP
            WHERE pricing_id = %s
              AND venue_id IN (SELECT venue_id FROM venues WHERE user_id = %s)
            """,
            (str(label)[:100], min_h, max_h, price, pricing_id, uid),
        )
        return jsonify({'status': 'success'})
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid payload'}), 400
    except Exception as e:
        logger.error(f"Patch pricing error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


@vendor_bp.route('/vendor/pricing/<int:pricing_id>', methods=['DELETE'])
@vendor_required
def delete_pricing(current_user, pricing_id):
    try:
        execute_query("""
            DELETE FROM venue_pricing WHERE pricing_id=%s
            AND venue_id IN (SELECT venue_id FROM venues WHERE user_id=%s)
        """, (pricing_id, current_user['user_id']))
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Delete pricing error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


# --------------- Packages ---------------

@vendor_bp.route('/vendor/venues/<int:venue_id>/packages', methods=['GET'])
@vendor_required
def list_packages(current_user, venue_id):
    rows = execute_query("""
        SELECT pk.* FROM venue_packages pk
        JOIN venues v ON v.venue_id = pk.venue_id
        WHERE pk.venue_id=%s AND v.user_id=%s ORDER BY pk.flat_price
    """, (venue_id, current_user['user_id']), fetch=True) or []
    return jsonify({'packages': [dict(r) for r in rows]})


@vendor_bp.route('/vendor/venues/<int:venue_id>/packages', methods=['POST'])
@vendor_required
def add_package(current_user, venue_id):
    data = request.get_json() or {}
    try:
        venue = execute_query("SELECT venue_id FROM venues WHERE venue_id=%s AND user_id=%s",
                              (venue_id, current_user['user_id']), fetch_one=True)
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404
        pid = execute_insert("""
            INSERT INTO venue_packages (venue_id, name, description, hours_included,
                flat_price, discount_pct, included_assets)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING package_id
        """, (venue_id, data.get('name', 'Package'), data.get('description', ''),
              data.get('hours_included', 4), data.get('flat_price', 0),
              data.get('discount_pct', 0),
              json.dumps(data.get('included_assets', []))))
        return jsonify({'status': 'success', 'package_id': pid}), 201
    except Exception as e:
        logger.error(f"Add package error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


@vendor_bp.route('/vendor/packages/<int:package_id>', methods=['PATCH'])
@vendor_required
def patch_package(current_user, package_id):
    """Update a package (name, description, hours, price, discount)."""
    data = request.get_json() or {}
    uid = current_user['user_id']
    try:
        row = execute_query(
            """
            SELECT pk.name, pk.description, pk.hours_included, pk.flat_price, pk.discount_pct
            FROM venue_packages pk
            JOIN venues v ON v.venue_id = pk.venue_id
            WHERE pk.package_id = %s AND v.user_id = %s
            """,
            (package_id, uid),
            fetch_one=True,
        )
        if not row:
            return jsonify({'error': 'Not found'}), 404
        name = data.get('name', row['name'])
        desc = data.get('description', row['description'] or '')
        hours = int(data['hours_included']) if 'hours_included' in data else row['hours_included']
        flat = float(data['flat_price']) if 'flat_price' in data else float(row['flat_price'])
        disc = float(data['discount_pct']) if 'discount_pct' in data else float(row['discount_pct'] or 0)
        if hours < 1 or flat < 0 or disc < 0 or disc > 100:
            return jsonify({'error': 'Invalid values'}), 400
        execute_query(
            """
            UPDATE venue_packages SET name = %s, description = %s, hours_included = %s,
                flat_price = %s, discount_pct = %s, updated_at = CURRENT_TIMESTAMP
            WHERE package_id = %s
              AND venue_id IN (SELECT venue_id FROM venues WHERE user_id = %s)
            """,
            (str(name)[:255], desc, hours, flat, disc, package_id, uid),
        )
        return jsonify({'status': 'success'})
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid payload'}), 400
    except Exception as e:
        logger.error(f"Patch package error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


@vendor_bp.route('/vendor/packages/<int:package_id>', methods=['DELETE'])
@vendor_required
def delete_package(current_user, package_id):
    try:
        execute_query("""
            DELETE FROM venue_packages WHERE package_id=%s
            AND venue_id IN (SELECT venue_id FROM venues WHERE user_id=%s)
        """, (package_id, current_user['user_id']))
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Delete package error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


# --------------- Presets ---------------

@vendor_bp.route('/vendor/venues/<int:venue_id>/presets', methods=['GET'])
@vendor_required
def list_presets(current_user, venue_id):
    rows = execute_query("""
        SELECT pr.* FROM venue_presets pr
        JOIN venues v ON v.venue_id = pr.venue_id
        WHERE pr.venue_id=%s AND v.user_id=%s ORDER BY pr.is_default DESC, pr.name
    """, (venue_id, current_user['user_id']), fetch=True) or []
    return jsonify({'presets': [dict(r) for r in rows]})


@vendor_bp.route('/vendor/venues/<int:venue_id>/presets', methods=['POST'])
@vendor_required
def add_preset(current_user, venue_id):
    data = request.get_json() or {}
    try:
        venue = execute_query("SELECT venue_id FROM venues WHERE venue_id=%s AND user_id=%s",
                              (venue_id, current_user['user_id']), fetch_one=True)
        if not venue:
            return jsonify({'error': 'Venue not found'}), 404
        pid = execute_insert("""
            INSERT INTO venue_presets (venue_id, name, description, capacity_label,
                layout_snapshot, is_default)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING preset_id
        """, (venue_id, data.get('name', 'Default'), data.get('description', ''),
              data.get('capacity_label', ''), json.dumps(data.get('layout_snapshot', {})),
              data.get('is_default', False)))
        return jsonify({'status': 'success', 'preset_id': pid}), 201
    except Exception as e:
        logger.error(f"Add preset error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


# --------------- Vendor Dashboard Stats ---------------

@vendor_bp.route('/vendor/dashboard', methods=['GET'])
@vendor_required
def vendor_dashboard(current_user):
    """Quick stats for vendor dashboard."""
    uid = current_user['user_id']
    try:
        stats = execute_query("""
            SELECT
                (SELECT COUNT(*) FROM venues WHERE user_id=%(uid)s) as total_venues,
                (SELECT COUNT(*) FROM venues WHERE user_id=%(uid)s AND is_published) as published_venues,
                (SELECT COUNT(*) FROM bookings WHERE vendor_id=%(uid)s AND status='pending') as pending_bookings,
                (SELECT COUNT(*) FROM bookings WHERE vendor_id=%(uid)s AND status='confirmed') as confirmed_bookings,
                (SELECT COALESCE(SUM(total_price),0) FROM bookings
                 WHERE vendor_id=%(uid)s AND status='confirmed') as total_revenue,
                (SELECT COUNT(*) FROM reviews r JOIN venues v ON v.venue_id=r.venue_id
                 WHERE v.user_id=%(uid)s) as total_reviews
        """, {'uid': uid}, fetch_one=True)

        recent_bookings = execute_query("""
            SELECT b.booking_id, b.event_date, b.status, b.total_price,
                   v.venue_name, u.full_name as customer_name
            FROM bookings b
            JOIN venues v ON v.venue_id = b.venue_id
            JOIN users u ON u.user_id = b.customer_id
            WHERE b.vendor_id = %s
            ORDER BY b.created_at DESC LIMIT 5
        """, (uid,), fetch=True) or []

        return jsonify({
            'status': 'success',
            'stats': {
                'total_venues': stats['total_venues'],
                'published_venues': stats['published_venues'],
                'pending_bookings': stats['pending_bookings'],
                'confirmed_bookings': stats['confirmed_bookings'],
                'total_revenue': float(stats['total_revenue']),
                'total_reviews': stats['total_reviews'],
            },
            'recent_bookings': [{
                'booking_id': b['booking_id'],
                'event_date': b['event_date'].isoformat() if b['event_date'] else None,
                'status': b['status'],
                'total_price': float(b['total_price']),
                'venue_name': b['venue_name'],
                'customer_name': b['customer_name'],
            } for b in recent_bookings]
        })
    except Exception as e:
        logger.error(f"Vendor dashboard error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500
