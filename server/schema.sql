-- Database schema for FYP Event Space Visualizer
-- Multi-user venue management system with hybrid storage approach

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Venues table
CREATE TABLE IF NOT EXISTS venues (
    venue_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    venue_identifier VARCHAR(100) NOT NULL, -- unique string like 'my-venue-2024'
    venue_name VARCHAR(255) NOT NULL,
    width FLOAT DEFAULT 40,  -- feet
    height FLOAT DEFAULT 9,  -- feet
    depth FLOAT DEFAULT 40,  -- feet
    floor_material_type VARCHAR(50) DEFAULT 'carpet',
    floor_material_color VARCHAR(7) DEFAULT '#cccccc',
    ceiling_material_type VARCHAR(50) DEFAULT 'plain',
    ceiling_material_color VARCHAR(7),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, venue_identifier)
);

-- Walls table
CREATE TABLE IF NOT EXISTS venue_walls (
    wall_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    wall_identifier VARCHAR(100) NOT NULL, -- 'wall_north', 'wall_south', etc.
    wall_name VARCHAR(100),
    wall_type VARCHAR(20) DEFAULT 'straight', -- 'straight' or 'curved'
    length FLOAT,
    height FLOAT,
    coord_x1 FLOAT,
    coord_y1 FLOAT,
    coord_x2 FLOAT,
    coord_y2 FLOAT,
    image_path VARCHAR(500), -- relative path like 'user_123/venue_456/wall_north.jpg'
    processed_image_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(venue_id, wall_identifier)
);

-- Assets table (tables, chairs, etc.)
CREATE TABLE IF NOT EXISTS venue_assets (
    asset_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    asset_identifier VARCHAR(100) NOT NULL, -- client-generated ID like 'placed-1765808521852'
    asset_type VARCHAR(100) NOT NULL, -- 'table', 'chair', etc.
    model_file VARCHAR(255), -- 'asset_table.glb'
    width FLOAT,
    depth FLOAT,
    position_x FLOAT,
    position_y FLOAT,
    rotation FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(venue_id, asset_identifier)
);

-- Floor plans table (optional uploaded floor plan images)
CREATE TABLE IF NOT EXISTS venue_floor_plans (
    floor_plan_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    image_path VARCHAR(500),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Polygon/custom shape data (for irregular venue shapes)
CREATE TABLE IF NOT EXISTS venue_polygons (
    polygon_id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
    point_index INTEGER NOT NULL,
    point_x FLOAT NOT NULL,
    point_y FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Assets table (user's personal 3D asset library - generated via InstantMesh)
CREATE TABLE IF NOT EXISTS user_assets (
    asset_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    asset_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL, -- relative path: 'user_assets/{user_id}/user_{id}_{timestamp}.glb'
    source_image_path VARCHAR(500), -- original image used for generation
    thumbnail_url VARCHAR(500), -- auto-generated 2D snapshot for UI
    file_size_bytes BIGINT,
    generation_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    generation_error TEXT, -- error message if generation failed
    metadata JSONB DEFAULT '{}', -- additional metadata (dimensions, vertex count, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_venues_user_id ON venues(user_id);
CREATE INDEX IF NOT EXISTS idx_venues_identifier ON venues(venue_identifier);
CREATE INDEX IF NOT EXISTS idx_walls_venue_id ON venue_walls(venue_id);
CREATE INDEX IF NOT EXISTS idx_assets_venue_id ON venue_assets(venue_id);
CREATE INDEX IF NOT EXISTS idx_floor_plans_venue_id ON venue_floor_plans(venue_id);
CREATE INDEX IF NOT EXISTS idx_polygons_venue_id ON venue_polygons(venue_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_status ON user_assets(generation_status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_venues_updated_at ON venues;
CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_assets_updated_at ON user_assets;
CREATE TRIGGER update_user_assets_updated_at BEFORE UPDATE ON user_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
