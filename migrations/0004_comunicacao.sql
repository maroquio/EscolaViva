-- Communication: what the school says to the guardian.
-- An announcement belongs to a school and carries an explicit list of guardian recipients.
-- `read_at` is the instrumentation behind the board's read rate: without it, "nobody reads the
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

-- The registrar's list shows the school's announcements, from the most recent to the oldest.
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

-- The board is always built from the guardian's side.
CREATE INDEX announcement_recipient_by_guardian
  ON announcement_recipient (network_id, guardian_id);
