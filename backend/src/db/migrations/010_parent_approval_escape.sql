-- Sprint 5: parent approval and escape penalty

ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check;
ALTER TABLE missions ADD CONSTRAINT missions_status_check
  CHECK (status IN ('pending', 'completed', 'expired', 'pending_approval', 'failed'));

ALTER TABLE missions ADD COLUMN IF NOT EXISTS penalty_applied INTEGER DEFAULT 0;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS escaped_at TIMESTAMPTZ;
