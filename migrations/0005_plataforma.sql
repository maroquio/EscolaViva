-- Platform: the record of requests already processed (I4).
-- The browser is external input — a guardian on bad 4G sends the same form twice.
-- The key comes from the form itself and the INSERT happens inside the write transaction: if the
-- key already exists, the second submission reprocesses nothing and goes back to
-- `response_location`.
-- This is a platform table, not a business one: it belongs to no network.

-- The column is `idempotency_key`, not `key`: `key` is a reserved word in PostgreSQL and would
-- start demanding double quotes in every hand-written query from here on.
CREATE TABLE idempotent_request (
  idempotency_key    uuid PRIMARY KEY,
  route              text NOT NULL,
  user_id            uuid NOT NULL REFERENCES app_user(id),
  response_hash      text NOT NULL,
  response_location  text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idempotent_request_by_creation ON idempotent_request (created_at);
