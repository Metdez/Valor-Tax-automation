CREATE TABLE IF NOT EXISTS pending_tasks (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  appointment_title TEXT,
  calendar_name TEXT,
  ai_summary TEXT,
  ai_transcript TEXT,
  case_id INTEGER,
  lookup_method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_tasks_status ON pending_tasks (status) WHERE status IN ('pending', 'processing');

ALTER TABLE pending_tasks DISABLE ROW LEVEL SECURITY;
