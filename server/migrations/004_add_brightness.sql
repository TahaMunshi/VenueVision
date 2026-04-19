-- Migration: Add brightness to user_assets for per-asset brightness in viewer
-- brightness = multiplier (e.g. 1.0 = default, 1.5 = brighter, 0.5 = dimmer)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_assets' AND column_name = 'brightness'
  ) THEN
    ALTER TABLE user_assets ADD COLUMN brightness FLOAT DEFAULT 1.0;
  END IF;
END $$;
