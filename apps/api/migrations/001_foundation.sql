CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager','user')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  description text NOT NULL DEFAULT '',
  owner_id uuid NOT NULL REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  model text NOT NULL,
  technology text NOT NULL CHECK (technology IN ('FDM','RESIN')),
  location text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  technology text NOT NULL CHECK (technology IN ('FDM','RESIN')),
  unit text NOT NULL CHECK (unit IN ('g','ml')),
  minimum numeric(12,3) NOT NULL CHECK (minimum >= 0),
  physical numeric(12,3) NOT NULL DEFAULT 0 CHECK (physical >= 0),
  reserved numeric(12,3) NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= physical),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((technology = 'FDM' AND unit = 'g') OR (technology = 'RESIN' AND unit = 'ml'))
);
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id),
  author_id uuid NOT NULL REFERENCES users(id),
  quantity numeric(12,3) NOT NULL CHECK (quantity <> 0),
  resulting_balance numeric(12,3) NOT NULL CHECK (resulting_balance >= 0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_material_date ON stock_movements(material_id, created_at DESC);
