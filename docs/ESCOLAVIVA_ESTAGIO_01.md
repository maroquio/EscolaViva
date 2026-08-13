# EscolaViva — Estágio 01

> Detalhamento da ideia #16 de [`IDEIAS_SAAS.md`](./IDEIAS_SAAS.md), no formato da Seção 8 de
> [`EVOLUCAO_SAAS.md`](./EVOLUCAO_SAAS.md).
>
> **Pilha de exemplo:** TypeScript/Node com HTML renderizado no servidor e PostgreSQL.
> A estrutura de módulos, o modelo de dados e as 22 invariantes **não mudam** com a linguagem —
> a Seção 7 traz a tabela de equivalência para Django, Rails, Spring Boot e .NET.

---

## Posicionamento decidido no dia 1

**EscolaViva é um SaaS para redes educacionais.** A conta contratante é a **rede**, que possui uma ou
mais **unidades**. Uma escola isolada é apenas uma rede de uma unidade.

Essa decisão custa **uma tabela e uma coluna** hoje. Se for adiada, o Estágio 10 (réplica) e o
Estágio 13 (busca) perdem a justificativa de volume, e acrescentar `unidade` depois vira migração em
todas as tabelas do sistema. É a mesma lógica das invariantes: barato agora, projeto depois.

---

## Estágio 01 — A secretaria que cabe em um repositório

**Entra:** Cliente Web · Aplicação Monolítica · Banco de Dados Relacional
**Escala de referência:** 40 redes contratantes (≈ 55 unidades, 18 mil alunos) · 2 pessoas · Pré-seed · 1 servidor

**O que doeu:** Nada doeu ainda. Duas pessoas, quarenta redes pagantes e três perguntas de suporte por
semana. O sistema inteiro cabe em um repositório, sobe com um comando e é depurado com um breakpoint.
A secretaria trocou planilha compartilhada e caderno de chamada por um lugar só.

**Sinal de medição:** p95 da rota de lançamento de notas abaixo de 300 ms · CPU do banco abaixo de 20 % ·
maior tabela (`frequencia`) com ~3,6 milhões de linhas por ano letivo. Os três números são anotados
manualmente uma vez por semana, com `pg_stat_statements` e `pg_stat_activity` — **isso não é
observabilidade** (Estágio 11), é a linha de base sem a qual nenhuma dor futura é demonstrável.

**Por que agora:** Simplicidade aqui não é atalho, é a decisão certa. O produto ainda é CRUD com
regra de negócio: matricular, lançar nota, registrar frequência, fechar bimestre, publicar comunicado.
Tudo isso é uma transação em um banco relacional. Qualquer componente a mais cobraria aluguel
permanente — deploy, monitoramento, plantão — sem resolver problema que exista hoje.

**O que muda:**

- **Código:** monólito modular com quatro domínios (`identidade`, `academico`, `avaliacao`,
  `comunicacao`), HTML renderizado no servidor, sessão em cookie assinado, migrações versionadas.
- **Infraestrutura:** um servidor de aplicação em container, um PostgreSQL gerenciado com
  point-in-time recovery, um domínio com TLS.
- **Operação:** deploy manual por comando (aceita 2 min de indisponibilidade — ninguém reclama ainda);
  backup diário automático **com restauração testada semanalmente**; as três métricas anotadas à mão.

**Aluguel permanente:** um servidor, um banco, um pipeline de migração e a disciplina de manter a
fronteira entre os quatro módulos. É o menor aluguel possível para um produto que cobra.

**Deixado de fora de propósito:** Gateway de Pagamentos · Armazenamento de Objetos · Mensageria ·
Fila · Worker · CDN · Cache · Balanceador · WAF · Réplica · Observabilidade · CI/CD · Busca Dedicada ·
Microserviços — **e também**: PDF de boletim, montagem de horário, recuperação e conselho de classe,
frequência por aula, aplicativo móvel.

- *Por quê:* nenhum deles resolve um problema que este sistema tem hoje. As redes pagam por
  transferência bancária, os documentos de matrícula continuam em papel na secretaria, o comunicado
  fica no mural do portal e o boletim é uma tela.
- *Entra quando:* um de cada vez, com a dor descrita nos treze estágios seguintes. Especificamente:
  o gateway quando a primeira rede pedir cartão (E02); o storage quando a secretaria pedir anexo de
  matrícula (E03); o e-mail quando ficar provado que ninguém abre o mural (E04); a fila no primeiro
  fechamento de bimestre que travar a secretaria (E05).

**Invariantes exercidas:** I1, I2, I5, I6, I7, I8, I10, I11, I12, I13, I14, I15, I16, I17, I18, I19,
I20, I22 — e a preparação barata de I3, I4, I9 e I21 (detalhada na Seção 4).

---

## 1. Módulos por domínio (I1)

```
escolaviva/
├─ src/
│  ├─ identidade/          # quem entra e o que pode fazer
│  │  ├─ dominio/          #   Rede, Unidade, Usuario, Papel
│  │  ├─ aplicacao/        #   autenticar, convidar usuário, trocar senha
│  │  ├─ infra/            #   repositórios (SQL)
│  │  └─ index.ts          #   ⟵ ÚNICA porta de entrada do módulo
│  │
│  ├─ academico/           # quem estuda, onde e com quem
│  │  ├─ dominio/          #   Aluno, Responsavel, Turma, Disciplina, Matricula
│  │  ├─ aplicacao/        #   matricular, transferir, alocar professor
│  │  ├─ infra/
│  │  └─ index.ts
│  │
│  ├─ avaliacao/           # nota, frequência e fechamento
│  │  ├─ dominio/          #   Nota, Frequencia, FechamentoBimestre, Boletim
│  │  ├─ aplicacao/        #   lançar notas, registrar chamada, fechar bimestre
│  │  ├─ infra/
│  │  └─ index.ts
│  │
│  ├─ comunicacao/         # o que a escola diz ao responsável
│  │  ├─ dominio/          #   Comunicado, Destinatario, Leitura
│  │  ├─ aplicacao/        #   publicar comunicado, marcar como lido
│  │  ├─ infra/
│  │  └─ index.ts
│  │
│  ├─ shared/              # infraestrutura sem regra de negócio
│  │  ├─ ports/            #   Clock, IdGenerator  (Mailer→E04, FileStorage→E03, Payment→E02)
│  │  ├─ db/               #   conexão, unidade de trabalho, leitura()/escrita()  (I15)
│  │  ├─ http/             #   correlacao (I16), tenant, ip (I12), sessao (I2), cache-control (I11)
│  │  ├─ log/              #   logger estruturado + redação de campos (I17)
│  │  ├─ jobs/             #   agendador + lock por advisory lock (I20)
│  │  └─ config/           #   leitura e validação de env no boot (I18)
│  │
│  └─ web/                 # controllers HTTP + templates
│     ├─ rotas/
│     ├─ templates/
│     └─ health.ts         #   /health e /health/live  (I13)
│
├─ migrations/             # 0001_..., 0002_...  (I6)
├─ scripts/
│  ├─ backup.sh
│  └─ restore-test.sh      # restaura em banco descartável e valida  (I7)
├─ .dependency-cruiser.js  # a regra de I1 verificada pela ferramenta de build
├─ Dockerfile              # artefato imutável desde o dia 1  (I19)
└─ .env.example            # segredos fora do repositório  (I18)
```

### A regra que a ferramenta verifica

Três restrições, checadas no `npm run check` (e, a partir do Estágio 12, na esteira):

1. Nenhum módulo importa arquivo interno de outro módulo — só o `index.ts`.
   `academico/aplicacao/*` **não** pode importar `avaliacao/dominio/Nota`.
2. `*/dominio/**` não importa nada de `shared/db`, `shared/http` nem SDK de terceiro.
   O domínio não sabe que existe banco, HTTP ou fornecedor.
3. `shared/**` não importa nenhum módulo de domínio. A dependência é sempre de fora para dentro.

**Por que isso importa no Estágio 14:** quando `cobranca/` for extraído, a pergunta "o que mais mexe
nisso?" já tem resposta — só o que importa `cobranca/index.ts`. Sem essa regra, a resposta é "não sei"
e a extração vira reescrita.

### Grafo de dependências permitido no E01

```
comunicacao ──┐
avaliacao ────┼──▶ academico ──▶ identidade
              └──▶ identidade
```

`identidade` não conhece ninguém. `academico` conhece `identidade` (professor é usuário).
`avaliacao` conhece `academico` (nota pertence a uma matrícula). `comunicacao` conhece os dois.
Nenhuma seta volta.

---

## 2. Modelo de dados

Convenções aplicadas a **todas** as tabelas de negócio:

- `rede_id` presente em toda tabela — isolamento de tenant verificável no banco, não só na aplicação.
- Todo índice de consulta começa por `rede_id`.
- `criado_em` e `atualizado_em` em `timestamptz`, sempre UTC.
- Chave primária `uuid` gerada pela aplicação (permite escrever pai e filho na mesma transação sem ida e volta).

### Identidade

```sql
CREATE TABLE rede (
  id           uuid PRIMARY KEY,
  nome         text NOT NULL,
  slug         text NOT NULL,
  status       text NOT NULL DEFAULT 'ativa',
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rede_slug_unico UNIQUE (slug),
  CONSTRAINT rede_status_valido CHECK (status IN ('ativa','suspensa','cancelada'))
);

CREATE TABLE unidade (
  id           uuid PRIMARY KEY,
  rede_id      uuid NOT NULL REFERENCES rede(id),
  nome         text NOT NULL,
  codigo_inep  text,
  ativa        boolean NOT NULL DEFAULT true,
  CONSTRAINT unidade_nome_unico_na_rede UNIQUE (rede_id, nome)
);

CREATE TABLE usuario (
  id           uuid PRIMARY KEY,
  rede_id      uuid NOT NULL REFERENCES rede(id),
  email        text NOT NULL,
  senha_hash   text NOT NULL,
  nome         text NOT NULL,
  ativo        boolean NOT NULL DEFAULT true,
  CONSTRAINT usuario_email_unico_na_rede UNIQUE (rede_id, email)
);

CREATE TABLE papel_usuario (
  usuario_id   uuid NOT NULL REFERENCES usuario(id),
  unidade_id   uuid NOT NULL REFERENCES unidade(id),
  papel        text NOT NULL,
  PRIMARY KEY (usuario_id, unidade_id, papel),
  CONSTRAINT papel_valido CHECK (papel IN ('admin_rede','secretaria','professor','responsavel'))
);
```

> **Nota sobre cobrança:** `rede.status` é definido **manualmente** pelo administrador no Estágio 01.
> Não existe coluna `plano` nem booleano `assinante`. No Estágio 02 nasce o módulo `cobranca/` com
> assinatura e histórico de cobrança próprios, e `rede.status` passa a ser derivado dele. Modelar
> assinatura como campo do tenant agora é exatamente a armadilha que o catálogo do curso descreve no
> Gateway de Pagamentos: "não conseguir explicar o histórico de cobrança".

### Acadêmico

```sql
CREATE TABLE ano_letivo (
  id           uuid PRIMARY KEY,
  rede_id      uuid NOT NULL REFERENCES rede(id),
  ano          integer NOT NULL,
  data_inicio  date NOT NULL,
  data_fim     date NOT NULL,
  CONSTRAINT ano_unico_na_rede UNIQUE (rede_id, ano),
  CONSTRAINT periodo_coerente CHECK (data_fim > data_inicio)
);

CREATE TABLE turma (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  unidade_id     uuid NOT NULL REFERENCES unidade(id),
  ano_letivo_id  uuid NOT NULL REFERENCES ano_letivo(id),
  nome           text NOT NULL,
  serie          text NOT NULL,
  turno          text NOT NULL,
  CONSTRAINT turma_unica UNIQUE (unidade_id, ano_letivo_id, nome),
  CONSTRAINT turno_valido CHECK (turno IN ('matutino','vespertino','noturno','integral'))
);

CREATE TABLE disciplina (
  id        uuid PRIMARY KEY,
  rede_id   uuid NOT NULL REFERENCES rede(id),
  nome      text NOT NULL,
  CONSTRAINT disciplina_unica_na_rede UNIQUE (rede_id, nome)
);

CREATE TABLE turma_disciplina (
  id                    uuid PRIMARY KEY,
  rede_id               uuid NOT NULL REFERENCES rede(id),
  turma_id              uuid NOT NULL REFERENCES turma(id),
  disciplina_id         uuid NOT NULL REFERENCES disciplina(id),
  professor_usuario_id  uuid NOT NULL REFERENCES usuario(id),
  CONSTRAINT disciplina_unica_na_turma UNIQUE (turma_id, disciplina_id)
);

CREATE TABLE aluno (
  id                uuid PRIMARY KEY,
  rede_id           uuid NOT NULL REFERENCES rede(id),
  nome              text NOT NULL,
  data_nascimento   date NOT NULL,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE responsavel (
  id        uuid PRIMARY KEY,
  rede_id   uuid NOT NULL REFERENCES rede(id),
  nome      text NOT NULL,
  email     text NOT NULL,
  telefone  text,
  CONSTRAINT responsavel_email_unico_na_rede UNIQUE (rede_id, email)
);

CREATE TABLE aluno_responsavel (
  aluno_id        uuid NOT NULL REFERENCES aluno(id),
  responsavel_id  uuid NOT NULL REFERENCES responsavel(id),
  parentesco      text NOT NULL,
  financeiro      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (aluno_id, responsavel_id)
);

CREATE TABLE matricula (
  id              uuid PRIMARY KEY,
  rede_id         uuid NOT NULL REFERENCES rede(id),
  aluno_id        uuid NOT NULL REFERENCES aluno(id),
  turma_id        uuid NOT NULL REFERENCES turma(id),
  ano_letivo_id   uuid NOT NULL REFERENCES ano_letivo(id),
  data_matricula  date NOT NULL,
  situacao        text NOT NULL DEFAULT 'ativa',
  CONSTRAINT situacao_valida CHECK (situacao IN ('ativa','transferida','cancelada','concluida'))
);

-- Um aluno não pode ter duas matrículas ATIVAS no mesmo ano letivo.
CREATE UNIQUE INDEX matricula_ativa_unica_por_ano
  ON matricula (aluno_id, ano_letivo_id)
  WHERE situacao = 'ativa';
```

### Avaliação

```sql
CREATE TABLE nota (
  id                    uuid PRIMARY KEY,
  rede_id               uuid NOT NULL REFERENCES rede(id),
  matricula_id          uuid NOT NULL REFERENCES matricula(id),
  turma_disciplina_id   uuid NOT NULL REFERENCES turma_disciplina(id),
  bimestre              smallint NOT NULL,
  valor                 numeric(4,2) NOT NULL,
  lancada_por           uuid NOT NULL REFERENCES usuario(id),
  lancada_em            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bimestre_valido CHECK (bimestre BETWEEN 1 AND 4),
  CONSTRAINT valor_valido    CHECK (valor >= 0 AND valor <= 10),
  CONSTRAINT nota_unica      UNIQUE (matricula_id, turma_disciplina_id, bimestre)
);

CREATE TABLE frequencia (
  id            uuid PRIMARY KEY,
  rede_id       uuid NOT NULL REFERENCES rede(id),
  matricula_id  uuid NOT NULL REFERENCES matricula(id),
  data          date NOT NULL,
  presente      boolean NOT NULL,
  justificativa text,
  CONSTRAINT frequencia_unica_por_dia UNIQUE (matricula_id, data)
);

CREATE TABLE fechamento_bimestre (
  id             uuid PRIMARY KEY,
  rede_id        uuid NOT NULL REFERENCES rede(id),
  turma_id       uuid NOT NULL REFERENCES turma(id),
  bimestre       smallint NOT NULL,
  fechado_em     timestamptz NOT NULL DEFAULT now(),
  fechado_por    uuid NOT NULL REFERENCES usuario(id),
  CONSTRAINT fechamento_unico UNIQUE (turma_id, bimestre)
);
```

**Regra fixada por decisão de escopo:** média final = média aritmética dos 4 bimestres, aprovado com
média ≥ 6,0 e frequência ≥ 75 %. **Sem** recuperação, **sem** conselho de classe, **sem** peso por
avaliação, **sem** arredondamento configurável. Essa regra é código, não configuração. Tornar a regra
pedagógica parametrizável é o buraco que consome o semestre e não ensina nada de arquitetura.

### Comunicação

```sql
CREATE TABLE comunicado (
  id                 uuid PRIMARY KEY,
  rede_id            uuid NOT NULL REFERENCES rede(id),
  unidade_id         uuid NOT NULL REFERENCES unidade(id),
  titulo             text NOT NULL,
  corpo              text NOT NULL,
  autor_usuario_id   uuid NOT NULL REFERENCES usuario(id),
  publicado_em       timestamptz
);

CREATE TABLE comunicado_destinatario (
  comunicado_id   uuid NOT NULL REFERENCES comunicado(id),
  responsavel_id  uuid NOT NULL REFERENCES responsavel(id),
  lido_em         timestamptz,
  PRIMARY KEY (comunicado_id, responsavel_id)
);
```

> `lido_em` é a instrumentação que **prova a dor do Estágio 04**. Quando a taxa de leitura do mural
> ficar em 12 %, o e-mail deixa de ser opinião e vira medição.

### Índices que existem desde o dia 1

```sql
CREATE INDEX ON matricula   (rede_id, turma_id) WHERE situacao = 'ativa';
CREATE INDEX ON nota        (rede_id, turma_disciplina_id, bimestre);
CREATE INDEX ON frequencia  (rede_id, matricula_id, data);
CREATE INDEX ON comunicado  (rede_id, unidade_id, publicado_em DESC);
```

**Por que isso é uma decisão de arquitetura e não de banco:** o Estágio 07 (cache) só é honesto depois
que os índices foram revisados. Um cache colocado sobre uma consulta sem índice esconde o problema em
vez de resolvê-lo — é o antipadrão nº 2 do curso, "cache antes de índice".

---

## 3. Superfícies do Estágio 01

| Ator | O que faz | Autenticação |
|------|-----------|--------------|
| Secretaria | matricula, transfere, cadastra turma e disciplina | sessão |
| Professor | lança nota, registra chamada, fecha bimestre da sua turma | sessão |
| Responsável | vê boletim (tela), frequência e mural de comunicados | sessão |
| Admin da rede | cria unidades, convida usuários, define ano letivo | sessão |

Nenhuma superfície pública sem login. Nenhuma API para terceiros. Nenhum aplicativo móvel.
HTML renderizado no servidor, sem SPA e sem API pública para versionar — exatamente o que o catálogo
de componentes recomenda para o canal Cliente Web no dia 1.

---

## 4. As 22 invariantes, mapeadas

| # | Invariante | Onde vive no Estágio 01 | Custo hoje |
|---|-----------|-------------------------|------------|
| **I1** | Monólito modular | 4 pastas de domínio + `.dependency-cruiser.js` com as 3 regras da Seção 1 | 1 arquivo de config |
| **I2** | Aplicação stateless | `shared/http/sessao.ts`: cookie assinado (`HttpOnly`, `Secure`, `SameSite=Lax`). Zero variável de módulo com estado, zero escrita em disco | grátis |
| **I3** | Efeitos atrás de interface | `shared/ports/` contém `Clock` e `IdGenerator`. **Não há efeito externo no E01** — o que se estabelece é a regra 2 do dependency-cruiser: domínio não importa SDK. Quando `Mailer` entrar no E04, ele nasce em `ports/` porque é o único lugar onde cabe | grátis |
| **I4** | Idempotência em entrada externa | O navegador **é** entrada externa: responsável com 4G ruim envia o formulário duas vezes. Tabela `requisicao_idempotente(chave, rota, usuario_id, resposta_hash, criado_em)` + middleware nas rotas de escrita. No E02 o webhook do gateway usa a mesma tabela sem mudança | 1 tabela + 1 middleware |
| **I5** | Banco é a única fonte da verdade | Trivial hoje (não há cópia). A regra que se firma: nenhum caso de uso decide a partir de valor calculado e guardado — situação da matrícula, média e frequência são **consultadas**, nunca mantidas em coluna denormalizada | grátis |
| **I6** | Migrações versionadas | `migrations/0001_*.sql` numeradas, aplicadas por comando em toda ordem. README fixa a janela de compatibilidade: **nunca remover coluna que a versão anterior ainda lê** — adiciona, migra, para de escrever, depois remove | grátis |
| **I7** | Backup com restauração testada | `scripts/restore-test.sh` restaura o dump em banco descartável e roda `SELECT count(*) FROM matricula WHERE situacao='ativa'` comparando com o esperado. Rodado **toda sexta**, manualmente, com o resultado anotado | 1 script + 10 min/semana |
| **I8** | Integridade no banco | Todas as FK, UNIQUE e CHECK da Seção 2, incluindo o índice único parcial `matricula_ativa_unica_por_ano` | grátis |
| **I9** | Chave do objeto, não URL | Não há arquivo no E01. Decisão registrada em ADR: quando o storage entrar (E03), a coluna se chama `documento.chave_objeto`, jamais `documento.url` | 1 ADR |
| **I10** | Assets versionados no nome | Build do front gera `app.<hash>.css`; templates usam o helper `asset('app.css')`. Sem CDN ainda, mas quando ela entrar no E06 não haverá purga manual | 1 plugin de build |
| **I11** | Nunca cachear resposta autenticada sem separar por usuário | Não há cache — mas há cabeçalho. Middleware global: toda rota autenticada responde `Cache-Control: private, no-store`. **A invariante mais barata e a que evita o erro mais grave da lista** | 3 linhas |
| **I12** | `X-Forwarded-For` lido corretamente | Função única `ipDoCliente(req)` em `shared/http/ip.ts`, com a lista de proxies confiáveis vinda de env (**vazia** no E01). Quando CDN e balanceador entrarem, muda a variável, não o código | 1 função |
| **I13** | `/health` que verifica dependências | `/health` executa `SELECT 1` com timeout de 2 s e responde 503 se falhar. `/health/live` só confirma o processo. `SIGTERM` para de aceitar conexões, termina as em curso e só então encerra | 1 arquivo |
| **I14** | Timeout da aplicação menor que o da camada da frente | `HTTP_TIMEOUT_MS=25000` por env, documentado: "sempre menor que o timeout de quem estiver na frente". Sem balanceador ainda, mas o número já é explícito | 1 variável |
| **I15** | Roteamento leitura/escrita explícito | `db.leitura()` e `db.escrita()` em `shared/db/`. Ambos devolvem o primário no E01. Cada consulta escolhe conscientemente. No E10, muda uma linha em `leitura()` | 1 função a mais |
| **I16** | Correlation ID gerado na borda | `shared/http/correlacao.ts` gera na entrada, guarda em contexto de requisição e injeta em todo log. Sem observabilidade ainda — mas quando ela entrar no E11, o formato do rastro já existe | 1 middleware |
| **I17** | Log estruturado, sem dado pessoal nem segredo | Logger JSON com lista de campos redigidos. **Grava `aluno_id`, nunca `aluno_nome`; nunca e-mail de responsável; nunca nota.** Dado de menor de idade tem tratamento mais rigoroso — a observabilidade do E11 não pode criar o problema de conformidade | 1 módulo |
| **I18** | Config por env, segredos fora do repositório | `shared/config` valida o schema no boot e **falha rápido** se faltar variável. `.env.example` versionado, `.env` no `.gitignore` | 1 módulo |
| **I19** | Artefato imutável e versionado | `Dockerfile` desde o dia 1; a mesma imagem roda em dev e produção; tag = hash do commit. Sem esteira ainda (E12), mas nunca haverá "funciona na minha máquina" | 1 arquivo |
| **I20** | Lock distribuído em job periódico | Único job do E01 é o expurgo de sessões expiradas. Já usa `pg_try_advisory_lock` em `shared/jobs/lock.ts`. Com uma instância é redundante; com seis (E08) é o que evita rodar o job seis vezes | 1 função |
| **I21** | Eventos de domínio via outbox | **Não entra no E01** — o curso posiciona a outbox no E05, junto com a fila. O que se garante hoje é que todo caso de uso que muda estado tem **um único ponto de commit** (`shared/db/unidadeDeTrabalho.ts`). Acrescentar o `INSERT` na outbox no E05 será uma linha nesse ponto, não uma refatoração em 40 lugares | grátis |
| **I22** | Validação de verdade sempre no servidor | Todo caso de uso em `*/aplicacao/` valida a entrada com schema antes de tocar no domínio. O HTML usa `required` e `type=number` **apenas** para retorno rápido ao usuário | grátis |

---

## 5. As dores que o Estágio 01 planta de propósito

Um bom Estágio 01 não é só o que funciona — é o que **prepara a próxima dor para ser medível**.
Estas quatro decisões existem para que os estágios 02 a 05 aconteçam por evidência, e não por
calendário da disciplina:

| Decisão do E01 | Dor que ela torna mensurável | Estágio |
|----------------|------------------------------|---------|
| Cobrança por transferência bancária, `rede.status` manual | Admin gasta 3 h/mês conciliando planilha; 4 redes inadimplentes ficaram ativas por engano | 02 |
| Documento de matrícula continua em papel | Secretaria pede anexo digital; a primeira tentativa grava em disco local e some no deploy | 03 |
| `comunicado_destinatario.lido_em` | Taxa de leitura do mural fica em 12 % — o e-mail deixa de ser opinião | 04 |
| Fechamento de bimestre síncrono | Fechar uma turma de 35 alunos leva 6 s; fechar as 40 turmas da rede leva 4 min e o navegador desiste | 05 |

Peça aos alunos que **anotem os quatro números** ao longo do semestre. É a diferença entre seguir um
roteiro e reproduzir o método.

---

## 6. O primeiro backlog (ordem sugerida)

1. `identidade`: rede, unidade, usuário, papel, login com sessão em cookie assinado
2. `shared`: config validada no boot, logger estruturado, correlation ID, `/health`, `Cache-Control`
3. Migrações 0001–0003 com todas as FK, UNIQUE e CHECK
4. `academico`: aluno, responsável, turma, disciplina, matrícula
5. `avaliacao`: lançamento de nota e chamada, com idempotência no envio do formulário
6. `avaliacao`: fechamento de bimestre e boletim em tela
7. `comunicacao`: publicar comunicado, mural do responsável, marcar como lido
8. `scripts/restore-test.sh` + primeira restauração ensaiada **antes** de ter cliente real
9. `.dependency-cruiser.js` com as 3 regras, rodando em `npm run check`

O item 8 costuma ser empurrado para o fim e nunca acontece. "Backup não verificado não é backup" é a
única invariante do curso escrita como frase de efeito — provavelmente por isso.

---

## 7. Equivalência entre pilhas

A estrutura acima não depende da linguagem. Trocam-se as ferramentas, não as decisões.

| Conceito | TypeScript/Node | Django | Rails | Spring Boot | .NET |
|----------|-----------------|--------|-------|-------------|------|
| Módulo de domínio | pasta + `index.ts` | app Django | engine / namespace | package | project / namespace |
| Regra I1 verificada | dependency-cruiser | import-linter | packwerk | ArchUnit | NetArchTest |
| Migrações (I6) | node-pg-migrate / Prisma Migrate | migrations | Active Record migrations | Flyway / Liquibase | EF Core Migrations |
| Sessão em cookie (I2) | cookie assinado | signed cookie session | `cookie_store` | Spring Session | Cookie Authentication |
| Config validada (I18) | zod no boot | django-environ | dotenv + validação | `@ConfigurationProperties` | `IOptions` + validação |
| Log estruturado (I17) | pino | structlog | Semantic Logger | Logback JSON | Serilog |
| Advisory lock (I20) | `pg_try_advisory_lock` | idem | idem | ShedLock | idem |
| Health (I13) | rota própria | django-health-check | rota própria | Actuator | Health Checks |

---

## 8. O que verificar antes de declarar o Estágio 01 pronto

- [ ] `npm run check` falha se um módulo importar arquivo interno de outro
- [ ] Nenhum arquivo é escrito em disco pela aplicação
- [ ] Derrubar o container e subir outro não perde nada além de sessões
- [ ] Toda tabela de negócio tem `rede_id` e FK declarada
- [ ] Enviar o mesmo formulário duas vezes cria **um** registro
- [ ] Rota autenticada responde `Cache-Control: private, no-store`
- [ ] `/health` responde 503 com o banco parado
- [ ] Falta uma variável de ambiente → o processo **não sobe**
- [ ] O dump foi restaurado em outro banco e a contagem bateu
- [ ] Nenhum log contém nome, e-mail, CPF ou nota
- [ ] Os quatro números da Seção 5 estão anotados

Onze itens. Nenhum deles adiciona componente — todos tornam os treze estágios seguintes uma adição.
