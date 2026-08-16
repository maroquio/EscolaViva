-- Identidade: o tenant e quem entra nele.
-- Cria a função de gatilho que mantém `updated_at` em todas as tabelas, a rede (conta
-- contratante), suas unidades, os usuários e o papel que cada um exerce em cada unidade.
-- A sessão vive em tabela para que o processo continue sem estado próprio (I2).
--
-- A tabela de usuário se chama `app_user`, e não `user`: `user` é palavra reservada no
-- PostgreSQL, `CREATE TABLE user` é erro de sintaxe, e `SELECT * FROM user` não falha —
-- devolve o role corrente, que é a forma mais silenciosa de errar.

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

-- Montar o menu e o painel exige todos os papéis do usuário logado a cada requisição.
CREATE INDEX user_role_by_user ON user_role (network_id, user_id);

CREATE TABLE session (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          text
);

-- O expurgo periódico varre por expiração (I20).
CREATE INDEX session_by_expiration ON session (expires_at);
