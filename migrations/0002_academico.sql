-- Acadêmico: quem estuda, onde e com quem.
-- Ano letivo, turma, disciplina e a alocação do professor na disciplina da turma; aluno,
-- responsável e o vínculo entre eles; e a matrícula, que amarra aluno a turma no ano.
-- O índice único parcial garante no banco que ninguém tenha duas matrículas ativas no
-- mesmo ano letivo — a regra não depende de a aplicação lembrar dela (I8).

CREATE TABLE academic_year (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  year        integer NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT year_unique_in_network UNIQUE (network_id, year),
  CONSTRAINT period_consistent CHECK (end_date > start_date)
);

CREATE TRIGGER academic_year_updated_at BEFORE UPDATE ON academic_year
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE class_group (
  id                uuid PRIMARY KEY,
  network_id        uuid NOT NULL REFERENCES network(id),
  school_id         uuid NOT NULL REFERENCES school(id),
  academic_year_id  uuid NOT NULL REFERENCES academic_year(id),
  name              text NOT NULL,
  grade_level       text NOT NULL,
  shift             text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_group_unique UNIQUE (school_id, academic_year_id, name),
  CONSTRAINT shift_valid CHECK (shift IN ('morning','afternoon','evening','full_time'))
);

CREATE TRIGGER class_group_updated_at BEFORE UPDATE ON class_group
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A secretaria lista as turmas filtrando por unidade e ano letivo.
CREATE INDEX class_group_by_school_and_year ON class_group (network_id, school_id, academic_year_id);

CREATE TABLE subject (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_unique_in_network UNIQUE (network_id, name)
);

CREATE TRIGGER subject_updated_at BEFORE UPDATE ON subject
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE class_group_subject (
  id               uuid PRIMARY KEY,
  network_id       uuid NOT NULL REFERENCES network(id),
  class_group_id   uuid NOT NULL REFERENCES class_group(id),
  subject_id       uuid NOT NULL REFERENCES subject(id),
  teacher_user_id  uuid NOT NULL REFERENCES app_user(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_unique_in_class_group UNIQUE (class_group_id, subject_id)
);

CREATE TRIGGER class_group_subject_updated_at BEFORE UPDATE ON class_group_subject
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- O painel do professor abre pelas disciplinas dele; a tela da turma, pelas disciplinas dela.
CREATE INDEX class_group_subject_by_teacher ON class_group_subject (network_id, teacher_user_id);
CREATE INDEX class_group_subject_by_class_group ON class_group_subject (network_id, class_group_id);

CREATE TABLE student (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  birth_date  date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER student_updated_at BEFORE UPDATE ON student
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A secretaria procura aluno pelo nome antes de matricular.
CREATE INDEX student_by_name ON student (network_id, name);

CREATE TABLE guardian (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  email       text NOT NULL,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guardian_email_unique_in_network UNIQUE (network_id, email)
);

CREATE TRIGGER guardian_updated_at BEFORE UPDATE ON guardian
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE student_guardian (
  network_id              uuid NOT NULL REFERENCES network(id),
  student_id              uuid NOT NULL REFERENCES student(id),
  guardian_id             uuid NOT NULL REFERENCES guardian(id),
  relationship            text NOT NULL,
  financially_responsible boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, guardian_id)
);

CREATE TRIGGER student_guardian_updated_at BEFORE UPDATE ON student_guardian
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- O portal do responsável parte do responsável para chegar aos filhos.
CREATE INDEX student_guardian_by_guardian ON student_guardian (network_id, guardian_id);

CREATE TABLE enrollment (
  id                uuid PRIMARY KEY,
  network_id        uuid NOT NULL REFERENCES network(id),
  student_id        uuid NOT NULL REFERENCES student(id),
  class_group_id    uuid NOT NULL REFERENCES class_group(id),
  academic_year_id  uuid NOT NULL REFERENCES academic_year(id),
  enrollment_date   date NOT NULL,
  status            text NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_valid CHECK (status IN ('active','transferred','cancelled','completed'))
);

CREATE TRIGGER enrollment_updated_at BEFORE UPDATE ON enrollment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Um aluno não pode ter duas matrículas ATIVAS no mesmo ano letivo.
CREATE UNIQUE INDEX active_enrollment_unique_per_year
  ON enrollment (student_id, academic_year_id)
  WHERE status = 'active';

-- Chamada, boletim e fechamento sempre partem da lista de ativos da turma.
CREATE INDEX active_enrollment_by_class_group
  ON enrollment (network_id, class_group_id)
  WHERE status = 'active';
