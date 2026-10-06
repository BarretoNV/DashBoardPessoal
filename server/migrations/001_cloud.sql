CREATE TABLE IF NOT EXISTS dashboard_owner (id text PRIMARY KEY, email text NOT NULL);
CREATE TABLE IF NOT EXISTS dashboard_sessions (hash text PRIMARY KEY, owner_id text NOT NULL REFERENCES dashboard_owner(id), csrf text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS dashboard_oauth (state_hash text PRIMARY KEY, owner_id text REFERENCES dashboard_owner(id), payload jsonb NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS dashboard_credentials (owner_id text PRIMARY KEY REFERENCES dashboard_owner(id), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS dashboard_state (owner_id text PRIMARY KEY REFERENCES dashboard_owner(id), data jsonb NOT NULL, revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS dashboard_operations (owner_id text NOT NULL REFERENCES dashboard_owner(id), operation_id text NOT NULL, PRIMARY KEY(owner_id, operation_id));
CREATE INDEX IF NOT EXISTS dashboard_sessions_expiry ON dashboard_sessions(expires_at);
CREATE INDEX IF NOT EXISTS dashboard_oauth_expiry ON dashboard_oauth(expires_at);
