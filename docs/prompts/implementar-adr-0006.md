# Prompt — implementar a ADR 0006 (a pessoa é o usuário)

Implemente a ADR 0006 neste repositório: `docs/ADR/0006-a-pessoa-e-o-usuario.md`.

Leia antes de qualquer coisa, nesta ordem: **ADR 0006** (a decisão), **ADR 0005** (a análise que a
motivou), **ADR 0004** (o que ela supersede parcialmente) e **ADR 0003** (a janela de
compatibilidade, que governa como a migração precisa ser escrita).

## Aviso: as ADRs estão em português, o código está em inglês

As ADRs foram escritas antes da conversão do vocabulário do código. Elas citam nomes que não
existem mais. Este é o mapa — confirme cada um contra `migrations/0001_initial_schema.sql` antes
de usar:

| ADR (português) | código hoje (inglês) |
|---|---|
| `usuario` | `app_user` (não `user`: é palavra reservada no PostgreSQL) |
| `usuario.responsavel_id` | `app_user.guardian_id` |
| `responsavel` | `guardian` |
| `aluno` | `student` |
| `aluno_responsavel` | `student_guardian` |
| `comunicado_destinatario` | `announcement_recipient` |
| `rede` / `unidade` | `network` / `school` |
| `papel_usuario` | `user_role` |
| `matricula` | `enrollment` |
| módulos | `identity` · `academics` · `assessment` · `communication` |
| camadas | `domain/` · `application/` · `infra/` |

Ao terminar, **atualize a ADR 0006** para os nomes em inglês e remova a "Nota de leitura" do topo,
que existia só para cobrir essa defasagem.

## O modelo alvo

`app_user` passa a ser a pessoa. `academics` guarda só a relação acadêmica, apontando para
`identity`. A tabela `guardian` deixa de existir.

- `app_user` ganha `phone text`.
- `student_guardian.guardian_id` vira `user_id uuid NOT NULL REFERENCES app_user(id)`, com a chave
  primária virando `(student_id, user_id)`.
- `announcement_recipient.guardian_id` vira `user_id uuid NOT NULL REFERENCES app_user(id)`, com a
  chave primária virando `(announcement_id, user_id)`.
- `DROP TABLE guardian`.
- `ALTER TABLE app_user DROP COLUMN guardian_id` — junto com a FK
  `app_user_guardian_id_fkey` e o índice `app_user_by_guardian`.
- `guardianId` sai de `UserSession` (`src/shared/http/session.ts`) e do tipo de usuário
  autenticado em `src/identity/domain/user.ts`.

Resultado esperado: 19 tabelas viram 18, e **nenhuma chave estrangeira aponta de `identity` para
outro módulo**. Confirme isso ao final contando as FKs, não por inspeção visual.

O painel do responsável passa a filtrar por `currentUser(c).id` direto. Em
`src/web/routes/guardian.ts`, `sessionGuardian()` deixa de existir: o usuário logado **é** o
responsável, e não há tradução a fazer. Nenhuma consulta a mais.

## Três decisões que você precisa tomar ANTES de escrever código

A ADR 0006 não resolve estas. Decida, registre o porquê, e **pergunte ao Maroquio** se qualquer uma
delas mudar o comportamento de uma tela.

**1. `user_role.school_id` é `NOT NULL`, e um responsável recém-cadastrado não tem escola.**
Hoje `registerGuardian` (academics) cria um cadastro sem escola nenhuma; o papel só é concedido
depois, por `inviteUser` (identity). Com a tabela `guardian` fora, cadastrar um responsável passa a
ser criar um `app_user` — e um `app_user` sem papel não entra em lugar nenhum.
As saídas plausíveis: conceder o papel no momento do vínculo (`linkGuardian` sabe o aluno, logo
sabe a escola), ou pedir a escola já no cadastro. **Restrição real:** a fachada de `identity` não
expõe nenhuma escrita que aceite o `sql` de uma unidade de trabalho em curso, então `linkGuardian`
não consegue criar o papel na mesma transação. A ADR 0006 registra isso e aceita as duas operações
separadas — mas confirme que essa aceitação continua de pé depois de você ver o código.

**2. O que acontece com `registerGuardian`.** Cadastrar responsável passa a significar convidar
usuário, e `inviteUser` devolve senha provisória, que a tela da secretaria vai ter de mostrar. Isso
muda o significado de uma tela existente. Decida se `academics.registerGuardian` some e a secretaria
passa a usar o fluxo de convite, ou se ele vira um invólucro que chama `identity.inviteUser`.
A direção `academics → identity` é permitida; a inversa não.

**3. Uma migração ou duas.** A ADR 0003 exige janela de compatibilidade: nunca remover coluna que a
versão anterior ainda lê. Isso pede `0002` abrindo (colunas novas anuláveis, backfill) e `0003`
fechando (`NOT NULL`, troca de PK, os dois `DROP`). As oito migrações originais foram achatadas em
`0001_initial_schema.sql`, então a numeração recomeça em `0002`.
**Recomendação:** faça as duas. A janela é o conteúdo didático de I6 e este é exatamente o caso para
o qual a ADR 0003 foi escrita — achatar aqui apagaria a demonstração. Se você concluir o contrário,
diga por quê antes de fazer.

## O obstáculo real é dado, não DDL

O backfill exige um `app_user` para cada `guardian` referenciado, e `app_user.cpf` é `NOT NULL`
enquanto `guardian.cpf` é anulável. Todo responsável sem CPF trava a migração.

Neste repositório os dados vêm do seed, então: **ajuste `scripts/seed.ts` e
`scripts/seed-volume.ts` primeiro**, para que todo responsável nasça como `app_user` com CPF e com
papel. Só depois escreva o backfill. Se algum caminho de seed criar responsável sem CPF, o `0003`
falha — e é melhor descobrir isso no seed que na migração.

Anote também: `app_user.cpf` é `NOT NULL`, mas a `CONSTRAINT user_cpf_format` ainda diz
`cpf IS NULL OR cpf ~ '...'`. O ramo `IS NULL` é resto da janela que a ADR 0004 fechou. Limpar é
opcional e cabe nesta mudança; se limpar, diga no commit.

## Superfície a mexer

Confirme com `grep -rl "guardian\|Guardian" src tests scripts` antes de começar — a lista abaixo é
o que existia no levantamento, não uma promessa.

- **migrations**: `0002_*.sql`, `0003_*.sql`
- **identity**: `domain/user.ts`, `application/inviteUser.ts`, `infra/userRepository.ts`,
  `infra/sessionRepository.ts`, `constants.ts`, `index.ts`
- **academics**: `domain/guardian.ts`, `infra/guardianRepository.ts`,
  `application/registerGuardian.ts`, `application/linkGuardian.ts`, `application/queries.ts`,
  `infra/enrollmentRepository.ts`, `constants.ts`, `index.ts`
- **communication**: `application/publishAnnouncement.ts`, `application/markAsRead.ts`,
  `application/queries.ts`, `infra/announcementRepository.ts`, `index.ts`
- **shared**: `http/session.ts`
- **web**: `routes/guardian.ts`, `routes/registrar.ts`, `routes/announcements.ts`,
  `routes/network.ts`, `routes/index.ts`, `constants.ts`, e **13 templates `.eta`**
- **tests**: 10 arquivos, incluindo `tests/support/factories.ts` — comece por ele
- **scripts**: `seed.ts`, `seed-volume.ts`, `golden.ts`

## Ordem sugerida

1. Seeds e `tests/support/factories.ts` — decidem a forma dos dados.
2. Migração `0002` (abre) e o backfill.
3. `identity`, depois `shared/http/session.ts`.
4. `academics`, depois `communication`.
5. `web` e templates.
6. Migração `0003` (fecha).
7. ADR 0006 atualizada para os nomes em inglês.

Use TDD onde couber: os testes de `tests/academics/registrations.test.ts` e
`tests/identity/users.test.ts` descrevem o comportamento que precisa sobreviver.

## Portão de verificação

`bun run verify` (typecheck → check → magic → test) precisa passar. Não é opcional e não vale
"passou o que importa".

Antes de rodar a suíte: `docker compose -f infra/docker-compose.yml up -d database test_database` —
sem os bancos, centenas de testes falham disfarçados de regressão. Se aparecer falha do tipo
`Expected: false / Received: false`, é o `FORCE_COLOR` do shell: rode com `env -u FORCE_COLOR`.

`bun run check` é o que garante que a fronteira não inverteu de novo. Se ele passar mas você tiver
dúvida, lembre do que a ADR 0005 registrou: as três regras leem `import`, e chave estrangeira, campo
de retorno e campo estrutural passam por baixo delas. Verde ali não é prova de fronteira intacta —
confira a direção das FKs à mão.

## Regras da casa

- **`git add` seletivo, sempre.** Liste os arquivos explicitamente. Nunca `git add -A`, `.`, `-u`,
  `commit -a` ou `-am`. Rode `git status --short` antes e confirme que só está staged o que esta
  sessão tocou — há outros agentes trabalhando no mesmo repositório, e commitar em massa corrompe o
  trabalho deles.
- **Pergunte antes de commitar.** Pergunte de novo antes de push. Autorizar commit não autoriza
  push; autorizar push não autoriza abrir PR nem criar branch.
- **Não crie branch.** Trabalhe na atual.
- **Não se identifique como Claude em nenhum commit.**
- Antes de propor push, confira `git log --oneline origin/main..HEAD`: costumam existir commits de
  outras sessões ali, e um push publica todos.

## O que NÃO fazer

- Não implemente o papel `aluno` nem `student.user_id`. A ADR 0006 cita isso como consequência
  futura, não como escopo.
- Não quebre `app_user` em `pessoa` + `credencial`. A ADR 0006 descarta explicitamente, e registra
  quando esse caminho voltaria a valer.
- Não reintroduza `guardian` como tabela de contato. O responsável sem CPF deixar de ser
  cadastrável é o preço assumido da decisão, e está escrito nas consequências da ADR 0006.
- Não altere as três regras de `config/.dependency-cruiser.js` para fazer a mudança passar. Se elas
  reclamarem, quem está errado é a mudança.
