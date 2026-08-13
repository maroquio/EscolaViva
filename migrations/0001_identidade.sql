-- Identidade: o tenant e quem entra nele.
-- Cria a função de gatilho que mantém `atualizado_em` em todas as tabelas, a rede (conta
-- contratante), suas unidades, os usuários e o papel que cada um exerce em cada unidade.
-- A sessão vive em tabela para que o processo continue sem estado próprio (I2).

CREATE FUNCTION set_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

CREATE TABLE rede (
  id             uuid PRIMARY KEY,
  nome           text NOT NULL,
  slug           text NOT NULL,
  status         text NOT NULL DEFAULT 'ativa',
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rede_slug_unico UNIQUE (slug),
  CONSTRAINT rede_status_valido CHECK (status IN ('ativa','suspensa','cancelada'))
);

CREATE TRIGGER rede_atualizado_em BEFORE UPDATE ON rede
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE unidade (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  nome           text NOT NULL,
  codigo_inep    text,
  ativa          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unidade_nome_unico_na_rede UNIQUE (rede_id, nome)
);

CREATE TRIGGER unidade_atualizado_em BEFORE UPDATE ON unidade
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE usuario (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  email          text NOT NULL,
  senha_hash     text NOT NULL,
  nome           text NOT NULL,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuario_email_unico_na_rede UNIQUE (rede_id, email)
);

CREATE TRIGGER usuario_atualizado_em BEFORE UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE papel_usuario (
  rede_id        uuid NOT NULL REFERENCES rede(id),
  usuario_id     uuid NOT NULL REFERENCES usuario(id),
  unidade_id     uuid NOT NULL REFERENCES unidade(id),
  papel          text NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, unidade_id, papel),
  CONSTRAINT papel_valido CHECK (papel IN ('admin_rede','secretaria','professor','responsavel'))
);

CREATE TRIGGER papel_usuario_atualizado_em BEFORE UPDATE ON papel_usuario
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Montar o menu e o painel exige todos os papéis do usuário logado a cada requisição.
CREATE INDEX papel_usuario_por_usuario ON papel_usuario (rede_id, usuario_id);

CREATE TABLE sessao (
  id          uuid PRIMARY KEY,
  rede_id     uuid NOT NULL REFERENCES rede(id),
  usuario_id  uuid NOT NULL REFERENCES usuario(id),
  criado_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL,
  ip          text
);

-- O expurgo periódico varre por expiração (I20).
CREATE INDEX sessao_por_expiracao ON sessao (expira_em);
