-- 007_inspection.sql
-- Step 3: First-class inspection entity.
--
-- An inspection is a scheduled site visit / physical verification tied to an
-- application (and optionally to a specific task). It tracks scheduling,
-- assignment, checklist findings, photos, and outcome.
--
-- Key relationships:
--   inspection.arn      → application.arn
--   inspection.task_id  → task.task_id  (optional: the task that triggered it)
--   inspection.officer_user_id → "user".user_id

-- ---------------------------------------------------------------------------
-- Inspection table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inspection (
  inspection_id       TEXT PRIMARY KEY,                           -- UUID
  arn                 TEXT NOT NULL REFERENCES application(arn) ON DELETE CASCADE,
  task_id             TEXT REFERENCES task(task_id),              -- the task that created/owns this inspection

  -- Type & scheduling
  inspection_type     TEXT NOT NULL,                              -- SITE_VISIT, DPC_CHECK, PLUMBING_CHECK, etc.
  status              TEXT NOT NULL DEFAULT 'SCHEDULED',          -- SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
  scheduled_at        TIMESTAMPTZ,
  actual_at           TIMESTAMPTZ,                                -- when the inspection actually happened

  -- Assignment
  officer_user_id     TEXT REFERENCES "user"(user_id),            -- assigned inspector
  officer_role_id     TEXT,                                       -- system role at time of assignment

  -- Findings
  findings_summary    TEXT,
  checklist_jsonb     JSONB NOT NULL DEFAULT '{}'::jsonb,         -- { "site_visit_completed": true, ... }
  observations_jsonb  JSONB NOT NULL DEFAULT '{}'::jsonb,         -- free-form observations
  photos_jsonb        JSONB NOT NULL DEFAULT '[]'::jsonb,         -- array of AttachmentRef

  -- Outcome
  outcome             TEXT,                                       -- PASS, FAIL, REINSPECTION_REQUIRED, NA
  outcome_remarks     TEXT,

  -- Metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- All inspections for an application
CREATE INDEX IF NOT EXISTS idx_inspection_arn ON inspection(arn);

-- Officer's inspection queue (scheduled/in-progress inspections assigned to them)
CREATE INDEX IF NOT EXISTS idx_inspection_officer_status
  ON inspection(officer_user_id, status)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');

-- By task (find inspection for a given task)
CREATE INDEX IF NOT EXISTS idx_inspection_task ON inspection(task_id)
  WHERE task_id IS NOT NULL;
