-- Add profile_jsonb to user for citizen profile storage
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'profile_jsonb'
    ) THEN
      ALTER TABLE "user" ADD COLUMN profile_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'profile_updated_at'
    ) THEN
      ALTER TABLE "user" ADD COLUMN profile_updated_at TIMESTAMPTZ;
    END IF;
  END IF;
END $$;
