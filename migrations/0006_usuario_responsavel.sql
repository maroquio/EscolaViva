-- Liga o usuário que entra no portal ao cadastro de responsável do módulo acadêmico.
-- O responsável é uma pessoa no acadêmico (`responsavel`) e uma credencial na identidade
-- (`usuario`): sem esta coluna, o mural, o boletim e a frequência não teriam como sair do
-- usuário logado para os filhos dele. Nula para admin, secretaria e professor.
-- Vem depois de 0002 porque referencia `responsavel`, criada lá.

ALTER TABLE usuario ADD COLUMN responsavel_id uuid REFERENCES responsavel(id);

-- Toda tela do responsável parte do usuário logado; o índice começa por rede_id como os demais.
CREATE INDEX usuario_por_responsavel ON usuario (rede_id, responsavel_id);
