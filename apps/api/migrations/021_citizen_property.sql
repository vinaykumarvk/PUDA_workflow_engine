-- 021_citizen_property.sql
-- Direct citizen ↔ property ownership link.
--
-- A citizen can own/hold multiple properties independently of any
-- application. This table is the source of truth for the UPN picker
-- shown on the citizen portal when they start a new application.

CREATE TABLE IF NOT EXISTS citizen_property (
  user_id         TEXT NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
  property_id     TEXT NOT NULL REFERENCES property(property_id) ON DELETE CASCADE,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_citizen_property_user
  ON citizen_property(user_id);
