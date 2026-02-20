-- Migration: Add user_assets table for InstantMesh integration
-- Run this script if you have an existing database to add the new user assets functionality

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
CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_status ON user_assets(generation_status);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_user_assets_updated_at ON user_assets;
CREATE TRIGGER update_user_assets_updated_at BEFORE UPDATE ON user_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify migration
SELECT 'Migration 001_add_user_assets_table completed successfully' AS status;
