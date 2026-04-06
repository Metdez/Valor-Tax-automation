-- Add columns to support "case not found" delayed retry pattern
-- reason: distinguishes 'case_not_found' from 'missing_appointment' retry types
-- next_retry_at: controls when the cron should next process this row

ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- Backfill existing rows as 'missing_appointment' (the original queue type)
UPDATE pending_tasks SET reason = 'missing_appointment' WHERE reason IS NULL;

-- Index for efficient cron queries filtering by next_retry_at
CREATE INDEX IF NOT EXISTS idx_pending_tasks_next_retry
  ON pending_tasks (next_retry_at)
  WHERE status IN ('pending', 'processing');
