-- CPF como identificador de acesso (ADR 0004).
-- Primeira das duas etapas da janela de compatibilidade (I6, ADR 0003): a coluna nasce anulável
-- para que a versão anterior do código continue subindo e para que o rollback não perca linha.
-- A segunda etapa, 0008, só pode rodar depois que todo usuário tiver CPF.

ALTER TABLE app_user ADD COLUMN cpf text;
ALTER TABLE guardian ADD COLUMN cpf text;

-- O banco garante a forma; os dígitos verificadores são regra de domínio e ficam em
-- `shared/documento/cpf.ts`. Mesma divisão que já vale para unicidade e formato em toda tabela.
ALTER TABLE app_user ADD CONSTRAINT user_cpf_format
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
ALTER TABLE guardian ADD CONSTRAINT guardian_cpf_format
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

-- Índice PARCIAL: durante a janela existem linhas sem CPF, e sem o WHERE a primeira delas
-- impediria a segunda. Vários NULL não colidem entre si.
CREATE UNIQUE INDEX user_cpf_unique_in_network
  ON app_user (network_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX guardian_cpf_unique_in_network
  ON guardian (network_id, cpf) WHERE cpf IS NOT NULL;
