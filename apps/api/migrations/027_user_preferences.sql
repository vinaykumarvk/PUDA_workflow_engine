DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user'
      AND column_name = 'preferences_updated_at'
  ) THEN
    ALTER TABLE "user" ADD COLUMN preferences_updated_at TIMESTAMPTZ;
  END IF;
END $$;
