CREATE TABLE maintenance_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('preventive', 'corrective')),
  description text NOT NULL CHECK (length(description) BETWEEN 5 AND 1000),
  responsible text NOT NULL CHECK (length(responsible) BETWEEN 2 AND 100),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'done')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (ends_at > starts_at)
);
CREATE INDEX maintenance_windows_equipment_time ON maintenance_windows(equipment_id, starts_at, ends_at);
