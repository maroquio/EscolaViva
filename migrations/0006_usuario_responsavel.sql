-- Liga o usuário que entra no portal ao cadastro de responsável do módulo acadêmico.
-- O responsável é uma pessoa no acadêmico (`guardian`) e uma credencial na identidade
-- (`app_user`): sem esta coluna, o mural, o boletim e a frequência não teriam como sair do
-- usuário logado para os filhos dele. Nula para admin, secretaria e professor.
-- Vem depois de 0002 porque referencia `guardian`, criada lá.

ALTER TABLE app_user ADD COLUMN guardian_id uuid REFERENCES guardian(id);

-- Toda tela do responsável parte do usuário logado; o índice começa por network_id como os demais.
CREATE INDEX app_user_by_guardian ON app_user (network_id, guardian_id);
