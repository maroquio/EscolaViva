-- Closes the window opened by 0007 (ADR 0003, ADR 0004). It may only run once every user has a
-- CPF — on a classroom database, after `bun run seed`.
-- The e-mail stays NOT NULL because it is the contact channel of Stage 04; what it stops being is
-- unique, a constraint that only made sense while it identified anyone. A mother and a father may
-- now share one family e-mail.

ALTER TABLE app_user ALTER COLUMN cpf SET NOT NULL;

DROP INDEX user_cpf_unique_in_network;
ALTER TABLE app_user ADD CONSTRAINT user_cpf_unique_in_network UNIQUE (network_id, cpf);

ALTER TABLE app_user DROP CONSTRAINT user_email_unique_in_network;
