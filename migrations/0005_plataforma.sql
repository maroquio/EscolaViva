-- Plataforma: o registro de requisições já processadas (I4).
-- O navegador é entrada externa — responsável em 4G ruim envia o mesmo formulário duas vezes.
-- A chave vem do próprio formulário e o INSERT acontece na transação da escrita: se a chave
-- já existe, a segunda submissão não reprocessa nada e volta para `response_location`.
-- É tabela de plataforma, não de negócio: não pertence a uma rede.

-- A coluna é `idempotency_key`, não `key`: `key` é palavra reservada no PostgreSQL e passaria
-- a exigir aspas duplas em toda query escrita à mão daqui para a frente.
CREATE TABLE idempotent_request (
  idempotency_key    uuid PRIMARY KEY,
  route              text NOT NULL,
  user_id            uuid NOT NULL REFERENCES app_user(id),
  response_hash      text NOT NULL,
  response_location  text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idempotent_request_by_creation ON idempotent_request (created_at);
