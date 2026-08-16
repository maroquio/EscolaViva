-- Identity: the tenant and whoever signs into it.
-- Creates the trigger function that keeps `updated_at` on every table, the network (the paying
-- account), its schools, the users, and the role each of them holds at each school.
-- The session lives in a table so the process stays free of state of its own (I2).
--
-- The user table is called `app_user`, not `user`: `user` is a reserved word in PostgreSQL,
-- `CREATE TABLE user` is a syntax error, and `SELECT * FROM user` does not fail — it gives back
-- the current role, which is the quietest way there is to be wrong.

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE network (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_slug_unique UNIQUE (slug),
  CONSTRAINT network_status_valid CHECK (status IN ('active','suspended','cancelled'))
);

CREATE TRIGGER network_updated_at BEFORE UPDATE ON network
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE school (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  inep_code   text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_name_unique_in_network UNIQUE (network_id, name)
);

CREATE TRIGGER school_updated_at BEFORE UPDATE ON school
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE app_user (
  id             uuid PRIMARY KEY,
  network_id     uuid NOT NULL REFERENCES network(id),
  email          text NOT NULL,
  password_hash  text NOT NULL,
  name           text NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_email_unique_in_network UNIQUE (network_id, email)
);

CREATE TRIGGER app_user_updated_at BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_role (
  network_id  uuid NOT NULL REFERENCES network(id),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  school_id   uuid NOT NULL REFERENCES school(id),
  role        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, school_id, role),
  CONSTRAINT role_valid CHECK (role IN ('network_admin','registrar','teacher','guardian'))
);

CREATE TRIGGER user_role_updated_at BEFORE UPDATE ON user_role
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Building the menu and the dashboard needs every role of the signed-in user, on every request.
CREATE INDEX user_role_by_user ON user_role (network_id, user_id);

CREATE TABLE session (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          text
);

-- The periodic purge sweeps by expiry (I20).
CREATE INDEX session_by_expiration ON session (expires_at);
