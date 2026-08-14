# Frontend em React e backend como API

> Spec de projeto. O plano de implementação correspondente é
> [`docs/MIGRACAO_REACT.md`](../../MIGRACAO_REACT.md).

O EscolaViva troca o HTML renderizado no servidor por uma aplicação React servida como arquivo
estático, e o Hono deixa de devolver página para devolver JSON. Nenhuma regra de negócio muda:
os quatro módulos de domínio, as consultas, o `Resultado<T>` e as 22 invariantes continuam onde
estão. O que muda é a camada de entrega — e a conta que ela passa a cobrar.

## Problema

A camada web de hoje tem 2.710 linhas de TypeScript em `src/web/`, mais 45 templates Eta, servindo
59 handlers — 54 nos routers de papel, 3 de entrada em `app.ts` e 2 de saúde. Ela funciona, é
rápida e é a decisão que o Estágio 01 defende no material didático.

O pedido é outro: o produto passa a ser uma SPA em React 19, com o front publicado no Cloudflare
em algum momento futuro. Isso implica três coisas que hoje não existem — uma API versionada,
um segundo artefato de build e uma origem separada para o front.

Aceitar isso é aceitar o custo que `docs/EVOLUCAO_SAAS.md:435` já descrevia: *"SPA separada dobra
deploys e obriga a criar API pública versionada"*. Este documento é o registro de que o custo foi
lido antes de ser pago, e de como ele foi mantido no menor valor possível.

## Decisão

**Substituição total.** Eta, `src/web/templates/`, `src/web/render.ts` e `scripts/build-assets.ts`
saem do repositório. O Hono passa a servir `/api/v1/*` em JSON e a entregar o `dist/` do Vite como
estático. O material didático é atualizado para descrever a SPA como decisão consciente, com o
custo declarado.

Três decisões de menor porte governam o resto do documento:

1. **As URLs do navegador não mudam.** `/secretaria/alunos/:id` continua sendo
   `/secretaria/alunos/:id` — agora resolvido pelo React Router em vez do Hono. Marcadores de
   página sobrevivem, as capturas de tela do material continuam válidas e a barra de endereço
   continua contando a mesma história. A API mora sob `/api/v1`, que nunca colidiu com nada.
2. **A sessão continua sendo cookie assinado resolvido no banco.** Nenhum token viaja para o
   `localStorage`. I2 fica intacta e o front não ganha o problema de guardar credencial.
3. **A origem do front é configuração, não código.** O front é estático puro desde o primeiro
   commit e nunca importa nada do servidor em tempo de execução. Publicar no Cloudflare Pages
   será trocar três variáveis de ambiente.

## Escopo

**Dentro**

- Reorganização em workspaces: `apps/api` e `apps/web`.
- API JSON `/api/v1` cobrindo todas as telas dos quatro papéis.
- SPA React 19 com as mesmas telas e as mesmas URLs.
- Migração de Zod 3 para Zod 4 no backend.
- Reescrita da suíte `testes/web/` para JSON, testes de unidade no front e E2E com Playwright.
- Atualização de `ESCOLAVIVA_ESTAGIO_01.md`, `EVOLUCAO_SAAS.md`, README, dois ADRs novos e os
  diagramas de `docs/archify/` afetados.

**Fora**

- Qualquer componente de estágio posterior: fila, cache, CDN contratada, réplica, observabilidade,
  esteira, envio de e-mail. A preparação para o Cloudflare é uma variável vazia, não um contrato.
- Renderização no servidor do React (SSR/SSG). O front é estático.
- Mudança de regra de negócio, de schema do banco ou de migração.
- Redesenho visual. O tema Mantine espelha o `app.css` atual.
- Aplicativo móvel e API para terceiros. `/api/v1` é interna: existe para esta SPA e é versionada
  porque a SPA e o servidor passam a ter ciclos de vida separados, não porque alguém de fora vai
  consumi-la.

---

## 1. Estrutura do repositório

```
escolaviva/
├─ package.json                 workspaces: ["apps/*"]; scripts agregadores
├─ bunfig.toml                  preload de teste, aponta para apps/api
├─ docker-compose.yml           inalterado
├─ Dockerfile                   passa a construir o front e copiar o dist
├─ migrations/                  inalterado
├─ scripts/                     migrate, seed, backup, restore-test (build-assets sai)
├─ docs/
├─ e2e/                         Playwright: as 4 jornadas
├─ apps/
│  ├─ api/
│  │  ├─ package.json
│  │  ├─ .dependency-cruiser.js
│  │  ├─ src/
│  │  │  ├─ identidade/  academico/  avaliacao/  comunicacao/   inalterados
│  │  │  ├─ shared/                                              quase inalterado
│  │  │  ├─ http/            ← o que era src/web/
│  │  │  │  ├─ app.ts
│  │  │  │  ├─ health.ts
│  │  │  │  ├─ paginacao.ts
│  │  │  │  ├─ estatico.ts    serve o dist do Vite + fallback SPA
│  │  │  │  ├─ contratos/     tipos de resposta e enumerações (sem dependência)
│  │  │  │  ├─ esquemas/      Zod de corpo de requisição, por recurso
│  │  │  │  ├─ apresentadores/  domínio → JSON de resposta
│  │  │  │  └─ rotas/         sessao, conta, rede, secretaria, professor,
│  │  │  │                    responsavel, comunicados, selecoes
│  │  │  └─ main.ts
│  │  └─ testes/
│  └─ web/
│     ├─ package.json
│     ├─ vite.config.ts
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx
│        ├─ app/              rotas, provedores, layout, limites de erro
│        ├─ funcionalidades/  sessao rede secretaria professor responsavel comunicados conta
│        └─ compartilhado/    api/ ui/ formato/ tema/
```

### 1.1 Por que workspaces

O front precisa de um `package.json` próprio — as dependências dele (React, Mantine, Vite) não
podem entrar na imagem do servidor. Workspaces do Bun dão isso sem um segundo repositório: um
`bun install` na raiz, um `bun.lock` só, e `bun run verificar` continua sendo um comando na raiz
que roda as duas verificações.

### 1.2 A preparação para o Cloudflare

Três variáveis, todas **vazias por padrão**, no mesmo espírito de `PROXIES_CONFIAVEIS` (I12), que
já nasceu vazia esperando o balanceador:

| Variável | Onde | Vazia (hoje) | Preenchida (Cloudflare Pages) |
|---|---|---|---|
| `VITE_API_URL` | build do front | `''` → mesma origem, caminho relativo | `https://api.escolaviva.com.br` |
| `ORIGENS_PERMITIDAS` | boot da API | sem CORS, nenhum cabeçalho emitido | `https://app.escolaviva.com.br` |
| `COOKIE_DOMINIO` | boot da API | sem atributo `Domain` → cookie host-only | `.escolaviva.com.br` |

`app.escolaviva.com.br` e `api.escolaviva.com.br` são **origens diferentes, mesmo site**: o
navegador exige CORS, mas `SameSite=Lax` continua valendo e o cookie continua viajando. É por isso
que a decisão de manter o cookie assinado não vira dívida no dia da CDN — se a sessão fosse token,
o problema seria outro (guardar credencial no cliente), e não sumiria com configuração.

**Regra que o front precisa obedecer para isso funcionar:** nenhuma rota React pode depender de
comportamento do servidor. Nada de caminho absoluto montado no servidor, nada de HTML injetado, nada
de leitura de cabeçalho na primeira carga. O `index.html` gerado pelo Vite tem de funcionar servido
por qualquer coisa que devolva arquivo.

Isso vira **I23 — a origem do front e a origem da API são configuração, não código**, registrada
como invariante nova na tabela do estágio.

### 1.3 Como o servidor entrega o front hoje

`apps/api/src/http/estatico.ts` substitui o handler de `/publico/*`:

- `GET /assets/*` → arquivo do `dist/assets/`, com `Cache-Control: public, max-age=31536000,
  immutable`. O Vite já põe o hash do conteúdo no nome, o que **preserva I10** — a invariante
  troca de dono, não desaparece.
- `GET` de qualquer caminho que não comece por `/api`, `/health` ou `/assets` → `dist/index.html`
  com `Cache-Control: no-store`. É o fallback que faz `/secretaria/alunos/xyz` funcionar quando
  a pessoa aperta F5. O `index.html` **nunca** vai para cache: é ele que aponta para o bundle
  novo depois de um deploy.
- Nome de arquivo continua validado contra a mesma expressão de hoje; nada fora do `dist/` é
  servido.

---

## 2. Contrato HTTP

### 2.1 Formato

Prefixo `/api/v1`. Todo corpo de requisição e de resposta é `application/json; charset=utf-8`.

**Sucesso** devolve o recurso, sem envelope:

```json
{ "id": "01H...", "nome": "Ana Souza", "dataNascimento": "2015-03-11" }
```

**Lista paginada** devolve o `Pagina<T>` que `src/shared/paginacao/` já produz — nenhum tipo novo:

```json
{ "itens": [], "pagina": 2, "paginas": 7, "total": 134, "tamanho": 20 }
```

**Erro** devolve os erros da aplicação e o código de correlação:

```json
{ "erros": [ { "campo": "cpf", "codigo": "cpf_invalido", "mensagem": "CPF inválido." } ],
  "correlacaoId": "01H..." }
```

`ErroDeAplicacao` já é `{ campo?, codigo, mensagem }` em `src/shared/resultado.ts`. Isso é
deliberado e é o maior ganho de reaproveitamento do projeto: o array cai direto no `setError` do
React Hook Form, campo por campo, **sem nenhum tradutor entre as duas pontas**. Erro sem `campo`
vira aviso geral do formulário, exatamente como o `_mensagens.eta` faz hoje.

Os status continuam vindo do mapa de `shared/http/erros.ts` — 400, 401, 403, 404, 422, 500 — com
os mesmos significados. O que muda é só o corpo: `middlewareErros` para de chamar
`paginaDeErro()` e passa a serializar JSON. `registrarRenderizadorDeErro` e todo o mecanismo de
injeção de HTML em `shared/` **são removidos**; `shared/http/` fica menor do que era.

### 2.2 Validação de entrada — onde cada uma mora

Duas camadas, com responsabilidades que não se sobrepõem:

| Camada | Onde | Valida | Não valida |
|---|---|---|---|
| Borda HTTP | `apps/api/src/http/esquemas/` | **forma**: campo presente, tipo certo, id com formato de identificador | regra de negócio |
| Aplicação | `*/aplicacao/` | **regra**: unicidade, faixa, coerência, situação | — |

A borda existe porque JSON pode chegar com qualquer coisa; ela responde 400 e usa o
`errosDeSchema()` que já existe para produzir `ErroDeAplicacao[]`. A verdade continua na aplicação,
que responde 422 — **I22 sobrevive intacta**. O Zod do React é uma terceira camada, e é a única
das três que existe apenas para conforto: ela não decide nada.

Um efeito colateral bom: conversões que hoje moram nas rotas somem. `rede.ts` tem uma expressão
regular de quatro dígitos e uma conversão manual de `ano` para número porque o formulário só sabe
mandar texto; com JSON, `ano` chega número e a checagem vira uma linha de schema.

### 2.3 Idempotência (I4)

A chave sai do corpo do formulário e vai para o cabeçalho:

```
Idempotency-Key: 3f2a91c0-...
```

- Exigida em **POST**. `PUT` e `DELETE` são idempotentes pelo próprio método e não pagam esse
  pedágio — exigir chave neles seria aluguel sem dor.
- A tabela `requisicao_idempotente` **não muda**. `resposta_local` passa a guardar o caminho
  canônico do recurso criado (o que hoje é o `Location` do 303) e `resposta_hash` continua sendo
  o SHA-256 dele.
- **Repetição** responde `200` com `{ "repetida": true, "local": "/api/v1/secretaria/alunos/01H..." }`.
  O cliente segue para o recurso. Nenhum corpo de resposta é gravado no banco — o que impediria,
  por exemplo, que a senha provisória de um convite ficasse em repouso numa tabela (I17).
- Falha e recusa por validação continuam **liberando a chave**, como hoje.
- O corpo continua sendo lido uma única vez pelo middleware e deixado em `c.get('corpo')` —
  agora como objeto JSON, não `CorpoDeFormulario`. O tipo `CorpoDeFormulario` desaparece.

### 2.4 CSRF — o problema que a SPA cria

Cookie automático mais escrita por JSON abre falsificação de requisição entre sites, que o
formulário com PRG não tinha. A defesa é a mais barata que resolve, sem tabela e sem token:

- Toda escrita precisa de `Content-Type: application/json`. Formulário HTML não consegue emitir
  esse tipo.
- Toda escrita precisa do cabeçalho `X-Requerido-Por: escolaviva`. Cabeçalho fora da lista
  segura obriga o navegador a fazer preflight, e o preflight só passa para origem permitida.
- Com `ORIGENS_PERMITIDAS` vazia (hoje, mesma origem), não há preflight nem CORS: a exigência do
  cabeçalho sozinha já barra o envio cruzado, porque nenhum site externo consegue adicioná-lo.

Isso é registrado como o **primeiro custo concreto da decisão de SPA**: uma defesa que o desenho
anterior não precisava ter.

### 2.5 Cache (I11)

`middlewareCacheControl` continua, com o prefixo trocado:

| Caminho | Cabeçalho |
|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` |
| `/api/*` com sessão | `private, no-store` + `Vary: Cookie` |
| `/api/*` sem sessão | `no-store` |
| `index.html` (fallback) | `no-store` |

Com CORS ativo, `Vary: Origin` é acrescentado. O boletim de um aluno servido do cache de um proxy
para o responsável de outro continua sendo o erro que estas linhas impedem.

### 2.6 CORS

Middleware novo, `apps/api/src/http/cors.ts`, ativo **apenas** quando `ORIGENS_PERMITIDAS` não
está vazia. Ecoa a origem quando ela está na lista (nunca `*`, que é incompatível com credenciais),
responde ao preflight, e declara `Access-Control-Allow-Credentials: true`,
`Access-Control-Allow-Headers: Content-Type, Idempotency-Key, X-Requerido-Por`.

---

## 3. Mapa de endpoints

Os 54 handlers dos routers viram 50 endpoints, e a conta não é a que se espera: 12 `GET` de tela de
formulário (`/novo`, `/nova`, `/matricular`, `/transferir`) **somem** — o React já tem o
formulário —, mas 8 nascem para servir as opções de preenchimento que hoje viajam dentro daquelas
telas. Os 3 handlers de entrada de `app.ts` viram roteamento do cliente; os 2 de saúde ficam onde
estão.

A distribuição por família: 4 de sessão e conta, 6 de seleções, 7 de rede, 17 de secretaria,
7 de professor, 6 de responsável, 3 de comunicados.

### 3.1 Sessão e conta

| Método | Caminho | Substitui | Corpo → Resposta |
|---|---|---|---|
| `POST` | `/api/v1/sessao` | `POST /login` | `{redeSlug, identificador, senha}` → `201 {usuario}` + `Set-Cookie` |
| `GET` | `/api/v1/sessao` | *novo* | → `200 {usuario}` \| `401` |
| `DELETE` | `/api/v1/sessao` | `POST /logout` | → `204` |
| `PUT` | `/api/v1/conta/senha` | `POST /conta/senha` | `{senhaAtual, senhaNova, senhaConfirmacao}` → `204` |

`GET /api/v1/sessao` é o que hidrata a aplicação a cada carga e detecta expiração sem recarregar
a página. Devolve o `UsuarioDaSessao` inteiro, `papeis` inclusive.

`GET /painel`, que hoje redireciona pela precedência de papel, **deixa de existir no servidor**: a
lista de precedência (`admin_rede` > `secretaria` > `professor` > `responsavel`) é do front, que
decide para onde levar quem entrou. É apresentação, e sempre foi.

### 3.2 Seleções — as opções dos formulários

Família própria, `/api/v1/selecoes/*`, para as listas **não paginadas** que alimentam campos de
escolha. Elas existem hoje espalhadas dentro dos `GET /novo`; concentrá-las evita que cada
formulário invente seu jeito de pedir a mesma coisa, e deixa o TanStack Query cacheá-las com
tempo de vida longo — mudam pouco.

| Método | Caminho | Devolve | Alcance |
|---|---|---|---|
| `GET` | `/api/v1/selecoes/unidades` | unidades do alcance de quem pergunta | qualquer papel com alcance |
| `GET` | `/api/v1/selecoes/anos-letivos` | anos letivos da rede | rede, secretaria |
| `GET` | `/api/v1/selecoes/responsaveis` | responsáveis da rede | rede, secretaria |
| `GET` | `/api/v1/selecoes/turmas` | turmas do alcance, com ano e unidade | secretaria |
| `GET` | `/api/v1/selecoes/disciplinas` | disciplinas da rede | secretaria |
| `GET` | `/api/v1/selecoes/professores?unidadeId=` | quem tem papel de professor na unidade | secretaria |

Turnos e papéis **não** viram endpoint: são listas fechadas do domínio e vivem em
`apps/api/src/http/contratos/enumeracoes.ts`, importadas pelo front. Os rótulos de tela
("Matutino", "Administração da rede") são do front — hoje eles moram nas rotas, e é apresentação
que nunca deveria ter estado lá.

### 3.3 Rede — `admin_rede`

| Método | Caminho | Substitui | Notas |
|---|---|---|---|
| `GET` | `/api/v1/rede/painel` | `GET /rede` | contagens + ano em vigor |
| `GET` | `/api/v1/rede/unidades?p=` | `GET /rede/unidades` | `Pagina<Unidade>` |
| `POST` | `/api/v1/rede/unidades` | `POST /rede/unidades` | `{nome, codigoInep}` → `201 {id}` |
| `GET` | `/api/v1/rede/usuarios?p=` | `GET /rede/usuarios` | `Pagina<Usuario>` |
| `POST` | `/api/v1/rede/usuarios` | `POST /rede/usuarios` | → `201 {usuarioId, senhaProvisoria}` |
| `GET` | `/api/v1/rede/anos-letivos?p=` | `GET /rede/anos-letivos` | |
| `POST` | `/api/v1/rede/anos-letivos` | `POST /rede/anos-letivos` | `{ano: number, dataInicio, dataFim}` |

**O cookie `ev_convite` desaparece.** Ele existe hoje só porque a senha provisória precisava
atravessar um redirecionamento sem entrar na URL nem na tabela de idempotência. Com JSON ela volta
no corpo do `201`, é exibida uma vez e não é guardada em lugar nenhum — nem em cookie, nem em
banco, nem em log. `guardarConvite`, `retirarConvite`, `COOKIE_DO_CONVITE` e `VALIDADE_DO_CONVITE_S`
saem junto. É a segunda simplificação real que a mudança traz.

### 3.4 Secretaria

| Método | Caminho | Substitui | Notas |
|---|---|---|---|
| `GET` | `/api/v1/secretaria/painel?p=` | `GET /secretaria` | unidades do papel + contagens |
| `GET` | `/api/v1/secretaria/alunos?q=&p=` | `GET /secretaria/alunos` | sem `q`, página vazia |
| `POST` | `/api/v1/secretaria/alunos` | `POST /secretaria/alunos` | `{nome, dataNascimento}` |
| `GET` | `/api/v1/secretaria/alunos/:id?pResponsaveis=&pMatriculas=` | `GET /secretaria/alunos/:id` | ficha |
| `GET` | `/api/v1/secretaria/alunos/:id/responsaveis-disponiveis` | dentro de `/responsaveis/novo` | responsáveis menos os já vinculados |
| `POST` | `/api/v1/secretaria/alunos/:id/responsaveis` | idem | `{responsavelId, parentesco, financeiro}` |
| `POST` | `/api/v1/secretaria/matriculas` | `POST /secretaria/matriculas` | `{alunoId, turmaId, anoLetivoId, dataMatricula}` |
| `GET` | `/api/v1/secretaria/matriculas/:id` | dentro de `/transferir` | matrícula ativa + aluno |
| `POST` | `/api/v1/secretaria/matriculas/:id/transferencia` | `POST .../transferir` | `{turmaDestinoId, data}` |
| `GET` | `/api/v1/secretaria/responsaveis?p=` | `GET /secretaria/responsaveis` | |
| `POST` | `/api/v1/secretaria/responsaveis` | idem | `{nome, email, telefone, cpf}` |
| `GET` | `/api/v1/secretaria/turmas?unidade=&ano=&p=` | `GET /secretaria/turmas` | filtros continuam na query |
| `POST` | `/api/v1/secretaria/turmas` | idem | `{nome, serie, turno, unidadeId, anoLetivoId}` |
| `GET` | `/api/v1/secretaria/turmas/:id?pDisciplinas=&pMatriculas=` | `GET /secretaria/turmas/:id` | |
| `POST` | `/api/v1/secretaria/turmas/:id/disciplinas` | idem | `{disciplinaId, professorUsuarioId}` |
| `GET` | `/api/v1/secretaria/disciplinas?p=` | `GET /secretaria/disciplinas` | |
| `POST` | `/api/v1/secretaria/disciplinas` | idem | `{nome}` |

As regras de alcance não mudam nem afrouxam. Aluno, turma ou matrícula fora das unidades onde a
pessoa tem o papel continuam respondendo **404**, nunca 403 — a existência de um aluno já é
informação, e isso vale igual em JSON.

### 3.5 Professor

| Método | Caminho | Substitui | Notas |
|---|---|---|---|
| `GET` | `/api/v1/professor/turmas` | `GET /professor` | turmas agrupadas, com disciplinas |
| `GET` | `/api/v1/professor/disciplinas/:id/notas?bimestre=` | idem | linhas + estado de fechamento |
| `PUT` | `/api/v1/professor/disciplinas/:id/notas` | `POST` | `{bimestre, notas:[{matriculaId, valor}]}` → `{gravadas}` |
| `GET` | `/api/v1/professor/turmas/:id/chamada?data=` | idem | linhas do dia |
| `PUT` | `/api/v1/professor/turmas/:id/chamada` | `POST` | `{data, linhas:[{matriculaId, presente, justificativa}]}` |
| `GET` | `/api/v1/professor/turmas/:id/fechamento` | idem | estado dos 4 bimestres |
| `POST` | `/api/v1/professor/turmas/:id/fechamento` | idem | `{bimestre}` |

Notas e chamada viram `PUT` porque é o que elas de fato são: substituição do estado de um bimestre
ou de um dia, não criação de recurso. Dois envios idênticos produzem o mesmo estado — o método já
carrega a garantia que a chave de idempotência daria.

`nota_<uuid>` e `presenca_<uuid>` deixam de existir. O corpo passa a ser um array de objetos, o
que elimina a montagem e a leitura de nomes de campo por concatenação — três funções em
`professor.ts` somem.

O fechamento continua **síncrono**, com o cliente esperando. É a dor plantada que justifica o
Estágio 05, e trocá-la por indicador de progresso a esconderia. O front mostra um botão desabilitado
com o tempo correndo, e nada mais.

### 3.6 Responsável

| Método | Caminho | Substitui | Notas |
|---|---|---|---|
| `GET` | `/api/v1/responsavel/painel?p=` | `GET /responsavel` | matrículas + não lidos + contagens |
| `GET` | `/api/v1/responsavel/matriculas/:id/boletim` | idem | |
| `GET` | `/api/v1/responsavel/matriculas/:id/frequencia?p=` | idem | dias + apuração |
| `GET` | `/api/v1/responsavel/mural?pNaoLidos=&pLidos=` | idem | duas páginas independentes |
| `GET` | `/api/v1/responsavel/mural/:comunicadoId` | idem | **não marca leitura** |
| `POST` | `/api/v1/responsavel/mural/:comunicadoId/leitura` | `POST .../lido` | → `204` |

Abrir o comunicado continua não marcando leitura. Com SPA a tentação é maior — um `useEffect` no
carregamento resolveria "sozinho" —, e é exatamente isso que não pode acontecer: a taxa de 12 %
é a medição que justifica o Estágio 04, e leitura inventada por navegação a destrói. Fica registrado
aqui e vira um teste E2E explícito.

### 3.7 Comunicados — `secretaria` e `admin_rede`

| Método | Caminho | Substitui | Notas |
|---|---|---|---|
| `GET` | `/api/v1/comunicados?unidadeId=&p=` | `GET /comunicados` | lista + resumo com a taxa |
| `GET` | `/api/v1/comunicados/destinatarios?unidadeId=` | dentro de `GET /comunicados/novo` | responsáveis da unidade |
| `POST` | `/api/v1/comunicados` | `POST /comunicados/novo` | `{unidadeId, titulo, corpo, alcance, responsaveis[]}` |

O resumo continua medindo o recorte inteiro, e não as linhas da página — uma taxa que se
recalculasse a cada clique em "próxima" responderia outra pergunta.

A conferência dos destinatários marcados contra os responsáveis da unidade continua no servidor.
Que o React só ofereça os certos não é garantia de nada: a lista que volta é entrada externa.

### 3.8 Saúde

`/health` e `/health/live` ficam como estão, fora de `/api/v1`. Eles respondem a um balanceador,
não à SPA, e versioná-los seria dar a eles um cliente que não têm.

---

## 4. O frontend

### 4.1 Pilha e versões

React 19 · TypeScript 5 · Vite 7 · React Router 7 · Zod 4 · Zustand 5 · Mantine 8 ·
React Hook Form 7 · TanStack Query 5 · Axios 1.

As versões maiores acima são o alvo; a versão exata é a que `bun add <pacote>@latest` resolver no
dia da instalação, e ela é registrada no `bun.lock`. O plano não fixa números de correção.

### 4.2 Quem manda em quê

Este é o ponto onde uma pilha assim costuma virar sopa: três bibliotecas sabem guardar estado, e
sem fronteira declarada cada tela escolhe uma diferente. A fronteira é:

| Camada | Dona de | Proibida de guardar |
|---|---|---|
| **TanStack Query** | todo estado que veio do servidor: listas, fichas, boletins, seleções | — |
| **Zustand** | estado de cliente que sobrevive à navegação: unidade e ano selecionados, avisos, preferências | qualquer coisa que a API devolveu |
| **URL / React Router** | página, busca, filtros de unidade e ano | credencial, estado transitório de formulário |
| **React Hook Form + Zod** | valores e erros do formulário aberto | dado de outra tela |

A regra do meio é a que importa: **nenhuma lista, ficha ou boletim entra no Zustand**. Duplicar
resposta de servidor em store de cliente é como se produz tela desatualizada que ninguém sabe
invalidar.

A quarta linha preserva uma conquista do desenho atual, descrita em `src/web/paginacao.ts`: o
estado da página mora na query, não em sessão nem em cookie. A terceira página da lista de
responsáveis continua sendo um endereço copiável, e o botão "voltar" continua funcionando sem que
ninguém o programe.

### 4.3 Cliente HTTP

`compartilhado/api/cliente.ts` — uma instância de Axios, e só uma:

- `baseURL` de `import.meta.env.VITE_API_URL` + `/api/v1`; vazio significa mesma origem.
- `withCredentials: true`.
- Interceptor de requisição: acrescenta `X-Requerido-Por` em toda escrita e
  `Idempotency-Key: crypto.randomUUID()` em todo `POST`.
- Interceptor de resposta: converte `{erros, correlacaoId}` em um `ErroDaApi` tipado, com
  `porCampo(): Record<string,string>` pronto para o `setError`. `401` limpa o cache do Query e
  leva para `/login`.
- Nenhum outro arquivo do front chama `fetch` ou monta URL de API à mão.

### 4.4 Estrutura por funcionalidade

Cada pasta de `funcionalidades/` é auto-contida — consultas, mutações, esquemas, telas e
componentes daquele assunto:

```
funcionalidades/secretaria/alunos/
├─ consultas.ts      useAlunos, useFichaDoAluno            (TanStack Query)
├─ mutacoes.ts       useCadastrarAluno, useVincularResponsavel
├─ esquemas.ts       Zod dos formulários                    (conforto, não verdade)
├─ ListaDeAlunos.tsx
├─ FichaDoAluno.tsx
└─ FormularioDeAluno.tsx
```

Arquivo com mais de 400 linhas é sinal de que a funcionalidade precisa de subpasta. O limite duro
é 800, igual ao do resto do repositório.

### 4.5 Rotas e guardas

O React Router recebe **as mesmas URLs de hoje**, incluindo `/login`. Cada grupo de papel é um
`lazy()` próprio, o que dá um bloco por papel no bundle: quem entra como responsável não baixa a
secretaria.

A guarda de rota lê o usuário do `GET /api/v1/sessao` e aplica a mesma regra do
`exigirPapel` do servidor. Ela é **conveniência de navegação, não segurança** — quem forçar a URL
recebe 404 ou 403 da API do mesmo jeito. Isso fica escrito no código, para que ninguém confunda a
guarda do cliente com controle de acesso.

### 4.6 Formatação

`formatarData`, `formatarDataHora`, `formatarNota`, `formatarPercentual`, `formatarTaxa` e
`formatarCpf` são portados de `src/web/render.ts` para `compartilhado/formato/`, com os mesmos
testes. Duas regras vêm junto e não podem ser perdidas na tradução:

- Nota e média são **truncadas**, nunca arredondadas — arredondar 5,99 para 6,0 mostraria
  "aprovado" ao lado de uma situação "reprovado".
- Taxa sai do domínio como fração de 0 a 1 e vira percentual **num lugar só**. Espalhar a
  multiplicação por 100 já custou uma tela mostrando "0,1 %" onde eram 12,3 %.

`formatarCpf` continua vindo de `shared/documento/` no servidor; no front é uma cópia com o mesmo
teste, porque o front não importa código de domínio.

---

## 5. Tema

`src/web/publico/app.css` tem 1.176 linhas e 390 propriedades customizadas. Elas viram
`compartilhado/tema/tema.ts`, um `MantineThemeOverride`:

| Origem no `app.css` | Destino no tema |
|---|---|
| paleta (`--cor-*`) | `theme.colors`, com as escalas de 10 tons que o Mantine exige |
| tipografia (`--fonte-*`, `--texto-*`) | `theme.fontFamily`, `theme.fontSizes`, `theme.headings` |
| espaçamento (`--espaco-*`) | `theme.spacing` |
| raio e sombra | `theme.radius`, `theme.shadows` |
| o que sobrar | CSS Module do componente que usa |

O objetivo é que as telas continuem reconhecíveis: as capturas do material didático não podem
virar outro produto. Não é redesenho.

`app.css`, `scripts/build-assets.ts` e `publico/manifest.json` são removidos ao fim.

---

## 6. Invariantes

### Intactas, sem mudança de código

I1 (fronteira entre módulos), I3, I5, I6, I7, I8, I9, I13, I14, I15, I18, I20, I21.

### Preservadas com mudança de mecanismo

| # | Como sobrevive |
|---|---|
| **I2** | Sessão continua em tabela, cookie assinado `HttpOnly`. Nenhum token no cliente. Ganha `COOKIE_DOMINIO` opcional. |
| **I4** | Chave migra do corpo do formulário para `Idempotency-Key`. Mesma tabela, mesmo comportamento. Repetição responde 200 com o local do recurso. |
| **I10** | O hash no nome do asset passa a ser gerado pelo Vite. `build-assets.ts` sai; a garantia fica. |
| **I11** | Mesmo middleware, prefixo `/publico/` → `/assets/`. `index.html` explicitamente `no-store`. |
| **I12** | `ipDoCliente` inalterado. Ganha relevância: com CDN na frente, é ela que resolve o endereço real. |
| **I16** | Correlação inalterada na geração. Passa a **sair também na resposta de erro**, no campo `correlacaoId` — hoje ela aparece na página de erro, e o suporte não pode perdê-la. |
| **I17** | Nenhum dado pessoal novo entra em log. A senha provisória, que hoje viaja em cookie, passa a viajar no corpo do 201 e continua fora do log e fora do banco. |
| **I19** | Um `Dockerfile`, uma imagem. O build do front acontece dentro dela, em estágio próprio. |
| **I22** | Validação de verdade continua em `*/aplicacao/`. A borda HTTP valida forma; o Zod do React valida conforto. |

### Nova

**I23 — A origem do front e a origem da API são configuração, não código.**
O front é estático puro e nunca depende de comportamento do servidor na primeira carga.
`VITE_API_URL`, `ORIGENS_PERMITIDAS` e `COOKIE_DOMINIO` nascem vazias. Custo: três variáveis e um
middleware de CORS que não faz nada enquanto a lista estiver vazia.

---

## 7. Testes

| Suíte | Onde | Ferramenta | Cobre |
|---|---|---|---|
| Domínio e aplicação | `apps/api/testes/{identidade,academico,avaliacao,comunicacao,shared}/` | `bun test` | **inalterada** |
| API HTTP | `apps/api/testes/api/` | `bun test` + `app.request` | status, JSON, alcance, idempotência, cache, CORS, CSRF |
| Unidade do front | `apps/web/src/**/*.test.ts(x)` | Vitest + Testing Library + MSW | hooks de consulta, resolvers, stores, formatação |
| Ponta a ponta | `e2e/` | Playwright | as 4 jornadas de `docs/archify/06..09` |

A reescrita de `testes/web/` é mais barata do que parece: a estratégia de `apoio.ts` — entrar de
verdade e devolver o `Set-Cookie` que a aplicação emitiu, sem porta aberta e sem cliente HTTP no
meio — continua valendo palavra por palavra. Mudam duas funções: `enviar` passa a mandar JSON com
`Idempotency-Key`, e `entrar` passa a chamar `POST /api/v1/sessao`.

Os três testes que rodam em processo separado (I13 banco fora do ar, I17 log de um fluxo, I18 boot
com config incompleta) mudam apenas as URLs e o formato do corpo.

`checklist.test.ts` é o mais delicado: ele verifica invariantes estruturais — que nenhum módulo
grava arquivo, que toda tabela de negócio tem `rede_id`, que dois envios com a mesma chave
produzem uma linha só, que rota autenticada recusa cache. Todos continuam válidos; o que muda são
os caminhos e o formato de envio. **Ele ganha um caso novo:** que o `index.html` responde
`no-store` e o asset com hash responde `immutable`.

Portão de cobertura de 80 % vale para as duas aplicações.

Casos que precisam existir e não existiam:

- Escrita sem `Idempotency-Key` responde 400.
- Escrita sem `X-Requerido-Por` responde 403.
- Escrita com `Content-Type` de formulário responde 415.
- Com `ORIGENS_PERMITIDAS` vazia, nenhum cabeçalho de CORS é emitido.
- Com `ORIGENS_PERMITIDAS` preenchida, origem de fora não recebe eco.
- `GET` do comunicado **não** grava `lido_em` (E2E).
- Recarregar `/secretaria/alunos/:id` no navegador devolve o `index.html`, não 404 (E2E).

---

## 8. Documentação

| Arquivo | O que muda |
|---|---|
| `docs/ESCOLAVIVA_ESTAGIO_01.md` | a frase "sem SPA e sem API pública para versionar" é substituída pela decisão e pelo custo; a tabela de invariantes ganha I23 e as notas de I2, I4, I10, I11, I22 |
| `docs/EVOLUCAO_SAAS.md` | o catálogo de canais deixa de listar "adotar SPA por padrão" como armadilha pura e passa a distinguir adotar por padrão de adotar com o custo medido |
| `docs/ADR/0005-spa-e-api-versionada.md` | **novo** — por que a SPA entrou, o que ela cobra, o que foi recusado junto (SSR, token, envelope de resposta) |
| `docs/ADR/0006-origem-do-front-como-configuracao.md` | **novo** — I23, as três variáveis, por que cookie sobrevive à separação de origem |
| `README.md` | comandos novos, dois processos em desenvolvimento, variáveis novas |
| `.env.example` | `ORIGENS_PERMITIDAS`, `COOKIE_DOMINIO`, `VITE_API_URL` |
| `docs/archify/01-arquitetura.*` | passa a ter dois artefatos |
| `docs/archify/03-requisicao-de-escrita.*` | PRG vira requisição JSON com idempotência por cabeçalho |
| `docs/archify/06..09-jornada-*.*` | as quatro jornadas, com as telas do React |

---

## 9. Sequência de entrega

Sete fases. Cada uma termina com `bun run verificar` verde e é um ponto de parada seguro.

| # | Fase | Entrega | Paralelizável |
|---|---|---|---|
| 0 | **Fundação** | workspaces, mudança de `src/` para `apps/api/src/`, Zod 3 → 4, dependency-cruiser reapontado | não — é pré-requisito de tudo |
| 1 | **Borda** | erros em JSON, idempotência por cabeçalho, CORS, CSRF, cache, estático + fallback, `/api/v1/sessao`, `/conta/senha` | não — define o contrato |
| 2 | **API por papel** | seleções, rede, secretaria, professor, responsável, comunicados | **sim** — seis frentes, arquivos disjuntos |
| 3 | **Casca do front** | Vite, tema, provedores, cliente Axios, roteador, guardas, layout, tela de entrada | não — é pré-requisito das telas |
| 4 | **Telas por papel** | as mesmas seis frentes da fase 2 | **sim** — seis frentes, arquivos disjuntos |
| 5 | **Qualidade** | E2E das 4 jornadas, acessibilidade, orçamento de bundle | **sim** — quatro jornadas independentes |
| 6 | **Remoção e documentação** | apaga Eta e o que restou; ADRs, diagramas, README, material didático | **sim** após a remoção |

As fases 2 e 4 são as que justificam execução por múltiplos agentes: seis conjuntos de arquivos
que não se tocam, cada um com sua suíte.

---

## 10. Riscos

**1. Zod 3 → 4.** Menor do que parece: 21 arquivos importam `zod`, mas só **dois** usam API que
mudou de forma — `src/shared/config/schema.ts` (9 ocorrências de `errorMap`,
`invalid_type_error` e `required_error`) e `src/identidade/aplicacao/convidarUsuario.ts:28`
(1 `errorMap`). Os outros 19 usam apenas `z.object`, `z.string`, `.min`, `.safeParse` e `.issues`,
que não mudaram. A versão instalada já é a `3.25.76`, que expõe o Zod 4 pelo subcaminho `zod/v4` —
a migração pode ser verificada arquivo a arquivo antes de trocar o pacote.

O ponto de atenção real é `errosDeSchema()` em `src/shared/resultado.ts:18`: ele tipa
`path: (string | number)[]`, e no Zod 4 `issue.path` é `PropertyKey[]`. A assinatura precisa
acompanhar. Ainda é a primeira coisa a fazer, com a suíte inteira verde antes de qualquer outra
mudança — fazer isso com o front já escrito seria depurar duas coisas ao mesmo tempo.

**2. Orçamento de bundle no portal do responsável.** É o pior caso do sistema: I4 existe porque um
responsável com 4G ruim toca em "enviar" duas vezes. Essa mesma pessoa passa a baixar React e
Mantine antes de ver o boletim. Mitigação: bloco por papel via `lazy()`, `@mantine/core` importado
por componente, e um teto declarado — **150 kB comprimidos para o primeiro carregamento do
responsável**, verificado na fase 5. Estourar o teto é motivo para trocar componente, não para
subir o teto.

**3. Duas verdades sobre o formato do dado.** Front e API podem divergir em silêncio. Mitigação:
`apps/api/src/http/contratos/` exporta os tipos de resposta, o front os importa como `import type`,
e uma regra do dependency-cruiser impede que `contratos/` importe qualquer coisa — ele precisa
continuar sendo carregável por um bundler de navegador.

**4. Perder a medição do Estágio 04.** Marcar leitura por efeito de carregamento é o erro mais
fácil de cometer numa SPA e destrói a taxa de 12 % que justifica o estágio seguinte. Mitigação:
teste E2E explícito de que abrir o comunicado não grava `lido_em`.

**5. Esconder a lentidão do fechamento de bimestre.** É dor plantada de propósito para justificar o
Estágio 05. Mitigação: nada de otimista, nada de fila falsa no cliente. O botão desabilita e a
pessoa espera, como hoje.

**6. A guarda de rota confundida com autorização.** Mitigação: comentário no código, e testes de
API que provam 403/404 sem passar pelo front.

**7. Cookie e Cloudflare.** Se um dia o front for para um domínio **diferente** (não subdomínio),
`SameSite=Lax` deixa de servir e o desenho precisa mudar. Mitigação: o ADR 0006 registra que a
premissa é subdomínio do mesmo domínio registrável, e que sair dela é uma decisão nova, não um
ajuste de variável.
