-- The whole schema of Stage 01, in one migration.
--
-- This file is the starting point, not the story. It replaces the eight migrations that built
-- the schema one module at a time and the ninth that carried out ADR 0006 — including two
-- compatibility windows that were opened and closed again, one for the CPF (ADR 0004) and one
-- for the guardian who became a user (ADR 0006). That story belongs to the ADRs and to the git
-- history; a migration directory is not the place to keep it once the windows have closed, and
-- nine files to reach a single starting point is nine chances of reading an intermediate state
-- as if it were the current one.
--
-- **This file only creates.** There is no ALTER and no DROP in it, and that is a property, not
-- a coincidence: `tests/shared/migration_window.test.ts` reads every file in this directory and
-- refuses the ones that compress the window ADR 0003 requires — a rename, an ADD COLUMN sharing
-- a file with a DROP, a NOT NULL with no default. A consolidated baseline passes those rules by
-- construction, so the gate needs no exception for it, and the next migration to arrive is
-- checked from the first line.
--
-- The window itself, applied end to end against a real database, is demonstrated in
-- `tests/shared/migration_window_in_motion.test.ts`. Consolidating erases the example from this
-- directory; that test is where it went, and it runs.

-- Keeps `updated_at` current on every table that carries it.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

/* --- Identity: the tenant and who signs into it ---------------------------- */

-- The session lives in a table so the process stays stateless (I2).
--
-- The user table is `app_user`, not `user`: `user` is a reserved word in PostgreSQL,
-- `CREATE TABLE user` is a syntax error, and `SELECT * FROM user` does not fail — it hands
-- back the current role, which is the quietest way to get this wrong.

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

-- `app_user` is the person, not merely the credential (ADR 0006). There is no separate record
-- of a guardian: whoever answers for a student is a row here, reached through
-- `student_guardian.user_id` — academics pointing at identity, the same direction as the
-- teacher's `class_group_subject.teacher_user_id`. `phone` is the contact column that used to
-- justify the second table.
--
-- The CPF is what a person types to sign in (ADR 0004); e-mail is contact only, and is not
-- unique — a mother and a father may share a family address.
CREATE TABLE app_user (
  id             uuid PRIMARY KEY,
  network_id     uuid NOT NULL REFERENCES network(id),
  email          text NOT NULL,
  cpf            text NOT NULL,
  phone          text,
  password_hash  text NOT NULL,
  name           text NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_cpf_format CHECK (cpf ~ '^[0-9]{11}$'),
  CONSTRAINT user_cpf_unique_in_network UNIQUE (network_id, cpf)
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

-- Building the menu and the dashboard needs every role of the signed-in user on each request.
CREATE INDEX user_role_by_user ON user_role (network_id, user_id);

CREATE TABLE session (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          text
);

-- The periodic purge sweeps by expiration (I20).
CREATE INDEX session_by_expiration ON session (expires_at);

/* --- Academics: who studies, where and with whom --------------------------- */

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

-- The registrar lists the class groups filtering by school and academic year.
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

-- The teacher dashboard opens from their subjects; the class group screen, from its own.
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

-- The registrar looks a student up by name before enrolling them.
CREATE INDEX student_by_name ON student (network_id, name);

-- Who answers for a student, and under what relationship. `user_id` points at `app_user`:
-- academics keeps the academic relationship and nothing else (ADR 0006). The pair is the
-- primary key, so the same person answers for a student exactly once.
CREATE TABLE student_guardian (
  network_id              uuid NOT NULL REFERENCES network(id),
  student_id              uuid NOT NULL REFERENCES student(id),
  user_id                 uuid NOT NULL REFERENCES app_user(id),
  relationship            text NOT NULL,
  financially_responsible boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, user_id)
);

CREATE TRIGGER student_guardian_updated_at BEFORE UPDATE ON student_guardian
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The guardian portal starts from the signed-in user to reach the children.
CREATE INDEX student_guardian_by_user ON student_guardian (network_id, user_id);

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

-- A student may not hold two ACTIVE enrollments in the same academic year. The partial
-- unique index guarantees it inside the database — the rule does not depend on the
-- application remembering it (I8).
CREATE UNIQUE INDEX active_enrollment_unique_per_year
  ON enrollment (student_id, academic_year_id)
  WHERE status = 'active';

-- Roll call, report card and closing always start from the class group's list of active
-- students.
CREATE INDEX active_enrollment_by_class_group
  ON enrollment (network_id, class_group_id)
  WHERE status = 'active';

/* --- Assessment: grade, attendance and the closing of a term --------------- */

-- Average, attendance percentage and status are always computed at query time, never stored
-- in a column (I5).

CREATE TABLE grade (
  id                      uuid PRIMARY KEY,
  network_id              uuid NOT NULL REFERENCES network(id),
  enrollment_id           uuid NOT NULL REFERENCES enrollment(id),
  class_group_subject_id  uuid NOT NULL REFERENCES class_group_subject(id),
  term                    smallint NOT NULL,
  value                   numeric(4,2) NOT NULL,
  posted_by               uuid NOT NULL REFERENCES app_user(id),
  posted_at               timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT term_valid   CHECK (term BETWEEN 1 AND 4),
  CONSTRAINT value_valid  CHECK (value >= 0 AND value <= 10),
  CONSTRAINT grade_unique UNIQUE (enrollment_id, class_group_subject_id, term)
);

CREATE TRIGGER grade_updated_at BEFORE UPDATE ON grade
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The posting screen loads the grades of one subject within one term.
CREATE INDEX grade_by_class_group_subject ON grade (network_id, class_group_subject_id, term);

-- Attendance is per day, never per class period.
CREATE TABLE attendance (
  id               uuid PRIMARY KEY,
  network_id       uuid NOT NULL REFERENCES network(id),
  enrollment_id    uuid NOT NULL REFERENCES enrollment(id),
  attendance_date  date NOT NULL,
  present          boolean NOT NULL,
  excuse           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_unique_per_day UNIQUE (enrollment_id, attendance_date)
);

CREATE TRIGGER attendance_updated_at BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The largest table in the system: the day's roll call and the report card percentage both
-- come through here.
CREATE INDEX attendance_by_enrollment ON attendance (network_id, enrollment_id, attendance_date);

CREATE TABLE term_closing (
  id              uuid PRIMARY KEY,
  network_id      uuid NOT NULL REFERENCES network(id),
  class_group_id  uuid NOT NULL REFERENCES class_group(id),
  term            smallint NOT NULL,
  closed_at       timestamptz NOT NULL DEFAULT now(),
  closed_by       uuid NOT NULL REFERENCES app_user(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT term_closing_unique UNIQUE (class_group_id, term)
);

CREATE TRIGGER term_closing_updated_at BEFORE UPDATE ON term_closing
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* --- Communication: what the school tells the guardian --------------------- */

-- `read_at` is the instrumentation of the board's read rate: without it, "nobody reads the
-- board" is an opinion; with it, it is a measurement.

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

-- The registrar's list shows the announcements of the school, newest first.
CREATE INDEX announcement_by_school ON announcement (network_id, school_id, published_at DESC);

CREATE TABLE announcement_recipient (
  network_id       uuid NOT NULL REFERENCES network(id),
  announcement_id  uuid NOT NULL REFERENCES announcement(id),
  user_id          uuid NOT NULL REFERENCES app_user(id),
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TRIGGER announcement_recipient_updated_at BEFORE UPDATE ON announcement_recipient
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The board is always assembled from the guardian's side, and the guardian is a user.
CREATE INDEX announcement_recipient_by_user
  ON announcement_recipient (network_id, user_id);

/* --- Platform: requests already processed (I4) ----------------------------- */

-- The browser is external input — a guardian on bad 4G sends the same form twice. The key
-- comes from the form itself and the INSERT happens inside the write transaction: if the key
-- already exists, the second submission reprocesses nothing and goes back to
-- `response_location`.
--
-- This is a platform table, not a business one: it belongs to no network. The column is
-- `idempotency_key`, not `key`: `key` is a reserved word in PostgreSQL and would start
-- demanding double quotes in every hand-written query from here on.
CREATE TABLE idempotent_request (
  idempotency_key    uuid PRIMARY KEY,
  route              text NOT NULL,
  user_id            uuid NOT NULL REFERENCES app_user(id),
  response_hash      text NOT NULL,
  response_location  text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idempotent_request_by_creation ON idempotent_request (created_at);
