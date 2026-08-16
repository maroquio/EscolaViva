-- Assessment: grade, attendance and the closing of a term.
-- A grade belongs to an enrollment within a subject of a class group; attendance is per day, never
-- per class period; the closing records that the class group's term has been shut.
-- Average, attendance percentage and status are always computed at query time, never stored in a
-- column (I5).

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

-- The largest table in the system: the day's roll call and the report card percentage both come through here.
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
