-- Sprint 5.5: parent-defined real-world missions
CREATE TABLE custom_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  points INT NOT NULL DEFAULT 20,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_custom_missions_parent_active ON custom_missions (parent_id, is_active);
