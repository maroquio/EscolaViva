-- Avaliação: nota, frequência e fechamento de bimestre.
-- A nota pertence à matrícula dentro de uma disciplina da turma; a frequência é por dia,
-- nunca por aula; o fechamento registra que o bimestre da turma foi encerrado.
-- Média, percentual de frequência e situação são sempre calculados na consulta,
-- nunca guardados em coluna (I5).

CREATE TABLE nota (
  id                    uuid PRIMARY KEY,
  rede_id               uuid NOT NULL REFERENCES rede(id),
  matricula_id          uuid NOT NULL REFERENCES matricula(id),
  turma_disciplina_id   uuid NOT NULL REFERENCES turma_disciplina(id),
  bimestre              smallint NOT NULL,
  valor                 numeric(4,2) NOT NULL,
  lancada_por           uuid NOT NULL REFERENCES usuario(id),
  lancada_em            timestamptz NOT NULL DEFAULT now(),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bimestre_valido CHECK (bimestre BETWEEN 1 AND 4),
  CONSTRAINT valor_valido    CHECK (valor >= 0 AND valor <= 10),
  CONSTRAINT nota_unica      UNIQUE (matricula_id, turma_disciplina_id, bimestre)
);

CREATE TRIGGER nota_atualizado_em BEFORE UPDATE ON nota
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- A tela de lançamento carrega as notas de uma disciplina em um bimestre.
CREATE INDEX nota_por_turma_disciplina ON nota (rede_id, turma_disciplina_id, bimestre);

CREATE TABLE frequencia (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  matricula_id   uuid NOT NULL REFERENCES matricula(id),
  data           date NOT NULL,
  presente       boolean NOT NULL,
  justificativa  text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT frequencia_unica_por_dia UNIQUE (matricula_id, data)
);

CREATE TRIGGER frequencia_atualizado_em BEFORE UPDATE ON frequencia
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Maior tabela do sistema: chamada do dia e percentual do boletim passam por aqui.
CREATE INDEX frequencia_por_matricula ON frequencia (rede_id, matricula_id, data);

CREATE TABLE fechamento_bimestre (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  turma_id       uuid NOT NULL REFERENCES turma(id),
  bimestre       smallint NOT NULL,
  fechado_em     timestamptz NOT NULL DEFAULT now(),
  fechado_por    uuid NOT NULL REFERENCES usuario(id),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fechamento_unico UNIQUE (turma_id, bimestre)
);

CREATE TRIGGER fechamento_bimestre_atualizado_em BEFORE UPDATE ON fechamento_bimestre
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
