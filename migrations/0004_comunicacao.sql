-- Comunicação: o que a escola diz ao responsável.
-- Um comunicado pertence a uma unidade e tem uma lista explícita de responsáveis destinatários.
-- `read_at` é a instrumentação da taxa de leitura do mural: sem ela, "ninguém lê o mural"
-- é opinião; com ela, é medição.

CREATE TABLE announcement (
  id              uuid PRIMARY KEY,
  network_id      uuid NOT NULL REFERENCES network(id),
  school_id       uuid NOT NULL REFERENCES school(id),
  title           text NOT NULL,
  body            text NOT NULL,
  author_user_id  uuid NOT NULL REFERENCES app_user(id),
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER announcement_updated_at BEFORE UPDATE ON announcement
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A lista da secretaria mostra os comunicados da unidade, do mais recente para o mais antigo.
CREATE INDEX announcement_by_school ON announcement (network_id, school_id, published_at DESC);

CREATE TABLE announcement_recipient (
  network_id       uuid NOT NULL REFERENCES network(id),
  announcement_id  uuid NOT NULL REFERENCES announcement(id),
  guardian_id      uuid NOT NULL REFERENCES guardian(id),
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, guardian_id)
);

CREATE TRIGGER announcement_recipient_updated_at BEFORE UPDATE ON announcement_recipient
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- O mural é sempre montado do lado do responsável.
CREATE INDEX announcement_recipient_by_guardian
  ON announcement_recipient (network_id, guardian_id);
