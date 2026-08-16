-- Fecha a janela aberta por 0007 (ADR 0003, ADR 0004). Só pode rodar depois que todo usuário tem
-- CPF — em base de aula, depois de `bun run seed`.
-- O e-mail continua NOT NULL porque é o contato do Estágio 04; o que ele deixa de ser é único,
-- restrição que só fazia sentido enquanto identificava. Mãe e pai passam a poder compartilhar
-- um e-mail de família.

ALTER TABLE app_user ALTER COLUMN cpf SET NOT NULL;

DROP INDEX user_cpf_unique_in_network;
ALTER TABLE app_user ADD CONSTRAINT user_cpf_unique_in_network UNIQUE (network_id, cpf);

ALTER TABLE app_user DROP CONSTRAINT user_email_unique_in_network;
