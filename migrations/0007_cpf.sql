-- The CPF as the credential for signing in (ADR 0004).
-- The first of the two steps of the compatibility window (I6, ADR 0003): the column is born
-- nullable so the previous version of the code keeps booting and so a rollback loses no row.
-- The second step, 0008, may only run once every user has a CPF.

ALTER TABLE app_user ADD COLUMN cpf text;
ALTER TABLE guardian ADD COLUMN cpf text;

-- The database guarantees the shape; the check digits are a domain rule and live in
-- `shared/document/cpf.ts`. The same division that already holds for uniqueness and format on
-- every table.
ALTER TABLE app_user ADD CONSTRAINT user_cpf_format
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
ALTER TABLE guardian ADD CONSTRAINT guardian_cpf_format
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

-- A PARTIAL index: during the window there are rows with no CPF, and without the WHERE the first
-- of them would block the second. Several NULLs do not collide with one another.
CREATE UNIQUE INDEX user_cpf_unique_in_network
  ON app_user (network_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX guardian_cpf_unique_in_network
  ON guardian (network_id, cpf) WHERE cpf IS NOT NULL;
