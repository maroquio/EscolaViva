-- Comunicação: o que a escola diz ao responsável.
-- Um comunicado pertence a uma unidade e tem uma lista explícita de responsáveis destinatários.
-- `lido_em` é a instrumentação da taxa de leitura do mural: sem ela, "ninguém lê o mural"
-- é opinião; com ela, é medição.

CREATE TABLE comunicado (
  id                 uuid PRIMARY KEY,
  rede_id            uuid NOT NULL REFERENCES rede(id),
  unidade_id         uuid NOT NULL REFERENCES unidade(id),
  titulo             text NOT NULL,
  corpo              text NOT NULL,
  autor_usuario_id   uuid NOT NULL REFERENCES usuario(id),
  publicado_em       timestamptz,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER comunicado_atualizado_em BEFORE UPDATE ON comunicado
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- A lista da secretaria mostra os comunicados da unidade, do mais recente para o mais antigo.
CREATE INDEX comunicado_por_unidade ON comunicado (rede_id, unidade_id, publicado_em DESC);

CREATE TABLE comunicado_destinatario (
  rede_id         uuid NOT NULL REFERENCES rede(id),
  comunicado_id   uuid NOT NULL REFERENCES comunicado(id),
  responsavel_id  uuid NOT NULL REFERENCES responsavel(id),
  lido_em         timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comunicado_id, responsavel_id)
);

CREATE TRIGGER comunicado_destinatario_atualizado_em BEFORE UPDATE ON comunicado_destinatario
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- O mural é sempre montado do lado do responsável.
CREATE INDEX comunicado_destinatario_por_responsavel
  ON comunicado_destinatario (rede_id, responsavel_id);
