-- Migration: Add height_m to user_assets for true-to-life vertical scaling
-- height_m = real-world height in meters (Y axis) - used to scale 3D models correctly

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_assets' AND column_name = 'height_m'
  ) THEN
    ALTER TABLE user_assets ADD COLUMN height_m FLOAT DEFAULT 1.0;
  END IF;
END $$;
