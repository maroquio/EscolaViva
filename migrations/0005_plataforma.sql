-- Plataforma: o registro de requisições já processadas (I4).
-- O navegador é entrada externa — responsável em 4G ruim envia o mesmo formulário duas vezes.
-- A chave vem do próprio formulário e o INSERT acontece na transação da escrita: se a chave
-- já existe, a segunda submissão não reprocessa nada e volta para `resposta_local`.
-- É tabela de plataforma, não de negócio: não pertence a uma rede.

CREATE TABLE requisicao_idempotente (
  chave           uuid PRIMARY KEY,
  rota            text NOT NULL,
  usuario_id      uuid NOT NULL REFERENCES usuario(id),
  resposta_hash   text NOT NULL,
  resposta_local  text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX requisicao_idempotente_por_criacao ON requisicao_idempotente (criado_em);
