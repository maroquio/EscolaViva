-- CPF como identificador de acesso (ADR 0004).
-- Primeira das duas etapas da janela de compatibilidade (I6, ADR 0003): a coluna nasce anulável
-- para que a versão anterior do código continue subindo e para que o rollback não perca linha.
-- A segunda etapa, 0008, só pode rodar depois que todo usuário tiver CPF.

ALTER TABLE usuario     ADD COLUMN cpf text;
ALTER TABLE responsavel ADD COLUMN cpf text;

-- O banco garante a forma; os dígitos verificadores são regra de domínio e ficam em
-- `shared/documento/cpf.ts`. Mesma divisão que já vale para unicidade e formato em toda tabela.
ALTER TABLE usuario     ADD CONSTRAINT usuario_cpf_formato
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
ALTER TABLE responsavel ADD CONSTRAINT responsavel_cpf_formato
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

-- Índice PARCIAL: durante a janela existem linhas sem CPF, e sem o WHERE a primeira delas
-- impediria a segunda. Vários NULL não colidem entre si.
CREATE UNIQUE INDEX usuario_cpf_unico_na_rede
  ON usuario (rede_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX responsavel_cpf_unico_na_rede
  ON responsavel (rede_id, cpf) WHERE cpf IS NOT NULL;
