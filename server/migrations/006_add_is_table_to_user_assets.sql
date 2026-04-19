-- Mark assets that act as a table surface (small decor snaps on top in planner/3D).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_assets' AND column_name = 'is_table'
  ) THEN
    ALTER TABLE user_assets ADD COLUMN is_table BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
