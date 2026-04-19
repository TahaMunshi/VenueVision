-- Migration: Add asset_layer, width_m, depth_m to user_assets
-- Allows categorizing user assets as floor/surface/ceiling and specifying dimensions

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_assets' AND column_name = 'asset_layer'
  ) THEN
    ALTER TABLE user_assets ADD COLUMN asset_layer VARCHAR(50) DEFAULT 'surface';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_assets' AND column_name = 'width_m'
  ) THEN
    ALTER TABLE user_assets ADD COLUMN width_m FLOAT DEFAULT 1.0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_assets' AND column_name = 'depth_m'
  ) THEN
    ALTER TABLE user_assets ADD COLUMN depth_m FLOAT DEFAULT 1.0;
  END IF;
END $$;
