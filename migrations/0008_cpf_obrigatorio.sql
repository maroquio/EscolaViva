-- Fecha a janela aberta por 0007 (ADR 0003, ADR 0004). Só pode rodar depois que todo usuário tem
-- CPF — em base de aula, depois de `bun run seed`.
-- O e-mail continua NOT NULL porque é o contato do Estágio 04; o que ele deixa de ser é único,
-- restrição que só fazia sentido enquanto identificava. Mãe e pai passam a poder compartilhar
-- um e-mail de família.

ALTER TABLE usuario ALTER COLUMN cpf SET NOT NULL;

DROP INDEX usuario_cpf_unico_na_rede;
ALTER TABLE usuario ADD CONSTRAINT usuario_cpf_unico_na_rede UNIQUE (rede_id, cpf);

ALTER TABLE usuario DROP CONSTRAINT usuario_email_unico_na_rede;
