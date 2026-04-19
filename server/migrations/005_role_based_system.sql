-- Migration 005: Role-based multi-vendor system
-- Adds user roles, venue listings, pricing, packages, bookings, reviews

-- 1. Add role and profile fields to users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'customer' NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone') THEN
    ALTER TABLE users ADD COLUMN phone VARCHAR(30);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='profile_image') THEN
    ALTER TABLE users ADD COLUMN profile_image VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='business_name') THEN
    ALTER TABLE users ADD COLUMN business_name VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='business_description') THEN
    ALTER TABLE users ADD COLUMN business_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='address') THEN
    ALTER TABLE users ADD COLUMN address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='city') THEN
    ALTER TABLE users ADD COLUMN city VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='country') THEN
    ALTER TABLE users ADD COLUMN country VARCHAR(100);
  END IF;
END $$;

-- 2. Add marketplace fields to venues
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='description') THEN
    ALTER TABLE venues ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='address') THEN
    ALTER TABLE venues ADD COLUMN address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='city') THEN
    ALTER TABLE venues ADD COLUMN city VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='country') THEN
    ALTER TABLE venues ADD COLUMN country VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='capacity') THEN
    ALTER TABLE venues ADD COLUMN capacity INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='amenities') THEN
    ALTER TABLE venues ADD COLUMN amenities JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='cover_image') THEN
    ALTER TABLE venues ADD COLUMN cover_image VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='gallery_images') THEN
    ALTER TABLE venues ADD COLUMN gallery_images JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='category') THEN
    ALTER TABLE venues ADD COLUMN category VARCHAR(100) DEFAULT 'event_hall';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='rating_avg') THEN
    ALTER TABLE venues ADD COLUMN rating_avg FLOAT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='rating_count') THEN
    ALTER TABLE venues ADD COLUMN rating_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='is_published') THEN
    ALTER TABLE venues ADD COLUMN is_published BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venues' AND column_name='status') THEN
    ALTER TABLE venues ADD COLUMN status VARCHAR(30) DEFAULT 'draft';
  END IF;
END $$;

-- 3. Venue pricing tiers
CREATE TABLE IF NOT EXISTS venue_pricing (
    pricing_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    label VARCHAR(100) NOT NULL,
    min_hours INTEGER DEFAULT 1,
    max_hours INTEGER DEFAULT 24,
    price_per_hour NUMERIC(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_venue_pricing_venue ON venue_pricing(venue_id);

-- 4. Venue packages (bundled deals)
CREATE TABLE IF NOT EXISTS venue_packages (
    package_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    hours_included INTEGER NOT NULL DEFAULT 4,
    flat_price NUMERIC(10,2) NOT NULL,
    discount_pct NUMERIC(5,2) DEFAULT 0,
    included_assets JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_venue_packages_venue ON venue_packages(venue_id);

-- 5. Venue preset configurations (e.g. "Wedding for 120 guests")
CREATE TABLE IF NOT EXISTS venue_presets (
    preset_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    capacity_label VARCHAR(100),
    layout_snapshot JSONB NOT NULL DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_venue_presets_venue ON venue_presets(venue_id);

-- 6. Bookings
CREATE TABLE IF NOT EXISTS bookings (
    booking_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES users(user_id),
    preset_id INTEGER REFERENCES venue_presets(preset_id) ON DELETE SET NULL,
    package_id INTEGER REFERENCES venue_packages(package_id) ON DELETE SET NULL,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    total_hours NUMERIC(5,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    customer_notes TEXT,
    vendor_notes TEXT,
    custom_layout JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bookings_venue ON bookings(venue_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_vendor ON bookings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(event_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- 7. Reviews
CREATE TABLE IF NOT EXISTS reviews (
    review_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    booking_id INTEGER REFERENCES bookings(booking_id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    body TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(booking_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_venue ON reviews(venue_id);

-- 8. Triggers for updated_at on new tables
DROP TRIGGER IF EXISTS update_venue_pricing_updated_at ON venue_pricing;
CREATE TRIGGER update_venue_pricing_updated_at BEFORE UPDATE ON venue_pricing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_venue_packages_updated_at ON venue_packages;
CREATE TRIGGER update_venue_packages_updated_at BEFORE UPDATE ON venue_packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Enable trigram extension for fuzzy search (requires superuser once)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 10. Trigram index for fuzzy venue name search
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON venues USING gin (venue_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venues_city_trgm ON venues USING gin (city gin_trgm_ops);
