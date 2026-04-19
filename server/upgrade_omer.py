"""One-time script to upgrade omer to vendor and assign/publish all venues."""
import psycopg2
import json
import os

DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@db:5432/fyp_db')

def main():
    c = psycopg2.connect(DB_URL)
    cur = c.cursor()

    cur.execute("""
        UPDATE users SET role='vendor', business_name='VenueVision Studios',
            phone='+1234567890', city='Karachi', country='Pakistan'
        WHERE username='omer'
    """)
    print("omer upgraded to vendor")

    amenities = json.dumps(['WiFi', 'Parking', 'AC', 'Sound System'])
    cur.execute("""
        UPDATE venues SET
            user_id = 2,
            is_published = TRUE,
            status = 'published',
            category = COALESCE(NULLIF(category,''), 'event_hall'),
            city = COALESCE(NULLIF(city,''), 'Karachi'),
            country = COALESCE(NULLIF(country,''), 'Pakistan'),
            amenities = %s,
            description = CASE
                WHEN description IS NOT NULL AND description != '' THEN description
                ELSE 'A venue on VenueVision'
            END
    """, (amenities,))
    print("All venues assigned to omer, published")

    cur.execute("SELECT venue_id FROM venues")
    vids = [r[0] for r in cur.fetchall()]
    for vid in vids:
        cur.execute("SELECT 1 FROM venue_pricing WHERE venue_id=%s", (vid,))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO venue_pricing (venue_id, label, min_hours, max_hours, price_per_hour)
                VALUES (%s, 'Standard', 1, 4, 150),
                       (%s, 'Half Day', 4, 8, 120),
                       (%s, 'Full Day', 8, 24, 95)
            """, (vid, vid, vid))
            print(f"  Pricing added for venue {vid}")
        else:
            print(f"  Pricing exists for venue {vid}")

    c.commit()
    c.close()
    print("Done!")

if __name__ == '__main__':
    main()
