"""Seed script: creates a vendor user, customer user, and sample venues with pricing."""

import psycopg2
import bcrypt
import json
import os

DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:Tennis123@localhost:5432/fyp_db')

def main():
    c = psycopg2.connect(DB_URL)
    cur = c.cursor()

    # Check if vendor already exists
    cur.execute("SELECT user_id FROM users WHERE username = 'omer'")
    existing = cur.fetchone()
    if existing:
        print("Seed data already exists, skipping.")
        c.close()
        return

    # Vendor
    pw = bcrypt.hashpw(b'vendor123', bcrypt.gensalt()).decode()
    cur.execute("""
        INSERT INTO users (username, email, password_hash, full_name, role,
                           business_name, phone, city, country)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING user_id
    """, ('omer', 'omer@venuevision.com', pw, 'Omer Sheikh', 'vendor',
          'VenueVision Studios', '+1234567890', 'Karachi', 'Pakistan'))
    vendor_id = cur.fetchone()[0]
    print(f"Vendor created: user_id={vendor_id}")

    # Customer
    pw2 = bcrypt.hashpw(b'customer123', bcrypt.gensalt()).decode()
    cur.execute("""
        INSERT INTO users (username, email, password_hash, full_name, role, city, country)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING user_id
    """, ('testcustomer', 'customer@test.com', pw2, 'Test Customer', 'customer',
          'Karachi', 'Pakistan'))
    cust_id = cur.fetchone()[0]
    print(f"Customer created: user_id={cust_id}")

    venues_data = [
        ('grand-hall', 'Grand Banquet Hall',
         'A luxurious banquet hall perfect for weddings and galas with crystal chandeliers and marble flooring.',
         'Karachi', 'Pakistan', '123 Main Boulevard, Clifton', 'wedding_venue', 200, 60, 12, 45),
        ('conference-center', 'Elite Conference Center',
         'Modern conference facility with state-of-the-art AV equipment and flexible seating arrangements.',
         'Karachi', 'Pakistan', '45 Business Park, Shahrah-e-Faisal', 'conference_room', 80, 40, 10, 35),
        ('rooftop-garden', 'Skyline Rooftop Garden',
         'Open-air rooftop venue with panoramic city views, ideal for cocktail parties and receptions.',
         'Lahore', 'Pakistan', 'Tower 7, Gulberg III', 'rooftop', 120, 50, 10, 50),
        ('studio-loft', 'Creative Studio Loft',
         'Industrial-chic space with exposed brick walls, perfect for corporate events and product launches.',
         'Islamabad', 'Pakistan', '12 Art District, F-7', 'studio', 60, 35, 11, 30),
    ]

    amenities = json.dumps(['WiFi', 'Parking', 'AC', 'Sound System', 'Projector'])

    for ident, name, desc, city, country, addr, cat, cap, w, h, d in venues_data:
        cur.execute("""
            INSERT INTO venues (user_id, venue_identifier, venue_name, description,
                city, country, address, category, capacity,
                width, height, depth, is_published, status, amenities)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,TRUE,'published',%s)
            RETURNING venue_id
        """, (vendor_id, ident, name, desc, city, country, addr, cat, cap,
              w, h, d, amenities))
        vid = cur.fetchone()[0]
        print(f"  Venue: {name} (id={vid})")

        for wall_id, wall_name, leng in [
            ('wall_north', 'North Wall', w),
            ('wall_east', 'East Wall', d),
            ('wall_south', 'South Wall', w),
            ('wall_west', 'West Wall', d),
        ]:
            cur.execute("""
                INSERT INTO venue_walls (venue_id, wall_identifier, wall_name,
                    wall_type, length, height)
                VALUES (%s,%s,%s,'straight',%s,%s)
            """, (vid, wall_id, wall_name, leng, h))

        cur.execute("""
            INSERT INTO venue_pricing (venue_id, label, min_hours, max_hours, price_per_hour)
            VALUES (%s,'Standard',1,4,150), (%s,'Half Day',4,8,120), (%s,'Full Day',8,24,95)
        """, (vid, vid, vid))

        cur.execute("""
            INSERT INTO venue_packages (venue_id, name, description,
                hours_included, flat_price, discount_pct)
            VALUES (%s, 'Wedding Package',
                    'Includes setup, breakdown, basic decor, and coordinator',
                    8, 800, 15)
        """, (vid,))

    c.commit()
    c.close()

    print()
    print("=" * 50)
    print("VENDOR LOGIN:   username=omer       password=vendor123")
    print("CUSTOMER LOGIN: username=testcustomer  password=customer123")
    print("=" * 50)

if __name__ == '__main__':
    main()
