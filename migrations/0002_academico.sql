-- Acadêmico: quem estuda, onde e com quem.
-- Ano letivo, turma, disciplina e a alocação do professor na disciplina da turma; aluno,
-- responsável e o vínculo entre eles; e a matrícula, que amarra aluno a turma no ano.
-- O índice único parcial garante no banco que ninguém tenha duas matrículas ativas no
-- mesmo ano letivo — a regra não depende de a aplicação lembrar dela (I8).

CREATE TABLE ano_letivo (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  ano            integer NOT NULL,
  data_inicio    date NOT NULL,
  data_fim       date NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ano_unico_na_rede UNIQUE (rede_id, ano),
  CONSTRAINT periodo_coerente CHECK (data_fim > data_inicio)
);

CREATE TRIGGER ano_letivo_atualizado_em BEFORE UPDATE ON ano_letivo
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE turma (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  unidade_id     uuid NOT NULL REFERENCES unidade(id),
  ano_letivo_id  uuid NOT NULL REFERENCES ano_letivo(id),
  nome           text NOT NULL,
  serie          text NOT NULL,
  turno          text NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turma_unica UNIQUE (unidade_id, ano_letivo_id, nome),
  CONSTRAINT turno_valido CHECK (turno IN ('matutino','vespertino','noturno','integral'))
);

CREATE TRIGGER turma_atualizado_em BEFORE UPDATE ON turma
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- A secretaria lista as turmas filtrando por unidade e ano letivo.
CREATE INDEX turma_por_unidade_e_ano ON turma (rede_id, unidade_id, ano_letivo_id);

CREATE TABLE disciplina (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  nome           text NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disciplina_unica_na_rede UNIQUE (rede_id, nome)
);

CREATE TRIGGER disciplina_atualizado_em BEFORE UPDATE ON disciplina
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE turma_disciplina (
  id                    uuid PRIMARY KEY,
  rede_id               uuid NOT NULL REFERENCES rede(id),
  turma_id              uuid NOT NULL REFERENCES turma(id),
  disciplina_id         uuid NOT NULL REFERENCES disciplina(id),
  professor_usuario_id  uuid NOT NULL REFERENCES usuario(id),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disciplina_unica_na_turma UNIQUE (turma_id, disciplina_id)
);

CREATE TRIGGER turma_disciplina_atualizado_em BEFORE UPDATE ON turma_disciplina
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- O painel do professor abre pelas disciplinas dele; a tela da turma, pelas disciplinas dela.
CREATE INDEX turma_disciplina_por_professor ON turma_disciplina (rede_id, professor_usuario_id);
CREATE INDEX turma_disciplina_por_turma ON turma_disciplina (rede_id, turma_id);

CREATE TABLE aluno (
  id                uuid PRIMARY KEY,
  rede_id           uuid NOT NULL REFERENCES rede(id),
  nome              text NOT NULL,
  data_nascimento   date NOT NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER aluno_atualizado_em BEFORE UPDATE ON aluno
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- A secretaria procura aluno pelo nome antes de matricular.
CREATE INDEX aluno_por_nome ON aluno (rede_id, nome);

CREATE TABLE responsavel (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  nome           text NOT NULL,
  email          text NOT NULL,
  telefone       text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT responsavel_email_unico_na_rede UNIQUE (rede_id, email)
);

CREATE TRIGGER responsavel_atualizado_em BEFORE UPDATE ON responsavel
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE aluno_responsavel (
  rede_id         uuid NOT NULL REFERENCES rede(id),
  aluno_id        uuid NOT NULL REFERENCES aluno(id),
  responsavel_id  uuid NOT NULL REFERENCES responsavel(id),
  parentesco      text NOT NULL,
  financeiro      boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, responsavel_id)
);

CREATE TRIGGER aluno_responsavel_atualizado_em BEFORE UPDATE ON aluno_responsavel
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- O portal do responsável parte do responsável para chegar aos filhos.
CREATE INDEX aluno_responsavel_por_responsavel ON aluno_responsavel (rede_id, responsavel_id);

CREATE TABLE matricula (
  id              uuid PRIMARY KEY,
  rede_id         uuid NOT NULL REFERENCES rede(id),
  aluno_id        uuid NOT NULL REFERENCES aluno(id),
  turma_id        uuid NOT NULL REFERENCES turma(id),
  ano_letivo_id   uuid NOT NULL REFERENCES ano_letivo(id),
  data_matricula  date NOT NULL,
  situacao        text NOT NULL DEFAULT 'ativa',
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT situacao_valida CHECK (situacao IN ('ativa','transferida','cancelada','concluida'))
);

CREATE TRIGGER matricula_atualizado_em BEFORE UPDATE ON matricula
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Um aluno não pode ter duas matrículas ATIVAS no mesmo ano letivo.
CREATE UNIQUE INDEX matricula_ativa_unica_por_ano
  ON matricula (aluno_id, ano_letivo_id)
  WHERE situacao = 'ativa';

-- Chamada, boletim e fechamento sempre partem da lista de ativos da turma.
CREATE INDEX matricula_ativa_por_turma
  ON matricula (rede_id, turma_id)
  WHERE situacao = 'ativa';
