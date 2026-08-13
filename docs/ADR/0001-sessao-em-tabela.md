# ADR 0001 — Sessão em tabela, cookie assinado carregando apenas o id

**Status:** aceita — Estágio 01

## Contexto

O EscolaViva precisa saber quem está do outro lado de cada requisição. Há dois caminhos
comuns: guardar o estado da sessão *dentro* do cookie (o cookie carrega usuário, rede e
papéis, assinados) ou guardar apenas um identificador no cookie e o estado no banco.

O primeiro caminho é tentador porque não custa nenhuma consulta. Ele cobra em outro lugar:
não existe logout de verdade — um cookie assinado continua válido até expirar, mesmo que o
usuário tenha clicado em "sair", mesmo que a secretaria tenha desativado a conta. Revogar
exige uma lista de invalidação, que é exatamente a tabela que se queria evitar, só que sem
as garantias do banco.

A invariante I2 diz que a aplicação é stateless. Sessão em memória de processo (um `Map`
de módulo) ou em arquivo no disco do container quebra I2 de forma silenciosa: funciona com
uma instância e some no primeiro deploy. Derrubar o container e subir outro não pode perder
nada além do que está declarado como perdível.

## Decisão

O cookie `ev_sessao` é **assinado** e carrega **apenas o id da sessão**. O estado —
`usuario_id`, `rede_id`, `criado_em`, `expira_em`, `ip` — vive na tabela `sessao` do
PostgreSQL, que é a única fonte da verdade (I5).

O cookie é `HttpOnly`, `SameSite=Lax` e `Secure` quando `APP_ENV=production`.
A duração vem de `SESSAO_DURACAO_HORAS`, e a expiração é do registro, não do cookie:
o navegador pode mentir sobre a validade do cookie, o banco não.

## Consequências

- **Logout é real.** `encerrarSessao` apaga a linha; a próxima requisição com aquele cookie
  não encontra sessão e volta ao login. Desativar um usuário tem o mesmo efeito imediato.
- **A aplicação continua stateless.** Nenhuma variável de módulo com estado, nenhuma escrita
  em disco. Qualquer instância atende qualquer requisição — é o que torna o Estágio 08
  (mais instâncias atrás de um balanceador) uma mudança de infraestrutura, e não de código.
- **Custa uma consulta por requisição autenticada.** É um `SELECT` por chave primária em uma
  tabela pequena. Na escala do Estágio 01 (40 redes, 18 mil alunos) não aparece no p95.
- **Linhas expiradas acumulam.** Isso é uma consequência desejada: dá trabalho real ao único
  job periódico do estágio (I20), `expurgo-de-sessoes`, que roda a cada 15 minutos sob
  `pg_try_advisory_lock`. Com uma instância o lock é redundante; com seis, no Estágio 08,
  é o que evita o job rodar seis vezes. Ter o job com trabalho de verdade desde o dia 1
  significa que o mecanismo já estará provado quando importar.
