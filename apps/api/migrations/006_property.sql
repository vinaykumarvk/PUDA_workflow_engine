-- 006_property.sql
-- Step 2: First-class property entity + application-property link.
--
-- The `property` table is a SHARED master entity: one row per physical
-- property (plot/unit) identified by authority + unique_property_number.
-- Multiple applications can reference the same property over time.

-- ---------------------------------------------------------------------------
-- Property master table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS property (
  property_id         TEXT PRIMARY KEY,                           -- UUID
  authority_id        TEXT NOT NULL REFERENCES authority(authority_id),

  -- Core identifiers (from Data Model.md §A)
  unique_property_number TEXT,                                    -- UPN — the main lookup key
  property_number     TEXT,                                       -- plot_no / unit number
  location            TEXT,                                       -- scheme/city/area
  sector              TEXT,
  scheme_name         TEXT,
  usage_type          TEXT,                                       -- RESIDENTIAL, COMMERCIAL, etc.
  property_type       TEXT,                                       -- PLOT, HOUSE, FLAT, etc.

  -- Allotment references (§B)
  allotment_ref_type  TEXT,                                       -- LOI, ALLOTMENT_LETTER, OTHER
  allotment_ref_number TEXT,
  allotment_date      DATE,
  allottee_name       TEXT,

  -- Revenue / site identification (§C)
  khasra_number       TEXT,
  village             TEXT,
  tehsil              TEXT,
  district            TEXT,

  -- Physical characteristics (§E) — stored as structured JSON for flexibility
  area_sqyd           NUMERIC(12,2),                              -- commonly used in forms
  area_sqm            NUMERIC(12,2),
  physical_jsonb      JSONB NOT NULL DEFAULT '{}'::jsonb,         -- dimensions, boundaries, corner flag

  -- Planning controls (§F) — rarely queried, keep as JSON
  planning_controls_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Financial ledger snapshot (§H)
  ledger_account_id   TEXT,
  outstanding_amount  NUMERIC(14,2),

  -- Address
  property_address_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index on authority + UPN (the natural key for lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_authority_upn
  ON property(authority_id, unique_property_number)
  WHERE unique_property_number IS NOT NULL;

-- For searching by scheme + plot
CREATE INDEX IF NOT EXISTS idx_property_scheme_plot
  ON property(authority_id, scheme_name, property_number);

-- ---------------------------------------------------------------------------
-- Application ↔ Property link table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS application_property (
  arn                 TEXT NOT NULL REFERENCES application(arn) ON DELETE CASCADE,
  property_id         TEXT NOT NULL REFERENCES property(property_id),
  linked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (arn, property_id)
);

-- Fast lookup: "all applications for this property"
CREATE INDEX IF NOT EXISTS idx_application_property_pid
  ON application_property(property_id);
