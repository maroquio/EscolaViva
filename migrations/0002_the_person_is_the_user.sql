-- ADR 0006 — the person is the user: the `guardian` table stops existing.
--
-- `app_user` becomes the person, and `academics` keeps only the academic relationship,
-- pointing at identity. Nineteen tables become eighteen, and no foreign key leaves
-- `identity` towards another module any more.
--
-- This is a single migration, not the open/close pair the compatibility window of ADR 0003
-- asks for. The window protects a running system from a version that still reads what the
-- next one drops; here the only data is what `scripts/seed.ts` writes, there is no previous
-- version in flight, and the decision was to keep the change in one file. The rule stands —
-- this is a deliberate exception to it, not evidence against it.
--
-- The obstacle is data, not DDL. Every guardian that is linked to a student or that receives
-- an announcement needs an `app_user` to become. `app_user.cpf` is NOT NULL while
-- `guardian.cpf` was nullable, so a guardian without a CPF has no account to migrate to and
-- no row to point at. The `SET NOT NULL` below is what fails, loudly, in that case: it is the
-- price ADR 0006 accepts written as a constraint instead of as a paragraph.

-- The contact column that started the whole inversion (ADR 0005) comes home.
ALTER TABLE app_user ADD COLUMN phone text;

UPDATE app_user u
   SET phone = g.phone
  FROM guardian g
 WHERE g.id = u.guardian_id;

/* --- academics: the link points at the person ------------------------------ */

ALTER TABLE student_guardian ADD COLUMN user_id uuid REFERENCES app_user(id);

UPDATE student_guardian sg
   SET user_id = u.id
  FROM app_user u
 WHERE u.guardian_id = sg.guardian_id;

ALTER TABLE student_guardian ALTER COLUMN user_id SET NOT NULL;

-- Dropping the column would take the primary key with it; saying so is clearer than
-- letting it happen. The index on (network_id, guardian_id) goes the same way.
ALTER TABLE student_guardian DROP CONSTRAINT student_guardian_pkey;
ALTER TABLE student_guardian DROP COLUMN guardian_id;
ALTER TABLE student_guardian ADD CONSTRAINT student_guardian_pkey PRIMARY KEY (student_id, user_id);

-- The guardian portal still starts from the guardian to reach the children — the guardian is
-- now the signed-in user, so the index leads with the same pair it always did.
CREATE INDEX student_guardian_by_user ON student_guardian (network_id, user_id);

/* --- communication: the board belongs to the person ------------------------ */

ALTER TABLE announcement_recipient ADD COLUMN user_id uuid REFERENCES app_user(id);

UPDATE announcement_recipient ar
   SET user_id = u.id
  FROM app_user u
 WHERE u.guardian_id = ar.guardian_id;

ALTER TABLE announcement_recipient ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE announcement_recipient DROP CONSTRAINT announcement_recipient_pkey;
ALTER TABLE announcement_recipient DROP COLUMN guardian_id;
ALTER TABLE announcement_recipient
  ADD CONSTRAINT announcement_recipient_pkey PRIMARY KEY (announcement_id, user_id);

CREATE INDEX announcement_recipient_by_user ON announcement_recipient (network_id, user_id);

/* --- identity becomes a leaf of the graph in the database too -------------- */

-- The arrow ADR 0005 recorded as debt: identity pointing at academics. It is the last one.
ALTER TABLE app_user DROP CONSTRAINT app_user_guardian_id_fkey;
DROP INDEX app_user_by_guardian;
ALTER TABLE app_user DROP COLUMN guardian_id;

-- Takes `guardian_cpf_unique_in_network` and the `guardian_updated_at` trigger with it.
DROP TABLE guardian;

-- The `IS NULL` branch was the last residue of the window ADR 0004 opened and closed for the
-- CPF: it was live on `guardian.cpf` and dead on `app_user.cpf`, and writing both the same
-- way said they answered to the same rule. There is no second column left to agree with.
ALTER TABLE app_user DROP CONSTRAINT user_cpf_format;
ALTER TABLE app_user ADD CONSTRAINT user_cpf_format CHECK (cpf ~ '^[0-9]{11}$');
