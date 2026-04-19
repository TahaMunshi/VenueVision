"""
Marketplace API: public venue browsing, search, filtering.
"""

import logging
from flask import Blueprint, jsonify, request
from database import execute_query
from middleware.auth_middleware import optional_token

logger = logging.getLogger(__name__)
marketplace_bp = Blueprint('marketplace', __name__)

# Prefer the person (full_name / username) over business_name so demo seeds don’t show one label for everyone.
_DISPLAY_HOST_SQL = """
COALESCE(
    NULLIF(TRIM(u.full_name), ''),
    NULLIF(TRIM(u.username), ''),
    NULLIF(TRIM(u.business_name), ''),
    'Host'
)
"""


@marketplace_bp.route('/marketplace/venues', methods=['GET'])
@optional_token
def search_venues(current_user):
    """
    Browse / search published venues with filters.
    Query params: q, city, category, min_capacity, max_price, date, sort, page, limit
    """
    q = request.args.get('q', '').strip()
    city = request.args.get('city', '').strip()
    category = request.args.get('category', '').strip()
    min_capacity = request.args.get('min_capacity', type=int)
    max_price = request.args.get('max_price', type=float)
    sort = request.args.get('sort', 'rating')
    page = max(1, request.args.get('page', 1, type=int))
    limit = min(50, max(1, request.args.get('limit', 20, type=int)))
    offset = (page - 1) * limit

    conditions = ["v.is_published = TRUE"]
    params = []

    if q:
        conditions.append("(v.venue_name ILIKE %s OR v.description ILIKE %s OR v.city ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like, like])

    if city:
        conditions.append("v.city ILIKE %s")
        params.append(f"%{city}%")

    if category:
        conditions.append("v.category = %s")
        params.append(category)

    if min_capacity:
        conditions.append("v.capacity >= %s")
        params.append(min_capacity)

    if max_price:
        conditions.append("""
            EXISTS (SELECT 1 FROM venue_pricing vp
                    WHERE vp.venue_id = v.venue_id AND vp.is_active AND vp.price_per_hour <= %s)
        """)
        params.append(max_price)

    where = " AND ".join(conditions)

    order_map = {
        'rating': 'v.rating_avg DESC',
        'price_low': 'min_price ASC NULLS LAST',
        'price_high': 'min_price DESC NULLS LAST',
        'newest': 'v.created_at DESC',
        'capacity': 'v.capacity DESC NULLS LAST',
    }
    order_by = order_map.get(sort, 'v.rating_avg DESC')

    try:
        count_row = execute_query(
            f"SELECT COUNT(*) as total FROM venues v WHERE {where}",
            params, fetch_one=True
        )
        total = count_row['total'] if count_row else 0

        rows = execute_query(f"""
            SELECT v.venue_id, v.venue_identifier, v.venue_name, v.description,
                   v.city, v.country, v.address, v.category, v.capacity,
                   v.cover_image, v.gallery_images, v.amenities,
                   v.rating_avg, v.rating_count, v.width, v.height, v.depth,
                   ({_DISPLAY_HOST_SQL.strip()}) as vendor_name, u.user_id as vendor_id,
                   (SELECT MIN(vp.price_per_hour) FROM venue_pricing vp
                    WHERE vp.venue_id = v.venue_id AND vp.is_active) as min_price
            FROM venues v
            JOIN users u ON u.user_id = v.user_id
            WHERE {where}
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
        """, params + [limit, offset], fetch=True)

        venues = []
        for r in (rows or []):
            venues.append({
                'venue_id': r['venue_id'],
                'venue_identifier': r['venue_identifier'],
                'name': r['venue_name'],
                'description': r['description'],
                'city': r['city'],
                'country': r['country'],
                'address': r['address'],
                'category': r['category'],
                'capacity': r['capacity'],
                'cover_image': r['cover_image'],
                'gallery_images': r['gallery_images'] or [],
                'amenities': r['amenities'] or [],
                'rating': r['rating_avg'],
                'review_count': r['rating_count'],
                'min_price': float(r['min_price']) if r['min_price'] else None,
                'vendor_name': r['vendor_name'],
                'vendor_id': r['vendor_id'],
                'dimensions': {'width': r['width'], 'height': r['height'], 'depth': r['depth']},
            })

        return jsonify({
            'status': 'success',
            'venues': venues,
            'total': total,
            'page': page,
            'pages': (total + limit - 1) // limit if total else 0
        })
    except Exception as e:
        logger.error(f"Marketplace search error: {e}", exc_info=True)
        return jsonify({'error': 'Search failed'}), 500


@marketplace_bp.route('/marketplace/venues/<venue_identifier>', methods=['GET'])
@optional_token
def venue_detail(current_user, venue_identifier):
    """Full venue detail for marketplace (published only, or owner)."""
    try:
        row = execute_query(f"""
            SELECT v.*, ({_DISPLAY_HOST_SQL.strip()}) as vendor_name, u.phone as vendor_phone,
                   u.user_id as vendor_id
            FROM venues v JOIN users u ON u.user_id = v.user_id
            WHERE v.venue_identifier = %s
        """, (venue_identifier,), fetch_one=True)

        if not row:
            return jsonify({'error': 'Venue not found'}), 404

        is_owner = current_user and current_user['user_id'] == row['vendor_id']
        if not row['is_published'] and not is_owner:
            return jsonify({'error': 'Venue not found'}), 404

        pricing = execute_query("""
            SELECT pricing_id, label, min_hours, max_hours, price_per_hour
            FROM venue_pricing WHERE venue_id = %s AND is_active ORDER BY min_hours
        """, (row['venue_id'],), fetch=True) or []

        packages = execute_query("""
            SELECT package_id, name, description, hours_included, flat_price,
                   discount_pct, included_assets
            FROM venue_packages WHERE venue_id = %s AND is_active ORDER BY flat_price
        """, (row['venue_id'],), fetch=True) or []

        presets = execute_query("""
            SELECT preset_id, name, description, capacity_label, is_default
            FROM venue_presets WHERE venue_id = %s ORDER BY is_default DESC, name
        """, (row['venue_id'],), fetch=True) or []

        reviews = execute_query("""
            SELECT r.review_id, r.rating, r.title, r.body, r.created_at,
                   u.username, u.full_name
            FROM reviews r JOIN users u ON u.user_id = r.customer_id
            WHERE r.venue_id = %s ORDER BY r.created_at DESC LIMIT 20
        """, (row['venue_id'],), fetch=True) or []

        return jsonify({
            'status': 'success',
            'venue': {
                'venue_id': row['venue_id'],
                'venue_identifier': row['venue_identifier'],
                'name': row['venue_name'],
                'description': row['description'],
                'city': row['city'],
                'country': row['country'],
                'address': row['address'],
                'category': row['category'],
                'capacity': row['capacity'],
                'cover_image': row['cover_image'],
                'gallery_images': row['gallery_images'] or [],
                'amenities': row['amenities'] or [],
                'rating': row['rating_avg'],
                'review_count': row['rating_count'],
                'dimensions': {'width': row['width'], 'height': row['height'], 'depth': row['depth']},
                'vendor_name': row['vendor_name'],
                'vendor_id': row['vendor_id'],
                'is_published': row['is_published'],
            },
            'pricing': [dict(p) for p in pricing],
            'packages': [dict(p) for p in packages],
            'presets': [dict(p) for p in presets],
            'reviews': [{
                'review_id': rv['review_id'], 'rating': rv['rating'],
                'title': rv['title'], 'body': rv['body'],
                'author': rv['full_name'] or rv['username'],
                'created_at': rv['created_at'].isoformat() if rv['created_at'] else None
            } for rv in reviews],
        })
    except Exception as e:
        logger.error(f"Venue detail error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to load venue'}), 500


@marketplace_bp.route('/marketplace/categories', methods=['GET'])
def list_categories():
    """List venue categories with counts."""
    try:
        rows = execute_query("""
            SELECT category, COUNT(*) as count
            FROM venues WHERE is_published = TRUE
            GROUP BY category ORDER BY count DESC
        """, fetch=True) or []
        return jsonify({'categories': [dict(r) for r in rows]})
    except Exception as e:
        logger.error(f"Categories error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500


@marketplace_bp.route('/marketplace/cities', methods=['GET'])
def list_cities():
    """List cities with published venues."""
    try:
        rows = execute_query("""
            SELECT city, COUNT(*) as count
            FROM venues WHERE is_published = TRUE AND city IS NOT NULL
            GROUP BY city ORDER BY count DESC
        """, fetch=True) or []
        return jsonify({'cities': [dict(r) for r in rows]})
    except Exception as e:
        logger.error(f"Cities error: {e}", exc_info=True)
        return jsonify({'error': 'Failed'}), 500
