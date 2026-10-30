-- PostgreSQL names the original two-column check materials_check when it is
-- declared inline; older databases can also have the explicit name below.
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_check;
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_reserved_check;
ALTER TABLE materials ADD CONSTRAINT materials_reserved_check CHECK (reserved >= 0);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  material_id uuid NOT NULL REFERENCES materials(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  started_at timestamptz NOT NULL,
  duration_min integer NOT NULL CHECK (duration_min BETWEEN 1 AND 1440),
  material_grams numeric(12,3) NOT NULL CHECK (material_grams BETWEEN 1 AND 99999),
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'confirmed', 'in_progress', 'done', 'cancelled', 'interrupted')
  ),
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) BETWEEN 5 AND 255),
  interrupted_reason text CHECK (
    interrupted_reason IS NULL OR length(interrupted_reason) BETWEEN 5 AND 255
  ),
  actual_material_grams numeric(12,3) CHECK (
    actual_material_grams IS NULL OR actual_material_grams BETWEEN 0 AND 99999
  ),
  cancelled_at timestamptz,
  completed_at timestamptz,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_equipment_started ON bookings(equipment_id, started_at);
CREATE INDEX bookings_started ON bookings(started_at);
CREATE INDEX bookings_user_started ON bookings(user_id, started_at DESC);
CREATE UNIQUE INDEX bookings_user_idempotency ON bookings(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  performed_at date NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 5 AND 1000),
  next_due date NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (next_due > performed_at)
);
CREATE INDEX maintenance_equipment_date ON maintenance_logs(equipment_id, performed_at DESC);
