# Frontend em React e backend como API — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** substituir o HTML renderizado em Eta por uma SPA React 19 servida como arquivo estático, transformando o Hono em uma API JSON versionada, sem alterar nenhuma regra de negócio.

**Architecture:** o repositório vira dois workspaces do Bun — `apps/api` (os quatro módulos de domínio de hoje, com `src/web/` virando `src/http/` e devolvendo JSON sob `/api/v1`) e `apps/web` (Vite + React, estático puro). A sessão continua sendo cookie assinado resolvido no banco; a idempotência migra do corpo do formulário para o cabeçalho `Idempotency-Key`; o hash de asset passa a ser do Vite. Três variáveis de ambiente vazias (`VITE_API_URL`, `ORIGENS_PERMITIDAS`, `COOKIE_DOMINIO`) tornam a futura publicação no Cloudflare Pages uma troca de configuração.

**Tech Stack:** Bun · TypeScript · Hono · PostgreSQL 16 via `Bun.sql` · Zod 4 · `bun:test` · React 19 · Vite 7 · React Router 7 · Mantine 8 · TanStack Query 5 · React Hook Form 7 · Zustand 5 · Axios 1 · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-08-14-frontend-react-design.md` — leia antes de começar; este plano argumenta a partir dela.

## Global Constraints

Valem para **toda** tarefa. Não repetidas nas tarefas individuais.

- **Idioma:** todo identificador, nome de arquivo e nome de pasta em **inglês**. Texto de tela e mensagem que o usuário final lê ficam em **português do Brasil**, com acentuação correta. Vale igual em `.ts`, `.tsx` e `.css`. Revogado em 2026-08-16 o que esta linha dizia antes ("todo identificador, comentário, mensagem de erro e texto de tela em português do Brasil"): o repositório está sendo convertido para inglês, e o glossário canônico é a fonte de verdade dos termos.
- **Comentários explicam o porquê, nunca o quê.** Olhe qualquer arquivo vizinho antes de escrever: o repositório documenta decisão e trade-off, não mecânica. Arquivo novo sem cabeçalho explicando por que ele existe está incompleto.
- **`bun run verificar` verde antes de qualquer commit.** Roda `tsc --noEmit` nos dois workspaces, `depcruise` na API e as duas suítes, com portão de cobertura de 80 %.
- **Commit:** `git add` **explícito, arquivo por arquivo**. Nunca `git add -A`, `git add .`, `git add -u`, `git commit -a` nem `-am`. Rode `git status --short` antes e confirme que só os arquivos daquela tarefa estão staged. Esta regra vale também para sub-agentes.
- **Peça autorização ao usuário antes de cada commit e antes de qualquer push.** Autorização é escopada: "pode commitar" não autoriza push, e um commit autorizado não autoriza o seguinte.
- **Não crie branch.** Trabalhe na branch atual.
- **Sem atribuição a IA** em mensagem de commit.
- **Estágio 01.** Nada deste plano pode antecipar componente de estágio posterior — sem fila, sem cache, sem CDN contratada, sem envio de e-mail, sem serviço externo. As três variáveis do Cloudflare nascem **vazias**.
- **Nenhuma regra de negócio muda.** `*/dominio/`, `*/aplicacao/`, `*/infra/`, `migrations/` e as suítes de domínio ficam como estão, exceto pela migração de Zod (Task 2) e pelo caminho dos arquivos (Task 1).
- **Não afrouxe alcance.** Registro fora das unidades onde a pessoa tem o papel responde **404**, nunca 403 — a existência de um aluno já é informação. Isso vale igual em JSON.
- **`ErroDeAplicacao`** é `{ campo?: string; codigo: string; mensagem: string }` em `apps/api/src/shared/resultado.ts`. Use `falhaDeCampo(campo, codigo, mensagem)` para erro ancorado em campo. É este array que viaja para o React Hook Form — nenhum tradutor entre as pontas.
- **Versões:** instale sempre com `@latest` e deixe o `bun.lock` registrar a versão exata. O plano nomeia versões maiores (React 19, Vite 7, Mantine 8…), nunca números de correção.
- **Front nunca importa domínio.** `apps/web` só pode importar de `apps/api/src/http/contratos/`, e apenas isso. Importar `academico`, `identidade` ou `shared/db` de dentro do React é erro de arquitetura, não conveniência.
- **Validação de verdade continua em `*/aplicacao/` (I22).** A borda HTTP valida **forma** e responde 400; a aplicação valida **regra** e responde 422; o Zod do React valida **conforto** e não decide nada.

---

## Execução por múltiplos agentes

36 tarefas em 7 fases. Fases ímpares são estreitas de propósito — elas definem contrato, e contrato feito por duas mãos ao mesmo tempo diverge. Fases 2, 4, 5 e 6 abrem em frentes cujos arquivos não se tocam.

### Grafo de dependência

```
FASE 0   T1 ──▶ T2
                 │
FASE 1           └▶ T3 ─▶ T4 ─▶ T5 ─▶ T6 ─▶ T7 ─▶ T8 ─▶ T9
                                                          │
FASE 2   ┌──────┬──────┬──────┬──────┬──────┬─────────────┘
         T10    T11    T12    T13    T14    T15    T16      (7 frentes paralelas)
         └──────┴──────┴──────┴──────┴──────┴──────┬─────┘
                                                    │
FASE 3   T17 ─▶ T18 ─▶ T19 ─▶ T20 ─▶ T21 ─▶ T22 ◀──┘
                                              │
FASE 4   ┌──────┬──────┬──────┬──────┬────────┘
         T23    T24    T25    T26    T27    T28              (6 frentes paralelas)
         └──────┴──────┴──────┴──────┴───────┬─────┘
                                              │
FASE 5   T29 ─▶ (T30 ‖ T31 ‖ T32)
                          │
FASE 6   T33 ─▶ (T34 ‖ T35 ‖ T36)
```

`T18` (formatadores) só depende de `T17` pelo `package.json`; o orquestrador pode rodá-la em paralelo com `T19`.

### Propriedade de arquivo por frente

Enquanto uma fase paralela estiver em voo, **nenhuma frente escreve fora da sua linha**. Arquivos compartilhados (`http/rotas/index.ts`, `app/rotas.tsx`, `package.json`) são tocados só pela tarefa de fechamento da fase.

| Frente | Fase 2 escreve em | Fase 4 escreve em |
|---|---|---|
| Seleções | `api/src/http/rotas/selecoes.ts` · `apresentadores/selecoes.ts` · `testes/api/selecoes.test.ts` | — |
| Rede | `api/src/http/rotas/rede.ts` · `esquemas/rede.ts` · `apresentadores/rede.ts` · `testes/api/rede.test.ts` | `web/src/funcionalidades/rede/**` |
| Secretaria A | `.../rotas/secretaria/alunos.ts` · `esquemas/alunos.ts` · `apresentadores/alunos.ts` · `testes/api/secretaria_alunos.test.ts` | `web/src/funcionalidades/secretaria/alunos/**` |
| Secretaria B | `.../rotas/secretaria/turmas.ts` · `esquemas/turmas.ts` · `apresentadores/turmas.ts` · `testes/api/secretaria_turmas.test.ts` | `web/src/funcionalidades/secretaria/turmas/**` |
| Professor | `.../rotas/professor.ts` · `esquemas/professor.ts` · `apresentadores/professor.ts` · `testes/api/professor.test.ts` | `web/src/funcionalidades/professor/**` |
| Responsável | `.../rotas/responsavel.ts` · `apresentadores/responsavel.ts` · `testes/api/responsavel.test.ts` | `web/src/funcionalidades/responsavel/**` |
| Comunicados | `.../rotas/comunicados.ts` · `esquemas/comunicados.ts` · `apresentadores/comunicados.ts` · `testes/api/comunicados.test.ts` | `web/src/funcionalidades/comunicados/**` |

### Briefing obrigatório do sub-agente de frente

Cole isto no briefing de toda tarefa de fase paralela:

> Você implementa **uma** frente. Não edite arquivo fora da linha da sua frente na tabela de propriedade do plano. Se precisar de algo que pertence a outra frente ou a um arquivo compartilhado, **pare e relate** em vez de editar. Ao commitar, liste os arquivos explicitamente com `git add <caminho> <caminho>`; nunca use `-A`, `.`, `-u`, `-a` nem `-am`. Outros agentes trabalham no mesmo repositório ao mesmo tempo, e um `git add` amplo destrói o trabalho deles. Leia a seção "Padrões de Implementação" do plano antes de escrever a primeira linha.

---

## File Structure

### Criados

| Arquivo | Responsabilidade |
|---|---|
| `apps/api/package.json` | dependências do servidor: hono, pino, zod |
| `apps/web/package.json` | dependências do front |
| `apps/web/vite.config.ts` | build, proxy de desenvolvimento, PostCSS do Mantine, Vitest |
| `apps/web/index.html` | casca do documento; sem dado e sem script inline |
| `apps/api/src/http/estatico.ts` | serve `apps/web/dist` e faz o fallback de SPA |
| `apps/api/src/http/cors.ts` | CORS por env; inerte com `ORIGENS_PERMITIDAS` vazia |
| `apps/api/src/http/escritaSegura.ts` | exige `Content-Type` JSON e `X-Requerido-Por` em escrita |
| `apps/api/src/http/resposta.ts` | `corpoDeErro`, `criado`, `paginaEmJson`, `analisar` |
| `apps/api/src/http/contratos/*.ts` | tipos de resposta e enumerações; **sem nenhum import** |
| `apps/api/src/http/esquemas/*.ts` | Zod de corpo de requisição, por recurso |
| `apps/api/src/http/apresentadores/*.ts` | domínio → objeto JSON de resposta |
| `apps/api/src/http/rotas/sessao.ts` | entrar, sair, quem sou eu |
| `apps/web/src/compartilhado/api/cliente.ts` | única instância de Axios do sistema |
| `apps/web/src/compartilhado/api/erro.ts` | `ErroDaApi` e `aplicarErros` |
| `apps/web/src/compartilhado/tema/tema.ts` | `MantineThemeOverride` derivado do `app.css` |
| `apps/web/src/compartilhado/formato/*.ts` | formatadores portados de `render.ts` |
| `apps/web/src/app/rotas.tsx` | árvore do React Router, com as URLs de hoje |
| `apps/web/src/app/guardas.tsx` | `ExigirLogin`, `ExigirPapel`, `painelInicial` |
| `apps/web/src/funcionalidades/**` | uma pasta por assunto, auto-contida |
| `e2e/*.spec.ts` | as quatro jornadas |
| `docs/ADR/0005-spa-e-api-versionada.md` | por que a SPA entrou e o que ela cobra |
| `docs/ADR/0006-origem-do-front-como-configuracao.md` | I23 e as três variáveis |

### Movidos

| De | Para |
|---|---|
| `src/{identidade,academico,avaliacao,comunicacao,shared}/` | `apps/api/src/…` |
| `src/main.ts` | `apps/api/src/main.ts` |
| `src/web/{app,health,paginacao}.ts` | `apps/api/src/http/…` |
| `src/web/rotas/*.ts` | `apps/api/src/http/rotas/*.ts` |
| `testes/` | `apps/api/testes/` |
| `config/.dependency-cruiser.js` | `apps/api/.dependency-cruiser.js` (deixa `config/` vazia; remova a pasta) |
| `testes/web/*.test.ts` | `apps/api/testes/api/*.test.ts` (reescritos ao longo das fases 1 e 2) |

### Removidos ao fim (Task 33)

`src/web/templates/` (45 arquivos) · `src/web/render.ts` · `src/web/publico/app.css` · `scripts/build-assets.ts` · `publico/manifest.json` · dependência `eta` · `CAMPO_CHAVE` e `CorpoDeFormulario` em `shared/http` · `registrarRenderizadorDeErro`, `RenderizadorDeErro` e `paginaDeErro` em `shared/http/erros.ts` · `COOKIE_DO_CONVITE`, `VALIDADE_DO_CONVITE_S`, `guardarConvite` e `retirarConvite` em `rotas/rede.ts`.

---

## Padrões de Implementação

Toda tarefa de fase paralela usa estes padrões. Eles estão aqui, e não dentro de uma tarefa, porque as tarefas são lidas fora de ordem e por agentes diferentes. **Leia esta seção antes de qualquer tarefa das fases 2 e 4.**

### P1 — Rota de leitura paginada

```ts
rotasSecretaria.get('/responsaveis', async (c) => {
  const pagina = await academico.paginaDeResponsaveis(redeAtual(c), paginaDaQuery(c));
  return c.json(paginaEmJson(pagina, responsavelEmJson));
});
```

### P2 — Rota de escrita

```ts
rotasSecretaria.post('/alunos', async (c) => {
  // Borda: só a forma. Campo ausente, tipo errado, id malformado — nada de regra.
  const entrada = analisar(esquemaDeAluno, c.get('corpo'));
  if (!entrada.ok) return c.json(corpoDeErro(entrada.erros), 400);

  // Regra: quem decide é o caso de uso, como sempre foi (I22).
  const resultado = await academico.cadastrarAluno({ redeId: redeAtual(c), ...entrada.valor });
  if (!resultado.ok) return c.json(corpoDeErro(resultado.erros), 422);

  return criado(c, `/api/v1/secretaria/alunos/${resultado.valor.id}`, { id: resultado.valor.id });
});
```

`criado` escreve o cabeçalho `Location`, e é dele que o middleware de idempotência tira o que grava em `resposta_local`. Escrita que responde 201 sem `Location` quebra I4 em silêncio.

### P3 — Apresentador

Um por agregado, em `apresentadores/`. Ele decide o que sai — nunca `...linhaDoBanco`:

```ts
export const responsavelEmJson = (responsavel: Responsavel): ResponsavelEmLista => ({
  id: responsavel.id,
  nome: responsavel.nome,
  email: responsavel.email,
  telefone: responsavel.telefone,
  cpf: responsavel.cpf,
});
```

O tipo de retorno vem de `contratos/`, e é ele que o front importa.

### P4 — Esquema de borda

```ts
export const esquemaDeAluno = z.object({
  nome: z.string({ error: 'informe o nome' }),
  dataNascimento: z.string({ error: 'informe a data de nascimento' }),
});
```

Sem `.min`, sem `.regex`, sem faixa: isso é regra e mora em `academico/aplicacao/cadastrarAluno.ts`. A borda só garante que os campos existem e são strings, para o caso de uso não receber `undefined`.

### P5 — Teste de rota da API

```ts
import { describe, expect, test } from 'bun:test';
import { entrar, escrever, ler } from '../apoio';

describe('cadastro de aluno', () => {
  test('aluno válido responde 201 com o id e o Location', async () => {
    const cookie = await entrar(SECRETARIA);

    const resposta = await escrever('POST', '/api/v1/secretaria/alunos', {
      nome: 'Ana Souza', dataNascimento: '2015-03-11',
    }, cookie);

    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(resposta.headers.get('Location')).toBe(`/api/v1/secretaria/alunos/${corpo.id}`);
  });

  test('nome ausente é recusado pela borda, com 400 e o campo apontado', async () => {
    const cookie = await entrar(SECRETARIA);

    const resposta = await escrever('POST', '/api/v1/secretaria/alunos', {
      dataNascimento: '2015-03-11',
    }, cookie);

    expect(resposta.status).toBe(400);
    const { erros } = await resposta.json();
    expect(erros[0].campo).toBe('nome');
  });

  test('aluno de outra rede não existe para esta secretaria', async () => {
    const cookie = await entrar(SECRETARIA);

    const resposta = await ler(`/api/v1/secretaria/alunos/${ALUNO_DE_OUTRA_REDE}`, cookie);

    expect(resposta.status).toBe(404);
  });
});
```

Toda frente entrega, no mínimo:

| Tipo de endpoint | Casos obrigatórios |
|---|---|
| escrita | sucesso · borda recusa (400 com `campo`) · regra recusa (422 com `campo`) · sem sessão (401) · papel errado (403) · alvo fora do alcance (404) |
| leitura | sucesso · sem sessão (401) · papel errado (403) · alvo fora do alcance (404) · `?p=` muda a página |

### P6 — Chaves e consultas do TanStack Query

```ts
export const chavesDeAlunos = {
  raiz: ['secretaria', 'alunos'] as const,
  busca: (termo: string, pagina: number) =>
    [...chavesDeAlunos.raiz, 'busca', termo, pagina] as const,
  ficha: (id: string) => [...chavesDeAlunos.raiz, 'ficha', id] as const,
};

export function useAlunos(termo: string, pagina: number) {
  return useQuery({
    queryKey: chavesDeAlunos.busca(termo, pagina),
    queryFn: () =>
      cliente
        .get<Pagina<AlunoEmLista>>('/secretaria/alunos', { params: { q: termo, p: pagina } })
        .then((resposta) => resposta.data),
    // A tela de alunos abre vazia: sem termo não há busca, e não há consulta ao banco.
    enabled: termo !== '',
    // A tabela não pisca ao trocar de página: a anterior fica na tela até a nova chegar.
    placeholderData: keepPreviousData,
  });
}
```

### P7 — Mutação

```ts
export function useCadastrarAluno() {
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: EntradaDeAluno) =>
      cliente.post<{ id: string }>('/secretaria/alunos', dados).then((r) => r.data),
    onSuccess: () => consultas.invalidateQueries({ queryKey: chavesDeAlunos.raiz }),
  });
}
```

Nada de atualização otimista neste estágio: a escrita é síncrona e o usuário espera. Esconder a espera esconderia a dor que os estágios seguintes existem para resolver.

### P8 — Formulário

```tsx
export function FormularioDeAluno() {
  const navegar = useNavigate();
  const avisar = useAvisos((estado) => estado.erro);
  const cadastrar = useCadastrarAluno();
  const { register, handleSubmit, setError, formState } = useForm<EntradaDeAluno>({
    resolver: zodResolver(esquemaDeAluno),
  });

  const enviar = handleSubmit(async (valores) => {
    try {
      const { id } = await cadastrar.mutateAsync(valores);
      navegar(`/secretaria/alunos/${id}`);
    } catch (erro) {
      // O `campo` que a API devolve é o `name` do input: o erro cai embaixo do campo certo
      // sem nenhuma tradução entre as duas pontas.
      aplicarErros(erro, setError, avisar);
    }
  });

  return (
    <form onSubmit={enviar} noValidate>
      <TextInput label="Nome" {...register('nome')} error={formState.errors.nome?.message} />
      <TextInput
        label="Data de nascimento"
        type="date"
        {...register('dataNascimento')}
        error={formState.errors.dataNascimento?.message}
      />
      <Button type="submit" loading={formState.isSubmitting}>Cadastrar</Button>
    </form>
  );
}
```

### P9 — Tela de lista

Uma tela de lista é **só a tabela**, com o botão que leva ao formulário em página própria. Formulário de escrita nunca divide a página com a listagem — foi decisão tomada e implementada no estado atual, e a migração não pode desfazê-la.

```tsx
export function ListaDeResponsaveis() {
  const [parametros, definirParametros] = useSearchParams();
  const pagina = Number(parametros.get('p') ?? 1);
  const consulta = useResponsaveis(pagina);

  if (consulta.isPending) return <Carregando />;
  if (consulta.isError) return <FalhaAoCarregar erro={consulta.error} />;
  if (consulta.data.total === 0) return <Vazio mensagem="Nenhum responsável cadastrado." />;

  return (
    <>
      <Tabela colunas={COLUNAS} linhas={consulta.data.itens} />
      <Paginacao
        pagina={consulta.data.pagina}
        paginas={consulta.data.paginas}
        aoMudar={(numero) => definirParametros({ p: String(numero) })}
      />
    </>
  );
}
```

A página mora na query, e não em estado do componente: a terceira página continua sendo um endereço copiável e o botão "voltar" continua funcionando sem que ninguém o programe.

### P10 — Teste de front

```tsx
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { servidor } from '../../../preparacaoDeTeste';

test('erro de campo vindo da API aparece embaixo do campo', async () => {
  servidor.use(
    http.post('*/api/v1/secretaria/alunos', () =>
      HttpResponse.json(
        {
          erros: [{ campo: 'nome', codigo: 'nome_repetido', mensagem: 'Já existe um aluno com este nome.' }],
          correlacaoId: 'teste',
        },
        { status: 422 },
      ),
    ),
  );
  renderizarComProvedores(<FormularioDeAluno />);

  await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza');
  await userEvent.type(screen.getByLabelText('Data de nascimento'), '2015-03-11');
  await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

  expect(await screen.findByText('Já existe um aluno com este nome.')).toBeVisible();
});
```

---

# FASE 0 — Fundação

Nada aqui muda comportamento. Duas tarefas mecânicas que precisam estar verdes antes de qualquer
outra coisa, porque depurar a mudança de caminho de arquivo junto com a mudança de contrato HTTP é
depurar duas coisas ao mesmo tempo.

### Task 1: Workspaces e mudança de `src/` para `apps/api/`

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Modify: `package.json`, `tsconfig.json`, `bunfig.toml`, `infra/Dockerfile`, `.dockerignore`
- Move: `src/` → `apps/api/src/`, `testes/` → `apps/api/testes/`, `config/.dependency-cruiser.js` → `apps/api/.dependency-cruiser.js`

> `.dockerignore` continua na raiz mesmo com o Dockerfile em `infra/`: o Docker o procura na raiz
> do contexto de build, não ao lado do Dockerfile. Ver "Onde mora cada coisa" no README.

**Interfaces:**
- Produces: raiz com `bun run verificar`, `bun run dev:api`, `bun run migrate`, `bun run seed` funcionando dos novos caminhos. Toda tarefa seguinte assume `apps/api/src/…`.

- [ ] **Step 1: Mover a árvore com `git mv`, preservando histórico**

```bash
mkdir -p apps/api
git mv src apps/api/src
git mv testes apps/api/testes
git mv config/.dependency-cruiser.js apps/api/.dependency-cruiser.js
rmdir config
```

- [ ] **Step 2: Criar `apps/api/package.json`**

```json
{
  "name": "@escolaviva/api",
  "private": true,
  "type": "module",
  "dependencies": {
    "eta": "^3",
    "hono": "^4",
    "pino": "^9",
    "zod": "^3"
  }
}
```

`eta` continua aqui até a Task 33 — o SSR só morre depois que a SPA estiver de pé.

- [ ] **Step 3: Reescrever o `package.json` da raiz**

```json
{
  "name": "escolaviva",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*"],
  "scripts": {
    "dev:api": "bun --watch apps/api/src/main.ts",
    "start": "bun apps/api/src/main.ts",
    "migrate": "bun scripts/migrate.ts",
    "migrate:status": "bun scripts/migrate.ts --status",
    "build:assets": "bun scripts/build-assets.ts",
    "seed": "bun scripts/seed.ts",
    "seed:volume": "bun scripts/seed-volume.ts",
    "check": "bunx depcruise apps/api/src --config apps/api/.dependency-cruiser.js",
    "typecheck": "bunx tsc --noEmit -p apps/api/tsconfig.json",
    "test": "bun test apps/api/testes",
    "test:cobertura": "bun test apps/api/testes --coverage",
    "verificar": "bun run typecheck && bun run check && bun run test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "dependency-cruiser": "^16",
    "typescript": "^5"
  }
}
```

`dev` sai da lista nesta tarefa e volta na Task 17, quando existir um segundo processo para subir.

- [ ] **Step 4: Criar `apps/api/tsconfig.json` e enxugar o da raiz**

`apps/api/tsconfig.json` recebe o conteúdo do `tsconfig.json` de hoje, com `include` apontando para
`src` e `testes`. O da raiz vira só `{ "files": [], "references": [{ "path": "apps/api" }] }`.

- [ ] **Step 5: Ajustar os caminhos que ficaram para trás**

Quatro pontos que apontam para `src/` e não são resolvidos pelo `git mv`:

| Arquivo | O que muda |
|---|---|
| `bunfig.toml` | `preload` → `apps/api/testes/apoio/preload.ts` |
| `apps/api/.dependency-cruiser.js` | os cinco `^src/` das três regras → `^apps/api/src/`; `tsConfig.fileName` → `apps/api/tsconfig.json` |
| `apps/api/testes/apoio/apoio.ts` | `RAIZ_DO_PROJETO` sobe dois níveis a mais; os `import('./src/web/app.ts')` dos processos separados viram `./apps/api/src/web/app.ts` |
| `apps/api/testes/web/checklist.test.ts` | a varredura de "nenhum módulo grava arquivo" aponta para `apps/api/src` |
| `scripts/*.ts` | imports de `../src/…` → `../apps/api/src/…` |
| `infra/Dockerfile`, `.dockerignore` | `COPY src` → `COPY apps/api/src`; idem `testes`. Os dois seguem em pastas diferentes de propósito — o contexto de build continua sendo a raiz. |

- [ ] **Step 6: Rodar a verificação inteira**

Run: `bun install && bun run verificar`
Expected: PASS — mesma contagem de testes de antes da mudança. Nenhum teste novo, nenhum a menos.

- [ ] **Step 7: Commit**

```bash
git status --short
git add package.json tsconfig.json bunfig.toml infra/Dockerfile .dockerignore \
        apps/api/package.json apps/api/tsconfig.json apps/api/.dependency-cruiser.js \
        apps/api/src apps/api/testes scripts
git commit -m "refactor: repositório em workspaces, backend em apps/api"
```

---

### Task 2: Zod 3 → Zod 4

**Files:**
- Modify: `apps/api/src/shared/config/schema.ts`, `apps/api/src/identidade/aplicacao/convidarUsuario.ts`, `apps/api/src/shared/resultado.ts`, `apps/api/package.json`
- Test: `apps/api/testes/shared/config.test.ts` (já existe e cobre as mensagens)

**Interfaces:**
- Produces: `errosDeSchema(issues: { path: PropertyKey[]; message: string; code: string }[]): ErroDeAplicacao[]` — assinatura usada por todos os casos de uso e, a partir da Task 8, também por `analisar()`.

**Contexto:** 21 arquivos importam `zod`, mas só dois usam API que mudou de forma. Os outros 19 usam
`z.object`, `z.string`, `.min`, `.safeParse` e `.issues`, que são iguais nas duas versões.

- [ ] **Step 1: Rodar a suíte e anotar o verde de partida**

Run: `bun run test`
Expected: PASS. Anote o número de testes — ele não pode mudar nesta tarefa.

- [ ] **Step 2: Trocar as 9 ocorrências de `apps/api/src/shared/config/schema.ts`**

| Antes (v3) | Depois (v4) |
|---|---|
| `z.enum(['true','false'], { errorMap: () => ({ message: 'use true ou false' }) })` | `z.enum(['true','false'], { error: 'use true ou false' })` |
| `z.enum(AMBIENTES, { errorMap: () => ({ message: 'use development, test ou production' }) })` | `z.enum(AMBIENTES, { error: 'use development, test ou production' })` |
| `z.enum(NIVEIS_DE_LOG, { errorMap: () => ({ message: 'use debug, info, warn ou error' }) })` | `z.enum(NIVEIS_DE_LOG, { error: 'use debug, info, warn ou error' })` |
| `z.coerce.number({ invalid_type_error: 'precisa ser um número inteiro de porta' })` | `z.coerce.number({ error: 'precisa ser um número inteiro de porta' })` |
| `z.coerce.number({ invalid_type_error: 'precisa ser um número de horas' })` | `z.coerce.number({ error: 'precisa ser um número de horas' })` |
| `z.coerce.number({ invalid_type_error: 'precisa ser um número de milissegundos' })` | `z.coerce.number({ error: 'precisa ser um número de milissegundos' })` |
| `z.string({ required_error: 'obrigatória — conexão do PostgreSQL primário' })` | `z.string({ error: 'obrigatória — conexão do PostgreSQL primário' })` |
| `z.string({ required_error: 'obrigatória — segredo que assina o cookie de sessão' })` | `z.string({ error: 'obrigatória — segredo que assina o cookie de sessão' })` |

- [ ] **Step 3: Trocar a ocorrência de `convidarUsuario.ts:28`**

```ts
papel: z.enum(PAPEIS, { error: 'papel desconhecido' }),
```

- [ ] **Step 4: Alargar a assinatura de `errosDeSchema` em `shared/resultado.ts`**

No Zod 4 `issue.path` é `PropertyKey[]`, que inclui `symbol`. `join('.')` continua funcionando; o
tipo é que precisa acompanhar:

```ts
export const errosDeSchema = (
  issues: readonly { path: PropertyKey[]; message: string; code: string }[],
): ErroDeAplicacao[] =>
  issues.map((problema) => {
    const campo = problema.path.map(String).join('.');
    const erro: ErroDeAplicacao = { codigo: problema.code, mensagem: problema.message };
    // Erro na raiz do schema não tem campo; omitir a chave é diferente de gravá-la como
    // undefined — a tela decide entre destacar um input e mostrar um aviso geral.
    return campo === '' ? erro : { ...erro, campo };
  });
```

- [ ] **Step 5: Verificar com o Zod 4 ainda pelo subcaminho, antes de trocar o pacote**

A versão instalada (`zod@3.25.76`) já expõe o Zod 4 em `zod/v4`. Trocar temporariamente os imports
dos dois arquivos alterados para `from 'zod/v4'` e rodar a suíte prova a migração sem mexer no lock.

Run: `bun run test apps/api/testes/shared/config.test.ts apps/api/testes/identidade`
Expected: PASS, com as mesmas mensagens de erro de configuração de antes.

- [ ] **Step 6: Subir o pacote e devolver os imports para `'zod'`**

```bash
cd apps/api && bun add zod@latest
```

Reverta os dois imports de `'zod/v4'` para `'zod'`.

- [ ] **Step 7: Rodar a verificação inteira**

Run: `bun run verificar`
Expected: PASS, com o mesmo número de testes do Step 1.

- [ ] **Step 8: Commit**

```bash
git status --short
git add apps/api/package.json apps/api/src/shared/config/schema.ts \
        apps/api/src/shared/resultado.ts apps/api/src/identidade/aplicacao/convidarUsuario.ts \
        bun.lock
git commit -m "chore: migra validação para Zod 4"
```

---

# FASE 1 — A borda

Sete tarefas sequenciais que definem o contrato HTTP. Elas são estreitas de propósito: cada uma
muda um mecanismo e mantém a suíte verde. Ao fim da fase, `/api/v1/sessao` responde JSON e o
servidor sabe entregar um `dist` que ainda não existe.

Enquanto esta fase corre, **o SSR continua funcionando** — as rotas Eta seguem montadas e os testes
de `testes/web/` seguem passando. É o que permite parar em qualquer tarefa sem deixar o sistema no
chão.

### Task 3: Configuração nova e cookie com domínio

**Files:**
- Modify: `apps/api/src/shared/config/schema.ts`, `apps/api/src/shared/http/sessao.ts`, `.env.example`
- Test: `apps/api/testes/shared/config.test.ts`

**Interfaces:**
- Produces: `config.origensPermitidas: string[]`, `config.cookieDominio: string | null`. Consumidos pela Task 6 (CORS) e por `opcoesDoCookie()`.

- [ ] **Step 1: Escrever o teste que falha**

Em `apps/api/testes/shared/config.test.ts`:

```ts
test('as origens permitidas nascem vazias e aceitam lista separada por vírgula', () => {
  const semLista = carregarConfig({ ...AMBIENTE_MINIMO });
  expect(semLista.origensPermitidas).toEqual([]);

  const comLista = carregarConfig({
    ...AMBIENTE_MINIMO,
    ORIGENS_PERMITIDAS: 'https://app.escolaviva.test, https://admin.escolaviva.test',
  });
  expect(comLista.origensPermitidas).toEqual([
    'https://app.escolaviva.test',
    'https://admin.escolaviva.test',
  ]);
});

test('o domínio do cookie é nulo quando não declarado', () => {
  expect(carregarConfig({ ...AMBIENTE_MINIMO }).cookieDominio).toBeNull();
  expect(
    carregarConfig({ ...AMBIENTE_MINIMO, COOKIE_DOMINIO: '.escolaviva.test' }).cookieDominio,
  ).toBe('.escolaviva.test');
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun test apps/api/testes/shared/config.test.ts`
Expected: FAIL — `origensPermitidas` e `cookieDominio` não existem em `Config`.

- [ ] **Step 3: Implementar**

Em `schema.ts`, duas linhas no schema e duas no retorno. `listaSeparadaPorVirgula` já existe e é
reaproveitada — é a mesma função que trata `PROXIES_CONFIAVEIS`:

```ts
ORIGENS_PERMITIDAS: z.string().default(''),
COOKIE_DOMINIO: z.string().default(''),
```

```ts
origensPermitidas: listaSeparadaPorVirgula(bruto.ORIGENS_PERMITIDAS),
// Sem domínio declarado o cookie é host-only, que é o que se quer com uma origem só.
cookieDominio: bruto.COOKIE_DOMINIO === '' ? null : bruto.COOKIE_DOMINIO,
```

E o tipo `Config` ganha os dois campos.

- [ ] **Step 4: Fazer o cookie de sessão honrar o domínio**

Em `shared/http/sessao.ts`, `opcoesDoCookie()`:

```ts
/**
 * O `Domain` só aparece quando alguém o declara. Ele existe para o dia em que o front morar em
 * `app.` e a API em `api.` do mesmo domínio registrável: aí os dois precisam do mesmo cookie, e
 * `SameSite=Lax` continua valendo porque subdomínios do mesmo domínio são o mesmo site.
 */
const opcoesDoCookie = () => ({
  path: '/',
  httpOnly: true,
  secure: config.cookieSeguro,
  sameSite: 'Lax' as const,
  maxAge: config.sessaoDuracaoHoras * SEGUNDOS_POR_HORA,
  ...(config.cookieDominio === null ? {} : { domain: config.cookieDominio }),
});
```

`fecharSessao` recebe o mesmo tratamento — apagar um cookie com `Domain` exige repetir o `Domain`.

- [ ] **Step 5: Rodar os testes**

Run: `bun test apps/api/testes/shared/config.test.ts apps/api/testes/web/autenticacao.test.ts`
Expected: PASS

- [ ] **Step 6: Registrar as variáveis no `.env.example`**

```bash
# Origens que podem falar com a API por CORS. Vazio = mesma origem, e nenhum cabeçalho é emitido.
# Preencher no dia em que o front for publicado separado (Cloudflare Pages).
ORIGENS_PERMITIDAS=

# Domínio do cookie de sessão. Vazio = host-only.
# Preencher com .seudominio.com.br quando front e API forem subdomínios distintos.
COOKIE_DOMINIO=
```

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/shared/config/schema.ts apps/api/src/shared/http/sessao.ts \
        apps/api/testes/shared/config.test.ts .env.example
git commit -m "feat(config): origens permitidas e domínio do cookie, ambos vazios"
```

---

### Task 4: Erros em JSON

**Files:**
- Create: `apps/api/src/http/resposta.ts`
- Modify: `apps/api/src/shared/http/erros.ts`, `apps/api/src/shared/http/index.ts`
- Test: `apps/api/testes/api/erros.test.ts`

**Interfaces:**
- Produces:
  - `corpoDeErro(erros: readonly ErroDeAplicacao[]): { erros: readonly ErroDeAplicacao[]; correlacaoId: string }`
  - `statusDoErro(erro: unknown): StatusDeErro` — exportado, para as rotas reaproveitarem
  - `middlewareErrosJson: MiddlewareHandler` — responde JSON em `/api/*` e delega o resto ao renderizador de HTML enquanto o SSR existir

**Contexto:** enquanto a fase 1 corre, o SSR ainda responde. O middleware precisa saber decidir pelo
caminho: `/api/*` recebe JSON, o resto continua recebendo página.

- [ ] **Step 1: Escrever o teste que falha**

```ts
test('erro em rota de API volta como JSON com o código de correlação', async () => {
  const resposta = await ler('/api/v1/sessao');

  expect(resposta.status).toBe(401);
  expect(resposta.headers.get('Content-Type')).toContain('application/json');
  const corpo = await resposta.json();
  expect(corpo.erros).toHaveLength(1);
  expect(corpo.correlacaoId).not.toBe('');
});

test('a resposta de erro não vaza pilha, SQL nem mensagem de exceção', async () => {
  const resposta = await ler('/api/v1/sessao');

  const bruto = await resposta.text();
  expect(bruto).not.toContain('at ');
  expect(bruto).not.toContain('SELECT');
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun test apps/api/testes/api/erros.test.ts`
Expected: FAIL — `/api/v1/sessao` ainda não existe; responde 404 em HTML.

- [ ] **Step 3: Criar `apps/api/src/http/resposta.ts`**

```ts
/**
 * O vocabulário de resposta da API. Existe para que nenhuma rota invente seu próprio formato de
 * erro ou de página: quem responde JSON aqui responde igual em todo lugar, e o front tem um
 * contrato só para tratar.
 */
import type { Context } from 'hono';
import { contextoAtual } from '../shared/http';
import type { ErroDeAplicacao } from '../shared/resultado';

export type CorpoDeErro = {
  readonly erros: readonly ErroDeAplicacao[];
  readonly correlacaoId: string;
};

/** O código de correlação é o que o suporte usa para achar o rastro no log (I16). */
export const corpoDeErro = (erros: readonly ErroDeAplicacao[]): CorpoDeErro => ({
  erros,
  correlacaoId: contextoAtual()?.correlacaoId ?? '',
});

/**
 * Escrita concluída responde 201 com `Location`. O cabeçalho não é enfeite: é dele que o
 * middleware de idempotência tira o caminho que grava em `resposta_local` (I4).
 */
export const criado = <T>(c: Context, local: string, corpo: T): Response => {
  c.header('Location', local);
  return c.json(corpo as object, 201);
};
```

- [ ] **Step 4: Ensinar `middlewareErros` a falar JSON**

Em `shared/http/erros.ts`, `statusDoErro` passa a ser exportado e o middleware ganha o desvio:

```ts
const PREFIXO_DA_API = '/api/';

const respostaDeErro = (c: Context, status: StatusDeErro, erros: ErroDeAplicacao[]): Response => {
  // Enquanto o SSR existe, o caminho decide o formato. Na Task 33, quando as telas Eta saírem,
  // o ramo de HTML sai junto e este middleware vira quatro linhas.
  if (!c.req.path.startsWith(PREFIXO_DA_API)) return c.html(paginaDeErro(status), status);
  const correlacaoId = contextoAtual()?.correlacaoId ?? '';
  return c.json({ erros, correlacaoId }, status);
};
```

O `erros` de uma exceção é uma linha só, com o código e a mensagem genérica do status — **nunca** a
mensagem da exceção, que é informação de operação e fica no log:

```ts
const ERROS_POR_STATUS: Record<StatusDeErro, ErroDeAplicacao> = {
  400: { codigo: 'requisicao_invalida', mensagem: 'A requisição chegou incompleta ou malformada.' },
  401: { codigo: 'sem_sessao', mensagem: 'Entre para continuar.' },
  403: { codigo: 'sem_permissao', mensagem: 'Sua conta não tem permissão para esta operação.' },
  404: { codigo: 'nao_encontrado', mensagem: 'O registro não existe ou não está ao seu alcance.' },
  422: { codigo: 'regra_de_negocio', mensagem: 'A situação atual não permite concluir esta operação.' },
  500: { codigo: 'falha_interna', mensagem: 'Algo falhou do nosso lado. A ocorrência foi registrada.' },
};
```

`registrarFalha` não muda uma linha: o log continua com pilha, rota, tipo e correlação.

- [ ] **Step 5: Rodar os testes**

Run: `bun run test`
Expected: PASS — os testes novos ainda falham por falta de `/api/v1/sessao` (Task 9); os antigos
continuam verdes porque o ramo de HTML não mudou. Marque os dois testes novos com `test.todo` e
tire o `todo` na Task 9.

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/resposta.ts apps/api/src/shared/http/erros.ts \
        apps/api/src/shared/http/index.ts apps/api/testes/api/erros.test.ts
git commit -m "feat(http): erros da API em JSON, com código de correlação"
```

---

### Task 5: Idempotência por cabeçalho

**Files:**
- Modify: `apps/api/src/shared/http/idempotencia.ts`, `apps/api/src/shared/http/index.ts`
- Test: `apps/api/testes/api/idempotencia.test.ts`

**Interfaces:**
- Produces: `middlewareIdempotenciaJson: MiddlewareHandler`. Lê `Idempotency-Key`, deixa o corpo JSON em `c.get('corpo')` e grava `Location` na repetição. O `middlewareIdempotencia` de formulário continua existindo até a Task 33.

**Contexto:** a tabela `requisicao_idempotente` **não muda**. Muda de onde a chave vem e o que a
repetição responde.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('POST sem Idempotency-Key é recusado com 400', async () => {
  const cookie = await entrar(SECRETARIA);

  const resposta = await app.request('/api/v1/secretaria/disciplinas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requerido-Por': 'escolaviva', Cookie: cookie },
    body: JSON.stringify({ nome: 'Filosofia' }),
  });

  expect(resposta.status).toBe(400);
});

test('dois POST com a mesma chave criam um registro só e o segundo aponta para o primeiro', async () => {
  const cookie = await entrar(SECRETARIA);
  const chave = crypto.randomUUID();
  const corpo = { nome: 'Sociologia' };

  const primeira = await escreverComChave('POST', '/api/v1/secretaria/disciplinas', corpo, cookie, chave);
  const segunda = await escreverComChave('POST', '/api/v1/secretaria/disciplinas', corpo, cookie, chave);

  expect(primeira.status).toBe(201);
  expect(segunda.status).toBe(200);
  const repetida = await segunda.json();
  expect(repetida.repetida).toBe(true);
  expect(repetida.local).toBe(primeira.headers.get('Location'));

  const linhas = await sql`SELECT count(*)::int AS total FROM disciplina WHERE nome = 'Sociologia'`;
  expect(linhas[0].total).toBe(1);
});

test('recusa por validação devolve a chave, e a correção pode ser reenviada', async () => {
  const cookie = await entrar(SECRETARIA);
  const chave = crypto.randomUUID();

  const recusada = await escreverComChave('POST', '/api/v1/secretaria/disciplinas', { nome: '' }, cookie, chave);
  const corrigida = await escreverComChave('POST', '/api/v1/secretaria/disciplinas', { nome: 'Artes Cênicas' }, cookie, chave);

  expect(recusada.status).toBe(422);
  expect(corrigida.status).toBe(201);
});

test('PUT não exige chave: o método já é idempotente', async () => {
  const cookie = await entrar(PROFESSOR);

  const resposta = await app.request(`/api/v1/professor/turmas/${TURMA}/chamada`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Requerido-Por': 'escolaviva', Cookie: cookie },
    body: JSON.stringify({ data: '2026-03-10', linhas: [] }),
  });

  expect(resposta.status).not.toBe(400);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun test apps/api/testes/api/idempotencia.test.ts`
Expected: FAIL — as rotas `/api/v1` ainda não existem. Marque com `test.todo` e tire na Task 12/14.
O caso "PUT não exige chave" pode ser escrito já contra uma rota de teste montada no próprio arquivo.

- [ ] **Step 3: Implementar `middlewareIdempotenciaJson`**

```ts
export const CABECALHO_DE_CHAVE = 'Idempotency-Key';

const SEM_CHAVE: ErroDeAplicacao = {
  codigo: 'sem_chave_de_idempotencia',
  mensagem: `Toda criação precisa do cabeçalho ${CABECALHO_DE_CHAVE}.`,
};

const CORPO_MALFORMADO: ErroDeAplicacao = {
  codigo: 'corpo_malformado',
  mensagem: 'O corpo da requisição não é um JSON válido.',
};

/**
 * I4 continua valendo palavra por palavra: o navegador é entrada externa, e um responsável com 4G
 * ruim toca em "enviar" duas vezes. O que muda é o transporte da chave — cabeçalho, e não campo
 * oculto de formulário — e o que a repetição devolve: em vez do 303 para a página, um 200 com o
 * caminho do recurso que a primeira criou.
 *
 * `PUT` e `DELETE` passam direto: eles são idempotentes pelo método, e cobrar chave deles seria
 * aluguel sem dor.
 */
export const middlewareIdempotenciaJson: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'POST') return next();

  let corpo: unknown;
  try {
    corpo = await c.req.json();
  } catch {
    return c.json(corpoDeErro([CORPO_MALFORMADO]), 400);
  }
  c.set('corpo', corpo);

  const usuario = usuarioAtualOuNulo(c);
  // A linha exige `usuario_id`; a única escrita anônima é o próprio login, e repetir um login
  // apenas cria outra sessão — não há registro a proteger.
  if (usuario === null) return next();

  const chave = c.req.header(CABECALHO_DE_CHAVE);
  if (chave === undefined || !FORMATO_CHAVE.test(chave)) {
    logger.warn(redigir({ rota: c.req.path, usuario_id: usuario.id }), 'escrita sem chave de idempotência');
    return c.json(corpoDeErro([SEM_CHAVE]), 400);
  }

  const sql = escrita();
  const inseridas: { chave: string }[] = await sql`
    INSERT INTO requisicao_idempotente (chave, rota, usuario_id, resposta_hash, resposta_local)
    VALUES (${chave}, ${c.req.path}, ${usuario.id}, '', '')
    ON CONFLICT (chave) DO NOTHING
    RETURNING chave`;

  if (inseridas.length === 0) {
    const gravadas: { resposta_local: string }[] = await sql`
      SELECT resposta_local FROM requisicao_idempotente WHERE chave = ${chave}`;
    // Nenhum corpo de resposta é guardado: a senha provisória de um convite não pode ficar em
    // repouso numa tabela (I17). O que se guarda é para onde ir.
    return c.json({ repetida: true, local: gravadas[0]?.resposta_local ?? '' }, 200);
  }

  try {
    await next();
  } catch (erro) {
    await liberarChave(sql, chave);
    throw erro;
  }

  const local = c.res.headers.get('Location');
  if (local === null || c.res.status >= 400) {
    // Sem `Location` não houve criação concluída (o formulário voltou com erros): a chave é
    // devolvida para que a correção possa ser enviada.
    await liberarChave(sql, chave);
    return;
  }

  const hash = new Bun.CryptoHasher('sha256').update(local).digest('hex');
  await sql`
    UPDATE requisicao_idempotente
       SET resposta_local = ${local}, resposta_hash = ${hash}
     WHERE chave = ${chave}`;
};
```

- [ ] **Step 4: Alargar `Variaveis` para o corpo JSON**

Em `shared/http/index.ts`, `corpo` passa a ser `unknown` — quem sabe a forma é o esquema Zod da
rota, não o middleware:

```ts
export type Variaveis = {
  correlacaoId: string;
  sessaoId: string | null;
  usuario: UsuarioDaSessao | null;
  /** Formulário enquanto o SSR existir; objeto JSON nas rotas de `/api/v1`. */
  corpo: CorpoDeFormulario | unknown;
};
```

- [ ] **Step 5: Rodar a verificação**

Run: `bun run verificar`
Expected: PASS — o middleware antigo continua montado nas rotas Eta e nada regride.

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/shared/http/idempotencia.ts apps/api/src/shared/http/index.ts \
        apps/api/testes/api/idempotencia.test.ts
git commit -m "feat(http): idempotência por cabeçalho Idempotency-Key"
```

---

### Task 6: Escrita segura e CORS

**Files:**
- Create: `apps/api/src/http/escritaSegura.ts`, `apps/api/src/http/cors.ts`
- Test: `apps/api/testes/api/escrita_segura.test.ts`, `apps/api/testes/api/cors.test.ts`

**Interfaces:**
- Produces: `middlewareEscritaSegura: MiddlewareHandler`, `criarMiddlewareCors(origens: readonly string[]): MiddlewareHandler`

**Contexto:** cookie automático mais escrita por JSON abre falsificação de requisição entre sites,
que o formulário com PRG não tinha. Esta é a defesa, e ela é o primeiro custo concreto da decisão
de SPA.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('escrita sem X-Requerido-Por é recusada com 403', async () => {
  const cookie = await entrar(SECRETARIA);

  const resposta = await app.request('/api/v1/secretaria/disciplinas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), Cookie: cookie },
    body: JSON.stringify({ nome: 'Filosofia' }),
  });

  expect(resposta.status).toBe(403);
});

test('escrita com Content-Type de formulário é recusada com 415', async () => {
  const cookie = await entrar(SECRETARIA);

  const resposta = await app.request('/api/v1/secretaria/disciplinas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requerido-Por': 'escolaviva',
      'Idempotency-Key': crypto.randomUUID(),
      Cookie: cookie,
    },
    body: 'nome=Filosofia',
  });

  expect(resposta.status).toBe(415);
});

test('leitura não exige nenhum dos dois cabeçalhos', async () => {
  const cookie = await entrar(SECRETARIA);

  const resposta = await app.request('/api/v1/secretaria/disciplinas', { headers: { Cookie: cookie } });

  expect(resposta.status).toBe(200);
});
```

```ts
test('com a lista vazia, nenhum cabeçalho de CORS é emitido', async () => {
  const resposta = await app.request('/api/v1/sessao', {
    headers: { Origin: 'https://qualquer.test' },
  });

  expect(resposta.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

test('com a lista preenchida, a origem conhecida é ecoada e a desconhecida não', async () => {
  const cors = criarMiddlewareCors(['https://app.escolaviva.test']);
  const aplicacao = new Hono().use(cors).get('/x', (c) => c.text('ok'));

  const conhecida = await aplicacao.request('/x', { headers: { Origin: 'https://app.escolaviva.test' } });
  const estranha = await aplicacao.request('/x', { headers: { Origin: 'https://intruso.test' } });

  expect(conhecida.headers.get('Access-Control-Allow-Origin')).toBe('https://app.escolaviva.test');
  expect(conhecida.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  expect(conhecida.headers.get('Vary')).toContain('Origin');
  expect(estranha.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

test('o preflight responde 204 e declara os cabeçalhos que a escrita usa', async () => {
  const cors = criarMiddlewareCors(['https://app.escolaviva.test']);
  const aplicacao = new Hono().use(cors).post('/x', (c) => c.text('ok'));

  const resposta = await aplicacao.request('/x', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://app.escolaviva.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, idempotency-key, x-requerido-por',
    },
  });

  expect(resposta.status).toBe(204);
  const permitidos = resposta.headers.get('Access-Control-Allow-Headers') ?? '';
  expect(permitidos.toLowerCase()).toContain('idempotency-key');
  expect(permitidos.toLowerCase()).toContain('x-requerido-por');
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun test apps/api/testes/api/escrita_segura.test.ts apps/api/testes/api/cors.test.ts`
Expected: FAIL — os dois módulos não existem.

- [ ] **Step 3: Implementar `escritaSegura.ts`**

```ts
/**
 * A SPA escreve com cookie automático e corpo JSON, e isso abre falsificação de requisição entre
 * sites — problema que o formulário com POST-Redirect-GET não tinha. Duas exigências resolvem sem
 * tabela e sem token:
 *
 *   1. `Content-Type: application/json` — formulário HTML não consegue emitir esse tipo;
 *   2. `X-Requerido-Por` — cabeçalho fora da lista segura, que obriga o navegador a fazer
 *      preflight; e preflight só passa para origem permitida.
 *
 * Com a lista de origens vazia (mesma origem), a segunda exigência sozinha já barra o envio
 * cruzado: nenhum site externo consegue acrescentar o cabeçalho.
 */
const METODOS_DE_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const CABECALHO_DE_ORIGEM_INTERNA = 'X-Requerido-Por';
export const MARCA_DA_APLICACAO = 'escolaviva';
const TIPO_JSON = 'application/json';

export const middlewareEscritaSegura: MiddlewareHandler = async (c, next) => {
  if (!METODOS_DE_ESCRITA.has(c.req.method)) return next();

  if (c.req.header(CABECALHO_DE_ORIGEM_INTERNA) !== MARCA_DA_APLICACAO) {
    logger.warn(redigir({ rota: c.req.path, metodo: c.req.method }), 'escrita sem marca de origem interna');
    return c.json(corpoDeErro([ESCRITA_SEM_MARCA]), 403);
  }

  // DELETE não carrega corpo, e cobrar tipo de conteúdo dele seria cobrar por algo que não existe.
  if (c.req.method === 'DELETE') return next();

  if (!(c.req.header('Content-Type') ?? '').startsWith(TIPO_JSON)) {
    return c.json(corpoDeErro([TIPO_NAO_SUPORTADO]), 415);
  }

  return next();
};
```

- [ ] **Step 4: Implementar `cors.ts`**

```ts
/**
 * CORS que não faz nada enquanto ninguém precisa dele. Com `ORIGENS_PERMITIDAS` vazia — que é o
 * estado de hoje, front e API na mesma origem — nenhum cabeçalho é emitido, e o navegador nem
 * chega a perguntar.
 *
 * Nunca `*`: origem curinga é incompatível com credencial, e a sessão desta aplicação é cookie.
 */
export function criarMiddlewareCors(origens: readonly string[]): MiddlewareHandler {
  const permitidas = new Set(origens);
  const cabecalhosPermitidos = ['Content-Type', CABECALHO_DE_CHAVE, CABECALHO_DE_ORIGEM_INTERNA].join(', ');

  return async (c, next) => {
    if (permitidas.size === 0) return next();

    const origem = c.req.header('Origin');
    if (origem === undefined || !permitidas.has(origem)) {
      // Requisição sem origem é o próprio servidor ou um cliente que não é navegador; ela segue.
      // Origem desconhecida também segue, mas sem eco: quem barra é o navegador, ao não receber
      // a permissão.
      return c.req.method === 'OPTIONS' ? c.body(null, 204) : next();
    }

    c.header('Access-Control-Allow-Origin', origem);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin', { append: true });

    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', cabecalhosPermitidos);
      c.header('Access-Control-Max-Age', '600');
      return c.body(null, 204);
    }

    return next();
  };
}
```

- [ ] **Step 5: Rodar os testes**

Run: `bun test apps/api/testes/api/cors.test.ts`
Expected: PASS. Os de `escrita_segura.test.ts` continuam em `test.todo` até as rotas existirem.

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/escritaSegura.ts apps/api/src/http/cors.ts \
        apps/api/testes/api/escrita_segura.test.ts apps/api/testes/api/cors.test.ts
git commit -m "feat(http): exigência de marca interna na escrita e CORS por ambiente"
```

---

### Task 7: Cache e entrega do estático

**Files:**
- Create: `apps/api/src/http/estatico.ts`
- Modify: `apps/api/src/shared/http/cacheControl.ts`, `apps/api/src/web/app.ts`, `apps/api/src/shared/config/schema.ts`, `.env.example`
- Test: `apps/api/testes/api/estatico.test.ts`

**Interfaces:**
- Consumes: o padrão de variável vazia estabelecido na Task 3.
- Produces: `montarEstatico(app: AplicacaoWeb): void` — registra `/assets/*` e o fallback de SPA; `config.caminhoDoFront: string`.

**Contexto:** o `dist` ainda não existe. Os testes desta tarefa criam um `dist` de mentira em pasta
temporária e apontam `CAMINHO_DO_FRONT` para ele — é o que permite provar o fallback antes de haver
front.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('o asset com hash no nome pode ser guardado para sempre', async () => {
  const resposta = await ler('/assets/app-a1b2c3.css');

  expect(resposta.status).toBe(200);
  expect(resposta.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
});

test('caminho de tela devolve o index.html, e ele nunca vai para cache', async () => {
  const resposta = await ler('/secretaria/alunos/01HZZZ');

  expect(resposta.status).toBe(200);
  expect(resposta.headers.get('Content-Type')).toContain('text/html');
  expect(resposta.headers.get('Cache-Control')).toBe('no-store');
});

test('caminho de API inexistente devolve 404 em JSON, e não o index.html', async () => {
  const resposta = await ler('/api/v1/inexistente');

  expect(resposta.status).toBe(404);
  expect(resposta.headers.get('Content-Type')).toContain('application/json');
});

test('a saúde continua fora do fallback', async () => {
  const resposta = await ler('/health/live');

  expect(resposta.status).toBe(200);
  expect(resposta.headers.get('Content-Type')).not.toContain('text/html');
});

test('nome de asset com travessia de diretório é recusado', async () => {
  const resposta = await ler('/assets/..%2F..%2F.env');

  expect(resposta.status).toBe(404);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun test apps/api/testes/api/estatico.test.ts`
Expected: FAIL — `montarEstatico` não existe.

- [ ] **Step 3: Implementar `estatico.ts`**

```ts
/**
 * A entrega do front. Duas regras, e a diferença entre elas é a razão de I10 continuar de pé
 * mesmo depois que o `build-assets.ts` sair:
 *
 *   - `/assets/*` carrega o hash do conteúdo no nome, posto lá pelo Vite. Trocar o arquivo troca
 *     o nome, então guardar para sempre é seguro;
 *   - `index.html` é o único que aponta para os nomes com hash. Se ele for para cache, o
 *     navegador continua pedindo o bundle da versão anterior depois do deploy — por isso
 *     `no-store`, sem exceção.
 *
 * O fallback existe porque as URLs do sistema são resolvidas pelo React Router: apertar F5 em
 * `/secretaria/alunos/01H…` chega aqui, e tem de receber a aplicação, não 404.
 */
const CAMINHOS_DO_SERVIDOR = ['/api', '/health'];
const PREFIXO_DE_ASSET = '/assets/';
const NOME_DE_ASSET = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;

const TIPOS: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  png: 'image/png',
  woff2: 'font/woff2',
};

export function montarEstatico(app: AplicacaoWeb): void {
  const raizDoFront = config.caminhoDoFront;

  app.get(`${PREFIXO_DE_ASSET}*`, async (c) => {
    const nome = c.req.path.slice(PREFIXO_DE_ASSET.length);
    if (!NOME_DE_ASSET.test(nome)) return c.notFound();

    const arquivo = Bun.file(join(raizDoFront, 'assets', nome));
    if (!(await arquivo.exists())) return c.notFound();

    return new Response(arquivo, { headers: { 'Content-Type': tipoDoAsset(nome) } });
  });

  app.get('*', async (c) => {
    if (CAMINHOS_DO_SERVIDOR.some((prefixo) => c.req.path.startsWith(prefixo))) return c.notFound();

    const documento = Bun.file(join(raizDoFront, 'index.html'));
    if (!(await documento.exists())) return c.notFound();

    return new Response(documento, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
}
```

`config.caminhoDoFront` entra em `shared/config/schema.ts` com `CAMINHO_DO_FRONT` vazio por padrão,
resolvido para `<raiz do repositório>/apps/web/dist`. A variável existe para o `infra/Dockerfile`,
que copia o `dist` para outro lugar dentro da imagem.

- [ ] **Step 4: Trocar o prefixo no `cacheControl.ts`**

```ts
const PREFIXO_DE_ASSET = '/assets/';
const CACHE_DE_ASSET = 'public, max-age=31536000, immutable';
```

E o ramo do documento, antes do teste de sessão:

```ts
// O `index.html` é a única coisa que sabe o nome do bundle desta versão. Guardá-lo é servir a
// versão anterior para sempre.
if (ehDocumentoDaAplicacao(c)) {
  c.header('Cache-Control', 'no-store');
  return;
}
```

- [ ] **Step 5: Montar em `app.ts`, depois das rotas**

`montarEstatico(app)` entra **depois** de `montarRotas(app)` e substitui o `app.notFound` de hoje
para os caminhos de tela. O `app.notFound` continua existindo para `/api` e `/health`.

- [ ] **Step 6: Rodar os testes**

Run: `bun run verificar`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/http/estatico.ts apps/api/src/shared/http/cacheControl.ts \
        apps/api/src/shared/config/schema.ts apps/api/src/web/app.ts \
        apps/api/testes/api/estatico.test.ts .env.example
git commit -m "feat(http): entrega do dist do Vite com fallback de SPA"
```

---

### Task 8: Contratos, apresentadores base e o apoio de teste em JSON

**Files:**
- Create: `apps/api/src/http/contratos/index.ts`, `contratos/pagina.ts`, `contratos/enumeracoes.ts`, `contratos/sessao.ts`, `apps/api/src/http/apresentadores/pagina.ts`, `apps/api/src/http/esquemas/analisar.ts`
- Modify: `apps/api/.dependency-cruiser.js`, `apps/api/testes/apoio/apoio.ts`

**Interfaces:**
- Produces:
  - `type Pagina<T> = { itens: readonly T[]; pagina: number; paginas: number; total: number; tamanho: number }`
  - `paginaEmJson<T, U>(pagina: PaginaDoDominio<T>, item: (valor: T) => U): Pagina<U>`
  - `analisar<T>(esquema: ZodType<T>, corpo: unknown): Resultado<T>`
  - `TURNOS`, `PAPEIS`, `BIMESTRES`, `SITUACOES_DE_MATRICULA` — listas fechadas do domínio
  - `type UsuarioDaSessaoEmJson`
  - apoio de teste: `ler(caminho, cookie?)`, `escrever(metodo, caminho, corpo, cookie?)`, `escreverComChave(...)`, `entrar(credenciais)`

**Contexto:** `contratos/` é a única pasta do servidor que o front pode importar. Ela precisa
continuar carregável por um bundler de navegador, o que significa **zero import** — nem de `zod`,
nem de `hono`, nem de outro arquivo do projeto.

- [ ] **Step 1: Escrever a regra do dependency-cruiser que falha**

Em `apps/api/.dependency-cruiser.js`:

```js
{
  name: 'contratos-sem-dependencia',
  comment:
    'É a única pasta do servidor que o front importa, e ele a carrega com um bundler de ' +
    'navegador. Um import aqui — de zod, de hono, de outro módulo — arrastaria código de ' +
    'servidor para dentro do bundle, ou simplesmente não resolveria. Contrato é forma, e forma ' +
    'não tem dependência.',
  severity: 'error',
  from: { path: '^apps/api/src/http/contratos/' },
  to: { pathNot: '^apps/api/src/http/contratos/' },
},
```

- [ ] **Step 2: Rodar para ver a regra existir e passar sobre a pasta vazia**

Run: `bun run check`
Expected: PASS (nada em `contratos/` ainda).

- [ ] **Step 3: Escrever os contratos**

`contratos/pagina.ts`:

```ts
/** A forma que toda lista paginada devolve. É o `Pagina<T>` do domínio, sem nada a mais. */
export type Pagina<T> = {
  readonly itens: readonly T[];
  readonly pagina: number;
  readonly paginas: number;
  readonly total: number;
  readonly tamanho: number;
};
```

`contratos/enumeracoes.ts`:

```ts
/**
 * Listas fechadas do domínio. Elas são valor, e não tipo, porque o front precisa iterá-las para
 * montar um seletor. O rótulo de tela ("Matutino") é do front: aqui mora só o que o banco aceita.
 */
export const TURNOS = ['matutino', 'vespertino', 'noturno', 'integral'] as const;
export const PAPEIS = ['admin_rede', 'secretaria', 'professor', 'responsavel'] as const;
export const BIMESTRES = [1, 2, 3, 4] as const;
export const SITUACOES_DE_MATRICULA = ['ativa', 'transferida', 'cancelada', 'concluida'] as const;

export type Turno = (typeof TURNOS)[number];
export type Papel = (typeof PAPEIS)[number];
export type SituacaoDeMatricula = (typeof SITUACOES_DE_MATRICULA)[number];
```

`contratos/sessao.ts`:

```ts
export type AtribuicaoEmJson = {
  readonly unidadeId: string;
  readonly unidadeNome: string;
  readonly papel: Papel;
};

export type UsuarioDaSessaoEmJson = {
  readonly id: string;
  readonly nome: string;
  readonly email: string;
  readonly redeId: string;
  readonly redeNome: string;
  readonly redeSlug: string;
  readonly papeis: readonly AtribuicaoEmJson[];
  readonly responsavelId: string | null;
};
```

- [ ] **Step 4: Escrever `apresentadores/pagina.ts` e `esquemas/analisar.ts`**

```ts
/** A tradução única de `Pagina<T>` do domínio para o JSON da resposta. */
export const paginaEmJson = <T, U>(
  pagina: PaginaDoDominio<T>,
  item: (valor: T) => U,
): Pagina<U> => ({
  itens: pagina.itens.map(item),
  pagina: pagina.pagina,
  paginas: pagina.paginas,
  total: pagina.total,
  tamanho: pagina.tamanho,
});
```

```ts
/**
 * A borda valida forma e devolve o mesmo `Resultado` que os casos de uso devolvem — é o que
 * permite que a rota trate os dois com o mesmo `if (!x.ok)`, mudando só o status.
 */
export function analisar<T>(esquema: ZodType<T>, corpo: unknown): Resultado<T> {
  const analise = esquema.safeParse(corpo);
  if (analise.success) return sucesso(analise.data);
  return falha<T>(...errosDeSchema(analise.error.issues));
}
```

- [ ] **Step 5: Estender o apoio de teste com JSON**

Em `apps/api/testes/apoio/apoio.ts`, três funções novas ao lado das de formulário, que continuam
existindo até a Task 33:

```ts
const MARCA = { 'X-Requerido-Por': 'escolaviva' };

/** GET na API, com ou sem sessão. */
export async function ler(caminho: string, cookie = ''): Promise<Response> {
  return await app.request(caminho, { headers: cabecalhos(cookie) });
}

/** Escrita com chave nova a cada chamada — o que o navegador faz em cada envio. */
export function escrever(
  metodo: 'POST' | 'PUT' | 'DELETE',
  caminho: string,
  corpo: unknown,
  cookie = '',
): Promise<Response> {
  return escreverComChave(metodo, caminho, corpo, cookie, crypto.randomUUID());
}

/** Escrita com chave ditada — é assim que se prova o reenvio de I4. */
export async function escreverComChave(
  metodo: 'POST' | 'PUT' | 'DELETE',
  caminho: string,
  corpo: unknown,
  cookie: string,
  chave: string,
): Promise<Response> {
  return await app.request(caminho, {
    method: metodo,
    headers: cabecalhos(cookie, {
      ...MARCA,
      'Content-Type': 'application/json',
      'Idempotency-Key': chave,
    }),
    ...(metodo === 'DELETE' ? {} : { body: JSON.stringify(corpo) }),
  });
}
```

`entrar` ganha a versão JSON na Task 9, quando `/api/v1/sessao` existir.

- [ ] **Step 6: Rodar a verificação**

Run: `bun run verificar`
Expected: PASS, com a regra `contratos-sem-dependencia` ativa e sem violação.

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/http/contratos apps/api/src/http/apresentadores/pagina.ts \
        apps/api/src/http/esquemas/analisar.ts apps/api/.dependency-cruiser.js \
        apps/api/testes/apoio/apoio.ts
git commit -m "feat(http): contratos sem dependência e vocabulário de resposta"
```

---

### Task 9: Sessão, conta e a montagem de `/api/v1`

**Files:**
- Create: `apps/api/src/http/rotas/sessao.ts`, `apps/api/src/http/rotas/conta.ts`, `apps/api/src/http/rotas/api.ts`, `apps/api/src/http/apresentadores/sessao.ts`, `apps/api/src/http/esquemas/sessao.ts`
- Modify: `apps/api/src/web/app.ts`, `apps/api/testes/apoio/apoio.ts`
- Test: `apps/api/testes/api/sessao.test.ts`, `apps/api/testes/api/conta.test.ts`

**Interfaces:**
- Produces: `montarApi(app: AplicacaoWeb): void` — pendura `/api/v1` com a ordem de middlewares correta. As frentes da fase 2 registram seus routers dentro de `rotas/api.ts`.
- Produces: `entrar(credenciais): Promise<string>` no apoio, agora falando com `POST /api/v1/sessao`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('credenciais válidas abrem sessão e devolvem o usuário', async () => {
  const resposta = await escrever('POST', '/api/v1/sessao', {
    redeSlug: 'demo', identificador: 'secretaria1@escolaviva.test', senha: 'escolaviva',
  });

  expect(resposta.status).toBe(201);
  const { usuario } = await resposta.json();
  expect(usuario.redeSlug).toBe('demo');
  expect(usuario.papeis.some((p) => p.papel === 'secretaria')).toBe(true);
  expect(resposta.headers.get('Set-Cookie')).toContain('ev_sessao=');
});

test('rede, identificador e senha errados voltam pela mesma porta', async () => {
  const redeErrada = await escrever('POST', '/api/v1/sessao', {
    redeSlug: 'inexistente', identificador: 'secretaria1@escolaviva.test', senha: 'escolaviva',
  });
  const senhaErrada = await escrever('POST', '/api/v1/sessao', {
    redeSlug: 'demo', identificador: 'secretaria1@escolaviva.test', senha: 'errada',
  });

  expect(redeErrada.status).toBe(422);
  expect(senhaErrada.status).toBe(422);
  expect(await redeErrada.json()).toEqual(await senhaErrada.json());
});

test('GET /sessao sem cookie responde 401; com cookie, devolve quem entrou', async () => {
  const semSessao = await ler('/api/v1/sessao');
  const cookie = await entrar(SECRETARIA);
  const comSessao = await ler('/api/v1/sessao', cookie);

  expect(semSessao.status).toBe(401);
  expect(comSessao.status).toBe(200);
  const { usuario } = await comSessao.json();
  expect(usuario.email).toBe(SECRETARIA.email);
});

test('sair apaga a linha da sessão antes de apagar o cookie', async () => {
  const cookie = await entrar(SECRETARIA);

  const saida = await escrever('DELETE', '/api/v1/sessao', null, cookie);
  const depois = await ler('/api/v1/sessao', cookie);

  expect(saida.status).toBe(204);
  expect(depois.status).toBe(401);
});

test('a senha nunca volta na resposta, nem em erro', async () => {
  const resposta = await escrever('POST', '/api/v1/sessao', {
    redeSlug: 'demo', identificador: 'secretaria1@escolaviva.test', senha: 'escolaviva',
  });

  expect(await resposta.text()).not.toContain('escolaviva');
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun test apps/api/testes/api/sessao.test.ts`
Expected: FAIL — `/api/v1/sessao` não existe; o fallback de SPA responde HTML.

- [ ] **Step 3: Implementar `rotas/sessao.ts`**

A lógica é a de `web/rotas/login.ts`, com três diferenças: o corpo vem de `c.get('corpo')` já em
JSON, a resposta é `201` com o usuário em vez de `303`, e o `logout` vira `DELETE` respondendo
`204`. As duas decisões que governam o arquivo continuam valendo e continuam comentadas: a tela não
é um oráculo, e a tentativa vai para o log — o CPF ou e-mail digitado, não.

```ts
rotasSessao.post('/', async (c) => {
  if (usuarioAtualOuNulo(c) !== null) {
    return c.json({ usuario: usuarioEmJson(usuarioAtual(c)) }, 200);
  }

  const entrada = analisar(esquemaDeEntrada, c.get('corpo'));
  if (!entrada.ok) return c.json(corpoDeErro(entrada.erros), 400);

  const ip = ipDoCliente(c.req.raw, enderecoRemoto(c), config.proxiesConfiaveis);
  const resultado = await identidade.autenticar({ ...entrada.valor, ip });

  if (!resultado.ok) {
    logger.warn({ rede_slug: entrada.valor.redeSlug, resultado: 'recusado', ip }, 'tentativa de entrada');
    return c.json(corpoDeErro(resultado.erros), 422);
  }

  await abrirSessao(c, resultado.valor.sessaoId);
  logger.info({ rede_slug: entrada.valor.redeSlug, resultado: 'sucesso', ip }, 'tentativa de entrada');
  return c.json({ usuario: usuarioEmJson(usuarioAtual(c)) }, 201);
});
```

O `esquemaDeEntrada` **não apara a senha**: espaço no início ou no fim faz parte do que a pessoa
escolheu. Rede e identificador são aparados.

- [ ] **Step 4: Implementar `rotas/conta.ts`**

`PUT /senha`, com a conferência da confirmação antes de chamar o caso de uso — conferir aqui evita
gastar cem milissegundos de verificação de hash para descobrir que a pessoa se enganou ao
redigitar. Responde `204`. Nenhuma senha volta para a tela nem entra em linha de log.

- [ ] **Step 5: Implementar `rotas/api.ts` com a ordem dos middlewares**

```ts
/**
 * A ordem é a própria semântica da API:
 *   1. CORS      — precisa responder ao preflight antes de qualquer coisa olhar sessão;
 *   2. escrita segura — barra a falsificação antes de o corpo ser lido;
 *   3. idempotência   — lê o corpo uma vez e o deixa no contexto (I4);
 *   4. routers.
 *
 * Erros, correlação, cache e sessão já rodaram em `app.ts`, para a aplicação inteira.
 */
export function montarApi(app: AplicacaoWeb): void {
  const api = new Hono<{ Variables: Variaveis }>();

  api.use(criarMiddlewareCors(config.origensPermitidas));
  api.use(middlewareEscritaSegura);
  api.use(middlewareIdempotenciaJson);

  api.route('/sessao', rotasSessao);
  api.route('/conta', rotasConta);
  // As frentes da fase 2 acrescentam suas linhas aqui, uma cada.

  app.route('/api/v1', api);
}
```

`montarApi(app)` entra em `app.ts` **antes** de `montarRotas(app)` e antes de `montarEstatico(app)`.

- [ ] **Step 6: Trocar o `entrar` do apoio de teste**

```ts
export async function entrar(credenciais: Credenciais): Promise<string> {
  const resposta = await escrever('POST', '/api/v1/sessao', {
    redeSlug: credenciais.redeSlug,
    identificador: credenciais.email,
    senha: credenciais.senha,
  });
  if (resposta.status !== 201) {
    throw new Error(`login recusado com status ${resposta.status} — cenário mal montado`);
  }
  const cookie = cookieDaResposta(resposta);
  if (cookie === '') throw new Error('login sem Set-Cookie — cenário mal montado');
  return cookie;
}
```

`entrarPorFormulario` fica como estava, para as suítes de `testes/web/` que ainda vivem.

- [ ] **Step 7: Tirar o `test.todo` dos testes das Tasks 4, 5 e 6 que já podem rodar**

Os casos de `erros.test.ts` e o de `escrita_segura.test.ts` que usam `/api/v1/sessao` agora passam.

- [ ] **Step 8: Rodar a verificação inteira**

Run: `bun run verificar`
Expected: PASS. As suítes de `testes/web/` continuam verdes — o SSR não foi tocado.

- [ ] **Step 9: Commit**

```bash
git status --short
git add apps/api/src/http/rotas/sessao.ts apps/api/src/http/rotas/conta.ts \
        apps/api/src/http/rotas/api.ts apps/api/src/http/apresentadores/sessao.ts \
        apps/api/src/http/esquemas/sessao.ts apps/api/src/web/app.ts \
        apps/api/testes/apoio/apoio.ts apps/api/testes/api/sessao.test.ts \
        apps/api/testes/api/conta.test.ts apps/api/testes/api/erros.test.ts \
        apps/api/testes/api/escrita_segura.test.ts
git commit -m "feat(api): sessão e conta em JSON sob /api/v1"
```

---

# FASE 2 — A API, por papel

Sete frentes paralelas. Cada uma segue o mesmo roteiro de cinco passos, com os padrões **P1 a P5**
da seção "Padrões de Implementação" — leia-a antes de começar.

**Roteiro comum a T10–T16:**

1. Escrever a suíte da frente com todos os casos da tabela da tarefa, e vê-la falhar.
2. Escrever o contrato em `contratos/<frente>.ts` (só tipos, nenhum import).
3. Escrever o apresentador em `apresentadores/<frente>.ts` (P3).
4. Escrever o esquema de borda em `esquemas/<frente>.ts` (P4) e o router (P1, P2).
5. Registrar a linha `api.route('/<prefixo>', rotas<Frente>)` em `rotas/api.ts`.
6. `bun run verificar` verde, e commit com `git add` explícito só dos arquivos da frente.

**Sobre o passo 5:** `rotas/api.ts` é arquivo compartilhado. Se duas frentes estiverem em voo ao
mesmo tempo, cada uma acrescenta **uma linha** no ponto marcado por comentário no arquivo. Conflito
de merge aqui é de uma linha e resolve-se lendo; conflito em qualquer outro arquivo significa que
alguém saiu da sua coluna.

**Sobre a autorização:** todo router registra `exigirPapel(...)` como primeiro middleware, igual
hoje. Alcance fora do papel responde **404**, nunca 403.

---

### Task 10: API — Seleções

**Files:**
- Create: `apps/api/src/http/rotas/selecoes.ts`, `apps/api/src/http/contratos/selecoes.ts`, `apps/api/src/http/apresentadores/selecoes.ts`
- Modify: `apps/api/src/http/rotas/api.ts`
- Test: `apps/api/testes/api/selecoes.test.ts`

**Interfaces:**
- Produces: `type OpcaoDeUnidade = { id: string; nome: string; ativa: boolean }`, `type OpcaoDeAnoLetivo = { id: string; ano: number }`, `type OpcaoDeTurma = { id: string; nome: string; serie: string; turno: Turno; unidadeId: string; unidadeNome: string; anoLetivoId: string; ano: number | null }`, `type OpcaoSimples = { id: string; nome: string }`

**Contexto:** estas listas existem hoje espalhadas dentro dos `GET /novo`. Cada uma tinha o seu jeito
de recortar; concentrá-las é o que permite ao TanStack Query cacheá-las com tempo de vida longo.

| Endpoint | Fonte | Alcance |
|---|---|---|
| `GET /selecoes/unidades` | `identidade.listarUnidades` recortado pelos papéis da sessão | qualquer papel |
| `GET /selecoes/anos-letivos` | `academico.listarAnosLetivos` | `admin_rede`, `secretaria` |
| `GET /selecoes/responsaveis` | `academico.listarResponsaveis` | `admin_rede`, `secretaria` |
| `GET /selecoes/turmas` | `academico.listarTurmas` no alcance da secretaria, com ano e nome de unidade | `secretaria` |
| `GET /selecoes/disciplinas` | `academico.listarDisciplinas` | `secretaria` |
| `GET /selecoes/professores?unidadeId=` | `identidade.professoresDaUnidade` | `secretaria` |

**Casos de teste obrigatórios:**

| Caso | Espera |
|---|---|
| secretaria pede unidades | só as unidades onde ela tem o papel |
| admin_rede pede unidades | todas as unidades da rede |
| responsável pede disciplinas | 403 |
| sem sessão | 401 em todas as seis |
| `?unidadeId=` de fora do alcance em `/professores` | 404 |
| `/selecoes/turmas` traz o nome da unidade e o ano resolvidos | nenhum `null` onde há dado |

- [ ] **Step 1: Escrever a suíte e vê-la falhar** (P5)
- [ ] **Step 2: Escrever `contratos/selecoes.ts`** — só tipos
- [ ] **Step 3: Escrever `apresentadores/selecoes.ts`** (P3)
- [ ] **Step 4: Escrever `rotas/selecoes.ts`** (P1) e registrar em `rotas/api.ts`
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/rotas/selecoes.ts apps/api/src/http/contratos/selecoes.ts \
        apps/api/src/http/apresentadores/selecoes.ts apps/api/src/http/rotas/api.ts \
        apps/api/testes/api/selecoes.test.ts
git commit -m "feat(api): seleções para os campos de escolha dos formulários"
```

---

### Task 11: API — Rede

**Files:**
- Create: `apps/api/src/http/rotas/rede.ts`, `contratos/rede.ts`, `apresentadores/rede.ts`, `esquemas/rede.ts`
- Modify: `apps/api/src/http/rotas/api.ts`
- Test: `apps/api/testes/api/rede.test.ts`

**Interfaces:**
- Produces: `type ContagensDaRede = { unidades: number; usuarios: number; turmas: number; matriculados: number }`, `type UnidadeEmLista`, `type UsuarioEmLista`, `type AnoLetivoEmLista`, `type ConviteAceito = { usuarioId: string; senhaProvisoria: string }`

| Endpoint | Corpo / query | Resposta |
|---|---|---|
| `GET /rede/painel` | — | `{ contagens, anoLetivo, anosDefinidos }` |
| `GET /rede/unidades?p=` | — | `Pagina<UnidadeEmLista>` |
| `POST /rede/unidades` | `{nome, codigoInep}` | `201 {id}` + `Location` |
| `GET /rede/usuarios?p=` | — | `Pagina<UsuarioEmLista>` |
| `POST /rede/usuarios` | `{nome, email, cpf, responsavelId, atribuicoes:[{unidadeId, papel}]}` | `201 {usuarioId, senhaProvisoria}` |
| `GET /rede/anos-letivos?p=` | — | `Pagina<AnoLetivoEmLista>` |
| `POST /rede/anos-letivos` | `{ano: number, dataInicio, dataFim}` | `201 {id}` |

**O que some nesta tarefa:** `COOKIE_DO_CONVITE`, `VALIDADE_DO_CONVITE_S`, `guardarConvite` e
`retirarConvite`. Eles existem hoje só porque a senha provisória precisava atravessar um
redirecionamento sem entrar na URL nem na coluna `resposta_local`. Com JSON ela volta no corpo do
`201`, é exibida uma vez pelo front e não fica em repouso em lugar nenhum.

**O que também some:** `ANO_EM_QUATRO_DIGITOS` e a conversão manual de `ano` para número. Com JSON o
campo chega número e a checagem vira `z.number().int()` no esquema de borda.

**O que continua exatamente igual:** a comparação do CPF digitado contra o do cadastro do
responsável. Só a camada HTTP enxerga `identidade` e `academico` ao mesmo tempo (I1), e é aqui — e
só aqui — que essa conferência pode acontecer.

**Casos de teste obrigatórios:** além dos da tabela de P5, um por linha:

| Caso | Espera |
|---|---|
| convite bem-sucedido | `201` com `senhaProvisoria` no corpo |
| a senha provisória **não** aparece no log | varredura do log do fluxo não a encontra |
| a senha provisória **não** entra em `requisicao_idempotente` | `SELECT resposta_local` não a contém |
| repetir o convite com a mesma chave | `200 {repetida:true}`, e **um** usuário criado |
| atribuição com unidade sem papel | `422`, campo `atribuicoes` |
| CPF divergente do cadastro do responsável | `422`, campo `cpf` |
| `ano` como texto no corpo | `400`, campo `ano` |
| secretaria tentando `POST /rede/unidades` | `403` |

- [ ] **Step 1: Escrever a suíte e vê-la falhar** (P5)
- [ ] **Step 2: `contratos/rede.ts`**
- [ ] **Step 3: `apresentadores/rede.ts`** (P3)
- [ ] **Step 4: `esquemas/rede.ts`** (P4) e `rotas/rede.ts` (P1, P2); registrar em `rotas/api.ts`
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/rotas/rede.ts apps/api/src/http/contratos/rede.ts \
        apps/api/src/http/apresentadores/rede.ts apps/api/src/http/esquemas/rede.ts \
        apps/api/src/http/rotas/api.ts apps/api/testes/api/rede.test.ts
git commit -m "feat(api): administração da rede em JSON"
```

---

### Task 12: API — Secretaria A: alunos, responsáveis e matrículas

**Files:**
- Create: `apps/api/src/http/rotas/secretaria/alunos.ts`, `contratos/alunos.ts`, `apresentadores/alunos.ts`, `esquemas/alunos.ts`
- Modify: `apps/api/src/http/rotas/api.ts`
- Test: `apps/api/testes/api/secretaria_alunos.test.ts`

**Interfaces:**
- Produces: `type AlunoEmLista = { id: string; nome: string; dataNascimento: string; turmaNome: string | null; ano: number | null; situacao: SituacaoDeMatricula | null }`, `type FichaDoAluno`, `type MatriculaEmLista`, `type VinculoEmLista`, `type ResponsavelEmLista`

| Endpoint | Corpo / query | Resposta |
|---|---|---|
| `GET /secretaria/painel?p=` | — | `{ unidades: Pagina<ContagemDaUnidade>, anoCorrente, totais }` |
| `GET /secretaria/alunos?q=&p=` | — | `Pagina<AlunoEmLista>`; sem `q`, página vazia |
| `POST /secretaria/alunos` | `{nome, dataNascimento}` | `201 {id}` |
| `GET /secretaria/alunos/:id?pResponsaveis=&pMatriculas=` | — | `FichaDoAluno` |
| `GET /secretaria/alunos/:id/responsaveis-disponiveis` | — | `OpcaoSimples[]` |
| `POST /secretaria/alunos/:id/responsaveis` | `{responsavelId, parentesco, financeiro: boolean}` | `201` |
| `GET /secretaria/responsaveis?p=` | — | `Pagina<ResponsavelEmLista>` |
| `POST /secretaria/responsaveis` | `{nome, email, telefone, cpf}` | `201 {id}` |
| `POST /secretaria/matriculas` | `{alunoId, turmaId, anoLetivoId, dataMatricula}` | `201 {id}` |
| `GET /secretaria/matriculas/:id` | — | `{matricula, aluno}` |
| `POST /secretaria/matriculas/:id/transferencia` | `{turmaDestinoId, data}` | `201 {id}` |

**Regras de alcance que não podem afrouxar** — hoje elas vivem em `alunoNoAlcance`,
`turmaNoAlcance` e `transferenciaNoAlcance`, e migram intactas:

- aluno que estuda em outra unidade da rede **não existe** para esta secretaria (404);
- aluno ainda sem matrícula é da rede e aparece para todas;
- turma de destino fora do alcance responde **404**, e não erro de campo — a tela não confirma que
  ela existe;
- `financeiro` chega `boolean` no JSON, e não mais como "campo presente = marcado".

**Casos de teste obrigatórios:** os da tabela de P5 para cada endpoint, mais:

| Caso | Espera |
|---|---|
| `GET /alunos` sem `q` | `200` com `total: 0`, e **nenhuma** consulta de busca |
| aluno de outra unidade com matrícula lá | `404` na ficha |
| aluno sem matrícula nenhuma | `200` para qualquer secretaria da rede |
| ficha com `?pResponsaveis=2&pMatriculas=1` | avança só a tabela de responsáveis |
| matrícula com `turmaId` fora do alcance | `404`, não `422` |
| responsável já vinculado | não aparece em `responsaveis-disponiveis` |
| transferência para a turma de origem | `422` |

- [ ] **Step 1: Escrever a suíte e vê-la falhar** (P5)
- [ ] **Step 2: `contratos/alunos.ts`**
- [ ] **Step 3: `apresentadores/alunos.ts`** (P3)
- [ ] **Step 4: `esquemas/alunos.ts`** (P4) e `rotas/secretaria/alunos.ts` (P1, P2); registrar em `rotas/api.ts`
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/rotas/secretaria/alunos.ts apps/api/src/http/contratos/alunos.ts \
        apps/api/src/http/apresentadores/alunos.ts apps/api/src/http/esquemas/alunos.ts \
        apps/api/src/http/rotas/api.ts apps/api/testes/api/secretaria_alunos.test.ts
git commit -m "feat(api): alunos, responsáveis e matrículas em JSON"
```

---

### Task 13: API — Secretaria B: turmas e disciplinas

**Files:**
- Create: `apps/api/src/http/rotas/secretaria/turmas.ts`, `contratos/turmas.ts`, `apresentadores/turmas.ts`, `esquemas/turmas.ts`
- Modify: `apps/api/src/http/rotas/api.ts`
- Test: `apps/api/testes/api/secretaria_turmas.test.ts`

**Interfaces:**
- Produces: `type TurmaEmLista = { id: string; nome: string; serie: string; turno: Turno; unidadeId: string; unidadeNome: string; anoLetivoId: string; ano: number | null }`, `type FichaDaTurma`, `type AlocacaoEmLista = { id: string; disciplinaNome: string; professorNome: string }`, `type DisciplinaEmLista`

| Endpoint | Corpo / query | Resposta |
|---|---|---|
| `GET /secretaria/turmas?unidade=&ano=&p=` | — | `Pagina<TurmaEmLista>` |
| `POST /secretaria/turmas` | `{nome, serie, turno, unidadeId, anoLetivoId}` | `201 {id}` |
| `GET /secretaria/turmas/:id?pDisciplinas=&pMatriculas=` | — | `FichaDaTurma` |
| `POST /secretaria/turmas/:id/disciplinas` | `{disciplinaId, professorUsuarioId}` | `201 {id}` |
| `GET /secretaria/disciplinas?p=` | — | `Pagina<DisciplinaEmLista>` |
| `POST /secretaria/disciplinas` | `{nome}` | `201 {id}` |

**Regras que migram intactas:**

- filtro de unidade ou de ano **fora do alcance** vale como "todas" e nunca vira consulta — não é
  erro, é filtro ignorado;
- `unidadeId` fora do alcance no `POST /turmas` responde **404**;
- o nome do professor alocado sai de **uma** consulta por tela (`identidade.nomesDeUsuarios`),
  nunca uma por linha — o professor alocado pode já não estar na unidade;
- as duas tabelas da ficha da turma têm parâmetros próprios (`pDisciplinas`, `pMatriculas`), porque
  avançar uma não pode mexer na outra.

**Casos de teste obrigatórios:** os de P5 para cada endpoint, mais:

| Caso | Espera |
|---|---|
| `?unidade=` de fora do alcance | `200` com a lista completa do alcance, não `404` |
| `?ano=` inexistente | `200` sem filtrar por ele |
| `POST /turmas` com `unidadeId` de outra secretaria | `404` |
| `POST /turmas` com `turno` fora de `TURNOS` | `400`, campo `turno` |
| ficha da turma com alocação cujo professor saiu da unidade | `professorNome` é `'—'`, não erro |
| `?pDisciplinas=2` | avança só a tabela de alocações |

- [ ] **Step 1: Escrever a suíte e vê-la falhar** (P5)
- [ ] **Step 2: `contratos/turmas.ts`**
- [ ] **Step 3: `apresentadores/turmas.ts`** (P3)
- [ ] **Step 4: `esquemas/turmas.ts`** (P4) e `rotas/secretaria/turmas.ts` (P1, P2); registrar em `rotas/api.ts`
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/rotas/secretaria/turmas.ts apps/api/src/http/contratos/turmas.ts \
        apps/api/src/http/apresentadores/turmas.ts apps/api/src/http/esquemas/turmas.ts \
        apps/api/src/http/rotas/api.ts apps/api/testes/api/secretaria_turmas.test.ts
git commit -m "feat(api): turmas e disciplinas em JSON"
```

---

### Task 14: API — Professor

**Files:**
- Create: `apps/api/src/http/rotas/professor.ts`, `contratos/professor.ts`, `apresentadores/professor.ts`, `esquemas/professor.ts`
- Modify: `apps/api/src/http/rotas/api.ts`
- Test: `apps/api/testes/api/professor.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TurmaDoProfessor = {
    turmaId: string; turmaNome: string; serie: string; turno: Turno;
    disciplinas: readonly { id: string; disciplinaNome: string }[];
  };
  type LinhaDeNota = { matriculaId: string; alunoNome: string; valor: number | null };
  type TelaDeNotas = {
    alocacao: { id: string; disciplinaNome: string; turmaId: string; turmaNome: string };
    bimestre: number; fechado: boolean; linhas: readonly LinhaDeNota[];
  };
  type LinhaDeChamada = { matriculaId: string; alunoNome: string; presente: boolean; justificativa: string | null };
  type EstadoDeFechamento = { bimestre: number; fechado: boolean; fechadoEm: string | null };
  ```

| Endpoint | Corpo / query | Resposta |
|---|---|---|
| `GET /professor/turmas` | — | `TurmaDoProfessor[]` |
| `GET /professor/disciplinas/:id/notas?bimestre=` | — | `TelaDeNotas` |
| `PUT /professor/disciplinas/:id/notas` | `{bimestre, notas:[{matriculaId, valor: number\|null}]}` | `200 {gravadas: number}` |
| `GET /professor/turmas/:id/chamada?data=` | — | `{data, linhas: LinhaDeChamada[]}` |
| `PUT /professor/turmas/:id/chamada` | `{data, linhas:[{matriculaId, presente, justificativa}]}` | `204` |
| `GET /professor/turmas/:id/fechamento` | — | `EstadoDeFechamento[]` |
| `POST /professor/turmas/:id/fechamento` | `{bimestre}` | `201` |

**O que muda de forma, e por quê:**

- `nota_<uuid>`, `presenca_<uuid>` e `justificativa_<uuid>` **deixam de existir**. Os campos eram
  nomeados por id porque `parseBody` guarda um valor por nome e nome repetido perderia linhas em
  silêncio. Com JSON, o corpo é um array de objetos, e `lerNotas`, `comoNota` e as três constantes
  de prefixo saem junto.
- Notas e chamada são `PUT` porque é o que elas são: substituição do estado de um bimestre ou de um
  dia. O método já carrega a garantia que a chave de idempotência daria — por isso não exigem
  `Idempotency-Key`.
- A leitura da nota digitada com vírgula (`'7,5'`) **sai do servidor**: o JSON manda `number`. Quem
  aceita vírgula agora é o campo do React, e o teste dessa conversão migra para o front (Task 26).

**O que não pode mudar:** a tela de notas é a rota de referência de desempenho do estágio
(p95 < 300 ms). As três consultas — matrículas, notas, estado de fechamento — continuam disparadas
**juntas**, uma vez cada. Nenhuma consulta por aluno.

**Casos de teste obrigatórios:** os de P5, mais:

| Caso | Espera |
|---|---|
| turma de outro professor | `404`, nunca `403` |
| `?bimestre=9` na leitura | cai no bimestre 1; é navegação, não escrita |
| `bimestre: 9` no `PUT` | `422` — veio de campo que a aplicação escreveu, não de digitação |
| nota fora de 0–10 | `422`, com `campo` apontando a matrícula |
| `valor: null` | apaga a nota daquela matrícula |
| matrícula que não é da turma no corpo | ignorada; a lista de quem está na turma vem do banco |
| bimestre já fechado | `422` |
| `PUT` de chamada duas vezes com o mesmo corpo | mesmo estado, sem duplicar linha |
| data malformada | `400` |
| `POST /fechamento` com pendências | `422` com a lista de faltantes na mensagem |

- [ ] **Step 1: Escrever a suíte e vê-la falhar** (P5)
- [ ] **Step 2: `contratos/professor.ts`**
- [ ] **Step 3: `apresentadores/professor.ts`** (P3)
- [ ] **Step 4: `esquemas/professor.ts`** (P4) e `rotas/professor.ts` (P1, P2); registrar em `rotas/api.ts`
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/rotas/professor.ts apps/api/src/http/contratos/professor.ts \
        apps/api/src/http/apresentadores/professor.ts apps/api/src/http/esquemas/professor.ts \
        apps/api/src/http/rotas/api.ts apps/api/testes/api/professor.test.ts
git commit -m "feat(api): diário de classe em JSON"
```

---

### Task 15: API — Responsável

**Files:**
- Create: `apps/api/src/http/rotas/responsavel.ts`, `contratos/responsavel.ts`, `apresentadores/responsavel.ts`
- Modify: `apps/api/src/http/rotas/api.ts`
- Test: `apps/api/testes/api/responsavel.test.ts`

**Interfaces:**
- Produces: `type PainelDoResponsavel = { matriculas: Pagina<MatriculaEmLista>; naoLidos: readonly ItemDoMural[]; totalNaoLidos: number; totalNoMural: number }`, `type BoletimEmJson`, `type DiaDeFrequencia`, `type ItemDoMural`, `type ComunicadoAberto`

| Endpoint | Query | Resposta |
|---|---|---|
| `GET /responsavel/painel?p=` | — | `PainelDoResponsavel` |
| `GET /responsavel/matriculas/:id/boletim` | — | `{ boletim, bimestres: number[] }` |
| `GET /responsavel/matriculas/:id/frequencia?p=` | — | `{ matricula, boletim, dias: Pagina<DiaDeFrequencia> }` |
| `GET /responsavel/mural?pNaoLidos=&pLidos=` | — | `{ naoLidos: Pagina<ItemDoMural>, lidos: Pagina<ItemDoMural> }` |
| `GET /responsavel/mural/:comunicadoId` | — | `{ comunicado, lidoEm: string \| null }` |
| `POST /responsavel/mural/:comunicadoId/leitura` | — | `204` |

**A regra mais importante desta frente:** `GET /mural/:comunicadoId` **não grava `lido_em`**. Ler é
escrita, e escrita não pode ser efeito colateral de navegação. A taxa de 12 % é a medição que
justifica o Estágio 04, e leitura inventada por pré-carregamento a destrói. O teste que prova isso
é obrigatório e volta na fase 5 como E2E.

**Outras regras que migram intactas:**

- conta com o papel `responsavel` mas **sem** `responsavelId` vinculado não enxerga aluno nenhum —
  não é erro, é uma conta que a secretaria ainda não vinculou. O painel responde `200` vazio;
- matrícula de outra família responde **404**, nunca 403;
- nenhuma conta é feita aqui. Média, percentual e situação vêm de `avaliacao`, que é dona da regra.
  A camada HTTP repassa o número; recalcular produziria um segundo número, e é a divergência entre
  os dois que o boletim existe para não ter.

**Casos de teste obrigatórios:** os de P5, mais:

| Caso | Espera |
|---|---|
| abrir o comunicado | `lido_em` continua `NULL` no banco |
| abrir e depois `POST /leitura` | `lido_em` preenchido, e a contagem de não lidos cai |
| `POST /leitura` duas vezes | `204` nas duas, uma linha só |
| conta sem `responsavelId` | painel `200` com listas vazias; boletim `404` |
| boletim de matrícula de outra família | `404` |
| `?pNaoLidos=2` | avança só a lista de não lidos |

- [ ] **Step 1: Escrever a suíte e vê-la falhar** (P5)
- [ ] **Step 2: `contratos/responsavel.ts`**
- [ ] **Step 3: `apresentadores/responsavel.ts`** (P3)
- [ ] **Step 4: `rotas/responsavel.ts`** (P1, P2); registrar em `rotas/api.ts`
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/rotas/responsavel.ts apps/api/src/http/contratos/responsavel.ts \
        apps/api/src/http/apresentadores/responsavel.ts apps/api/src/http/rotas/api.ts \
        apps/api/testes/api/responsavel.test.ts
git commit -m "feat(api): portal do responsável em JSON"
```

---

### Task 16: API — Comunicados

**Files:**
- Create: `apps/api/src/http/rotas/comunicados.ts`, `contratos/comunicados.ts`, `apresentadores/comunicados.ts`, `esquemas/comunicados.ts`
- Modify: `apps/api/src/http/rotas/api.ts`
- Test: `apps/api/testes/api/comunicados.test.ts`

**Interfaces:**
- Produces: `type ResumoDeLeitura = { destinatarios: number; leituras: number; taxa: number }`, `type ComunicadoEmLista`, `type Alcance = 'unidade' | 'selecionados'`

| Endpoint | Corpo / query | Resposta |
|---|---|---|
| `GET /comunicados?unidadeId=&p=` | — | `{ comunicados: Pagina<ComunicadoEmLista>, resumo: ResumoDeLeitura, unidadeAtual, veTodaARede }` |
| `GET /comunicados/destinatarios?unidadeId=` | — | `OpcaoSimples[]` |
| `POST /comunicados` | `{unidadeId, titulo, corpo, alcance, responsaveis: string[]}` | `201 {id}` |

**Regras que migram intactas:**

- o alcance vem do papel: `admin_rede` enxerga a rede inteira; `secretaria` só as unidades onde tem
  o papel. Unidade fora disso responde **404**, venha da query ou do corpo;
- secretaria sem unidade atribuída **não** cai na rede inteira por omissão: sem recorte, sem lista;
- o resumo mede o **recorte inteiro**, não as linhas da página. Uma taxa que se recalculasse a cada
  clique em "próxima" responderia outra pergunta;
- lista de destinatários vazia é o contrato de `publicarComunicado` para "toda a unidade";
- destinatário marcado é entrada externa: a lista que volta é conferida contra a da unidade, e um id
  de fora **recusa o envio inteiro** em vez de ser descartado em silêncio. Que o React só ofereça os
  certos não é garantia de nada.

**Casos de teste obrigatórios:** os de P5, mais:

| Caso | Espera |
|---|---|
| `alcance: 'selecionados'` com lista vazia | `422`, campo `destinatarios` |
| um id de outra unidade na lista | `422`, campo `destinatarios`, e **nada** publicado |
| secretaria sem unidade | lista `200` vazia, sem consulta à rede |
| `?unidadeId=` de outra rede | `404` |
| a taxa não muda ao pedir `?p=2` | mesmo `resumo` nas duas páginas |
| `admin_rede` sem `?unidadeId=` | rede inteira |
| `secretaria` sem `?unidadeId=` | primeira unidade dela, não a rede |

- [ ] **Step 1: Escrever a suíte e vê-la falhar** (P5)
- [ ] **Step 2: `contratos/comunicados.ts`**
- [ ] **Step 3: `apresentadores/comunicados.ts`** (P3)
- [ ] **Step 4: `esquemas/comunicados.ts`** (P4) e `rotas/comunicados.ts` (P1, P2); registrar em `rotas/api.ts`
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/rotas/comunicados.ts apps/api/src/http/contratos/comunicados.ts \
        apps/api/src/http/apresentadores/comunicados.ts apps/api/src/http/esquemas/comunicados.ts \
        apps/api/src/http/rotas/api.ts apps/api/testes/api/comunicados.test.ts
git commit -m "feat(api): comunicados e taxa de leitura em JSON"
```

---

**Portão de saída da fase 2.** Antes de abrir a fase 3, uma verificação de integração que nenhuma
frente sozinha faz:

- [ ] `bun run verificar` verde com todas as sete frentes juntas
- [ ] `rotas/api.ts` tem as sete linhas de `api.route(...)`, sem duplicata
- [ ] `bun test apps/api/testes/web` ainda verde — o SSR continua de pé e não foi tocado
- [ ] os `test.todo` das Tasks 4, 5 e 6 foram todos destravados

---

# FASE 3 — A casca do front

Seis tarefas sequenciais. Ao fim delas existe uma aplicação React que entra, sai, troca a senha e
mostra o layout — com **nenhuma** tela de papel. É de propósito: a casca é o contrato que as seis
frentes da fase 4 vão consumir, e ela precisa estar decidida antes de seis agentes começarem a
usá-la.

### Task 17: Vite, TypeScript e Vitest

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/preparacaoDeTeste.ts`, `apps/web/src/apoioDeTeste.tsx`
- Modify: `package.json` (raiz), `.gitignore`

**Interfaces:**
- Produces: `bun run dev` sobe API e front juntos; `bun run build:web` gera `apps/web/dist`; `renderizarComProvedores(elemento)` e `servidor` (MSW) para os testes de todas as frentes.

- [ ] **Step 1: Instalar as dependências**

```bash
mkdir -p apps/web/src
cd apps/web && bun init -y
bun add react@latest react-dom@latest react-router@latest \
        @tanstack/react-query@latest axios@latest zustand@latest zod@latest \
        react-hook-form@latest @hookform/resolvers@latest \
        @mantine/core@latest @mantine/hooks@latest @mantine/dates@latest \
        @mantine/notifications@latest dayjs@latest
bun add -d vite@latest @vitejs/plugin-react@latest typescript@latest \
        @types/react@latest @types/react-dom@latest \
        postcss@latest postcss-preset-mantine@latest postcss-simple-vars@latest \
        vitest@latest jsdom@latest msw@latest \
        @testing-library/react@latest @testing-library/user-event@latest \
        @testing-library/jest-dom@latest @vitest/coverage-v8@latest
```

- [ ] **Step 2: Escrever `apps/web/vite.config.ts`**

```ts
/**
 * O front é estático puro: nada aqui depende do servidor em tempo de execução. É o que torna a
 * publicação futura no Cloudflare Pages uma troca de `VITE_API_URL`, e não uma reescrita (I23).
 *
 * O proxy vale só em desenvolvimento, e existe para que `VITE_API_URL` possa continuar vazia na
 * máquina de quem desenvolve: o Vite encaminha `/api` para o Hono, e o cookie continua sendo de
 * primeira parte.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import postcssPresetMantine from 'postcss-preset-mantine';
import postcssSimpleVars from 'postcss-simple-vars';

const PONTOS_DE_QUEBRA = {
  'mantine-breakpoint-xs': '36em',
  'mantine-breakpoint-sm': '48em',
  'mantine-breakpoint-md': '62em',
  'mantine-breakpoint-lg': '75em',
  'mantine-breakpoint-xl': '88em',
};

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [postcssPresetMantine(), postcssSimpleVars({ variables: PONTOS_DE_QUEBRA })],
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: {
    // O Vite põe o hash do conteúdo no nome de tudo que sai daqui: é ele que passa a sustentar
    // I10 quando o `build-assets.ts` for removido.
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/preparacaoDeTeste.ts'],
    globals: true,
    coverage: { provider: 'v8', thresholds: { lines: 80, functions: 80, branches: 80 } },
  },
});
```

- [ ] **Step 3: Escrever `index.html` e `main.tsx`**

`index.html` não carrega dado nem script inline — se carregasse, o front deixaria de ser servível
por qualquer hospedagem de arquivo, e I23 morreria na primeira linha:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EscolaViva</title>
  </head>
  <body>
    <div id="raiz"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Escrever `preparacaoDeTeste.ts` e `apoioDeTeste.tsx`**

```ts
/**
 * O MSW responde no lugar da API em todo teste de front. Nenhum teste daqui fala com o Hono de
 * verdade — para isso existem as suítes de `apps/api/testes/api/` e os E2E.
 */
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';

export const servidor = setupServer();

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());
```

```tsx
/**
 * Todo teste de tela precisa dos mesmos quatro provedores. Um `QueryClient` novo por teste é o que
 * impede o cache de uma asserção vazar para a seguinte.
 */
export function renderizarComProvedores(elemento: ReactNode, rotaInicial = '/'): RenderResult {
  const consultas = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MantineProvider theme={tema}>
      <QueryClientProvider client={consultas}>
        <MemoryRouter initialEntries={[rotaInicial]}>{elemento}</MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}
```

- [ ] **Step 5: Ligar os dois workspaces nos scripts da raiz**

```json
"dev": "bun run dev:api & bun run dev:web",
"dev:web": "cd apps/web && bun run dev",
"build:web": "cd apps/web && bun run build",
"typecheck": "bunx tsc --noEmit -p apps/api/tsconfig.json && bunx tsc --noEmit -p apps/web/tsconfig.json",
"test": "bun test apps/api/testes && cd apps/web && bun run test"
```

E `apps/web/dist` entra no `.gitignore`.

- [ ] **Step 6: Provar que a casca sobe e que o teste roda**

Run: `cd apps/web && bun run build && bun run test`
Expected: build gera `dist/index.html` e `dist/assets/*` com hash no nome; a suíte roda com zero
testes e sai `0`.

- [ ] **Step 7: Commit**

```bash
git status --short
git add package.json .gitignore bun.lock apps/web/package.json apps/web/tsconfig.json \
        apps/web/vite.config.ts apps/web/index.html apps/web/src/main.tsx \
        apps/web/src/preparacaoDeTeste.ts apps/web/src/apoioDeTeste.tsx
git commit -m "chore(web): esqueleto do front com Vite, React 19 e Vitest"
```

---

### Task 18: Formatadores

**Files:**
- Create: `apps/web/src/compartilhado/formato/data.ts`, `numero.ts`, `cpf.ts`, `index.ts`, e os três `.test.ts` correspondentes

**Interfaces:**
- Produces: `formatarData`, `formatarDataHora`, `formatarNota`, `formatarPercentual`, `formatarTaxa`, `formatarCpf` — assinaturas idênticas às de `src/web/render.ts`.

**Contexto:** são portes literais. Duas regras vêm junto e não podem ser perdidas na tradução, e
por isso cada uma ganha um teste que a nomeia.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('nota é truncada, nunca arredondada', () => {
  // Arredondar 5,99 para 6,0 mostraria "aprovado" ao lado de uma situação "reprovado", e a
  // divergência entre o número impresso e o número que decidiu é o que o domínio proíbe.
  expect(formatarNota(5.99)).toBe('5,9');
  expect(formatarNota(9.99)).toBe('9,9');
  expect(formatarNota(null)).toBe('—');
});

test('taxa vira percentual num lugar só', () => {
  // Deixar a multiplicação por 100 espalhada já custou uma tela mostrando "0,1 %" onde eram 12,3 %.
  expect(formatarTaxa(0.123)).toBe('12,3 %');
  expect(formatarTaxa(0)).toBe('0,0 %');
  expect(formatarTaxa(null)).toBe('—');
});

test('data ISO vira data brasileira sem passar por fuso', () => {
  expect(formatarData('2026-03-15')).toBe('15/03/2026');
  expect(formatarData(null)).toBe('—');
  expect(formatarData('não é data')).toBe('—');
});

test('CPF sai pontuado e o inválido não é maquiado', () => {
  expect(formatarCpf('12345678909')).toBe('123.456.789-09');
  expect(formatarCpf(null)).toBe('—');
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd apps/web && bun run test src/compartilhado/formato`
Expected: FAIL — os módulos não existem.

- [ ] **Step 3: Portar de `src/web/render.ts` e `src/shared/documento/cpf.ts`**

Copie `comoData`, `comoNumero`, `umaCasaTruncada`, `doisDigitos`, `DATA_ISO`, `AUSENTE` e as seis
funções públicas. O comentário sobre o truncamento vem junto — é ele que impede alguém "consertar"
para `Math.round` daqui a um ano.

`formatarCpf` é cópia, não import: o front não importa domínio, e a aritmética do CPF é a mesma nos
dois lados. O teste duplicado é o preço, e é barato.

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && bun run test src/compartilhado/formato`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git status --short
git add apps/web/src/compartilhado/formato
git commit -m "feat(web): formatadores de data, nota, taxa e CPF"
```

---

### Task 19: Tema Mantine a partir do `app.css`

**Files:**
- Create: `apps/web/src/compartilhado/tema/tema.ts`, `apps/web/src/compartilhado/tema/tema.test.ts`
- Read-only: `apps/api/src/web/publico/app.css` (1.176 linhas, 390 propriedades customizadas)

**Interfaces:**
- Produces: `tema: MantineThemeOverride` — consumido pelo `MantineProvider` em `main.tsx` e por `renderizarComProvedores`.

**Contexto:** o objetivo é que as telas continuem **reconhecíveis**. As capturas do material
didático não podem virar outro produto. Isto não é redesenho.

- [ ] **Step 1: Extrair as propriedades customizadas do `app.css`**

```bash
grep -oE '^\s*--[a-z0-9-]+:\s*[^;]+;' apps/api/src/web/publico/app.css | sort -u
```

Agrupe a saída em cinco baldes: cor, tipografia, espaçamento, raio, sombra. O que não couber em
nenhum é estilo de componente e vira CSS Module na fase 4 — não force para dentro do tema.

- [ ] **Step 2: Escrever o teste que falha**

O tema é dado, e o que se testa em dado é que ele está completo o bastante para o Mantine:

```ts
test('a paleta primária tem os dez tons que o Mantine exige', () => {
  const primaria = tema.colors?.[tema.primaryColor ?? ''];
  expect(primaria).toHaveLength(10);
  expect(primaria?.every((tom) => /^#|^oklch|^rgb/.test(tom))).toBe(true);
});

test('os tamanhos de fonte e espaçamento cobrem as cinco chaves do Mantine', () => {
  for (const chave of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
    expect(tema.fontSizes?.[chave]).toBeDefined();
    expect(tema.spacing?.[chave]).toBeDefined();
  }
});
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `cd apps/web && bun run test src/compartilhado/tema`
Expected: FAIL

- [ ] **Step 4: Escrever `tema.ts`**

```ts
/**
 * O tema é a tradução do `app.css` artesanal para o vocabulário do Mantine. Ele existe para que a
 * migração não vire redesenho: as telas precisam continuar reconhecíveis, porque o material
 * didático do estágio é feito de capturas delas.
 *
 * O Mantine exige dez tons por cor nomeada. O `app.css` tem menos que isso — os intermediários
 * foram interpolados a partir dos tons que existiam, e os tons originais estão marcados.
 */
export const tema: MantineThemeOverride = {
  primaryColor: 'escola',
  colors: { escola: [/* dez tons */] },
  fontFamily: '…',           // de --fonte-*
  fontSizes: { /* xs…xl */ }, // de --texto-*
  spacing: { /* xs…xl */ },   // de --espaco-*
  radius: { /* … */ },
  shadows: { /* … */ },
  headings: { /* … */ },
};
```

- [ ] **Step 5: Rodar os testes**

Run: `cd apps/web && bun run test src/compartilhado/tema`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/compartilhado/tema
git commit -m "feat(web): tema Mantine derivado do CSS atual"
```

---

### Task 20: Cliente HTTP e tradução de erro

**Files:**
- Create: `apps/web/src/compartilhado/api/cliente.ts`, `erro.ts`, `index.ts`, `cliente.test.ts`, `erro.test.ts`

**Interfaces:**
- Produces:
  - `cliente: AxiosInstance` — a única instância do sistema
  - `class ErroDaApi extends Error { status: number; erros: readonly ErroDeAplicacao[]; correlacaoId: string; geral(): string | null }`
  - `aplicarErros<T extends FieldValues>(erro: unknown, setError: UseFormSetError<T>, avisar: (m: string) => void): void`
  - `aoExpirarSessao(acao: () => void): void` — registra o que fazer quando a API responder 401

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('todo POST leva uma chave de idempotência nova', async () => {
  const chaves: string[] = [];
  servidor.use(http.post('*/api/v1/x', ({ request }) => {
    chaves.push(request.headers.get('Idempotency-Key') ?? '');
    return HttpResponse.json({ id: '1' }, { status: 201 });
  }));

  await cliente.post('/x', {});
  await cliente.post('/x', {});

  expect(chaves).toHaveLength(2);
  expect(chaves[0]).not.toBe(chaves[1]);
  expect(chaves[0]).toMatch(/^[0-9a-f-]{36}$/);
});

test('toda escrita leva a marca de origem interna; leitura não precisa', async () => {
  let marcaDaEscrita: string | null = null;
  servidor.use(
    http.post('*/api/v1/x', ({ request }) => {
      marcaDaEscrita = request.headers.get('X-Requerido-Por');
      return HttpResponse.json({}, { status: 201 });
    }),
  );

  await cliente.post('/x', {});

  expect(marcaDaEscrita).toBe('escolaviva');
});

test('resposta de erro da API vira ErroDaApi com os campos preservados', async () => {
  servidor.use(http.post('*/api/v1/x', () =>
    HttpResponse.json(
      { erros: [{ campo: 'nome', codigo: 'obrigatorio', mensagem: 'Informe o nome.' }], correlacaoId: 'abc' },
      { status: 422 },
    ),
  ));

  const erro = await cliente.post('/x', {}).catch((e: unknown) => e);

  expect(erro).toBeInstanceOf(ErroDaApi);
  expect((erro as ErroDaApi).status).toBe(422);
  expect((erro as ErroDaApi).erros[0].campo).toBe('nome');
  expect((erro as ErroDaApi).correlacaoId).toBe('abc');
});

test('falha de rede também vira ErroDaApi, e não Error cru', async () => {
  servidor.use(http.get('*/api/v1/x', () => HttpResponse.error()));

  const erro = await cliente.get('/x').catch((e: unknown) => e);

  expect(erro).toBeInstanceOf(ErroDaApi);
  expect((erro as ErroDaApi).status).toBe(0);
});

test('401 dispara a ação de sessão expirada uma vez', async () => {
  let expirou = 0;
  aoExpirarSessao(() => { expirou += 1; });
  servidor.use(http.get('*/api/v1/x', () => HttpResponse.json({ erros: [] }, { status: 401 })));

  await cliente.get('/x').catch(() => undefined);

  expect(expirou).toBe(1);
});

test('erro sem campo vira aviso geral, e com campo vai para o input', () => {
  const definidos: [string, string][] = [];
  const avisos: string[] = [];
  const erro = new ErroDaApi(422, [
    { campo: 'cpf', codigo: 'x', mensagem: 'CPF inválido.' },
    { codigo: 'y', mensagem: 'Já existe um usuário com este e-mail.' },
  ], 'abc');

  aplicarErros(erro, ((campo, opcoes) => definidos.push([campo, opcoes.message ?? ''])) as never,
               (m) => avisos.push(m));

  expect(definidos).toEqual([['cpf', 'CPF inválido.']]);
  expect(avisos).toEqual(['Já existe um usuário com este e-mail.']);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd apps/web && bun run test src/compartilhado/api`
Expected: FAIL

- [ ] **Step 3: Escrever `erro.ts`**

```ts
/**
 * O erro da API é uma classe, e não um objeto solto, para que `instanceof` funcione no `catch` de
 * qualquer tela. Os `erros` chegam no formato que o servidor já usava internamente — `{campo,
 * codigo, mensagem}` — e é por isso que não há tradutor entre as duas pontas.
 */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly erros: readonly ErroDeAplicacao[],
    readonly correlacaoId: string,
  ) {
    super(erros[0]?.mensagem ?? 'Não foi possível falar com o servidor.');
    this.name = 'ErroDaApi';
  }

  /** A mensagem que não pertence a nenhum campo — a que vira aviso no topo do formulário. */
  geral(): string | null {
    return this.erros.find((problema) => problema.campo === undefined)?.mensagem ?? null;
  }
}

export function aplicarErros<T extends FieldValues>(
  erro: unknown,
  setError: UseFormSetError<T>,
  avisar: (mensagem: string) => void,
): void {
  if (!(erro instanceof ErroDaApi)) {
    avisar('Não foi possível falar com o servidor. Tente de novo.');
    return;
  }

  for (const problema of erro.erros) {
    if (problema.campo === undefined) continue;
    // O `campo` que a API devolve é o `name` do input: o erro cai embaixo do campo certo.
    setError(problema.campo as Path<T>, { type: 'server', message: problema.mensagem });
  }

  const geral = erro.geral();
  if (geral !== null) avisar(geral);
}
```

- [ ] **Step 4: Escrever `cliente.ts`**

```ts
/**
 * A única instância de Axios do sistema. Nenhum outro arquivo do front chama `fetch` nem monta
 * URL de API à mão — é o que garante que a chave de idempotência, a marca de origem interna e a
 * tradução de erro aconteçam sempre, e não onde alguém lembrou.
 *
 * `VITE_API_URL` vazia significa mesma origem, que é o estado de hoje. Preenchida, aponta para a
 * API publicada em outro subdomínio (I23) — e é só isso que muda.
 */
const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;
const METODOS_DE_ESCRITA = new Set(['post', 'put', 'patch', 'delete']);

export const cliente = axios.create({
  baseURL: BASE,
  // Sem isto o cookie de sessão não viaja quando a API estiver em outra origem.
  withCredentials: true,
});

cliente.interceptors.request.use((requisicao) => {
  const metodo = (requisicao.method ?? 'get').toLowerCase();
  if (!METODOS_DE_ESCRITA.has(metodo)) return requisicao;

  requisicao.headers.set('X-Requerido-Por', 'escolaviva');
  requisicao.headers.set('Content-Type', 'application/json');
  // I4: chave nova por envio. Dois cliques no mesmo botão são dois envios com a mesma chave
  // apenas se a tela reenviar a mesma requisição — que é exatamente o caso que a tabela cobre.
  if (metodo === 'post') requisicao.headers.set('Idempotency-Key', crypto.randomUUID());
  return requisicao;
});

let aoExpirar: () => void = () => undefined;

/** Quem sabe navegar é o roteador, e ele não existe quando este módulo carrega. */
export const aoExpirarSessao = (acao: () => void): void => { aoExpirar = acao; };

cliente.interceptors.response.use(
  (resposta) => resposta,
  (falha: unknown) => {
    if (!axios.isAxiosError(falha) || falha.response === undefined) {
      return Promise.reject(new ErroDaApi(0, [ERRO_DE_REDE], ''));
    }
    const { status, data } = falha.response;
    const corpo = data as Partial<CorpoDeErro>;
    if (status === 401) aoExpirar();
    return Promise.reject(new ErroDaApi(status, corpo.erros ?? [], corpo.correlacaoId ?? ''));
  },
);
```

- [ ] **Step 5: Rodar os testes**

Run: `cd apps/web && bun run test src/compartilhado/api`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/compartilhado/api
git commit -m "feat(web): cliente HTTP único, com idempotência e tradução de erro"
```

---

### Task 21: Provedores, roteador, guardas e layout

**Files:**
- Create: `apps/web/src/app/App.tsx`, `rotas.tsx`, `guardas.tsx`, `Layout.tsx`, `guardas.test.tsx`; `apps/web/src/funcionalidades/sessao/consultas.ts`, `mutacoes.ts`; `apps/web/src/compartilhado/ui/{Tabela,Paginacao,Vazio,Carregando,FalhaAoCarregar}.tsx`; `apps/web/src/compartilhado/estado/avisos.ts`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Produces:
  - `useSessao(): UseQueryResult<UsuarioDaSessaoEmJson>` — a consulta que hidrata a aplicação
  - `<ExigirLogin>`, `<ExigirPapel papel={...}>`
  - `painelInicial(usuario: UsuarioDaSessaoEmJson): string`
  - `useAvisos()` — store Zustand com `sucesso(m)`, `erro(m)`, `limpar()`
  - `<Tabela colunas linhas>`, `<Paginacao pagina paginas aoMudar>`, `<Vazio mensagem>`, `<Carregando>`, `<FalhaAoCarregar erro>`

**Contexto — as URLs não mudam.** O React Router recebe exatamente os caminhos que o Hono servia
hoje, `/login` incluído. Marcadores de página sobrevivem e as capturas do material continuam
válidas.

- [ ] **Step 1: Escrever os testes de guarda que falham**

```ts
test('a precedência de papel decide a tela inicial de quem acumula papéis', () => {
  // A secretária que também é mãe de aluno entra na tela de maior alcance na rede.
  const acumula = usuarioCom(['secretaria', 'responsavel']);
  const soResponsavel = usuarioCom(['responsavel']);

  expect(painelInicial(acumula)).toBe('/secretaria');
  expect(painelInicial(soResponsavel)).toBe('/responsavel');
});

test('conta sem papel nenhum vai para a tela que explica isso, não para um painel', () => {
  expect(painelInicial(usuarioCom([]))).toBe('/sem-papel');
});

test('quem não tem o papel vê a tela de sem permissão, e a API é quem de fato barra', async () => {
  servidor.use(http.get('*/api/v1/sessao', () =>
    HttpResponse.json({ usuario: usuarioCom(['responsavel']) }),
  ));

  renderizarComProvedores(
    <ExigirPapel papel="secretaria"><span>tela da secretaria</span></ExigirPapel>,
  );

  expect(await screen.findByText(/não tem permissão/i)).toBeVisible();
  expect(screen.queryByText('tela da secretaria')).toBeNull();
});

test('sem sessão, a guarda leva ao login', async () => {
  servidor.use(http.get('*/api/v1/sessao', () =>
    HttpResponse.json({ erros: [], correlacaoId: '' }, { status: 401 }),
  ));

  renderizarComProvedores(<ExigirLogin><span>conteúdo</span></ExigirLogin>, '/secretaria');

  expect(await screen.findByText(/entrar/i)).toBeVisible();
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd apps/web && bun run test src/app`
Expected: FAIL

- [ ] **Step 3: Escrever `funcionalidades/sessao/consultas.ts`**

```ts
export const chaveDaSessao = ['sessao'] as const;

/**
 * A consulta que hidrata a aplicação. Ela substitui o `GET /painel` do servidor: quem decide para
 * onde levar quem entrou é o front, porque precedência de papel é apresentação e sempre foi.
 */
export function useSessao() {
  return useQuery({
    queryKey: chaveDaSessao,
    queryFn: () => cliente.get<{ usuario: UsuarioDaSessaoEmJson }>('/sessao')
      .then((r) => r.data.usuario),
    // 401 é resposta, não falha de rede: repetir três vezes só atrasaria a ida ao login.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Escrever `guardas.tsx`**

```tsx
/**
 * ATENÇÃO: estas guardas são conveniência de navegação, **não** controle de acesso. Quem decide o
 * que uma pessoa pode ver é a API, que responde 403 ou 404 para qualquer requisição fora do
 * alcance — inclusive as que este componente deixaria passar. Trocar a guarda por uma condição
 * mais frouxa não abre nenhuma porta; trocar a regra do servidor, sim.
 */
const PRECEDENCIA: readonly { papel: Papel; destino: string }[] = [
  { papel: 'admin_rede', destino: '/rede' },
  { papel: 'secretaria', destino: '/secretaria' },
  { papel: 'professor', destino: '/professor' },
  { papel: 'responsavel', destino: '/responsavel' },
];

export const temPapel = (usuario: UsuarioDaSessaoEmJson, papel: Papel): boolean =>
  usuario.papeis.some((atribuicao) => atribuicao.papel === papel);

export const painelInicial = (usuario: UsuarioDaSessaoEmJson): string =>
  PRECEDENCIA.find(({ papel }) => temPapel(usuario, papel))?.destino ?? '/sem-papel';

export function ExigirLogin({ children }: { children: ReactNode }) {
  const { data: usuario, isPending } = useSessao();
  if (isPending) return <Carregando />;
  if (usuario === undefined) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function ExigirPapel({ papel, children }: { papel: Papel; children: ReactNode }) {
  const { data: usuario, isPending } = useSessao();
  if (isPending) return <Carregando />;
  if (usuario === undefined) return <Navigate to="/login" replace />;
  if (!temPapel(usuario, papel)) return <SemPermissao />;
  return <>{children}</>;
}
```

- [ ] **Step 5: Escrever `rotas.tsx` com as URLs de hoje e um bloco por papel**

```tsx
/**
 * Um `lazy()` por papel, e não por tela: é o que dá um bloco de bundle por papel. Quem entra como
 * responsável não baixa a secretaria — e o portal do responsável é o pior caso de rede do sistema,
 * o mesmo que justifica I4.
 */
const Rede = lazy(() => import('../funcionalidades/rede/rotas'));
const Secretaria = lazy(() => import('../funcionalidades/secretaria/rotas'));
const Professor = lazy(() => import('../funcionalidades/professor/rotas'));
const Responsavel = lazy(() => import('../funcionalidades/responsavel/rotas'));
const Comunicados = lazy(() => import('../funcionalidades/comunicados/rotas'));

export const roteador = createBrowserRouter([
  { path: '/login', element: <TelaDeEntrada /> },
  {
    element: <ExigirLogin><Layout /></ExigirLogin>,
    children: [
      { path: '/', element: <ParaOPainel /> },
      { path: '/painel', element: <ParaOPainel /> },
      { path: '/conta/senha', element: <TrocaDeSenha /> },
      { path: '/sem-papel', element: <ContaSemPapel /> },
      { path: '/rede/*', element: <ExigirPapel papel="admin_rede"><Rede /></ExigirPapel> },
      { path: '/secretaria/*', element: <ExigirPapel papel="secretaria"><Secretaria /></ExigirPapel> },
      { path: '/professor/*', element: <ExigirPapel papel="professor"><Professor /></ExigirPapel> },
      { path: '/responsavel/*', element: <ExigirPapel papel="responsavel"><Responsavel /></ExigirPapel> },
      { path: '/comunicados/*', element: <Comunicados /> },
      { path: '*', element: <NaoEncontrada /> },
    ],
  },
]);
```

Cada `funcionalidades/<papel>/rotas.tsx` é criado **vazio** nesta tarefa, com um `<Outlet />` e
nenhuma rota filha — as frentes da fase 4 preenchem cada um o seu, sem se tocarem.

- [ ] **Step 6: Ligar o 401 ao roteador em `main.tsx`**

```tsx
// A tradução de 401 em navegação mora aqui porque é aqui que o roteador existe. O cache inteiro
// vai junto: dado de uma sessão encerrada não pode sobrar na tela da próxima.
aoExpirarSessao(() => {
  consultas.clear();
  void roteador.navigate('/login');
});
```

- [ ] **Step 7: Escrever os cinco componentes de `compartilhado/ui/`**

`Tabela`, `Paginacao`, `Vazio`, `Carregando` e `FalhaAoCarregar` — os equivalentes de
`_paginacao.eta`, `_vazio.eta` e `_mensagens.eta`. `Paginacao` reproduz a janela de sete números
de `src/web/paginacao.ts`: sete cabem na linha do celular sem quebrar. `FalhaAoCarregar` mostra a
mensagem e o `correlacaoId` — é o código que o suporte usa para achar o rastro no log.

- [ ] **Step 8: Rodar os testes**

Run: `cd apps/web && bun run test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git status --short
git add apps/web/src/app apps/web/src/main.tsx apps/web/src/compartilhado/ui \
        apps/web/src/compartilhado/estado apps/web/src/funcionalidades/sessao
git commit -m "feat(web): roteador com as URLs de hoje, guardas e componentes de lista"
```

---

### Task 22: Entrada e troca de senha

**Files:**
- Create: `apps/web/src/funcionalidades/sessao/TelaDeEntrada.tsx`, `esquemas.ts`, `TelaDeEntrada.test.tsx`; `apps/web/src/funcionalidades/conta/TrocaDeSenha.tsx`, `esquemas.ts`, `TrocaDeSenha.test.tsx`
- Modify: `apps/web/src/app/rotas.tsx`

**Interfaces:**
- Produces: `useEntrar()`, `useSair()`, `useTrocarSenha()` — as três mutações que o `Layout` e a tela de entrada consomem.

**Contexto:** é a primeira tela de verdade, e ela prova a casca inteira ponta a ponta — cliente,
erro, guarda, roteador e tema. Duas decisões do arquivo original continuam valendo:

- **a tela não é um oráculo**: rede inexistente, identificador desconhecido e senha errada voltam
  pela mesma porta, com a mensagem que `identidade.autenticar` já escolheu;
- **a senha não é aparada**: espaço no início ou no fim faz parte do que a pessoa escolheu. Rede e
  identificador, sim.

- [ ] **Step 1: Escrever os testes que falham**

```tsx
test('entrar leva ao painel do papel de maior alcance', async () => {
  servidor.use(
    http.post('*/api/v1/sessao', () =>
      HttpResponse.json({ usuario: usuarioCom(['secretaria', 'responsavel']) }, { status: 201 }),
    ),
  );
  renderizarComProvedores(<App />, '/login');

  await userEvent.type(screen.getByLabelText('Rede'), 'demo');
  await userEvent.type(screen.getByLabelText('CPF ou e-mail'), 'secretaria1@escolaviva.test');
  await userEvent.type(screen.getByLabelText('Senha'), 'escolaviva');
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

  expect(await screen.findByText('Painel da secretaria')).toBeVisible();
});

test('credencial recusada mostra a mensagem do servidor e mantém o que foi digitado', async () => {
  servidor.use(
    http.post('*/api/v1/sessao', () =>
      HttpResponse.json(
        { erros: [{ codigo: 'credenciais_invalidas', mensagem: 'Rede, identificador ou senha incorretos.' }],
          correlacaoId: 'abc' },
        { status: 422 },
      ),
    ),
  );
  renderizarComProvedores(<TelaDeEntrada />);

  await userEvent.type(screen.getByLabelText('Rede'), 'demo');
  await userEvent.type(screen.getByLabelText('CPF ou e-mail'), 'alguem@escolaviva.test');
  await userEvent.type(screen.getByLabelText('Senha'), 'errada');
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

  expect(await screen.findByText('Rede, identificador ou senha incorretos.')).toBeVisible();
  // Quem errou a senha não deve ser obrigado a redigitar o resto.
  expect(screen.getByLabelText('Rede')).toHaveValue('demo');
  expect(screen.getByLabelText('CPF ou e-mail')).toHaveValue('alguem@escolaviva.test');
  expect(screen.getByLabelText('Senha')).toHaveValue('');
});

test('a senha digitada nunca aparece na URL nem em atributo do documento', async () => {
  renderizarComProvedores(<TelaDeEntrada />);

  await userEvent.type(screen.getByLabelText('Senha'), 'segredo123');

  expect(window.location.search).not.toContain('segredo123');
  expect(document.body.innerHTML).not.toContain('segredo123');
});

test('confirmação diferente é barrada antes de chegar ao servidor', async () => {
  let chamou = false;
  servidor.use(http.put('*/api/v1/conta/senha', () => { chamou = true; return new HttpResponse(null, { status: 204 }); }));
  renderizarComProvedores(<TrocaDeSenha />);

  await userEvent.type(screen.getByLabelText('Senha atual'), 'antiga');
  await userEvent.type(screen.getByLabelText('Senha nova'), 'nova-senha-longa');
  await userEvent.type(screen.getByLabelText('Confirme a senha nova'), 'outra-coisa');
  await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));

  expect(await screen.findByText(/não confere/i)).toBeVisible();
  expect(chamou).toBe(false);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd apps/web && bun run test src/funcionalidades/sessao src/funcionalidades/conta`
Expected: FAIL

- [ ] **Step 3: Escrever os esquemas de conforto**

```ts
/**
 * Zod de conforto: ele existe para o retorno imediato, e não decide nada. A verdade de quem entra
 * continua sendo `identidade.autenticar`, no servidor (I22).
 */
export const esquemaDeEntrada = z.object({
  redeSlug: z.string().trim().min(1, 'Informe a rede.'),
  identificador: z.string().trim().min(1, 'Informe seu CPF ou e-mail.'),
  // Sem `.trim()`: espaço no início ou no fim faz parte da senha que a pessoa escolheu.
  senha: z.string().min(1, 'Informe a senha.'),
});

export const esquemaDeTrocaDeSenha = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    senhaNova: z.string().min(1, 'Informe a senha nova.'),
    senhaConfirmacao: z.string().min(1, 'Repita a senha nova.'),
  })
  // Conferir aqui evita uma ida ao servidor para descobrir que a pessoa se enganou ao redigitar.
  // O servidor confere de novo — esta checagem é conforto, não garantia.
  .refine((valores) => valores.senhaNova === valores.senhaConfirmacao, {
    path: ['senhaConfirmacao'],
    message: 'A confirmação não confere com a senha nova.',
  });
```

- [ ] **Step 4: Escrever as duas telas** (P8)

A tela de entrada usa o layout público — sem menu, sem cabeçalho de aplicação. Depois do sucesso,
`navegar(painelInicial(usuario), { replace: true })`.

- [ ] **Step 5: Rodar os testes**

Run: `cd apps/web && bun run test`
Expected: PASS

- [ ] **Step 6: Provar contra a API de verdade, à mão**

```bash
bun run dev
```
Abrir `http://localhost:5173/login`, entrar com `demo` / `secretaria1@escolaviva.test` /
`escolaviva`, confirmar que cai em `/secretaria`, trocar a senha e sair. É a única verificação
manual do plano, e ela existe porque nenhum teste prova que o cookie de primeira parte atravessa o
proxy do Vite.

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/funcionalidades/sessao apps/web/src/funcionalidades/conta \
        apps/web/src/app/rotas.tsx
git commit -m "feat(web): entrada, saída e troca de senha"
```

---

# FASE 4 — As telas, por papel

Seis frentes paralelas, as mesmas da fase 2. Cada uma preenche o seu
`funcionalidades/<papel>/rotas.tsx`, criado vazio na Task 21, e **não toca em mais nada**.

**Roteiro comum a T23–T28:**

1. Escrever `consultas.ts` com as chaves e os hooks de leitura (P6).
2. Escrever `mutacoes.ts` com os hooks de escrita e as invalidações (P7).
3. Escrever `esquemas.ts` — Zod de conforto, nunca de regra.
4. Escrever as telas: lista (P9), ficha e formulário (P8).
5. Escrever os testes com MSW (P10).
6. Preencher `rotas.tsx` da frente com as rotas filhas.
7. `bun run verificar` verde e commit só dos arquivos da frente.

**Três regras que valem para as seis frentes e não se repetem em cada tarefa:**

- **Formulário em página própria.** Lista é só a tabela. Recusar um formulário nunca recarrega a
  consulta paginada que ninguém pediu.
- **Filtro e página moram na URL**, via `useSearchParams`. Nunca em `useState`, nunca no Zustand.
- **Nada de atualização otimista.** A escrita é síncrona e o usuário espera; esconder a espera
  esconderia a dor que os estágios seguintes existem para resolver.

---

### Task 23: Telas — Rede

**Files:**
- Create em `apps/web/src/funcionalidades/rede/`: `consultas.ts`, `mutacoes.ts`, `esquemas.ts`, `rotas.tsx`, `Painel.tsx`, `ListaDeUnidades.tsx`, `FormularioDeUnidade.tsx`, `ListaDeUsuarios.tsx`, `FormularioDeUsuario.tsx`, `ListaDeAnosLetivos.tsx`, `FormularioDeAnoLetivo.tsx`, e os `.test.tsx` correspondentes

| Rota do navegador | Tela | Endpoint |
|---|---|---|
| `/rede` | `Painel` | `GET /rede/painel` |
| `/rede/unidades` | `ListaDeUnidades` | `GET /rede/unidades?p=` |
| `/rede/unidades/nova` | `FormularioDeUnidade` | `POST /rede/unidades` |
| `/rede/usuarios` | `ListaDeUsuarios` | `GET /rede/usuarios?p=` |
| `/rede/usuarios/novo` | `FormularioDeUsuario` | `POST /rede/usuarios` + `GET /selecoes/{unidades,responsaveis}` |
| `/rede/anos-letivos` | `ListaDeAnosLetivos` | `GET /rede/anos-letivos?p=` |
| `/rede/anos-letivos/novo` | `FormularioDeAnoLetivo` | `POST /rede/anos-letivos` |

**A tela de convite é a mais delicada da frente.** A senha provisória vem no corpo do `201` e é
exibida **uma vez**, na tela de sucesso. Ela não vai para a URL, não vai para o Zustand, não vai
para `localStorage` e não é reexibida por `invalidateQueries`. O componente que a mostra a recebe
por estado local e a perde ao navegar — que é o mesmo tempo de vida do cookie de 120 segundos que
ela tinha antes.

O formulário de atribuições deixa de ser três linhas fixas: com React, "uma ou mais" é `useFieldArray`
do React Hook Form, com botão de acrescentar e remover. As linhas fixas existiam por falta de
JavaScript no cliente, e essa restrição acabou.

**Casos de teste obrigatórios:**

| Caso | Espera |
|---|---|
| convite bem-sucedido | a senha provisória aparece uma vez |
| navegar para fora e voltar | a senha **não** aparece de novo |
| a senha não está no DOM depois de sair da tela | `document.body.innerHTML` não a contém |
| erro `422` no campo `cpf` | mensagem embaixo do campo CPF |
| erro sem campo | aviso no topo do formulário |
| atribuição sem unidade | barrada pelo Zod de conforto, sem ida ao servidor |
| lista com `?p=3` na URL | a tabela abre na terceira página |

- [ ] **Step 1: `consultas.ts` (P6) e testes de leitura**
- [ ] **Step 2: `mutacoes.ts` (P7) e testes de escrita**
- [ ] **Step 3: `esquemas.ts` — conforto, nunca regra**
- [ ] **Step 4: As sete telas (P8, P9) com os testes de P10**
- [ ] **Step 5: `rotas.tsx` da frente**
- [ ] **Step 6: `bun run verificar` verde**
- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/funcionalidades/rede
git commit -m "feat(web): telas de administração da rede"
```

---

### Task 24: Telas — Secretaria A: alunos, responsáveis e matrículas

**Files:**
- Create em `apps/web/src/funcionalidades/secretaria/alunos/` e `.../responsaveis/`: `consultas.ts`, `mutacoes.ts`, `esquemas.ts`, `BuscaDeAlunos.tsx`, `FormularioDeAluno.tsx`, `FichaDoAluno.tsx`, `FormularioDeVinculo.tsx`, `FormularioDeMatricula.tsx`, `FormularioDeTransferencia.tsx`, `ListaDeResponsaveis.tsx`, `FormularioDeResponsavel.tsx`, e os `.test.tsx`
- Create: `apps/web/src/funcionalidades/secretaria/rotas.tsx` (compartilhado com a Task 25 — ver nota)

| Rota do navegador | Tela | Endpoint |
|---|---|---|
| `/secretaria` | `Painel` | `GET /secretaria/painel?p=` |
| `/secretaria/alunos` | `BuscaDeAlunos` | `GET /secretaria/alunos?q=&p=` |
| `/secretaria/alunos/novo` | `FormularioDeAluno` | `POST /secretaria/alunos` |
| `/secretaria/alunos/:id` | `FichaDoAluno` | `GET /secretaria/alunos/:id` |
| `/secretaria/alunos/:id/responsaveis/novo` | `FormularioDeVinculo` | `GET .../responsaveis-disponiveis`, `POST .../responsaveis` |
| `/secretaria/alunos/:id/matricular` | `FormularioDeMatricula` | `GET /selecoes/turmas`, `POST /secretaria/matriculas` |
| `/secretaria/matriculas/:id/transferir` | `FormularioDeTransferencia` | `GET /secretaria/matriculas/:id`, `POST .../transferencia` |
| `/secretaria/responsaveis` | `ListaDeResponsaveis` | `GET /secretaria/responsaveis?p=` |
| `/secretaria/responsaveis/novo` | `FormularioDeResponsavel` | `POST /secretaria/responsaveis` |

**Nota sobre `rotas.tsx`:** as Tasks 24 e 25 dividem a mesma pasta de papel. Para não colidirem, o
`rotas.tsx` da secretaria é criado pela **Task 24** já com as rotas das duas, e a Task 25 não o
edita — ela só cria os componentes que ele importa. Se a Task 25 rodar primeiro, ela para e relata.

**Regras de tela que vêm do comportamento atual:**

- a busca de alunos **abre vazia**: sem termo não há consulta. É o `enabled: termo !== ''` de P6;
- o termo mora em `?q=`, e não em estado do componente — a busca é um endereço compartilhável;
- as duas tabelas da ficha têm `?pResponsaveis=` e `?pMatriculas=` próprios;
- o botão de transferência sai da matrícula **ativa**, consultada à parte, e continua aparecendo
  na segunda página do histórico;
- a turma de origem não aparece no seletor de transferência: transferir para onde já se está não é
  transferência.

**Casos de teste obrigatórios:**

| Caso | Espera |
|---|---|
| tela de busca sem `?q=` | nenhuma requisição disparada; texto convidando a buscar |
| digitar e enviar | `?q=` na URL e a requisição com o termo |
| ficha com `?pMatriculas=2` | só a tabela de matrículas avança |
| cadastro recusado com `campo: 'nome'` | mensagem embaixo do campo |
| responsável já vinculado | não aparece no seletor |
| `404` da API na ficha | tela de "não encontrado", não tela em branco |

- [ ] **Step 1: `consultas.ts` (P6) e testes de leitura**
- [ ] **Step 2: `mutacoes.ts` (P7) e testes de escrita**
- [ ] **Step 3: `esquemas.ts`**
- [ ] **Step 4: As nove telas (P8, P9) com os testes de P10**
- [ ] **Step 5: `rotas.tsx` da secretaria, com as rotas das Tasks 24 e 25**
- [ ] **Step 6: `bun run verificar` verde**
- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/funcionalidades/secretaria/alunos \
        apps/web/src/funcionalidades/secretaria/responsaveis \
        apps/web/src/funcionalidades/secretaria/rotas.tsx \
        apps/web/src/funcionalidades/secretaria/Painel.tsx
git commit -m "feat(web): telas de alunos, responsáveis e matrículas"
```

---

### Task 25: Telas — Secretaria B: turmas e disciplinas

**Files:**
- Create em `apps/web/src/funcionalidades/secretaria/turmas/` e `.../disciplinas/`: `consultas.ts`, `mutacoes.ts`, `esquemas.ts`, `ListaDeTurmas.tsx`, `FormularioDeTurma.tsx`, `FichaDaTurma.tsx`, `FormularioDeAlocacao.tsx`, `ListaDeDisciplinas.tsx`, `FormularioDeDisciplina.tsx`, e os `.test.tsx`
- **Não edita** `apps/web/src/funcionalidades/secretaria/rotas.tsx` — ver nota na Task 24

| Rota do navegador | Tela | Endpoint |
|---|---|---|
| `/secretaria/turmas` | `ListaDeTurmas` | `GET /secretaria/turmas?unidade=&ano=&p=` |
| `/secretaria/turmas/nova` | `FormularioDeTurma` | `GET /selecoes/{unidades,anos-letivos}`, `POST /secretaria/turmas` |
| `/secretaria/turmas/:id` | `FichaDaTurma` | `GET /secretaria/turmas/:id` |
| `/secretaria/turmas/:id/disciplinas/nova` | `FormularioDeAlocacao` | `GET /selecoes/{disciplinas,professores}`, `POST .../disciplinas` |
| `/secretaria/disciplinas` | `ListaDeDisciplinas` | `GET /secretaria/disciplinas?p=` |
| `/secretaria/disciplinas/nova` | `FormularioDeDisciplina` | `POST /secretaria/disciplinas` |

**Regras de tela:**

- os filtros de unidade e ano moram em `?unidade=` e `?ano=`. Trocar um deles volta para a página 1
  — a terceira página do filtro anterior não existe no novo;
- o seletor de professor da alocação depende da unidade **da turma**, e não de escolha do usuário:
  `GET /selecoes/professores?unidadeId=<unidade da turma>`;
- a ficha da turma tem `?pDisciplinas=` e `?pMatriculas=` próprios;
- os rótulos de turno (`Matutino`, `Vespertino`, `Noturno`, `Integral`) são do front; os valores vêm
  de `TURNOS`, importado de `contratos/enumeracoes.ts`.

**Casos de teste obrigatórios:**

| Caso | Espera |
|---|---|
| trocar o filtro de unidade estando em `?p=3` | `p` some da URL |
| `?unidade=` e `?ano=` juntos | ambos vão na requisição |
| alocação em turma cuja unidade não tem professor | seletor vazio com mensagem, não erro |
| turno mostrado na tabela | rótulo em português, não o valor cru |
| `422` com `campo: 'nome'` no cadastro de turma | mensagem embaixo do campo |

- [ ] **Step 1: `consultas.ts` (P6) e testes de leitura**
- [ ] **Step 2: `mutacoes.ts` (P7) e testes de escrita**
- [ ] **Step 3: `esquemas.ts`**
- [ ] **Step 4: As seis telas (P8, P9) com os testes de P10**
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/funcionalidades/secretaria/turmas \
        apps/web/src/funcionalidades/secretaria/disciplinas
git commit -m "feat(web): telas de turmas e disciplinas"
```

---

### Task 26: Telas — Professor

**Files:**
- Create em `apps/web/src/funcionalidades/professor/`: `consultas.ts`, `mutacoes.ts`, `esquemas.ts`, `rotas.tsx`, `MinhasTurmas.tsx`, `Notas.tsx`, `Chamada.tsx`, `Fechamento.tsx`, `nota.ts`, `nota.test.ts`, e os `.test.tsx`

| Rota do navegador | Tela | Endpoint |
|---|---|---|
| `/professor` | `MinhasTurmas` | `GET /professor/turmas` |
| `/professor/disciplinas/:id/notas` | `Notas` | `GET`/`PUT /professor/disciplinas/:id/notas` |
| `/professor/turmas/:id/chamada` | `Chamada` | `GET`/`PUT /professor/turmas/:id/chamada` |
| `/professor/turmas/:id/fechamento` | `Fechamento` | `GET`/`POST /professor/turmas/:id/fechamento` |

**A conversão de nota digitada migra para cá.** O servidor agora recebe `number`; quem aceita
vírgula é o campo. `nota.ts` é um módulo puro, com teste próprio:

```ts
/**
 * Vírgula e ponto são o mesmo separador para quem digita, e campo em branco apaga a nota. Isto
 * morava no servidor enquanto o formulário só sabia mandar texto; com JSON, é decisão de tela.
 *
 * `undefined` é o terceiro caso e não pode virar `null`: ele significa "digitado e inválido", que
 * é o que acende o erro na célula em vez de apagar a nota de alguém.
 */
export const comoNota = (digitado: string): number | null | undefined => {
  if (digitado.trim() === '') return null;
  const numero = Number(digitado.replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0 || numero > 10) return undefined;
  return numero;
};
```

```ts
test('vírgula e ponto produzem o mesmo número', () => {
  expect(comoNota('7,5')).toBe(7.5);
  expect(comoNota('7.5')).toBe(7.5);
});

test('campo em branco apaga a nota; valor fora da faixa acende o erro', () => {
  expect(comoNota('')).toBeNull();
  expect(comoNota('   ')).toBeNull();
  expect(comoNota('11')).toBeUndefined();
  expect(comoNota('-1')).toBeUndefined();
  expect(comoNota('abc')).toBeUndefined();
});
```

**Regras de tela:**

- o bimestre mora em `?bimestre=`. Valor fora de 1–4 na URL cai no 1º: é navegação, não escrita;
- a chamada abre com **todo mundo presente** — a falta é que é a exceção;
- a data da chamada mora em `?data=`, com os botões de dia anterior e seguinte mudando a URL;
- bimestre fechado deixa a grade de notas em leitura, com o motivo escrito na tela;
- **o fechamento é síncrono e a espera é visível.** O botão desabilita e mostra que está
  processando. Nada de otimista, nada de fila falsa: essa espera é a dor plantada que justifica o
  Estágio 05, e escondê-la apagaria a evidência.

**Casos de teste obrigatórios:**

| Caso | Espera |
|---|---|
| `?bimestre=9` | tela abre no bimestre 1 |
| trocar de bimestre | `?bimestre=` muda e a grade recarrega |
| nota `11` digitada | erro na célula, e **nenhum** envio |
| nota apagada | envia `valor: null` para aquela matrícula |
| `422` do servidor com `campo` de matrícula | erro na célula certa |
| bimestre fechado | campos desabilitados e motivo na tela |
| chamada sem registro no dia | todas as caixas marcadas |
| fechamento com pendências | a lista de faltantes aparece na tela |
| fechamento em curso | botão desabilitado, sem segundo envio possível |

- [ ] **Step 1: `nota.ts` e seu teste — o módulo puro primeiro**
- [ ] **Step 2: `consultas.ts` (P6) e testes de leitura**
- [ ] **Step 3: `mutacoes.ts` (P7) e testes de escrita**
- [ ] **Step 4: As quatro telas (P8, P9) com os testes de P10**
- [ ] **Step 5: `rotas.tsx` da frente**
- [ ] **Step 6: `bun run verificar` verde**
- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/funcionalidades/professor
git commit -m "feat(web): diário de classe do professor"
```

---

### Task 27: Telas — Responsável

**Files:**
- Create em `apps/web/src/funcionalidades/responsavel/`: `consultas.ts`, `mutacoes.ts`, `rotas.tsx`, `MeusAlunos.tsx`, `Boletim.tsx`, `Frequencia.tsx`, `Mural.tsx`, `Comunicado.tsx`, e os `.test.tsx`

| Rota do navegador | Tela | Endpoint |
|---|---|---|
| `/responsavel` | `MeusAlunos` | `GET /responsavel/painel?p=` |
| `/responsavel/matriculas/:id/boletim` | `Boletim` | `GET .../boletim` |
| `/responsavel/matriculas/:id/frequencia` | `Frequencia` | `GET .../frequencia?p=` |
| `/responsavel/mural` | `Mural` | `GET /responsavel/mural?pNaoLidos=&pLidos=` |
| `/responsavel/mural/:id` | `Comunicado` | `GET .../mural/:id`, `POST .../leitura` |

**A regra mais importante do plano inteiro está nesta tarefa.** Abrir o comunicado **não** marca
leitura. Não existe `useEffect` que dispare `POST /leitura`; a única coisa que grava é o clique no
botão. A taxa de 12 % é a medição que transforma "ninguém lê o mural" de opinião de corredor em
número, e é ela que justifica o Estágio 04. Um efeito de carregamento — o erro mais fácil de
cometer numa SPA — inventaria leitura que ninguém fez e destruiria a evidência.

Escreva isto como comentário no componente, não só aqui.

**Regras de tela:**

- conta sem `responsavelId` vinculado vê a tela com a explicação, não erro. Não é falha: é uma conta
  que a secretaria ainda não vinculou;
- nenhuma conta é feita no front. Média, percentual e situação vêm de `avaliacao` e são só
  formatados — recalcular produziria um segundo número, e é a divergência entre os dois que o
  boletim existe para não ter;
- as duas listas do mural têm `?pNaoLidos=` e `?pLidos=` próprios: marcar um comunicado como lido
  move uma linha de uma lista para a outra, e as duas precisam andar sem arrastar a vizinha;
- **este é o pior caso de rede do sistema.** O bloco desta frente é o que o orçamento de bundle da
  Task 32 mede.

**Casos de teste obrigatórios:**

| Caso | Espera |
|---|---|
| abrir o comunicado | **nenhuma** requisição `POST` disparada |
| clicar em "Marcar como lido" | um `POST /leitura`, e a lista de não lidos invalidada |
| clicar duas vezes rápido | um envio só (botão desabilita durante) |
| conta sem responsável vinculado | texto explicando, sem erro |
| boletim com nota `5.99` | tela mostra `5,9` |
| frequência com `?p=2` | segunda página dos dias |
| `404` no boletim | tela de "não encontrado" |

- [ ] **Step 1: `consultas.ts` (P6) e testes de leitura, incluindo o de "abrir não marca"**
- [ ] **Step 2: `mutacoes.ts` (P7) e teste do botão**
- [ ] **Step 3: As cinco telas (P8, P9) com os testes de P10**
- [ ] **Step 4: `rotas.tsx` da frente**
- [ ] **Step 5: `bun run verificar` verde**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/funcionalidades/responsavel
git commit -m "feat(web): portal do responsável"
```

---

### Task 28: Telas — Comunicados

**Files:**
- Create em `apps/web/src/funcionalidades/comunicados/`: `consultas.ts`, `mutacoes.ts`, `esquemas.ts`, `rotas.tsx`, `ListaDeComunicados.tsx`, `FormularioDeComunicado.tsx`, e os `.test.tsx`

| Rota do navegador | Tela | Endpoint |
|---|---|---|
| `/comunicados` | `ListaDeComunicados` | `GET /comunicados?unidadeId=&p=` |
| `/comunicados/novo` | `FormularioDeComunicado` | `GET /comunicados/destinatarios?unidadeId=`, `POST /comunicados` |

**O envio deixa de ter dois passos.** Hoje ele é `GET` para escolher a unidade e depois o
formulário, porque sem JavaScript a lista de destinatários só pode ser montada depois que a unidade
é conhecida. Com React, trocar a unidade dispara `GET /comunicados/destinatarios?unidadeId=` e a
lista aparece na mesma tela. É a terceira simplificação real que a migração traz.

**O que não muda:** a conferência dos destinatários continua no servidor. Que o React só ofereça os
certos não é garantia de nada — a lista que volta é entrada externa.

**Regras de tela:**

- a taxa de leitura é o motivo desta tela existir, e ela fica no topo, medindo o recorte inteiro.
  Trocar de página **não** a recalcula;
- o filtro de unidade mora em `?unidadeId=`;
- `admin_rede` sem filtro vê a rede inteira; `secretaria` sem filtro vê a primeira unidade dela;
- secretaria sem unidade atribuída vê a explicação, não uma lista vazia sem contexto.

**Casos de teste obrigatórios:**

| Caso | Espera |
|---|---|
| trocar a unidade no formulário | nova requisição de destinatários, seleção anterior limpa |
| alcance "toda a unidade" | envia `responsaveis: []` |
| alcance "selecionados" sem marcar ninguém | barrado pelo Zod de conforto |
| `422` com `campo: 'destinatarios'` | mensagem junto da lista |
| ir para `?p=2` | a taxa exibida não muda |
| taxa `0.123` | tela mostra `12,3 %` |

- [ ] **Step 1: `consultas.ts` (P6) e testes de leitura**
- [ ] **Step 2: `mutacoes.ts` (P7) e testes de escrita**
- [ ] **Step 3: `esquemas.ts`**
- [ ] **Step 4: As duas telas (P8, P9) com os testes de P10**
- [ ] **Step 5: `rotas.tsx` da frente**
- [ ] **Step 6: `bun run verificar` verde**
- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/funcionalidades/comunicados
git commit -m "feat(web): comunicados e taxa de leitura"
```

---

**Portão de saída da fase 4.**

- [ ] `bun run verificar` verde com as seis frentes juntas
- [ ] `bun run build:web` gera `dist` sem aviso de bundle
- [ ] `bun run dev` sobe os dois processos, e as quatro jornadas funcionam à mão
- [ ] toda rota do `rotas.tsx` da Task 21 resolve para uma tela de verdade

---

# FASE 5 — Qualidade

### Task 29: Playwright e a jornada da rede e da secretaria

**Files:**
- Create: `playwright.config.ts`, `e2e/apoio.ts`, `e2e/jornada-rede.spec.ts`, `e2e/jornada-secretaria.spec.ts`
- Modify: `package.json` (raiz)

**Interfaces:**
- Produces: `entrarComo(page, credenciais)` — o apoio que as Tasks 30 e 31 consomem.

**Contexto:** as jornadas são as de `docs/archify/06-jornada-admin-rede` e
`07-jornada-secretaria`. Elas rodam contra o servidor de verdade, com o banco semeado por
`bun run seed` — nenhum MSW aqui.

- [ ] **Step 1: Instalar e configurar**

```bash
bun add -d @playwright/test@latest
bunx playwright install chromium
```

`playwright.config.ts` sobe API e front com `webServer`, aponta `baseURL` para
`http://localhost:5173` e usa `retries: 0` — teste que só passa na segunda tentativa não é teste.

- [ ] **Step 2: Escrever `e2e/jornada-rede.spec.ts`**

Entrar como `admin@escolaviva.test`, criar unidade, definir ano letivo, convidar usuário,
**conferir que a senha provisória aparece uma vez**, navegar para fora e conferir que ela sumiu.

- [ ] **Step 3: Escrever `e2e/jornada-secretaria.spec.ts`**

Entrar como `secretaria1@escolaviva.test`, cadastrar aluno, cadastrar responsável, vincular,
criar turma, alocar disciplina, matricular, transferir. Ao fim, **recarregar a página numa URL
profunda** (`/secretaria/alunos/<id>`) e conferir que a aplicação volta — é o teste do fallback de
SPA da Task 7, feito no navegador de verdade.

- [ ] **Step 4: Rodar**

Run: `bun run e2e`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git status --short
git add playwright.config.ts e2e/apoio.ts e2e/jornada-rede.spec.ts \
        e2e/jornada-secretaria.spec.ts package.json bun.lock
git commit -m "test(e2e): jornadas da rede e da secretaria"
```

---

### Task 30: Jornada do professor

**Files:**
- Create: `e2e/jornada-professor.spec.ts`

Entrar como `professor1@escolaviva.test`, abrir a grade de notas, lançar com vírgula (`7,5`),
conferir que a tela mostra `7,5`, fazer a chamada de um dia com uma falta justificada, voltar um dia
e conferir que a chamada anterior continua lá, e **fechar o bimestre 3** conferindo que a recusa
traz a lista de pendências ("Faltam 45 notas: Arte (20), Ciências (20), Geografia (5)").

Fechar o bimestre 1 e conferir que funciona. Os dois casos estão plantados de propósito na base de
demonstração e são a prova de que a regra atravessou a migração.

- [ ] **Step 1: Escrever o teste**
- [ ] **Step 2: Rodar e ver passar**
- [ ] **Step 3: Commit**

```bash
git status --short
git add e2e/jornada-professor.spec.ts
git commit -m "test(e2e): jornada do professor"
```

---

### Task 31: Jornada do responsável, e a prova da taxa de leitura

**Files:**
- Create: `e2e/jornada-responsavel.spec.ts`

Entrar como um dos responsáveis que o `seed` imprime, abrir o boletim, conferir que a nota aparece
truncada, abrir a frequência, abrir o mural.

**O teste que não pode faltar:**

```ts
test('abrir o comunicado não marca leitura; só o botão marca', async ({ page }) => {
  await entrarComo(page, RESPONSAVEL);
  const naoLidosAntes = await contarNaoLidos(page);

  await page.goto('/responsavel/mural');
  await page.getByRole('link', { name: TITULO_DO_COMUNICADO }).click();
  await page.getByRole('heading', { name: TITULO_DO_COMUNICADO }).waitFor();
  await page.goto('/responsavel/mural');

  // Ler é escrita, e escrita não pode ser efeito colateral de navegação. A taxa de 12 % é a
  // medição que justifica o Estágio 04 — leitura inventada por navegação a destrói.
  expect(await contarNaoLidos(page)).toBe(naoLidosAntes);

  await page.getByRole('link', { name: TITULO_DO_COMUNICADO }).click();
  await page.getByRole('button', { name: 'Marcar como lido' }).click();
  await page.waitForURL('**/responsavel/mural');

  expect(await contarNaoLidos(page)).toBe(naoLidosAntes - 1);
});
```

- [ ] **Step 1: Escrever o teste**
- [ ] **Step 2: Rodar e ver passar**
- [ ] **Step 3: Commit**

```bash
git status --short
git add e2e/jornada-responsavel.spec.ts
git commit -m "test(e2e): jornada do responsável e prova da taxa de leitura"
```

---

### Task 32: Orçamento de bundle e acessibilidade

**Files:**
- Create: `apps/web/orcamento.test.ts`, `e2e/acessibilidade.spec.ts`
- Modify: `apps/web/vite.config.ts` se o teto estourar

**Interfaces:**
- Produces: um teste que falha quando o bundle do responsável passa do teto.

**Contexto:** o portal do responsável é o pior caso de rede do sistema. I4 existe porque um
responsável com 4G ruim toca em "enviar" duas vezes — e essa mesma pessoa agora baixa React e
Mantine antes de ver o boletim. **Teto: 150 kB comprimidos no primeiro carregamento do
responsável.** Estourar é motivo para trocar componente, não para subir o teto.

- [ ] **Step 1: Escrever o teste de orçamento**

```ts
const TETO_DO_RESPONSAVEL_EM_BYTES = 150 * 1024;

test('o primeiro carregamento do responsável cabe no orçamento', async () => {
  // O bloco do responsável mais o núcleo compartilhado: é o que uma pessoa em 4G baixa antes de
  // ver o boletim do filho. O teto não é estético — é a mesma restrição que justifica I4.
  const bytes = await somarGzipDosBlocos(['index', 'responsavel']);
  expect(bytes).toBeLessThanOrEqual(TETO_DO_RESPONSAVEL_EM_BYTES);
});

test('nenhum bloco de papel entra no carregamento inicial dos outros', async () => {
  const inicial = await blocosDoDocumento();
  expect(inicial).not.toContain('secretaria');
  expect(inicial).not.toContain('professor');
});
```

- [ ] **Step 2: Rodar e ajustar até passar**

Se estourar, nesta ordem: importar componentes do Mantine por caminho em vez do barril; adiar
`@mantine/dates` para as telas que usam data; separar o `dayjs` dos locales que não são `pt-br`.

- [ ] **Step 3: Escrever `e2e/acessibilidade.spec.ts`**

Uma varredura automatizada por papel, mais três verificações à mão que a ferramenta não pega:

| Verificação | Onde |
|---|---|
| navegação inteira por teclado, sem armadilha de foco | formulário de convite e grade de notas |
| todo campo tem `label` associado e o erro é anunciado | os oito formulários |
| contraste do tema em texto e em estado de erro | tema da Task 19 |
| `prefers-reduced-motion` respeitado | transições do Mantine |

- [ ] **Step 4: Rodar**

Run: `bun run e2e && cd apps/web && bun run test orcamento`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git status --short
git add apps/web/orcamento.test.ts e2e/acessibilidade.spec.ts apps/web/vite.config.ts
git commit -m "test: orçamento de bundle do responsável e acessibilidade"
```

---

# FASE 6 — Remoção e documentação

### Task 33: Remoção do SSR

**Files:**
- Delete: `apps/api/src/web/templates/` (45 arquivos), `apps/api/src/web/render.ts`, `apps/api/src/web/publico/app.css`, `scripts/build-assets.ts`, `publico/manifest.json`, `apps/api/testes/web/`
- Modify: `apps/api/src/web/rotas/*.ts` (removidos), `apps/api/src/shared/http/erros.ts`, `idempotencia.ts`, `index.ts`, `apps/api/src/web/app.ts`, `apps/api/package.json`, `package.json`

**Contexto:** só depois que a fase 5 estiver verde. Enquanto os E2E não provarem as quatro jornadas
no navegador, o SSR é a rede de segurança.

- [ ] **Step 1: Apagar os oito routers Eta e os 45 templates**

`apps/api/src/web/rotas/{login,conta,rede,secretaria,professor,responsavel,comunicados,index}.ts` e
a pasta `templates/`. `app.ts` perde a chamada a `montarRotas`.

- [ ] **Step 2: Enxugar `shared/http/erros.ts`**

Somem: `registrarRenderizadorDeErro`, `RenderizadorDeErro`, `paginaDeErro`, `paginaMinima`,
`escaparHtml`, `TITULOS`, `DETALHES` e o ramo de HTML de `respostaDeErro`. O middleware vira as
quatro linhas que a Task 4 anunciou.

- [ ] **Step 3: Enxugar `shared/http/idempotencia.ts` e `index.ts`**

Somem: `middlewareIdempotencia` (formulário), `CAMPO_CHAVE`, `CorpoDeFormulario`. `Variaveis.corpo`
passa a ser `unknown`, sem união.

- [ ] **Step 4: Remover `eta`, `build-assets` e o manifesto**

```bash
cd apps/api && bun remove eta
```

`build:assets` sai dos scripts da raiz. `publico/` deixa de existir — I10 agora é do Vite.

- [ ] **Step 5: Apagar `apps/api/testes/web/`, migrando o que sobrou**

`checklist.test.ts` **não é apagado**: ele é movido para `apps/api/testes/api/checklist.test.ts`
com os caminhos e os envios atualizados. Os quatro grupos que ele prova continuam valendo:
fronteira entre módulos, nenhum arquivo escrito em disco, `rede_id` em toda tabela de negócio,
idempotência, cache e saúde. Ele **ganha** o caso novo:

```ts
test('o documento da aplicação nunca vai para cache, e o asset com hash vai para sempre', async () => {
  const documento = await ler('/secretaria/alunos/01HZZZ');
  const asset = await ler('/assets/index-a1b2c3.js');

  expect(documento.headers.get('Cache-Control')).toBe('no-store');
  expect(asset.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
});
```

- [ ] **Step 6: Rodar a verificação**

Run: `bun run verificar && bun run e2e`
Expected: PASS. A contagem de testes cai (os de HTML sumiram) e a cobertura sobe.

- [ ] **Step 7: Commit**

```bash
git status --short
git add -- apps/api/src/web apps/api/src/shared/http apps/api/testes apps/api/package.json \
        package.json scripts publico bun.lock
git commit -m "refactor: remove o SSR em Eta"
```

---

### Task 34: Dockerfile, README e ambiente

**Files:**
- Modify: `infra/Dockerfile`, `.dockerignore`, `README.md`, `.env.example`

- [ ] **Step 1: `infra/Dockerfile` em dois estágios**

O primeiro instala e roda `bun run build:web`; o segundo copia o `dist` e o código da API. Uma
imagem só, tag = hash do commit — I19 intacta. `CAMINHO_DO_FRONT` aponta para onde o `dist` foi
copiado.

- [ ] **Step 2: Reescrever a seção "Como subir" do README**

```bash
cp .env.example .env
docker compose up -d banco
bun install
bun run migrate
bun run seed
bun run dev          # API em :3000 e front em :5173
```

`bun run build:assets` sai da lista. A tabela de comandos ganha `dev:web`, `build:web` e `e2e`.
O `cp` continua vindo antes do `docker compose`: é do `.env` que sai o `COMPOSE_FILE` que aponta
para `infra/docker-compose.yml`. Inverter os dois devolve `no configuration file provided`.

- [ ] **Step 3: Documentar as três variáveis do Cloudflare**

Uma subseção nova, "Publicar o front separado", explicando que as três variáveis são o caminho
inteiro e que a premissa é subdomínio do mesmo domínio registrável.

- [ ] **Step 4: Verificar que a imagem sobe**

Run: `docker build -f infra/Dockerfile -t escolaviva:teste . && docker run --rm escolaviva:teste bun --version`
Expected: build sem erro. O `.` final é o contexto e tem que ser a raiz — é de lá que saem
`apps/`, `migrations/` e `scripts/`, e é lá que está o `.dockerignore` que o build lê.

- [ ] **Step 5: Commit**

```bash
git status --short
git add infra/Dockerfile .dockerignore README.md .env.example
git commit -m "docs: comandos, imagem em dois estágios e variáveis de publicação"
```

---

### Task 35: ADRs e material didático

**Files:**
- Create: `docs/ADR/0005-spa-e-api-versionada.md`, `docs/ADR/0006-origem-do-front-como-configuracao.md`
- Modify: `docs/ESCOLAVIVA_ESTAGIO_01.md`, `docs/EVOLUCAO_SAAS.md`

**Contexto:** esta é a tarefa que o usuário aprovou explicitamente ao escolher "substituição total
+ doc atualizado". Sem ela o repositório fica contradizendo o próprio material.

- [ ] **Step 1: Escrever o ADR 0005**

No formato dos três ADRs existentes. Contexto: o pedido de SPA. Decisão: substituição total.
**Consequências, sem maquiar** — dois artefatos de build, uma API a versionar, validação em duas
camadas, CSRF que o formulário não exigia, e o portal do responsável passando a baixar JavaScript
antes do boletim. O que foi recusado junto e por quê: SSR do React (aluguel sem dor), token no
cliente (quebraria I2), envelope de resposta (o `Resultado<T>` já resolve).

- [ ] **Step 2: Escrever o ADR 0006**

I23, as três variáveis, e a premissa explícita: front e API em **subdomínios do mesmo domínio
registrável**. Sair dessa premissa é decisão nova, não ajuste de variável — com domínio diferente,
`SameSite=Lax` deixa de servir e o desenho muda.

- [ ] **Step 3: Corrigir `docs/ESCOLAVIVA_ESTAGIO_01.md`**

- a frase da linha 382 ("HTML renderizado no servidor, sem SPA e sem API pública para versionar")
  vira a decisão com o custo declarado, apontando para o ADR 0005;
- a tabela de invariantes ganha a linha **I23**;
- as linhas de **I2, I4, I10, I11 e I22** ganham a nota de como o mecanismo mudou;
- os números de abertura (55 unidades, 18 mil alunos, duas pessoas, um servidor) **não mudam**: a
  escala é a mesma, e é ela que sustenta o resto do argumento.

- [ ] **Step 4: Corrigir `docs/EVOLUCAO_SAAS.md`**

A linha 436 lista "adotar SPA por padrão" como armadilha. A armadilha continua sendo real — o que
muda é a distinção: adotar **por padrão** é armadilha; adotar **com o custo medido e registrado** é
decisão. A linha 435 ("SPA separada dobra deploys e obriga a criar API pública versionada") fica
como está: ela estava certa, e este estágio pagou exatamente esse preço.

- [ ] **Step 5: Commit**

```bash
git status --short
git add docs/ADR/0005-spa-e-api-versionada.md \
        docs/ADR/0006-origem-do-front-como-configuracao.md \
        docs/ESCOLAVIVA_ESTAGIO_01.md docs/EVOLUCAO_SAAS.md
git commit -m "docs: registra a decisão da SPA e a invariante I23"
```

---

### Task 36: Diagramas

**Files:**
- Modify: `docs/archify/01-arquitetura.*`, `03-requisicao-de-escrita.*`, `06..09-jornada-*.*`

Seis dos dez diagramas descrevem a arquitetura SSR e ficaram errados.

| Diagrama | O que muda |
|---|---|
| `01-arquitetura` | dois artefatos: `apps/web` estático e `apps/api`; a fronteira `/api/v1` |
| `03-requisicao-de-escrita` | POST-Redirect-GET vira requisição JSON com `Idempotency-Key`, e a resposta vira `201` com `Location` |
| `06-jornada-admin-rede` | telas do React; a senha provisória no corpo do `201`, sem o cookie de convite |
| `07-jornada-secretaria` | telas do React; formulários em página própria continuam |
| `08-jornada-professor` | a grade em `PUT`; a espera do fechamento continua explícita |
| `09-jornada-responsavel` | o mural, com o botão de marcar como lido separado da abertura |

Os quatro restantes (`02-fronteira-entre-modulos`, `04-ciclo-da-matricula`,
`05-fechamento-de-bimestre`, `10-fluxo-do-dado`) descrevem domínio e **não mudam** — o que é a
prova visual de que a migração não tocou em regra de negócio.

- [ ] **Step 1: Regerar os seis `.json` e `.html`**
- [ ] **Step 2: Conferir que os quatro de domínio continuam idênticos**

```bash
git status --short docs/archify
```
Expected: só os seis esperados aparecem como modificados.

- [ ] **Step 3: Commit**

```bash
git status --short
git add docs/archify/01-arquitetura.architecture.json docs/archify/01-arquitetura.html \
        docs/archify/03-requisicao-de-escrita.sequence.json docs/archify/03-requisicao-de-escrita.html \
        docs/archify/06-jornada-admin-rede.workflow.json docs/archify/06-jornada-admin-rede.html \
        docs/archify/07-jornada-secretaria.workflow.json docs/archify/07-jornada-secretaria.html \
        docs/archify/08-jornada-professor.workflow.json docs/archify/08-jornada-professor.html \
        docs/archify/09-jornada-responsavel.workflow.json docs/archify/09-jornada-responsavel.html
git commit -m "docs: diagramas com a arquitetura de dois artefatos"
```

---

## Checagem final

Antes de considerar o plano concluído:

**Comportamento**

- [ ] `bun run verificar` verde, cobertura ≥ 80 % nos dois workspaces
- [ ] `bun run e2e` verde nas quatro jornadas
- [ ] `bun run build:web` dentro do orçamento de 150 kB para o responsável
- [ ] `docker build` conclui e a imagem sobe

**Invariantes**

- [ ] **I2** — apagar a linha de `sessao` no banco derruba o acesso na requisição seguinte
- [ ] **I4** — dois `POST` com a mesma `Idempotency-Key` produzem um registro só
- [ ] **I10** — todo arquivo em `/assets/` tem hash no nome
- [ ] **I11** — `/api/*` com sessão responde `private, no-store`; `index.html` responde `no-store`
- [ ] **I17** — a senha provisória não está no log nem em `requisicao_idempotente`
- [ ] **I22** — desligar o Zod do front não deixa passar nenhuma escrita inválida
- [ ] **I23** — com `VITE_API_URL` e `ORIGENS_PERMITIDAS` preenchidas apontando para outra porta, a
      aplicação continua funcionando sem mudança de código

**Medições plantadas**

- [ ] abrir um comunicado não altera `lido_em`
- [ ] a taxa do mural continua sendo a do recorte, não a da página
- [ ] fechar o bimestre 3 da turma de demonstração continua recusando com a lista de pendências
- [ ] o fechamento continua síncrono, com a espera visível

**Higiene**

- [ ] nenhum `console.log` em `apps/web/src`
- [ ] nenhum arquivo acima de 800 linhas
- [ ] `grep -rn "eta" apps/api/src` não encontra o motor de template
- [ ] `bunx depcruise` passa, com a regra `contratos-sem-dependencia` ativa
- [ ] `grep -rn "academico\|identidade\|shared/db" apps/web/src` não encontra nada
