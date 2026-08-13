# EscolaViva — Estágio 01

**EscolaViva é um SaaS para redes educacionais.** A conta contratante é a **rede**, que possui uma
ou mais **unidades** — uma escola isolada é apenas uma rede de uma unidade. O sistema faz o que a
secretaria fazia em planilha compartilhada e caderno de chamada: matricular, transferir, montar
turma, lançar nota, registrar frequência, fechar bimestre, mostrar boletim e publicar comunicado
para o responsável. Quatro atores entram por sessão: admin da rede, secretaria, professor e
responsável. Não há superfície pública sem login, API para terceiros nem aplicativo móvel.

O **Estágio 01** é a versão que cabe em um repositório: um monólito modular com quatro domínios,
HTML renderizado no servidor e um PostgreSQL. Ele foi escrito para uma escala concreta — 40 redes
contratantes, ≈ 55 unidades, 18 mil alunos, duas pessoas na equipe, um servidor — e para **plantar
de propósito quatro dores mensuráveis**, de modo que os estágios seguintes aconteçam por evidência
e não por calendário. Por isso não existem aqui gateway de pagamento, fila, cache, CDN, réplica,
observabilidade nem esteira: cada um deles cobraria aluguel permanente sem resolver problema que
este sistema tenha hoje. O que existe são as **22 invariantes** — as decisões baratas agora que
seriam projeto depois. O detalhamento completo está em
[`docs/ESCOLAVIVA_ESTAGIO_01.md`](docs/ESCOLAVIVA_ESTAGIO_01.md).

---

## Como subir

Requisitos: [Bun](https://bun.sh) 1.3+ e Docker. Só isso.

Os scripts de backup usam `pg_dump`/`pg_restore`, que se recusam a falar com um servidor mais
novo do que eles — e o PostgreSQL que vem no sistema costuma ser mais antigo que o 16 do
`docker compose`. Por isso os dois scripts resolvem o cliente sozinhos: usam o do `PATH` quando
ele serve e, quando não serve, usam o que já está dentro do container do banco, dizendo na saída
qual escolheram. A restauração semanal de I7 não pode depender de instalar software — é
justamente o item que o documento do estágio diz que é empurrado para o fim e nunca acontece.

```bash
docker compose up -d banco       # PostgreSQL 16 com pg_stat_statements ligado
cp .env.example .env             # ajuste PORTA_BANCO se a 5432 já estiver ocupada na sua máquina
bun install
bun run migrate                  # aplica migrations/*.sql em ordem, uma transação por arquivo
bun run build:assets             # gera publico/app.<hash>.css e o manifest (I10)
bun run seed                     # rede de demonstração: 2 unidades, 6 turmas, 120 alunos
bun run dev                      # http://localhost:3000
```

Para rodar os testes, suba também o banco descartável: `docker compose up -d banco_teste`.

---

## Credenciais de demonstração

Todas criadas por `bun run seed`. **Rede: `demo` · senha: `escolaviva` para todos.**
O domínio `escolaviva.test` é reservado pela RFC 2606 — nenhum desses endereços existe de verdade.

| E-mail | Papel | Onde |
|---|---|---|
| `admin@escolaviva.test` | admin_rede | Escola Central + Escola Bairro Novo |
| `secretaria1@escolaviva.test` | secretaria | Escola Central |
| `secretaria2@escolaviva.test` | secretaria | Escola Bairro Novo |
| `professor1@escolaviva.test` … `professor3@escolaviva.test` | professor | Escola Central |
| `professor4@escolaviva.test` … `professor6@escolaviva.test` | professor | Escola Bairro Novo |
| ~200 responsáveis | responsavel | portal do responsável |

O seed imprime três e-mails de responsável no fim da execução — os nomes são sorteados com semente
fixa, então são sempre os mesmos em qualquer máquina.

Dois detalhes plantados de propósito na base de demonstração:

- **Os bimestres 1 e 2 têm nota em tudo; o 3 está incompleto.** Fechar o bimestre 1 de uma turma
  funciona; fechar o 3 é recusado com a lista de pendências ("Faltam 45 notas: Arte (20),
  Ciências (20), Geografia (5)"). É a demonstração da regra, não um dado esquecido.
- **A taxa de leitura do mural é de 12 %.** É o número da Seção 5 do documento, o que transforma
  "ninguém lê o mural" de opinião de corredor em medição — e é o que justifica o Estágio 04.

---

## Comandos

| Comando | O que faz |
|---|---|
| `bun run dev` | Sobe o servidor com recarga automática em `http://localhost:3000`. |
| `bun run start` | Sobe o servidor sem recarga — é o comando que o `Dockerfile` executa. |
| `bun run migrate` | Aplica as migrações pendentes, uma transação por arquivo, com advisory lock. |
| `bun run migrate:status` | Lista o que já foi aplicado e o que está pendente, sem escrever nada. |
| `bun run build:assets` | Gera `publico/app.<hash>.css` e o `manifest.json` que o helper `asset()` lê. |
| `bun run seed` | Apaga e recria a rede `demo`. Idempotente e bloqueado se `APP_ENV=production`. |
| `bun run seed:volume` | Carga sintética até 3,6 milhões de linhas em `frequencia`. Exige `--sim`. |
| `bun run check` | dependency-cruiser: as três regras de fronteira entre módulos (I1). |
| `bun run typecheck` | `tsc --noEmit` sobre `src/`, `scripts/` e `testes/`. |
| `bun run test` | Suíte com `bun test`; a cobertura mínima de 80 % é portão, não relatório. |
| `bun run test:cobertura` | O mesmo, imprimindo o relatório de cobertura por arquivo. |
| `bun run verificar` | `typecheck` + `check` + `test`. É o que rodar antes de qualquer commit. |
| `bash scripts/backup.sh` | `pg_dump -Fc` para `backups/`, mantendo os 7 mais recentes. |
| `bash scripts/restore-test.sh` | Restaura o dump em banco descartável e confere a contagem (I7). |

`bun run seed:volume` aceita `--ano <n>`, `--alunos <n>`, `--sim` (confirma a gravação) e
`--apagar --sim` (remove a rede de carga inteira para recomeçar uma medição).

---

## Os quatro módulos e a fronteira entre eles

```
src/
├─ identidade/    quem entra e o que pode fazer   → rede, unidade, usuário, papel, sessão
├─ academico/     quem estuda, onde e com quem    → aluno, responsável, turma, disciplina, matrícula
├─ avaliacao/     nota, frequência e fechamento   → nota, frequência, fechamento, boletim
├─ comunicacao/   o que a escola diz ao responsável → comunicado, destinatário, leitura
├─ shared/        infraestrutura sem regra de negócio
└─ web/           rotas HTTP + templates Eta
```

Cada módulo tem `dominio/`, `aplicacao/`, `infra/` e um **`index.ts` que é a única porta de
entrada**. Tudo o que não está no `index.ts` é privado do módulo: nenhum arquivo de fora importa
`academico/dominio/matricula` nem `avaliacao/infra/notaRepositorio`.

O grafo permitido tem todas as setas na mesma direção, e nenhuma volta:

```
comunicacao ──┐
avaliacao ────┼──▶ academico ──▶ identidade
              └──▶ identidade
```

`identidade` não conhece ninguém. `academico` conhece `identidade` (professor é usuário).
`avaliacao` conhece `academico` (nota pertence a uma matrícula). `comunicacao` conhece os dois.

**Quem verifica isso é `bun run check`**, não um combinado verbal. O
[`.dependency-cruiser.js`](.dependency-cruiser.js) declara três regras, todas com severidade de
erro:

1. `sem-atalho-entre-modulos` — um módulo só enxerga outro pelo `index.ts`.
2. `dominio-puro` — `*/dominio/` não alcança `shared/db`, `shared/http`, `shared/log`,
   `shared/jobs` nem `node_modules`. O domínio não sabe que existe banco, HTTP ou fornecedor.
3. `shared-nao-conhece-dominio` — `shared/` não importa nenhum módulo de domínio. A dependência é
   sempre de fora para dentro.

O motivo é o Estágio 14: quando `cobranca/` for extraído, a pergunta "o que mais mexe nisso?" já
tem resposta — é exatamente quem importa `cobranca/index.ts`. Sem a regra, a resposta é "não sei"
e a extração vira reescrita.

---

## Janela de compatibilidade de migração (I6)

As migrações são arquivos `.sql` numerados em `migrations/`, aplicados por `bun run migrate` em uma
transação por arquivo, com registro em `schema_migrations`. Sempre existe um intervalo — entre
aplicar a migração e o processo novo estar no ar, ou entre o novo subir e o antigo terminar o que
estava em curso — em que **duas versões do código conversam com o mesmo banco**.

**A regra: nunca remover ou renomear coluna que a versão anterior ainda lê.** Toda mudança de
schema respeita esta ordem, em migrações separadas e deploys separados:

1. **Adiciona** a estrutura nova. Nunca `NOT NULL` sem default na mesma migração — a versão antiga
   não sabe preencher o campo.
2. **Migra** os dados. O código novo escreve nos dois lugares; o antigo continua lendo o antigo.
3. **Para de escrever** no antigo, quando não houver mais instância da versão anterior no ar.
4. **Remove** a estrutura antiga, só depois que o passo 3 está em produção há tempo suficiente para
   não haver rollback plausível.

Renomear coluna é sempre essa sequência — nunca `ALTER TABLE ... RENAME COLUMN`, que comprime os
passos 1 e 4 em um instante. O raciocínio completo está em
[`docs/ADR/0003-janela-de-compatibilidade-de-migracao.md`](docs/ADR/0003-janela-de-compatibilidade-de-migracao.md).

---

## Checklist antes de declarar o Estágio 01 pronto

Onze itens da Seção 8 do documento. Nenhum deles adiciona componente.

| # | Item | Comando que comprova |
|---|---|---|
| 1 | `check` falha se um módulo importar arquivo interno de outro | `bun run check` |
| 2 | Nenhum arquivo é escrito em disco pela aplicação | `grep -rnE 'writeFile\|createWriteStream\|appendFile' src/` (saída vazia) |
| 3 | Derrubar o container e subir outro não perde nada | `docker compose restart app` e recarregue a página: o login continua, porque a sessão vive na tabela `sessao` |
| 4 | Toda tabela de negócio tem `rede_id` e FK declarada | a consulta abaixo, que precisa devolver **zero linhas** |
| 5 | Enviar o mesmo formulário duas vezes cria **um** registro | `bun run test` (caso de idempotência) ou reenvie o formulário no navegador com F5 |
| 6 | Rota autenticada responde `Cache-Control: private, no-store` | `bun run test`, ou abra `/painel` logado e veja o cabeçalho na aba Rede do navegador |
| 7 | `/health` responde 503 com o banco parado | `docker compose stop banco && curl -si localhost:3000/health && docker compose start banco` |
| 8 | Falta variável de ambiente → o processo **não sobe** | `SESSION_SECRET=curto bun run start` (morre no boot, com a lista do que está errado) |
| 9 | O dump foi restaurado em outro banco e a contagem bateu | `bash scripts/backup.sh && bash scripts/restore-test.sh` |
| 10 | Nenhum log contém nome, e-mail, CPF ou nota | `bun run dev \| grep -iE '"(nome\|email\|cpf\|nota)"'` (saída vazia) |
| 11 | Os quatro números da Seção 5 estão anotados | a tabela da seção seguinte, preenchida |

Consulta do item 4 — lista as tabelas de negócio **sem** chave estrangeira em `rede_id`
(`rede` é o próprio tenant e `requisicao_idempotente` é tabela de plataforma):

```sql
SELECT t.table_name AS tabela_sem_fk_de_rede
  FROM information_schema.tables t
 WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
   AND t.table_name NOT IN ('rede', 'schema_migrations', 'requisicao_idempotente')
   AND NOT EXISTS (
     SELECT 1
       FROM information_schema.key_column_usage k
       JOIN information_schema.table_constraints tc
         ON tc.constraint_name = k.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
      WHERE k.table_schema = t.table_schema AND k.table_name = t.table_name
        AND k.column_name = 'rede_id');
```

---

## Medição semanal

Três números anotados **à mão, uma vez por semana**. Isto **não é observabilidade** — ela entra no
Estágio 11. É a linha de base sem a qual nenhuma dor futura é demonstrável: sem o número de hoje,
qualquer piora vira discussão de opinião.

Alvos do Estágio 01: **p95 do lançamento de notas abaixo de 300 ms**, **CPU do banco abaixo de
20 %**, **`frequencia` com ~3,6 milhões de linhas por ano letivo**. Para ver os três sob carga real,
rode `bun run seed:volume --sim` e depois `ANALYZE frequencia;`.

Uma vez, no primeiro dia: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` (o
`docker-compose.yml` já sobe o banco com a biblioteca pré-carregada). Antes de cada medição, zere a
janela com `SELECT pg_stat_statements_reset();` e use o sistema por alguns minutos.

```sql
-- 1. Maior tabela.
SELECT count(*) AS linhas_de_frequencia FROM frequencia;

-- 2. p95 aproximado por consulta. pg_stat_statements NÃO guarda percentil: "média + 2 desvios"
--    é a aproximação, e max_exec_time é o pior caso realmente observado.
SELECT substring(query, 1, 70)                                     AS consulta,
       calls                                                       AS chamadas,
       round(mean_exec_time::numeric, 1)                           AS media_ms,
       round((mean_exec_time + 2 * stddev_exec_time)::numeric, 1)  AS p95_aprox_ms,
       round(max_exec_time::numeric, 1)                            AS pior_ms
  FROM pg_stat_statements
 WHERE query ILIKE '%nota%' OR query ILIKE '%frequencia%'
 ORDER BY mean_exec_time DESC
 LIMIT 10;

-- 3. O que o banco está fazendo agora: conexões por estado e a consulta mais antiga em curso.
SELECT state, count(*) AS conexoes, max(now() - query_start) AS mais_antiga
  FROM pg_stat_activity
 WHERE datname = current_database()
 GROUP BY state
 ORDER BY conexoes DESC;
```

A CPU do banco sai do container, não do SQL:
`docker stats --no-stream $(docker compose ps -q banco)`.

| Semana | p95 do lançamento de notas (ms) | CPU do banco (%) | Linhas em `frequencia` | Restauração testada (PASSOU/FALHOU) |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

### Os quatro números da Seção 5

Estas quatro decisões existem para tornar a próxima dor **mensurável**. Anote os números ao longo
do semestre: é a diferença entre seguir um roteiro e reproduzir o método.

| # | Número a anotar | Onde ele aparece | Dor que ele mede | Estágio |
|---|---|---|---|---|
| 1 | Horas por mês conciliando a planilha de pagamento, e quantas redes inadimplentes continuaram ativas por engano | `rede.status` é mudado à mão; a cobrança é por transferência bancária | Admin gasta 3 h/mês; 4 redes ficaram ativas por engano | 02 |
| 2 | Quantas vezes por mês a secretaria pede anexo digital de matrícula | O documento de matrícula continua em papel na secretaria | A primeira tentativa grava em disco local e some no deploy | 03 |
| 3 | Taxa de leitura do mural | Tela `/comunicados`, coluna de taxa (vem de `comunicado_destinatario.lido_em`) | Fica em 12 % — o e-mail deixa de ser opinião | 04 |
| 4 | Segundos para fechar o bimestre de uma turma, e minutos para fechar as turmas da rede | Cronômetro na tela de fechamento do professor | 35 alunos levam 6 s; 40 turmas levam 4 min e o navegador desiste | 05 |

Anote também o resultado de cada `restore-test.sh`, toda sexta. **Backup não verificado não é
backup** — é a única invariante do curso escrita como frase de efeito, provavelmente porque é o
item que mais costuma ser empurrado para o fim do backlog e nunca acontecer.

---

## O que está deliberadamente de fora

Nada aqui foi esquecido: cada linha resolve um problema que este sistema **não tem hoje** e cobraria
aluguel permanente — deploy, monitoramento, plantão — desde o primeiro dia. Cada um entra em um
estágio, um de cada vez, com a dor descrita.

| Fora do Estágio 01 | Entra quando | Estágio |
|---|---|---|
| Gateway de pagamentos | a primeira rede pedir cartão | 02 |
| Armazenamento de objetos (anexo de matrícula) | a secretaria pedir anexo digital | 03 |
| Mailer / envio de e-mail | ficar provado que ninguém abre o mural | 04 |
| Fila, worker e outbox de eventos | o primeiro fechamento de bimestre travar a secretaria | 05 |
| CDN | o custo de banda e a latência do CSS aparecerem | 06 |
| Cache | os índices já tiverem sido revisados — cache antes de índice esconde o problema | 07 |
| Balanceador e múltiplas instâncias | uma instância não der conta e o deploy precisar ser sem queda | 08 |
| Réplica de leitura | o relatório pesado atrapalhar a escrita | 10 |
| Observabilidade (métricas, tracing, APM) | os três números anotados à mão não bastarem | 11 |
| Esteira de CI/CD | o deploy manual passar a ser o gargalo | 12 |
| Busca dedicada | `ILIKE` sobre nome não aguentar o volume | 13 |
| Extração de serviço (`cobranca/`) | um módulo precisar de ciclo de vida próprio | 14 |

Também estão fora, por decisão de produto e não de arquitetura: PDF de boletim, montagem de
horário, recuperação e conselho de classe, frequência por aula (aqui a frequência é **por dia**),
aplicativo móvel, API pública para terceiros, SPA, WebSocket, exportação para planilha, i18n e tema
escuro.

A regra pedagógica também é código, não configuração: **média final é a média aritmética simples
dos quatro bimestres; aprovado com média ≥ 6,0 e frequência ≥ 75 %.** Sem peso por avaliação, sem
arredondamento configurável, sem recuperação. Parametrizar isso trocaria quatro funções puras por
um motor de fórmulas com tela de configuração e versão por ano letivo — e é a parte do produto que
menos ensina sobre arquitetura.
