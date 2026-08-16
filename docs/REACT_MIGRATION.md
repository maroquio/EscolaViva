# React frontend and the backend as an API — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** replace the Eta-rendered HTML with a React 19 SPA served as static files, turning Hono into a versioned JSON API, without changing any business rule.

**Architecture:** the repository becomes two Bun workspaces — `apps/api` (today's four domain modules, with `src/web/` becoming `src/http/` and returning JSON under `/api/v1`) and `apps/web` (Vite + React, pure static). The session stays a signed cookie resolved in the database; idempotency moves from the form body to the `Idempotency-Key` header; the asset hash becomes Vite's. Three empty environment variables (`VITE_API_URL`, `ALLOWED_ORIGINS`, `COOKIE_DOMAIN`) make a future Cloudflare Pages publication a configuration change.

**Tech Stack:** Bun · TypeScript · Hono · PostgreSQL 16 via `Bun.sql` · Zod 4 · `bun:test` · React 19 · Vite 7 · React Router 7 · Mantine 8 · TanStack Query 5 · React Hook Form 7 · Zustand 5 · Axios 1 · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-08-14-frontend-react-design.md` — read it before starting; this plan argues from it.

## Global Constraints

They apply to **every** task. Not repeated in the individual tasks.

- **Language:** every identifier, file name and folder name in **English**. Screen text and messages the end user reads stay in **Brazilian Portuguese**, with correct accents. This applies equally in `.ts`, `.tsx` and `.css`. What this line used to say ("every identifier, comment, error message and screen text in Brazilian Portuguese") was revoked on 2026-08-16: the repository has been converted to English, and the canonical glossary is the source of truth for the terms.
- **Comments explain the why, never the what.** Look at any neighbouring file before writing: the repository documents decisions and trade-offs, not mechanics. A new file with no header explaining why it exists is incomplete.
- **`bun run verify` green before any commit.** It runs `tsc --noEmit` in both workspaces, `depcruise` on the API and both suites, with an 80 % coverage gate.
- **Commit:** `git add` **explicit, file by file**. Never `git add -A`, `git add .`, `git add -u`, `git commit -a` or `-am`. Run `git status --short` first and confirm only that task's files are staged. This rule applies to sub-agents too.
- **Ask the user for authorisation before every commit and before any push.** Authorisation is scoped: "you may commit" does not authorise a push, and one authorised commit does not authorise the next.
- **Do not create a branch.** Work on the current branch.
- **No AI attribution** in commit messages.
- **Stage 01.** Nothing in this plan may anticipate a later-stage component — no queue, no cache, no contracted CDN, no e-mail delivery, no external service. The three Cloudflare variables are born **empty**.
- **No business rule changes.** `*/domain/`, `*/application/`, `*/infra/`, `migrations/` and the domain suites stay as they are, except for the Zod migration (Task 2) and the file paths (Task 1).
- **Do not loosen scope.** A record outside the schools where the person holds the role answers **404**, never 403 — the existence of a student is already information. That holds just the same in JSON.
- **`ApplicationError`** is `{ campo?: string; codigo: string; mensagem: string }` in `apps/api/src/shared/result.ts`. Use `fieldFailure(campo, codigo, mensagem)` for an error anchored to a field. It is this array that travels to React Hook Form — no translator between the two ends.
- **Versions:** always install with `@latest` and let `bun.lock` record the exact version. The plan names major versions (React 19, Vite 7, Mantine 8…), never patch numbers.
- **The front never imports the domain.** `apps/web` may only import from `apps/api/src/http/contracts/`, and nothing else. Importing `academics`, `identity` or `shared/db` from inside React is an architecture error, not a convenience.
- **Real validation stays in `*/application/` (I22).** The HTTP edge validates **shape** and answers 400; the application validates **rules** and answers 422; React's Zod validates **comfort** and decides nothing.

---

## Execution by multiple agents

36 tasks across 7 phases. The odd phases are deliberately narrow — they define the contract, and a contract written by two hands at once diverges. Phases 2, 4, 5 and 6 open into fronts whose files do not touch.

### Dependency graph

```
PHASE 0   T1 ──▶ T2
                  │
PHASE 1           └▶ T3 ─▶ T4 ─▶ T5 ─▶ T6 ─▶ T7 ─▶ T8 ─▶ T9
                                                           │
PHASE 2   ┌──────┬──────┬──────┬──────┬──────┬─────────────┘
          T10    T11    T12    T13    T14    T15    T16      (7 parallel fronts)
          └──────┴──────┴──────┴──────┴──────┴──────┬─────┘
                                                     │
PHASE 3   T17 ─▶ T18 ─▶ T19 ─▶ T20 ─▶ T21 ─▶ T22 ◀──┘
                                               │
PHASE 4   ┌──────┬──────┬──────┬──────┬────────┘
          T23    T24    T25    T26    T27    T28              (6 parallel fronts)
          └──────┴──────┴──────┴──────┴───────┬─────┘
                                               │
PHASE 5   T29 ─▶ (T30 ‖ T31 ‖ T32)
                           │
PHASE 6   T33 ─▶ (T34 ‖ T35 ‖ T36)
```

`T18` (formatters) depends on `T17` only through `package.json`; the orchestrator may run it in parallel with `T19`.

### File ownership per front

While a parallel phase is in flight, **no front writes outside its own row**. Shared files (`http/routes/index.ts`, `app/routes.tsx`, `package.json`) are touched only by the phase's closing task.

| Front | Phase 2 writes in | Phase 4 writes in |
|---|---|---|
| Options | `api/src/http/routes/options.ts` · `presenters/options.ts` · `tests/api/options.test.ts` | — |
| Network | `api/src/http/routes/network.ts` · `schemas/network.ts` · `presenters/network.ts` · `tests/api/network.test.ts` | `web/src/features/network/**` |
| Registrar A | `.../routes/registrar/students.ts` · `schemas/students.ts` · `presenters/students.ts` · `tests/api/registrar_students.test.ts` | `web/src/features/registrar/students/**` |
| Registrar B | `.../routes/registrar/classGroups.ts` · `schemas/classGroups.ts` · `presenters/classGroups.ts` · `tests/api/registrar_class_groups.test.ts` | `web/src/features/registrar/class-groups/**` |
| Teacher | `.../routes/teacher.ts` · `schemas/teacher.ts` · `presenters/teacher.ts` · `tests/api/teacher.test.ts` | `web/src/features/teacher/**` |
| Guardian | `.../routes/guardian.ts` · `presenters/guardian.ts` · `tests/api/guardian.test.ts` | `web/src/features/guardian/**` |
| Announcements | `.../routes/announcements.ts` · `schemas/announcements.ts` · `presenters/announcements.ts` · `tests/api/announcements.test.ts` | `web/src/features/announcements/**` |

### Mandatory briefing for a front sub-agent

Paste this into the briefing of every parallel-phase task:

> You implement **one** front. Do not edit any file outside your front's row in the plan's ownership table. If you need something belonging to another front or to a shared file, **stop and report** instead of editing. When committing, list the files explicitly with `git add <path> <path>`; never use `-A`, `.`, `-u`, `-a` or `-am`. Other agents are working in the same repository at the same time, and a broad `git add` destroys their work. Read the "Implementation Patterns" section of the plan before writing the first line.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `apps/api/package.json` | server dependencies: hono, pino, zod |
| `apps/web/package.json` | front dependencies |
| `apps/web/vite.config.ts` | build, dev proxy, Mantine PostCSS, Vitest |
| `apps/web/index.html` | the document shell; no data and no inline script |
| `apps/api/src/http/static.ts` | serves `apps/web/dist` and does the SPA fallback |
| `apps/api/src/http/cors.ts` | CORS from the environment; inert with `ALLOWED_ORIGINS` empty |
| `apps/api/src/http/secureWrite.ts` | requires JSON `Content-Type` and `X-Requested-By` on writes |
| `apps/api/src/http/response.ts` | `errorBody`, `created`, `pageAsJson`, `parse` |
| `apps/api/src/http/contracts/*.ts` | response types and enumerations; **no imports at all** |
| `apps/api/src/http/schemas/*.ts` | request-body Zod, per resource |
| `apps/api/src/http/presenters/*.ts` | domain → response JSON object |
| `apps/api/src/http/routes/session.ts` | sign in, sign out, who am I |
| `apps/web/src/shared/api/client.ts` | the system's single Axios instance |
| `apps/web/src/shared/api/error.ts` | `ApiError` and `applyErrors` |
| `apps/web/src/shared/theme/theme.ts` | `MantineThemeOverride` derived from `app.css` |
| `apps/web/src/shared/format/*.ts` | formatters ported from `render.ts` |
| `apps/web/src/app/routes.tsx` | the React Router tree, with today's URLs |
| `apps/web/src/app/guards.tsx` | `RequireLogin`, `RequireRole`, `initialDashboard` |
| `apps/web/src/features/**` | one folder per subject, self-contained |
| `e2e/*.spec.ts` | the four journeys |
| `docs/ADR/0007-spa-and-versioned-api.md` | why the SPA came in and what it charges |
| `docs/ADR/0008-front-origin-as-configuration.md` | I23 and the three variables |

### Moved

| From | To |
|---|---|
| `src/{identity,academics,assessment,communication,shared}/` | `apps/api/src/…` |
| `src/main.ts` | `apps/api/src/main.ts` |
| `src/web/{app,health,pagination}.ts` | `apps/api/src/http/…` |
| `src/web/routes/*.ts` | `apps/api/src/http/routes/*.ts` |
| `tests/` | `apps/api/tests/` |
| `config/.dependency-cruiser.js` | `apps/api/.dependency-cruiser.js` (leaves `config/` empty; remove the folder) |
| `tests/web/*.test.ts` | `apps/api/tests/api/*.test.ts` (rewritten across phases 1 and 2) |

### Removed at the end (Task 33)

`src/web/templates/` (45 files) · `src/web/render.ts` · `src/web/public/app.css` · `scripts/build-assets.ts` · `public/manifest.json` · the `eta` dependency · `KEY_FIELD` and `FormBody` in `shared/http` · `registerErrorRenderer`, `ErrorRenderer` and `errorPage` in `shared/http/errors.ts` · `INVITE_COOKIE`, `storeInvite` and `takeInvite` in `routes/network.ts`.

---

## Implementation Patterns

Every parallel-phase task uses these patterns. They live here, rather than inside a task, because the tasks are read out of order and by different agents. **Read this section before any task in phases 2 and 4.**

### P1 — Paginated read route

```ts
registrarRoutes.get('/guardians', async (c) => {
  const page = await academics.guardiansPage(currentNetwork(c), pageFromQuery(c));
  return c.json(pageAsJson(page, guardianAsJson));
});
```

### P2 — Write route

```ts
registrarRoutes.post('/students', async (c) => {
  // Edge: shape only. A missing field, a wrong type, a malformed id — no rules here.
  const input = parse(studentSchema, c.get('body'));
  if (!input.ok) return c.json(errorBody(input.erros), 400);

  // Rules: the use case decides, as it always did (I22).
  const result = await academics.registerStudent({ networkId: currentNetwork(c), ...input.valor });
  if (!result.ok) return c.json(errorBody(result.erros), 422);

  return created(c, `/api/v1/registrar/students/${result.valor.id}`, { id: result.valor.id });
});
```

`created` writes the `Location` header, and it is from there that the idempotency middleware takes what it stores in `response_location`. A write that answers 201 without a `Location` breaks I4 silently.

### P3 — Presenter

One per aggregate, in `presenters/`. It decides what goes out — never `...databaseRow`:

```ts
export const guardianAsJson = (guardian: Guardian): GuardianInList => ({
  id: guardian.id,
  name: guardian.name,
  email: guardian.email,
  phone: guardian.phone,
  cpf: guardian.cpf,
});
```

The return type comes from `contracts/`, and it is what the front imports.

### P4 — Edge schema

```ts
export const studentSchema = z.object({
  name: z.string({ error: 'informe o nome' }),
  birthDate: z.string({ error: 'informe a data de nascimento' }),
});
```

No `.min`, no `.regex`, no ranges: that is a rule and it lives in `academics/application/registerStudent.ts`. The edge only guarantees the fields exist and are strings, so the use case does not receive `undefined`.

### P5 — API route test

```ts
import { describe, expect, test } from 'bun:test';
import { read, signIn, write } from '../support';

describe('student registration', () => {
  test('a valid student answers 201 with the id and the Location', async () => {
    const cookie = await signIn(REGISTRAR);

    const response = await write('POST', '/api/v1/registrar/students', {
      name: 'Ana Souza', birthDate: '2015-03-11',
    }, cookie);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(response.headers.get('Location')).toBe(`/api/v1/registrar/students/${body.id}`);
  });

  test('a missing name is refused by the edge, with 400 and the field named', async () => {
    const cookie = await signIn(REGISTRAR);

    const response = await write('POST', '/api/v1/registrar/students', {
      birthDate: '2015-03-11',
    }, cookie);

    expect(response.status).toBe(400);
    const { erros } = await response.json();
    expect(erros[0].campo).toBe('name');
  });

  test('a student from another network does not exist for this registrar', async () => {
    const cookie = await signIn(REGISTRAR);

    const response = await read(`/api/v1/registrar/students/${STUDENT_FROM_ANOTHER_NETWORK}`, cookie);

    expect(response.status).toBe(404);
  });
});
```

Every front delivers, at a minimum:

| Endpoint kind | Mandatory cases |
|---|---|
| write | success · edge refusal (400 with `campo`) · rule refusal (422 with `campo`) · no session (401) · wrong role (403) · target out of scope (404) |
| read | success · no session (401) · wrong role (403) · target out of scope (404) · `?p=` changes the page |

### P6 — TanStack Query keys and queries

```ts
export const studentKeys = {
  root: ['registrar', 'students'] as const,
  search: (term: string, page: number) =>
    [...studentKeys.root, 'search', term, page] as const,
  record: (id: string) => [...studentKeys.root, 'record', id] as const,
};

export function useStudents(term: string, page: number) {
  return useQuery({
    queryKey: studentKeys.search(term, page),
    queryFn: () =>
      client
        .get<Page<StudentInList>>('/registrar/students', { params: { q: term, p: page } })
        .then((response) => response.data),
    // The students screen opens empty: no term means no search, and no query against the database.
    enabled: term !== '',
    // The table does not flicker when the page changes: the previous one stays until the new one lands.
    placeholderData: keepPreviousData,
  });
}
```

### P7 — Mutation

```ts
export function useRegisterStudent() {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (data: StudentInput) =>
      client.post<{ id: string }>('/registrar/students', data).then((r) => r.data),
    onSuccess: () => queries.invalidateQueries({ queryKey: studentKeys.root }),
  });
}
```

No optimistic updates at this stage: the write is synchronous and the user waits. Hiding the wait would hide the pain the later stages exist to solve.

### P8 — Form

```tsx
export function StudentForm() {
  const navigate = useNavigate();
  const warn = useNotices((state) => state.error);
  const register_ = useRegisterStudent();
  const { register, handleSubmit, setError, formState } = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
  });

  const submit = handleSubmit(async (values) => {
    try {
      const { id } = await register_.mutateAsync(values);
      navigate(`/registrar/students/${id}`);
    } catch (error) {
      // The `campo` the API returns is the input's `name`: the error lands under the right field
      // with no translation between the two ends.
      applyErrors(error, setError, warn);
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <TextInput label="Nome" {...register('name')} error={formState.errors.name?.message} />
      <TextInput
        label="Data de nascimento"
        type="date"
        {...register('birthDate')}
        error={formState.errors.birthDate?.message}
      />
      <Button type="submit" loading={formState.isSubmitting}>Cadastrar</Button>
    </form>
  );
}
```

### P9 — List screen

A list screen is **only the table**, with the button that leads to the form on its own page. A write form never shares the page with the listing — that was decided and implemented in the current state, and the migration may not undo it.

```tsx
export function GuardianList() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('p') ?? 1);
  const query = useGuardians(page);

  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailed error={query.error} />;
  if (query.data.total === 0) return <Empty message="Nenhum responsável cadastrado." />;

  return (
    <>
      <Table columns={COLUMNS} rows={query.data.items} />
      <Pagination
        page={query.data.page}
        pages={query.data.pages}
        onChange={(number) => setParams({ p: String(number) })}
      />
    </>
  );
}
```

The page lives in the query string, not in component state: the third page stays a copyable address and the back button keeps working without anyone programming it.

### P10 — Front test

```tsx
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../testSetup';

test('a field error coming from the API appears under the field', async () => {
  server.use(
    http.post('*/api/v1/registrar/students', () =>
      HttpResponse.json(
        {
          erros: [{ campo: 'name', codigo: 'nome_repetido', mensagem: 'Já existe um aluno com este nome.' }],
          correlationId: 'teste',
        },
        { status: 422 },
      ),
    ),
  );
  renderWithProviders(<StudentForm />);

  await userEvent.type(screen.getByLabelText('Nome'), 'Ana Souza');
  await userEvent.type(screen.getByLabelText('Data de nascimento'), '2015-03-11');
  await userEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

  expect(await screen.findByText('Já existe um aluno com este nome.')).toBeVisible();
});
```

---

# PHASE 0 — Foundation

Nothing here changes behaviour. Two mechanical tasks that have to be green before anything else,
because debugging a file-path change alongside an HTTP-contract change is debugging two things at
once.

### Task 1: Workspaces and moving `src/` to `apps/api/`

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Modify: `package.json`, `tsconfig.json`, `bunfig.toml`, `infra/Dockerfile`, `.dockerignore`
- Move: `src/` → `apps/api/src/`, `tests/` → `apps/api/tests/`, `config/.dependency-cruiser.js` → `apps/api/.dependency-cruiser.js`

> `.dockerignore` stays at the root even with the Dockerfile in `infra/`: Docker looks for it at the
> root of the build context, not next to the Dockerfile. See "Where everything lives" in the README.

**Interfaces:**
- Produces: a root where `bun run verify`, `bun run dev:api`, `bun run migrate` and `bun run seed` work from the new paths. Every later task assumes `apps/api/src/…`.

- [ ] **Step 1: Move the tree with `git mv`, preserving history**

```bash
mkdir -p apps/api
git mv src apps/api/src
git mv tests apps/api/tests
git mv config/.dependency-cruiser.js apps/api/.dependency-cruiser.js
rmdir config
```

- [ ] **Step 2: Create `apps/api/package.json`**

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

`eta` stays here until Task 33 — SSR only dies once the SPA is standing.

- [ ] **Step 3: Rewrite the root `package.json`**

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
    "magic": "bun scripts/magic-values.ts",
    "typecheck": "bunx tsc --noEmit -p apps/api/tsconfig.json",
    "test": "bun test apps/api/tests",
    "test:coverage": "bun test apps/api/tests --coverage",
    "verify": "bun run typecheck && bun run check && bun run magic && bun run test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "dependency-cruiser": "^16",
    "typescript": "^5"
  }
}
```

`dev` leaves the list in this task and comes back in Task 17, when there is a second process to start.

- [ ] **Step 4: Create `apps/api/tsconfig.json` and slim down the root one**

`apps/api/tsconfig.json` receives the content of today's `tsconfig.json`, with `include` pointing at
`src` and `tests`. The root one becomes just `{ "files": [], "references": [{ "path": "apps/api" }] }`.

- [ ] **Step 5: Fix the paths left behind**

Points that reference `src/` and are not resolved by `git mv`:

| File | What changes |
|---|---|
| `bunfig.toml` | `preload` → `apps/api/tests/support/preload.ts` |
| `apps/api/.dependency-cruiser.js` | the five `^src/` across the three rules → `^apps/api/src/`; `tsConfig.fileName` → `apps/api/tsconfig.json` |
| `apps/api/tests/web/support.ts` | `PROJECT_ROOT` climbs two more levels; the `import('./src/web/app.ts')` of the separate processes becomes `./apps/api/src/web/app.ts` |
| `apps/api/tests/web/checklist.test.ts` | the "no module writes a file" scan points at `apps/api/src` |
| `scripts/*.ts` | imports of `../src/…` → `../apps/api/src/…` |
| `infra/Dockerfile`, `.dockerignore` | `COPY src` → `COPY apps/api/src`; likewise `tests`. The two stay in different folders on purpose — the build context is still the root. |

- [ ] **Step 6: Run the whole verification**

Run: `bun install && bun run verify`
Expected: PASS — the same test count as before the move. No new test, none fewer.

- [ ] **Step 7: Commit**

```bash
git status --short
git add package.json tsconfig.json bunfig.toml infra/Dockerfile .dockerignore \
        apps/api/package.json apps/api/tsconfig.json apps/api/.dependency-cruiser.js \
        apps/api/src apps/api/tests scripts
git commit -m "refactor: repository as workspaces, backend under apps/api"
```

---

### Task 2: Zod 3 → Zod 4

**Files:**
- Modify: `apps/api/src/shared/config/schema.ts`, `apps/api/src/identity/application/inviteUser.ts`, `apps/api/src/shared/result.ts`, `apps/api/package.json`
- Test: `apps/api/tests/shared/config.test.ts` (already exists and covers the messages)

**Interfaces:**
- Produces: `schemaErrors(issues: { path: PropertyKey[]; message: string; code: string }[]): ApplicationError[]` — the signature used by every use case and, from Task 8 on, by `parse()` as well.

**Context:** 21 files import `zod`, but only two use API that changed shape. The other 19 use
`z.object`, `z.string`, `.min`, `.safeParse` and `.issues`, which are the same in both versions.

- [ ] **Step 1: Run the suite and note the starting green**

Run: `bun run test`
Expected: PASS. Note the test count — it must not change in this task.

- [ ] **Step 2: Swap the 9 occurrences in `apps/api/src/shared/config/schema.ts`**

| Before (v3) | After (v4) |
|---|---|
| `z.enum(['true','false'], { errorMap: () => ({ message: 'use true ou false' }) })` | `z.enum(['true','false'], { error: 'use true ou false' })` |
| `z.enum(ENVIRONMENTS, { errorMap: () => ({ message: 'use development, test ou production' }) })` | `z.enum(ENVIRONMENTS, { error: 'use development, test ou production' })` |
| `z.enum(LOG_LEVELS, { errorMap: () => ({ message: 'use debug, info, warn ou error' }) })` | `z.enum(LOG_LEVELS, { error: 'use debug, info, warn ou error' })` |
| `z.coerce.number({ invalid_type_error: 'precisa ser um número inteiro de porta' })` | `z.coerce.number({ error: 'precisa ser um número inteiro de porta' })` |
| `z.coerce.number({ invalid_type_error: 'precisa ser um número de horas' })` | `z.coerce.number({ error: 'precisa ser um número de horas' })` |
| `z.coerce.number({ invalid_type_error: 'precisa ser um número de milissegundos' })` | `z.coerce.number({ error: 'precisa ser um número de milissegundos' })` |
| `z.string({ required_error: 'obrigatória — conexão do PostgreSQL primário' })` | `z.string({ error: 'obrigatória — conexão do PostgreSQL primário' })` |
| `z.string({ required_error: 'obrigatória — segredo que assina o cookie de sessão' })` | `z.string({ error: 'obrigatória — segredo que assina o cookie de sessão' })` |

- [ ] **Step 3: Swap the occurrence in `inviteUser.ts`**

```ts
role: z.enum(ROLES, { error: 'papel desconhecido' }),
```

- [ ] **Step 4: Widen the signature of `schemaErrors` in `shared/result.ts`**

In Zod 4 `issue.path` is `PropertyKey[]`, which includes `symbol`. `join('.')` keeps working; it is the
type that has to follow:

```ts
export const schemaErrors = (
  issues: readonly { path: PropertyKey[]; message: string; code: string }[],
  fieldNames: Readonly<Record<string, string>> = {},
): ApplicationError[] =>
  issues.map((issue) => {
    const campo = issue.path.map(String).join('.');
    const error: ApplicationError = { codigo: issue.code, mensagem: issue.message };
    // An error at the schema root has no field; omitting the key is different from storing it as
    // undefined — the screen decides between highlighting an input and showing a general warning.
    return campo === '' ? error : { ...error, campo };
  });
```

- [ ] **Step 5: Verify with Zod 4 still on the subpath, before swapping the package**

The installed version (`zod@3.25.76`) already exposes Zod 4 at `zod/v4`. Temporarily switching the
imports of the two changed files to `from 'zod/v4'` and running the suite proves the migration without
touching the lockfile.

Run: `bun run test apps/api/tests/shared/config.test.ts apps/api/tests/identity`
Expected: PASS, with the same configuration error messages as before.

- [ ] **Step 6: Bump the package and put the imports back to `'zod'`**

```bash
cd apps/api && bun add zod@latest
```

Revert the two `'zod/v4'` imports to `'zod'`.

- [ ] **Step 7: Run the whole verification**

Run: `bun run verify`
Expected: PASS, with the same test count as Step 1.

- [ ] **Step 8: Commit**

```bash
git status --short
git add apps/api/package.json apps/api/src/shared/config/schema.ts \
        apps/api/src/shared/result.ts apps/api/src/identity/application/inviteUser.ts \
        bun.lock
git commit -m "chore: migrate validation to Zod 4"
```

---

# PHASE 1 — The edge

Seven sequential tasks that define the HTTP contract. They are deliberately narrow: each changes one
mechanism and keeps the suite green. By the end of the phase, `/api/v1/session` answers JSON and the
server knows how to deliver a `dist` that does not exist yet.

While this phase runs, **SSR keeps working** — the Eta routes stay mounted and the `tests/web/` tests
keep passing. That is what makes it possible to stop at any task without leaving the system on the
floor.

### Task 3: New configuration and a cookie with a domain

**Files:**
- Modify: `apps/api/src/shared/config/schema.ts`, `apps/api/src/shared/http/session.ts`, `.env.example`
- Test: `apps/api/tests/shared/config.test.ts`

**Interfaces:**
- Produces: `config.allowedOrigins: string[]`, `config.cookieDomain: string | null`. Consumed by Task 6 (CORS) and by `cookieOptions()`.

- [ ] **Step 1: Write the failing test**

In `apps/api/tests/shared/config.test.ts`:

```ts
test('allowed origins are born empty and accept a comma-separated list', () => {
  const withoutList = loadConfig({ ...MINIMUM_ENVIRONMENT });
  expect(withoutList.allowedOrigins).toEqual([]);

  const withList = loadConfig({
    ...MINIMUM_ENVIRONMENT,
    ALLOWED_ORIGINS: 'https://app.escolaviva.test, https://admin.escolaviva.test',
  });
  expect(withList.allowedOrigins).toEqual([
    'https://app.escolaviva.test',
    'https://admin.escolaviva.test',
  ]);
});

test('the cookie domain is null when it is not declared', () => {
  expect(loadConfig({ ...MINIMUM_ENVIRONMENT }).cookieDomain).toBeNull();
  expect(
    loadConfig({ ...MINIMUM_ENVIRONMENT, COOKIE_DOMAIN: '.escolaviva.test' }).cookieDomain,
  ).toBe('.escolaviva.test');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test apps/api/tests/shared/config.test.ts`
Expected: FAIL — `allowedOrigins` and `cookieDomain` do not exist on `Config`.

- [ ] **Step 3: Implement**

In `schema.ts`, two lines in the schema and two in the return. `commaSeparatedList` already exists and
is reused — it is the same function that handles `TRUSTED_PROXIES`:

```ts
ALLOWED_ORIGINS: z.string().default(''),
COOKIE_DOMAIN: z.string().default(''),
```

```ts
allowedOrigins: commaSeparatedList(raw.ALLOWED_ORIGINS),
// With no declared domain the cookie is host-only, which is what you want with a single origin.
cookieDomain: raw.COOKIE_DOMAIN === '' ? null : raw.COOKIE_DOMAIN,
```

And the `Config` type gains both fields.

- [ ] **Step 4: Make the session cookie honour the domain**

In `shared/http/session.ts`, `cookieOptions()`:

```ts
/**
 * `Domain` only appears when somebody declares it. It exists for the day the front lives at `app.`
 * and the API at `api.` of the same registrable domain: then both need the same cookie, and
 * `SameSite=Lax` still holds because subdomains of one domain are the same site.
 */
const cookieOptions = () => ({
  path: '/',
  httpOnly: true,
  secure: config.secureCookie,
  sameSite: 'Lax' as const,
  maxAge: config.sessionDurationHours * TIME.secondsPerHour,
  ...(config.cookieDomain === null ? {} : { domain: config.cookieDomain }),
});
```

`closeSession` gets the same treatment — deleting a cookie with a `Domain` requires repeating the
`Domain`.

- [ ] **Step 5: Run the tests**

Run: `bun test apps/api/tests/shared/config.test.ts apps/api/tests/web/authentication.test.ts`
Expected: PASS

- [ ] **Step 6: Record the variables in `.env.example`**

```bash
# Origins allowed to talk to the API through CORS. Empty = same origin, and no header is emitted.
# Fill this in the day the front is published separately (Cloudflare Pages).
ALLOWED_ORIGINS=

# Session cookie domain. Empty = host-only.
# Fill with .yourdomain.com.br when the front and the API are distinct subdomains.
COOKIE_DOMAIN=
```

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/shared/config/schema.ts apps/api/src/shared/http/session.ts \
        apps/api/tests/shared/config.test.ts .env.example
git commit -m "feat(config): allowed origins and cookie domain, both empty"
```

---

### Task 4: Errors in JSON

**Files:**
- Create: `apps/api/src/http/response.ts`
- Modify: `apps/api/src/shared/http/errors.ts`, `apps/api/src/shared/http/index.ts`
- Test: `apps/api/tests/api/errors.test.ts`

**Interfaces:**
- Produces:
  - `errorBody(erros: readonly ApplicationError[]): { erros: readonly ApplicationError[]; correlationId: string }`
  - `errorStatus(error: unknown): ErrorStatus` — exported, so the routes can reuse it
  - `jsonErrorsMiddleware: MiddlewareHandler` — answers JSON on `/api/*` and delegates the rest to the HTML renderer while SSR exists

**Context:** while phase 1 runs, SSR still answers. The middleware has to decide by path: `/api/*`
gets JSON, the rest keeps getting a page.

- [ ] **Step 1: Write the failing test**

```ts
test('an error on an API route comes back as JSON with the correlation code', async () => {
  const response = await read('/api/v1/session');

  expect(response.status).toBe(401);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  const body = await response.json();
  expect(body.erros).toHaveLength(1);
  expect(body.correlationId).not.toBe('');
});

test('the error response leaks no stack, no SQL and no exception message', async () => {
  const response = await read('/api/v1/session');

  const raw = await response.text();
  expect(raw).not.toContain('at ');
  expect(raw).not.toContain('SELECT');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test apps/api/tests/api/errors.test.ts`
Expected: FAIL — `/api/v1/session` does not exist yet; it answers 404 in HTML.

- [ ] **Step 3: Create `apps/api/src/http/response.ts`**

```ts
/**
 * The API's response vocabulary. It exists so that no route invents its own error or page format:
 * whoever answers JSON here answers the same way everywhere, and the front has one contract to
 * handle.
 */
import type { Context } from 'hono';
import { currentContext } from '../shared/http';
import type { ApplicationError } from '../shared/result';

export type ErrorBody = {
  readonly erros: readonly ApplicationError[];
  readonly correlationId: string;
};

/** The correlation code is what support uses to find the trail in the log (I16). */
export const errorBody = (erros: readonly ApplicationError[]): ErrorBody => ({
  erros,
  correlationId: currentContext()?.correlationId ?? '',
});

/**
 * A completed write answers 201 with `Location`. The header is not decoration: it is where the
 * idempotency middleware takes the path it stores in `response_location` (I4).
 */
export const created = <T>(c: Context, location: string, body: T): Response => {
  c.header('Location', location);
  return c.json(body as object, 201);
};
```

- [ ] **Step 4: Teach `errorsMiddleware` to speak JSON**

In `shared/http/errors.ts`, `errorStatus` becomes exported and the middleware gains the branch:

```ts
const API_PREFIX = '/api/';

const errorResponse = (c: Context, status: ErrorStatus, erros: ApplicationError[]): Response => {
  // While SSR exists, the path decides the format. In Task 33, when the Eta screens go, the HTML
  // branch goes with them and this middleware becomes four lines.
  if (!c.req.path.startsWith(API_PREFIX)) return c.html(errorPage(status), status);
  const correlationId = currentContext()?.correlationId ?? '';
  return c.json({ erros, correlationId }, status);
};
```

The `erros` of an exception is a single line, with the status code and its generic message — **never**
the exception's message, which is operational information and belongs in the log:

```ts
const ERRORS_BY_STATUS: Record<ErrorStatus, ApplicationError> = {
  400: { codigo: 'requisicao_invalida', mensagem: 'A requisição chegou incompleta ou malformada.' },
  401: { codigo: 'sem_sessao', mensagem: 'Entre para continuar.' },
  403: { codigo: 'sem_permissao', mensagem: 'Sua conta não tem permissão para esta operação.' },
  404: { codigo: 'nao_encontrado', mensagem: 'O registro não existe ou não está ao seu alcance.' },
  422: { codigo: 'regra_de_negocio', mensagem: 'A situação atual não permite concluir esta operação.' },
  500: { codigo: 'falha_interna', mensagem: 'Algo falhou do nosso lado. A ocorrência foi registrada.' },
};
```

The failure logging does not change a line: the log still carries stack, route, type and correlation.

- [ ] **Step 5: Run the tests**

Run: `bun run test`
Expected: PASS — the new tests still fail for lack of `/api/v1/session` (Task 9); the old ones stay
green because the HTML branch did not change. Mark the two new tests with `test.todo` and drop the
`todo` in Task 9.

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/response.ts apps/api/src/shared/http/errors.ts \
        apps/api/src/shared/http/index.ts apps/api/tests/api/errors.test.ts
git commit -m "feat(http): API errors in JSON, with the correlation code"
```

---

### Task 5: Header idempotency

**Files:**
- Modify: `apps/api/src/shared/http/idempotency.ts`, `apps/api/src/shared/http/index.ts`
- Test: `apps/api/tests/api/idempotency.test.ts`

**Interfaces:**
- Produces: `jsonIdempotencyMiddleware: MiddlewareHandler`. It reads `Idempotency-Key`, leaves the JSON body in `c.get('body')` and stores the `Location` on a repeat. The form `idempotencyMiddleware` stays in place until Task 33.

**Context:** the `idempotent_request` table **does not change**. What changes is where the key comes
from and what a repeat answers.

- [ ] **Step 1: Write the failing tests**

```ts
test('a POST without Idempotency-Key is refused with 400', async () => {
  const cookie = await signIn(REGISTRAR);

  const response = await app.request('/api/v1/registrar/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'escolaviva', Cookie: cookie },
    body: JSON.stringify({ name: 'Filosofia' }),
  });

  expect(response.status).toBe(400);
});

test('two POSTs with the same key create one record and the second points at the first', async () => {
  const cookie = await signIn(REGISTRAR);
  const key = crypto.randomUUID();
  const body = { name: 'Sociologia' };

  const first = await writeWithKey('POST', '/api/v1/registrar/subjects', body, cookie, key);
  const second = await writeWithKey('POST', '/api/v1/registrar/subjects', body, cookie, key);

  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  const repeated = await second.json();
  expect(repeated.repeated).toBe(true);
  expect(repeated.location).toBe(first.headers.get('Location'));

  const rows = await sql`SELECT count(*)::int AS total FROM subject WHERE name = 'Sociologia'`;
  expect(rows[0].total).toBe(1);
});

test('a validation refusal releases the key, and the correction can be resubmitted', async () => {
  const cookie = await signIn(REGISTRAR);
  const key = crypto.randomUUID();

  const refused = await writeWithKey('POST', '/api/v1/registrar/subjects', { name: '' }, cookie, key);
  const fixed = await writeWithKey('POST', '/api/v1/registrar/subjects', { name: 'Artes Cênicas' }, cookie, key);

  expect(refused.status).toBe(422);
  expect(fixed.status).toBe(201);
});

test('PUT does not require a key: the method is already idempotent', async () => {
  const cookie = await signIn(TEACHER);

  const response = await app.request(`/api/v1/teacher/class-groups/${CLASS_GROUP}/roll-call`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'escolaviva', Cookie: cookie },
    body: JSON.stringify({ date: '2026-03-10', rows: [] }),
  });

  expect(response.status).not.toBe(400);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test apps/api/tests/api/idempotency.test.ts`
Expected: FAIL — the `/api/v1` routes do not exist yet. Mark with `test.todo` and drop it in Task 12/14.
The "PUT does not require a key" case can already be written against a test route mounted in the file
itself.

- [ ] **Step 3: Implement `jsonIdempotencyMiddleware`**

```ts
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

const MISSING_KEY: ApplicationError = {
  codigo: 'sem_chave_de_idempotencia',
  mensagem: `Toda criação precisa do cabeçalho ${IDEMPOTENCY_KEY_HEADER}.`,
};

const MALFORMED_BODY: ApplicationError = {
  codigo: 'corpo_malformado',
  mensagem: 'O corpo da requisição não é um JSON válido.',
};

/**
 * I4 still holds word for word: the browser is external input, and a guardian on bad 4G taps
 * "submit" twice. What changes is how the key travels — a header, not a hidden form field — and
 * what a repeat returns: instead of a 303 to the page, a 200 with the path of the resource the
 * first one created.
 *
 * `PUT` and `DELETE` pass straight through: they are idempotent by method, and charging them a key
 * would be rent without pain.
 */
export const jsonIdempotencyMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'POST') return next();

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody([MALFORMED_BODY]), 400);
  }
  c.set('body', body);

  const user = currentUserOrNull(c);
  // The row requires `user_id`; the only anonymous write is login itself, and repeating a login
  // merely creates another session — there is no record to protect.
  if (user === null) return next();

  const key = c.req.header(IDEMPOTENCY_KEY_HEADER);
  if (key === undefined || !FORMATS.idempotencyKey.test(key)) {
    logger.warn(redact({ route: c.req.path, user_id: user.id }), INTERNAL_REASONS.writeWithoutKey);
    return c.json(errorBody([MISSING_KEY]), 400);
  }

  const sql = writer();
  const inserted: { idempotency_key: string }[] = await sql`
    INSERT INTO idempotent_request (idempotency_key, route, user_id, response_hash, response_location)
    VALUES (${key}, ${c.req.path}, ${user.id}, '', '')
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING idempotency_key`;

  if (inserted.length === 0) {
    const saved: { response_location: string }[] = await sql`
      SELECT response_location FROM idempotent_request WHERE idempotency_key = ${key}`;
    // No response body is stored: an invitation's temporary password must not sit at rest in a
    // table (I17). What is stored is where to go.
    return c.json({ repeated: true, location: saved[0]?.response_location ?? '' }, 200);
  }

  try {
    await next();
  } catch (error) {
    await releaseKey(sql, key);
    throw error;
  }

  const location = c.res.headers.get('Location');
  if (location === null || c.res.status >= 400) {
    // Without a `Location` no creation completed (the form came back with errors): the key is
    // released so the correction can be submitted.
    await releaseKey(sql, key);
    return;
  }

  const hash = new Bun.CryptoHasher('sha256').update(location).digest('hex');
  await sql`
    UPDATE idempotent_request
       SET response_location = ${location}, response_hash = ${hash}
     WHERE idempotency_key = ${key}`;
};
```

- [ ] **Step 4: Widen `Variables` for the JSON body**

In `shared/http/index.ts`, `body` becomes `unknown` — whoever knows its shape is the route's Zod
schema, not the middleware:

```ts
export type Variables = {
  correlationId: string;
  sessionId: string | null;
  user: SessionUser | null;
  /** A form while SSR exists; a JSON object on the `/api/v1` routes. */
  body: FormBody | unknown;
};
```

- [ ] **Step 5: Run the verification**

Run: `bun run verify`
Expected: PASS — the old middleware is still mounted on the Eta routes and nothing regresses.

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/shared/http/idempotency.ts apps/api/src/shared/http/index.ts \
        apps/api/tests/api/idempotency.test.ts
git commit -m "feat(http): idempotency through the Idempotency-Key header"
```

---

### Task 6: Secure writes and CORS

**Files:**
- Create: `apps/api/src/http/secureWrite.ts`, `apps/api/src/http/cors.ts`
- Test: `apps/api/tests/api/secure_write.test.ts`, `apps/api/tests/api/cors.test.ts`

**Interfaces:**
- Produces: `secureWriteMiddleware: MiddlewareHandler`, `createCorsMiddleware(origins: readonly string[]): MiddlewareHandler`

**Context:** an automatic cookie plus writes in JSON opens cross-site request forgery, which the form
with PRG did not have. This is the defence, and it is the first concrete cost of the SPA decision.

- [ ] **Step 1: Write the failing tests**

```ts
test('a write without X-Requested-By is refused with 403', async () => {
  const cookie = await signIn(REGISTRAR);

  const response = await app.request('/api/v1/registrar/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), Cookie: cookie },
    body: JSON.stringify({ name: 'Filosofia' }),
  });

  expect(response.status).toBe(403);
});

test('a write with a form Content-Type is refused with 415', async () => {
  const cookie = await signIn(REGISTRAR);

  const response = await app.request('/api/v1/registrar/subjects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-By': 'escolaviva',
      'Idempotency-Key': crypto.randomUUID(),
      Cookie: cookie,
    },
    body: 'name=Filosofia',
  });

  expect(response.status).toBe(415);
});

test('a read requires neither header', async () => {
  const cookie = await signIn(REGISTRAR);

  const response = await app.request('/api/v1/registrar/subjects', { headers: { Cookie: cookie } });

  expect(response.status).toBe(200);
});
```

```ts
test('with an empty list, no CORS header is emitted', async () => {
  const response = await app.request('/api/v1/session', {
    headers: { Origin: 'https://qualquer.test' },
  });

  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

test('with a filled list, a known origin is echoed and an unknown one is not', async () => {
  const cors = createCorsMiddleware(['https://app.escolaviva.test']);
  const application = new Hono().use(cors).get('/x', (c) => c.text('ok'));

  const known = await application.request('/x', { headers: { Origin: 'https://app.escolaviva.test' } });
  const stranger = await application.request('/x', { headers: { Origin: 'https://intruso.test' } });

  expect(known.headers.get('Access-Control-Allow-Origin')).toBe('https://app.escolaviva.test');
  expect(known.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  expect(known.headers.get('Vary')).toContain('Origin');
  expect(stranger.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

test('the preflight answers 204 and declares the headers writes use', async () => {
  const cors = createCorsMiddleware(['https://app.escolaviva.test']);
  const application = new Hono().use(cors).post('/x', (c) => c.text('ok'));

  const response = await application.request('/x', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://app.escolaviva.test',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, idempotency-key, x-requested-by',
    },
  });

  expect(response.status).toBe(204);
  const allowed = response.headers.get('Access-Control-Allow-Headers') ?? '';
  expect(allowed.toLowerCase()).toContain('idempotency-key');
  expect(allowed.toLowerCase()).toContain('x-requested-by');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test apps/api/tests/api/secure_write.test.ts apps/api/tests/api/cors.test.ts`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement `secureWrite.ts`**

```ts
/**
 * The SPA writes with an automatic cookie and a JSON body, and that opens cross-site request forgery
 * — a problem the form with POST-Redirect-GET did not have. Two requirements solve it with no table
 * and no token:
 *
 *   1. `Content-Type: application/json` — an HTML form cannot emit that type;
 *   2. `X-Requested-By` — a header outside the safe list, which forces the browser into a preflight;
 *      and a preflight only passes for an allowed origin.
 *
 * With the origin list empty (same origin), the second requirement alone already blocks the
 * cross-site submission: no external site can add the header.
 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const INTERNAL_ORIGIN_HEADER = 'X-Requested-By';
export const APPLICATION_MARK = 'escolaviva';
const JSON_TYPE = 'application/json';

export const secureWriteMiddleware: MiddlewareHandler = async (c, next) => {
  if (!WRITE_METHODS.has(c.req.method)) return next();

  if (c.req.header(INTERNAL_ORIGIN_HEADER) !== APPLICATION_MARK) {
    logger.warn(redact({ route: c.req.path, method: c.req.method }), 'escrita sem marca de origem interna');
    return c.json(errorBody([WRITE_WITHOUT_MARK]), 403);
  }

  // DELETE carries no body, and charging it a content type would charge for something that does not
  // exist.
  if (c.req.method === 'DELETE') return next();

  if (!(c.req.header('Content-Type') ?? '').startsWith(JSON_TYPE)) {
    return c.json(errorBody([UNSUPPORTED_TYPE]), 415);
  }

  return next();
};
```

- [ ] **Step 4: Implement `cors.ts`**

```ts
/**
 * CORS that does nothing while nobody needs it. With `ALLOWED_ORIGINS` empty — today's state, front
 * and API on the same origin — no header is emitted and the browser never even asks.
 *
 * Never `*`: a wildcard origin is incompatible with credentials, and this application's session is a
 * cookie.
 */
export function createCorsMiddleware(origins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(origins);
  const allowedHeaders = ['Content-Type', IDEMPOTENCY_KEY_HEADER, INTERNAL_ORIGIN_HEADER].join(', ');

  return async (c, next) => {
    if (allowed.size === 0) return next();

    const origin = c.req.header('Origin');
    if (origin === undefined || !allowed.has(origin)) {
      // A request with no origin is the server itself or a client that is not a browser; it goes
      // through. An unknown origin also goes through, but without an echo: the browser is what
      // blocks it, by not receiving permission.
      return c.req.method === 'OPTIONS' ? c.body(null, 204) : next();
    }

    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin', { append: true });

    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', allowedHeaders);
      c.header('Access-Control-Max-Age', '600');
      return c.body(null, 204);
    }

    return next();
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `bun test apps/api/tests/api/cors.test.ts`
Expected: PASS. The ones in `secure_write.test.ts` stay as `test.todo` until the routes exist.

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/secureWrite.ts apps/api/src/http/cors.ts \
        apps/api/tests/api/secure_write.test.ts apps/api/tests/api/cors.test.ts
git commit -m "feat(http): internal-origin mark required on writes, and CORS from the environment"
```

---

### Task 7: Cache and static delivery

**Files:**
- Create: `apps/api/src/http/static.ts`
- Modify: `apps/api/src/shared/http/cacheControl.ts`, `apps/api/src/web/app.ts`, `apps/api/src/shared/config/schema.ts`, `.env.example`
- Test: `apps/api/tests/api/static.test.ts`

**Interfaces:**
- Consumes: the empty-variable pattern established in Task 3.
- Produces: `mountStatic(app: WebApplication): void` — registers `/assets/*` and the SPA fallback; `config.frontPath: string`.

**Context:** the `dist` does not exist yet. This task's tests create a fake `dist` in a temporary
folder and point `FRONT_PATH` at it — that is what makes it possible to prove the fallback before
there is a front.

- [ ] **Step 1: Write the failing tests**

```ts
test('an asset with a hash in the name can be kept forever', async () => {
  const response = await read('/assets/app-a1b2c3.css');

  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
});

test('a screen path returns index.html, and it never goes to cache', async () => {
  const response = await read('/registrar/students/01HZZZ');

  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('text/html');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

test('a nonexistent API path returns 404 in JSON, not index.html', async () => {
  const response = await read('/api/v1/inexistente');

  expect(response.status).toBe(404);
  expect(response.headers.get('Content-Type')).toContain('application/json');
});

test('health stays outside the fallback', async () => {
  const response = await read('/health/live');

  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).not.toContain('text/html');
});

test('an asset name with directory traversal is refused', async () => {
  const response = await read('/assets/..%2F..%2F.env');

  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test apps/api/tests/api/static.test.ts`
Expected: FAIL — `mountStatic` does not exist.

- [ ] **Step 3: Implement `static.ts`**

```ts
/**
 * Delivering the front. Two rules, and the difference between them is why I10 stays standing even
 * after `build-assets.ts` goes away:
 *
 *   - `/assets/*` carries the content hash in the name, put there by Vite. Changing the file changes
 *     the name, so keeping it forever is safe;
 *   - `index.html` is the only thing that points at the hashed names. If it goes to cache, the
 *     browser keeps asking for the previous version's bundle after a deploy — hence `no-store`,
 *     with no exception.
 *
 * The fallback exists because the system's URLs are resolved by React Router: pressing F5 at
 * `/registrar/students/01H…` lands here, and has to receive the application, not a 404.
 */
const SERVER_PATHS = ['/api', '/health'];
const ASSET_PREFIX = '/assets/';
const ASSET_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;

const TYPES: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  png: 'image/png',
  woff2: 'font/woff2',
};

export function mountStatic(app: WebApplication): void {
  const frontRoot = config.frontPath;

  app.get(`${ASSET_PREFIX}*`, async (c) => {
    const name = c.req.path.slice(ASSET_PREFIX.length);
    if (!ASSET_NAME.test(name)) return c.notFound();

    const file = Bun.file(join(frontRoot, 'assets', name));
    if (!(await file.exists())) return c.notFound();

    return new Response(file, { headers: { 'Content-Type': assetType(name) } });
  });

  app.get('*', async (c) => {
    if (SERVER_PATHS.some((prefix) => c.req.path.startsWith(prefix))) return c.notFound();

    const document = Bun.file(join(frontRoot, 'index.html'));
    if (!(await document.exists())) return c.notFound();

    return new Response(document, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
}
```

`config.frontPath` goes into `shared/config/schema.ts` with `FRONT_PATH` empty by default, resolved to
`<repository root>/apps/web/dist`. The variable exists for `infra/Dockerfile`, which copies the `dist`
somewhere else inside the image.

- [ ] **Step 4: Swap the prefix in `cacheControl.ts`**

```ts
const ASSET_PREFIX = '/assets/';
const ASSET_CACHE = 'public, max-age=31536000, immutable';
```

And the document branch, before the session check:

```ts
// `index.html` is the only thing that knows this version's bundle name. Keeping it means serving the
// previous version forever.
if (isApplicationDocument(c)) {
  c.header('Cache-Control', 'no-store');
  return;
}
```

- [ ] **Step 5: Mount it in `app.ts`, after the routes**

`mountStatic(app)` goes in **after** `mountRoutes(app)` and replaces today's `app.notFound` for screen
paths. `app.notFound` keeps existing for `/api` and `/health`.

- [ ] **Step 6: Run the tests**

Run: `bun run verify`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/http/static.ts apps/api/src/shared/http/cacheControl.ts \
        apps/api/src/shared/config/schema.ts apps/api/src/web/app.ts \
        apps/api/tests/api/static.test.ts .env.example
git commit -m "feat(http): serve the Vite dist with an SPA fallback"
```

---

### Task 8: Contracts, base presenters and the JSON test support

**Files:**
- Create: `apps/api/src/http/contracts/index.ts`, `contracts/page.ts`, `contracts/enumerations.ts`, `contracts/session.ts`, `apps/api/src/http/presenters/page.ts`, `apps/api/src/http/schemas/parse.ts`
- Modify: `apps/api/.dependency-cruiser.js`, `apps/api/tests/web/support.ts`

**Interfaces:**
- Produces:
  - `type Page<T> = { items: readonly T[]; page: number; pages: number; total: number; size: number }`
  - `pageAsJson<T, U>(page: DomainPage<T>, item: (value: T) => U): Page<U>`
  - `parse<T>(schema: ZodType<T>, body: unknown): Result<T>`
  - `SHIFTS`, `ROLES`, `TERMS`, `ENROLLMENT_STATUSES` — closed sets from the domain
  - `type SessionUserAsJson`
  - test support: `read(path, cookie?)`, `write(method, path, body, cookie?)`, `writeWithKey(...)`, `signIn(credentials)`

**Context:** `contracts/` is the only server folder the front may import. It has to stay loadable by a
browser bundler, which means **zero imports** — not from `zod`, not from `hono`, not from another file
in the project.

- [ ] **Step 1: Write the dependency-cruiser rule that fails**

In `apps/api/.dependency-cruiser.js`:

```js
{
  name: 'contracts-without-dependencies',
  comment:
    'It is the only server folder the front imports, and it loads it with a browser bundler. An ' +
    'import here — of zod, of hono, of another module — would drag server code into the bundle, or ' +
    'simply fail to resolve. A contract is shape, and shape has no dependencies.',
  severity: 'error',
  from: { path: '^apps/api/src/http/contracts/' },
  to: { pathNot: '^apps/api/src/http/contracts/' },
},
```

- [ ] **Step 2: Run it to see the rule exists and passes over the empty folder**

Run: `bun run check`
Expected: PASS (nothing in `contracts/` yet).

- [ ] **Step 3: Write the contracts**

`contracts/page.ts`:

```ts
/** The shape every paginated list returns. It is the domain's `Page<T>`, with nothing added. */
export type Page<T> = {
  readonly items: readonly T[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly size: number;
};
```

`contracts/enumerations.ts`:

```ts
/**
 * Closed sets from the domain. They are values, not types, because the front needs to iterate them
 * to build a select. The screen label ("Matutino") belongs to the front: only what the database
 * accepts lives here.
 */
export const SHIFTS = ['morning', 'afternoon', 'evening', 'full_time'] as const;
export const ROLES = ['network_admin', 'registrar', 'teacher', 'guardian'] as const;
export const TERMS = [1, 2, 3, 4] as const;
export const ENROLLMENT_STATUSES = ['active', 'transferred', 'cancelled', 'completed'] as const;

export type Shift = (typeof SHIFTS)[number];
export type Role = (typeof ROLES)[number];
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
```

`contracts/session.ts`:

```ts
export type RoleAssignmentAsJson = {
  readonly schoolId: string;
  readonly schoolName: string;
  readonly role: Role;
};

export type SessionUserAsJson = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly networkId: string;
  readonly networkName: string;
  readonly networkSlug: string;
  readonly roles: readonly RoleAssignmentAsJson[];
  readonly guardianId: string | null;
};
```

- [ ] **Step 4: Write `presenters/page.ts` and `schemas/parse.ts`**

```ts
/** The single translation of the domain's `Page<T>` into the response JSON. */
export const pageAsJson = <T, U>(
  page: DomainPage<T>,
  item: (value: T) => U,
): Page<U> => ({
  items: page.items.map(item),
  page: page.page,
  pages: page.pages,
  total: page.total,
  size: page.size,
});
```

```ts
/**
 * The edge validates shape and returns the same `Result` the use cases return — that is what lets a
 * route handle both with the same `if (!x.ok)`, changing only the status.
 */
export function parse<T>(schema: ZodType<T>, body: unknown): Result<T> {
  const analysis = schema.safeParse(body);
  if (analysis.success) return success(analysis.data);
  return failure<T>(...schemaErrors(analysis.error.issues));
}
```

- [ ] **Step 5: Extend the test support with JSON**

In `apps/api/tests/web/support.ts`, three new functions next to the form ones, which keep existing
until Task 33:

```ts
const MARK = { 'X-Requested-By': 'escolaviva' };

/** GET against the API, with or without a session. */
export async function read(path: string, cookie = ''): Promise<Response> {
  return await app.request(path, { headers: headers(cookie) });
}

/** A write with a fresh key on every call — what the browser does on every submission. */
export function write(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  cookie = '',
): Promise<Response> {
  return writeWithKey(method, path, body, cookie, crypto.randomUUID());
}

/** A write with a dictated key — this is how the I4 resubmission is proven. */
export async function writeWithKey(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  cookie: string,
  key: string,
): Promise<Response> {
  return await app.request(path, {
    method,
    headers: headers(cookie, {
      ...MARK,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    }),
    ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
  });
}
```

`signIn` gets its JSON version in Task 9, when `/api/v1/session` exists.

- [ ] **Step 6: Run the verification**

Run: `bun run verify`
Expected: PASS, with the `contracts-without-dependencies` rule active and no violation.

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/http/contracts apps/api/src/http/presenters/page.ts \
        apps/api/src/http/schemas/parse.ts apps/api/.dependency-cruiser.js \
        apps/api/tests/web/support.ts
git commit -m "feat(http): dependency-free contracts and the response vocabulary"
```

---

### Task 9: Session, account and mounting `/api/v1`

**Files:**
- Create: `apps/api/src/http/routes/session.ts`, `apps/api/src/http/routes/account.ts`, `apps/api/src/http/routes/api.ts`, `apps/api/src/http/presenters/session.ts`, `apps/api/src/http/schemas/session.ts`
- Modify: `apps/api/src/web/app.ts`, `apps/api/tests/web/support.ts`
- Test: `apps/api/tests/api/session.test.ts`, `apps/api/tests/api/account.test.ts`

**Interfaces:**
- Produces: `mountApi(app: WebApplication): void` — hangs `/api/v1` with the correct middleware order. The phase 2 fronts register their routers inside `routes/api.ts`.
- Produces: `signIn(credentials): Promise<string>` in the support module, now talking to `POST /api/v1/session`.

- [ ] **Step 1: Write the failing tests**

```ts
test('valid credentials open a session and return the user', async () => {
  const response = await write('POST', '/api/v1/session', {
    networkSlug: 'demo', cpf: REGISTRAR_CPF, password: 'escolaviva',
  });

  expect(response.status).toBe(201);
  const { user } = await response.json();
  expect(user.networkSlug).toBe('demo');
  expect(user.roles.some((r) => r.role === 'registrar')).toBe(true);
  expect(response.headers.get('Set-Cookie')).toContain('ev_session=');
});

test('a wrong network, identifier and password all come back through the same door', async () => {
  const wrongNetwork = await write('POST', '/api/v1/session', {
    networkSlug: 'inexistente', cpf: REGISTRAR_CPF, password: 'escolaviva',
  });
  const wrongPassword = await write('POST', '/api/v1/session', {
    networkSlug: 'demo', cpf: REGISTRAR_CPF, password: 'errada',
  });

  expect(wrongNetwork.status).toBe(422);
  expect(wrongPassword.status).toBe(422);
  expect(await wrongNetwork.json()).toEqual(await wrongPassword.json());
});

test('GET /session without a cookie answers 401; with one, it returns who signed in', async () => {
  const withoutSession = await read('/api/v1/session');
  const cookie = await signIn(REGISTRAR);
  const withSession = await read('/api/v1/session', cookie);

  expect(withoutSession.status).toBe(401);
  expect(withSession.status).toBe(200);
  const { user } = await withSession.json();
  expect(user.email).toBe(REGISTRAR.email);
});

test('signing out deletes the session row before deleting the cookie', async () => {
  const cookie = await signIn(REGISTRAR);

  const exit = await write('DELETE', '/api/v1/session', null, cookie);
  const after = await read('/api/v1/session', cookie);

  expect(exit.status).toBe(204);
  expect(after.status).toBe(401);
});

test('the password never comes back in the response, not even in an error', async () => {
  const response = await write('POST', '/api/v1/session', {
    networkSlug: 'demo', cpf: REGISTRAR_CPF, password: 'escolaviva',
  });

  expect(await response.text()).not.toContain('escolaviva');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `bun test apps/api/tests/api/session.test.ts`
Expected: FAIL — `/api/v1/session` does not exist; the SPA fallback answers HTML.

- [ ] **Step 3: Implement `routes/session.ts`**

The logic is that of `web/routes/login.ts`, with three differences: the body arrives from
`c.get('body')` already as JSON, the response is a `201` with the user instead of a `303`, and logout
becomes a `DELETE` answering `204`. The two decisions that govern the file still hold and stay
commented: the screen is not an oracle, and the attempt goes to the log — the CPF typed does not.

```ts
sessionRoutes.post('/', async (c) => {
  if (currentUserOrNull(c) !== null) {
    return c.json({ user: userAsJson(currentUser(c)) }, 200);
  }

  const input = parse(signInSchema, c.get('body'));
  if (!input.ok) return c.json(errorBody(input.erros), 400);

  const ip = clientIp(c.req.raw, remoteAddress(c), config.trustedProxies);
  const result = await identity.authenticate({ ...input.valor, ip });

  if (!result.ok) {
    logger.warn({ network_slug: input.valor.networkSlug, result: 'recusado', ip }, LOG_EVENTS.signInAttempt);
    return c.json(errorBody(result.erros), 422);
  }

  await openSession(c, result.valor.sessionId);
  logger.info({ network_slug: input.valor.networkSlug, result: 'sucesso', ip }, LOG_EVENTS.signInAttempt);
  return c.json({ user: userAsJson(currentUser(c)) }, 201);
});
```

`signInSchema` **does not trim the password**: a leading or trailing space is part of what the person
chose. The network slug and the CPF are trimmed.

- [ ] **Step 4: Implement `routes/account.ts`**

`PUT /password`, with the confirmation check before calling the use case — checking here avoids
spending a hundred milliseconds of hash verification to discover the person mistyped the repeat. It
answers `204`. No password comes back to the screen or enters a log line.

- [ ] **Step 5: Implement `routes/api.ts` with the middleware order**

```ts
/**
 * The order is the API's semantics:
 *   1. CORS         — has to answer the preflight before anything looks at the session;
 *   2. secure write — blocks forgery before the body is read;
 *   3. idempotency  — reads the body once and leaves it in the context (I4);
 *   4. routers.
 *
 * Errors, correlation, cache and session already ran in `app.ts`, for the whole application.
 */
export function mountApi(app: WebApplication): void {
  const api = new Hono<{ Variables: Variables }>();

  api.use(createCorsMiddleware(config.allowedOrigins));
  api.use(secureWriteMiddleware);
  api.use(jsonIdempotencyMiddleware);

  api.route('/session', sessionRoutes);
  api.route('/account', accountRoutes);
  // The phase 2 fronts add their lines here, one each.

  app.route('/api/v1', api);
}
```

`mountApi(app)` goes into `app.ts` **before** `mountRoutes(app)` and before `mountStatic(app)`.

- [ ] **Step 6: Swap `signIn` in the test support**

```ts
export async function signIn(credentials: Credentials): Promise<string> {
  const response = await write('POST', '/api/v1/session', {
    networkSlug: credentials.networkSlug,
    cpf: credentials.cpf,
    password: credentials.password,
  });
  if (response.status !== 201) {
    throw new Error(`login refused with status ${response.status} — badly built scenario`);
  }
  const cookie = cookieFromResponse(response);
  if (cookie === '') throw new Error('login with no Set-Cookie — badly built scenario');
  return cookie;
}
```

`signInThroughForm` stays as it is, for the `tests/web/` suites that are still alive.

- [ ] **Step 7: Drop the `test.todo` from Tasks 4, 5 and 6 that can now run**

The cases in `errors.test.ts` and the one in `secure_write.test.ts` that use `/api/v1/session` now pass.

- [ ] **Step 8: Run the whole verification**

Run: `bun run verify`
Expected: PASS. The `tests/web/` suites stay green — SSR was not touched.

- [ ] **Step 9: Commit**

```bash
git status --short
git add apps/api/src/http/routes/session.ts apps/api/src/http/routes/account.ts \
        apps/api/src/http/routes/api.ts apps/api/src/http/presenters/session.ts \
        apps/api/src/http/schemas/session.ts apps/api/src/web/app.ts \
        apps/api/tests/web/support.ts apps/api/tests/api/session.test.ts \
        apps/api/tests/api/account.test.ts apps/api/tests/api/errors.test.ts \
        apps/api/tests/api/secure_write.test.ts
git commit -m "feat(api): session and account in JSON under /api/v1"
```

---

# PHASE 2 — The API, by role

Seven parallel fronts. Each follows the same five-step script, with patterns **P1 to P5** from the
"Implementation Patterns" section — read it before starting.

**Script common to T10–T16:**

1. Write the front's suite with every case from the task's table, and watch it fail.
2. Write the contract in `contracts/<front>.ts` (types only, no imports).
3. Write the presenter in `presenters/<front>.ts` (P3).
4. Write the edge schema in `schemas/<front>.ts` (P4) and the router (P1, P2).
5. Register the line `api.route('/<prefix>', <front>Routes)` in `routes/api.ts`.
6. `bun run verify` green, and commit with an explicit `git add` of only that front's files.

**About step 5:** `routes/api.ts` is a shared file. If two fronts are in flight at the same time, each
adds **one line** at the point marked by a comment in the file. A merge conflict here is one line and
resolves itself by reading; a conflict in any other file means somebody left their column.

**About authorisation:** every router registers `requireRole(...)` as its first middleware, just as
today. A target outside the role's scope answers **404**, never 403.

---

### Task 10: API — Options

**Files:**
- Create: `apps/api/src/http/routes/options.ts`, `apps/api/src/http/contracts/options.ts`, `apps/api/src/http/presenters/options.ts`
- Modify: `apps/api/src/http/routes/api.ts`
- Test: `apps/api/tests/api/options.test.ts`

**Interfaces:**
- Produces: `type SchoolOption = { id: string; name: string; active: boolean }`, `type AcademicYearOption = { id: string; year: number }`, `type ClassGroupOption = { id: string; name: string; gradeLevel: string; shift: Shift; schoolId: string; schoolName: string; academicYearId: string; year: number | null }`, `type SimpleOption = { id: string; name: string }`

**Context:** these lists exist today scattered inside the `GET /new` screens. Each one had its own way
of slicing; concentrating them is what lets TanStack Query cache them with a long lifetime.

| Endpoint | Source | Scope |
|---|---|---|
| `GET /options/schools` | `identity.listSchools` sliced by the session's roles | any role |
| `GET /options/academic-years` | `academics.listAcademicYears` | `network_admin`, `registrar` |
| `GET /options/guardians` | `academics.listGuardians` | `network_admin`, `registrar` |
| `GET /options/class-groups` | `academics.listClassGroups` within the registrar's scope, with year and school name | `registrar` |
| `GET /options/subjects` | `academics.listSubjects` | `registrar` |
| `GET /options/teachers?schoolId=` | `identity.schoolTeachers` | `registrar` |

**Mandatory test cases:**

| Case | Expects |
|---|---|
| a registrar asks for schools | only the schools where they hold the role |
| a network_admin asks for schools | every school of the network |
| a guardian asks for subjects | 403 |
| no session | 401 on all six |
| `?schoolId=` out of scope on `/teachers` | 404 |
| `/options/class-groups` carries the school name and the year resolved | no `null` where there is data |

- [ ] **Step 1: Write the suite and watch it fail** (P5)
- [ ] **Step 2: Write `contracts/options.ts`** — types only
- [ ] **Step 3: Write `presenters/options.ts`** (P3)
- [ ] **Step 4: Write `routes/options.ts`** (P1) and register it in `routes/api.ts`
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/routes/options.ts apps/api/src/http/contracts/options.ts \
        apps/api/src/http/presenters/options.ts apps/api/src/http/routes/api.ts \
        apps/api/tests/api/options.test.ts
git commit -m "feat(api): options for the choice fields in the forms"
```

---

### Task 11: API — Network

**Files:**
- Create: `apps/api/src/http/routes/network.ts`, `contracts/network.ts`, `presenters/network.ts`, `schemas/network.ts`
- Modify: `apps/api/src/http/routes/api.ts`
- Test: `apps/api/tests/api/network.test.ts`

**Interfaces:**
- Produces: `type NetworkCounts = { schools: number; users: number; classGroups: number; enrolled: number }`, `type SchoolInList`, `type UserInList`, `type AcademicYearInList`, `type AcceptedInvitation = { userId: string; temporaryPassword: string }`

| Endpoint | Body / query | Response |
|---|---|---|
| `GET /network/dashboard` | — | `{ counts, academicYear, definedYears }` |
| `GET /network/schools?p=` | — | `Page<SchoolInList>` |
| `POST /network/schools` | `{name, inepCode}` | `201 {id}` + `Location` |
| `GET /network/users?p=` | — | `Page<UserInList>` |
| `POST /network/users` | `{name, email, cpf, guardianId, roleAssignments:[{schoolId, role}]}` | `201 {userId, temporaryPassword}` |
| `GET /network/academic-years?p=` | — | `Page<AcademicYearInList>` |
| `POST /network/academic-years` | `{year: number, startDate, endDate}` | `201 {id}` |

**What disappears in this task:** `INVITE_COOKIE`, `storeInvite` and `takeInvite`. They exist today only
because the temporary password had to cross a redirect without entering the URL or the
`response_location` column. With JSON it comes back in the `201` body, is shown once by the front and
sits at rest nowhere.

**What also disappears:** `FOUR_DIGIT_YEAR` and the manual conversion of `year` to a number. With JSON
the field arrives as a number and the check becomes `z.number().int()` in the edge schema.

**What stays exactly the same:** comparing the typed CPF against the guardian record's. Only the HTTP
layer sees `identity` and `academics` at the same time (I1), and it is here — and only here — that this
check can happen.

**Mandatory test cases:** beyond the P5 table, one per row:

| Case | Expects |
|---|---|
| a successful invitation | `201` with `temporaryPassword` in the body |
| the temporary password does **not** appear in the log | a scan of the flow's log does not find it |
| the temporary password does **not** enter `idempotent_request` | `SELECT response_location` does not contain it |
| repeating the invitation with the same key | `200 {repeated:true}`, and **one** user created |
| a role assignment with a school but no role | `422`, field `roleAssignments` |
| a CPF diverging from the guardian record | `422`, field `cpf` |
| `year` as text in the body | `400`, field `year` |
| a registrar attempting `POST /network/schools` | `403` |

- [ ] **Step 1: Write the suite and watch it fail** (P5)
- [ ] **Step 2: `contracts/network.ts`**
- [ ] **Step 3: `presenters/network.ts`** (P3)
- [ ] **Step 4: `schemas/network.ts`** (P4) and `routes/network.ts` (P1, P2); register in `routes/api.ts`
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/routes/network.ts apps/api/src/http/contracts/network.ts \
        apps/api/src/http/presenters/network.ts apps/api/src/http/schemas/network.ts \
        apps/api/src/http/routes/api.ts apps/api/tests/api/network.test.ts
git commit -m "feat(api): network administration in JSON"
```

---

### Task 12: API — Registrar A: students, guardians and enrollments

**Files:**
- Create: `apps/api/src/http/routes/registrar/students.ts`, `contracts/students.ts`, `presenters/students.ts`, `schemas/students.ts`
- Modify: `apps/api/src/http/routes/api.ts`
- Test: `apps/api/tests/api/registrar_students.test.ts`

**Interfaces:**
- Produces: `type StudentInList = { id: string; name: string; birthDate: string; classGroupName: string | null; year: number | null; status: EnrollmentStatus | null }`, `type StudentRecord`, `type EnrollmentInList`, `type GuardianLinkInList`, `type GuardianInList`

| Endpoint | Body / query | Response |
|---|---|---|
| `GET /registrar/dashboard?p=` | — | `{ schools: Page<SchoolCounts>, currentYear, totals }` |
| `GET /registrar/students?q=&p=` | — | `Page<StudentInList>`; without `q`, an empty page |
| `POST /registrar/students` | `{name, birthDate}` | `201 {id}` |
| `GET /registrar/students/:id?pGuardians=&pEnrollments=` | — | `StudentRecord` |
| `GET /registrar/students/:id/available-guardians` | — | `SimpleOption[]` |
| `POST /registrar/students/:id/guardians` | `{guardianId, relationship, financiallyResponsible: boolean}` | `201` |
| `GET /registrar/guardians?p=` | — | `Page<GuardianInList>` |
| `POST /registrar/guardians` | `{name, email, phone, cpf}` | `201 {id}` |
| `POST /registrar/enrollments` | `{studentId, classGroupId, academicYearId, enrollmentDate}` | `201 {id}` |
| `GET /registrar/enrollments/:id` | — | `{enrollment, student}` |
| `POST /registrar/enrollments/:id/transfer` | `{targetClassGroupId, date}` | `201 {id}` |

**Scope rules that may not loosen** — today they live in the "in scope" helpers, and they migrate
intact:

- a student who studies at another school of the network **does not exist** for this registrar (404);
- a student with no enrollment yet belongs to the network and appears for every registrar;
- a target class group out of scope answers **404**, not a field error — the screen does not confirm
  that it exists;
- `financiallyResponsible` arrives as a `boolean` in JSON, no longer as "field present = ticked".

**Mandatory test cases:** the P5 ones for each endpoint, plus:

| Case | Expects |
|---|---|
| `GET /students` without `q` | `200` with `total: 0`, and **no** search query |
| a student of another school with an enrollment there | `404` on the record |
| a student with no enrollment at all | `200` for any registrar of the network |
| the record with `?pGuardians=2&pEnrollments=1` | only the guardians table advances |
| an enrollment with a `classGroupId` out of scope | `404`, not `422` |
| a guardian already linked | does not appear in `available-guardians` |
| a transfer to the source class group | `422` |

- [ ] **Step 1: Write the suite and watch it fail** (P5)
- [ ] **Step 2: `contracts/students.ts`**
- [ ] **Step 3: `presenters/students.ts`** (P3)
- [ ] **Step 4: `schemas/students.ts`** (P4) and `routes/registrar/students.ts` (P1, P2); register in `routes/api.ts`
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/routes/registrar/students.ts apps/api/src/http/contracts/students.ts \
        apps/api/src/http/presenters/students.ts apps/api/src/http/schemas/students.ts \
        apps/api/src/http/routes/api.ts apps/api/tests/api/registrar_students.test.ts
git commit -m "feat(api): students, guardians and enrollments in JSON"
```

---

### Task 13: API — Registrar B: class groups and subjects

**Files:**
- Create: `apps/api/src/http/routes/registrar/classGroups.ts`, `contracts/classGroups.ts`, `presenters/classGroups.ts`, `schemas/classGroups.ts`
- Modify: `apps/api/src/http/routes/api.ts`
- Test: `apps/api/tests/api/registrar_class_groups.test.ts`

**Interfaces:**
- Produces: `type ClassGroupInList = { id: string; name: string; gradeLevel: string; shift: Shift; schoolId: string; schoolName: string; academicYearId: string; year: number | null }`, `type ClassGroupRecord`, `type AssignmentInList = { id: string; subjectName: string; teacherName: string }`, `type SubjectInList`

| Endpoint | Body / query | Response |
|---|---|---|
| `GET /registrar/class-groups?school=&year=&p=` | — | `Page<ClassGroupInList>` |
| `POST /registrar/class-groups` | `{name, gradeLevel, shift, schoolId, academicYearId}` | `201 {id}` |
| `GET /registrar/class-groups/:id?pSubjects=&pEnrollments=` | — | `ClassGroupRecord` |
| `POST /registrar/class-groups/:id/subjects` | `{subjectId, teacherUserId}` | `201 {id}` |
| `GET /registrar/subjects?p=` | — | `Page<SubjectInList>` |
| `POST /registrar/subjects` | `{name}` | `201 {id}` |

**Rules that migrate intact:**

- a school or year filter **out of scope** counts as "all" and never becomes a query — it is not an
  error, it is an ignored filter;
- a `schoolId` out of scope on `POST /class-groups` answers **404**;
- the assigned teacher's name comes from **one** query per screen (`identity.userNames`), never one per
  row — the assigned teacher may no longer be at the school;
- the two tables on the class-group record have their own parameters (`pSubjects`, `pEnrollments`),
  because advancing one must not touch the other.

**Mandatory test cases:** the P5 ones for each endpoint, plus:

| Case | Expects |
|---|---|
| `?school=` out of scope | `200` with the full in-scope list, not `404` |
| `?year=` that does not exist | `200` without filtering by it |
| `POST /class-groups` with another registrar's `schoolId` | `404` |
| `POST /class-groups` with a `shift` outside `SHIFTS` | `400`, field `shift` |
| a class-group record whose assigned teacher left the school | `teacherName` is `'—'`, not an error |
| `?pSubjects=2` | only the assignments table advances |

- [ ] **Step 1: Write the suite and watch it fail** (P5)
- [ ] **Step 2: `contracts/classGroups.ts`**
- [ ] **Step 3: `presenters/classGroups.ts`** (P3)
- [ ] **Step 4: `schemas/classGroups.ts`** (P4) and `routes/registrar/classGroups.ts` (P1, P2); register in `routes/api.ts`
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/routes/registrar/classGroups.ts apps/api/src/http/contracts/classGroups.ts \
        apps/api/src/http/presenters/classGroups.ts apps/api/src/http/schemas/classGroups.ts \
        apps/api/src/http/routes/api.ts apps/api/tests/api/registrar_class_groups.test.ts
git commit -m "feat(api): class groups and subjects in JSON"
```

---

### Task 14: API — Teacher

**Files:**
- Create: `apps/api/src/http/routes/teacher.ts`, `contracts/teacher.ts`, `presenters/teacher.ts`, `schemas/teacher.ts`
- Modify: `apps/api/src/http/routes/api.ts`
- Test: `apps/api/tests/api/teacher.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TeacherClassGroup = {
    classGroupId: string; classGroupName: string; gradeLevel: string; shift: Shift;
    subjects: readonly { id: string; subjectName: string }[];
  };
  type GradeRow = { enrollmentId: string; studentName: string; value: number | null };
  type GradesScreen = {
    assignment: { id: string; subjectName: string; classGroupId: string; classGroupName: string };
    term: number; closed: boolean; rows: readonly GradeRow[];
  };
  type RollCallRow = { enrollmentId: string; studentName: string; present: boolean; excuse: string | null };
  type ClosingState = { term: number; closed: boolean; closedAt: string | null };
  ```

| Endpoint | Body / query | Response |
|---|---|---|
| `GET /teacher/class-groups` | — | `TeacherClassGroup[]` |
| `GET /teacher/subjects/:id/grades?term=` | — | `GradesScreen` |
| `PUT /teacher/subjects/:id/grades` | `{term, grades:[{enrollmentId, value: number\|null}]}` | `200 {saved: number}` |
| `GET /teacher/class-groups/:id/roll-call?date=` | — | `{date, rows: RollCallRow[]}` |
| `PUT /teacher/class-groups/:id/roll-call` | `{date, rows:[{enrollmentId, present, excuse}]}` | `204` |
| `GET /teacher/class-groups/:id/closing` | — | `ClosingState[]` |
| `POST /teacher/class-groups/:id/closing` | `{term}` | `201` |

**What changes shape, and why:**

- `grade_<uuid>`, `present_<uuid>` and `excuse_<uuid>` **stop existing**. The fields were named by id
  because `parseBody` keeps one value per name and a repeated name would lose rows silently. With
  JSON the body is an array of objects, and the grade-reading helpers and the three prefix constants
  go with them.
- Grades and roll call are `PUT` because that is what they are: replacing the state of a term or of a
  day. The method already carries the guarantee an idempotency key would give — hence they do not
  require `Idempotency-Key`.
- Reading a grade typed with a comma (`'7,5'`) **leaves the server**: JSON sends a `number`. What
  accepts a comma now is the React field, and the test for that conversion moves to the front
  (Task 26).

**What may not change:** the grades screen is the stage's performance reference route
(p95 < 300 ms). The three queries — enrollments, grades, closing state — are still fired **together**,
once each. No query per student.

**Mandatory test cases:** the P5 ones, plus:

| Case | Expects |
|---|---|
| another teacher's class group | `404`, never `403` |
| `?term=9` on a read | falls back to term 1; it is navigation, not a write |
| `term: 9` on the `PUT` | `422` — it came from a field the application wrote, not from typing |
| a grade outside 0–10 | `422`, with `campo` pointing at the enrollment |
| `value: null` | clears that enrollment's grade |
| an enrollment that is not in the class group in the body | ignored; the list of who is in the class group comes from the database |
| a term already closed | `422` |
| a roll-call `PUT` twice with the same body | the same state, with no duplicated row |
| a malformed date | `400` |
| `POST /closing` with items missing | `422` with the list of what is missing in the message |

- [ ] **Step 1: Write the suite and watch it fail** (P5)
- [ ] **Step 2: `contracts/teacher.ts`**
- [ ] **Step 3: `presenters/teacher.ts`** (P3)
- [ ] **Step 4: `schemas/teacher.ts`** (P4) and `routes/teacher.ts` (P1, P2); register in `routes/api.ts`
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/routes/teacher.ts apps/api/src/http/contracts/teacher.ts \
        apps/api/src/http/presenters/teacher.ts apps/api/src/http/schemas/teacher.ts \
        apps/api/src/http/routes/api.ts apps/api/tests/api/teacher.test.ts
git commit -m "feat(api): the class journal in JSON"
```

---

### Task 15: API — Guardian

**Files:**
- Create: `apps/api/src/http/routes/guardian.ts`, `contracts/guardian.ts`, `presenters/guardian.ts`
- Modify: `apps/api/src/http/routes/api.ts`
- Test: `apps/api/tests/api/guardian.test.ts`

**Interfaces:**
- Produces: `type GuardianDashboard = { enrollments: Page<EnrollmentInList>; unread: readonly BoardItem[]; totalUnread: number; totalOnBoard: number }`, `type ReportCardAsJson`, `type AttendanceDay`, `type BoardItem`, `type OpenAnnouncement`

| Endpoint | Query | Response |
|---|---|---|
| `GET /guardian/dashboard?p=` | — | `GuardianDashboard` |
| `GET /guardian/enrollments/:id/report-card` | — | `{ reportCard, terms: number[] }` |
| `GET /guardian/enrollments/:id/attendance?p=` | — | `{ enrollment, reportCard, days: Page<AttendanceDay> }` |
| `GET /guardian/board?pUnread=&pRead=` | — | `{ unread: Page<BoardItem>, read: Page<BoardItem> }` |
| `GET /guardian/board/:announcementId` | — | `{ announcement, readAt: string \| null }` |
| `POST /guardian/board/:announcementId/read` | — | `204` |

**The most important rule of this front:** `GET /board/:announcementId` **does not write `read_at`**.
Reading is a write, and a write may not be a side effect of navigation. The 12 % rate is the
measurement that justifies Stage 04, and reads invented by prefetching destroy it. The test that
proves this is mandatory and comes back in phase 5 as an E2E.

**Other rules that migrate intact:**

- an account with the `guardian` role but **no** linked `guardianId` sees no student at all — it is not
  an error, it is an account the registrar has not linked yet. The dashboard answers `200` empty;
- another family's enrollment answers **404**, never 403;
- no arithmetic is done here. Average, percentage and status come from `assessment`, which owns the
  rule. The HTTP layer passes the number along; recalculating would produce a second number, and it is
  the divergence between the two that the report card exists not to have.

**Mandatory test cases:** the P5 ones, plus:

| Case | Expects |
|---|---|
| opening the announcement | `read_at` stays `NULL` in the database |
| opening and then `POST /read` | `read_at` filled in, and the unread count drops |
| `POST /read` twice | `204` both times, one row |
| an account without `guardianId` | dashboard `200` with empty lists; report card `404` |
| another family's report card | `404` |
| `?pUnread=2` | only the unread list advances |

- [ ] **Step 1: Write the suite and watch it fail** (P5)
- [ ] **Step 2: `contracts/guardian.ts`**
- [ ] **Step 3: `presenters/guardian.ts`** (P3)
- [ ] **Step 4: `routes/guardian.ts`** (P1, P2); register in `routes/api.ts`
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/routes/guardian.ts apps/api/src/http/contracts/guardian.ts \
        apps/api/src/http/presenters/guardian.ts apps/api/src/http/routes/api.ts \
        apps/api/tests/api/guardian.test.ts
git commit -m "feat(api): the guardian portal in JSON"
```

---

### Task 16: API — Announcements

**Files:**
- Create: `apps/api/src/http/routes/announcements.ts`, `contracts/announcements.ts`, `presenters/announcements.ts`, `schemas/announcements.ts`
- Modify: `apps/api/src/http/routes/api.ts`
- Test: `apps/api/tests/api/announcements.test.ts`

**Interfaces:**
- Produces: `type ReadSummary = { recipients: number; reads: number; rate: number }`, `type AnnouncementInList`, `type Audience = 'unidade' | 'selecionados'`

| Endpoint | Body / query | Response |
|---|---|---|
| `GET /announcements?schoolId=&p=` | — | `{ announcements: Page<AnnouncementInList>, summary: ReadSummary, currentSchool, seesWholeNetwork }` |
| `GET /announcements/recipients?schoolId=` | — | `SimpleOption[]` |
| `POST /announcements` | `{schoolId, title, body, audience, guardians: string[]}` | `201 {id}` |

**Rules that migrate intact:**

- scope comes from the role: `network_admin` sees the whole network; `registrar` only the schools where
  they hold the role. A school outside that answers **404**, whether it comes from the query or the body;
- a registrar with no assigned school does **not** fall back to the whole network: no slice, no list;
- the summary measures the **whole slice**, not the page's rows. A rate that recalculated itself on
  every click of "next" would answer a different question;
- an empty recipient list is `publishAnnouncement`'s contract for "the whole school";
- a ticked recipient is external input: the list that comes back is checked against the school's, and
  an id from outside **refuses the whole submission** rather than being silently discarded. The fact
  that React only offers the right ones guarantees nothing.

**Mandatory test cases:** the P5 ones, plus:

| Case | Expects |
|---|---|
| `audience: 'selecionados'` with an empty list | `422`, field `recipients` |
| an id from another school in the list | `422`, field `recipients`, and **nothing** published |
| a registrar with no school | list `200` empty, with no query against the network |
| `?schoolId=` from another network | `404` |
| the rate does not change when asking for `?p=2` | the same `summary` on both pages |
| `network_admin` with no `?schoolId=` | the whole network |
| `registrar` with no `?schoolId=` | their first school, not the network |

- [ ] **Step 1: Write the suite and watch it fail** (P5)
- [ ] **Step 2: `contracts/announcements.ts`**
- [ ] **Step 3: `presenters/announcements.ts`** (P3)
- [ ] **Step 4: `schemas/announcements.ts`** (P4) and `routes/announcements.ts` (P1, P2); register in `routes/api.ts`
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/routes/announcements.ts apps/api/src/http/contracts/announcements.ts \
        apps/api/src/http/presenters/announcements.ts apps/api/src/http/schemas/announcements.ts \
        apps/api/src/http/routes/api.ts apps/api/tests/api/announcements.test.ts
git commit -m "feat(api): announcements and the read rate in JSON"
```

---

**Exit gate for phase 2.** Before opening phase 3, an integration check no single front performs:

- [ ] `bun run verify` green with all seven fronts together
- [ ] `routes/api.ts` has the seven `api.route(...)` lines, with no duplicates
- [ ] `bun test apps/api/tests/web` still green — SSR is still standing and was not touched
- [ ] every `test.todo` from Tasks 4, 5 and 6 has been unlocked

---

# PHASE 3 — The front shell

Six sequential tasks. By the end of them there is a React application that signs in, signs out,
changes the password and shows the layout — with **no** role screen at all. That is on purpose: the
shell is the contract the six fronts of phase 4 will consume, and it has to be settled before six
agents start using it.

### Task 17: Vite, TypeScript and Vitest

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/testSetup.ts`, `apps/web/src/testSupport.tsx`
- Modify: `package.json` (root), `.gitignore`

**Interfaces:**
- Produces: `bun run dev` starts the API and the front together; `bun run build:web` produces `apps/web/dist`; `renderWithProviders(element)` and `server` (MSW) for every front's tests.

- [ ] **Step 1: Install the dependencies**

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

- [ ] **Step 2: Write `apps/web/vite.config.ts`**

```ts
/**
 * The front is pure static: nothing here depends on the server at runtime. That is what makes a
 * future Cloudflare Pages publication a change of `VITE_API_URL` rather than a rewrite (I23).
 *
 * The proxy applies only in development, and it exists so that `VITE_API_URL` can stay empty on the
 * developer's machine: Vite forwards `/api` to Hono, and the cookie stays first-party.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import postcssPresetMantine from 'postcss-preset-mantine';
import postcssSimpleVars from 'postcss-simple-vars';

const BREAKPOINTS = {
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
      plugins: [postcssPresetMantine(), postcssSimpleVars({ variables: BREAKPOINTS })],
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: {
    // Vite puts the content hash in the name of everything that leaves here: it is what comes to
    // sustain I10 once `build-assets.ts` is removed.
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
    globals: true,
    coverage: { provider: 'v8', thresholds: { lines: 80, functions: 80, branches: 80 } },
  },
});
```

- [ ] **Step 3: Write `index.html` and `main.tsx`**

`index.html` carries no data and no inline script — if it did, the front would stop being servable by
any file host, and I23 would die on the first line:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EscolaViva</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Write `testSetup.ts` and `testSupport.tsx`**

```ts
/**
 * MSW answers in the API's place in every front test. No test here talks to the real Hono — that is
 * what `apps/api/tests/api/` and the E2E suites are for.
 */
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';

export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```tsx
/**
 * Every screen test needs the same four providers. A fresh `QueryClient` per test is what stops one
 * assertion's cache leaking into the next.
 */
export function renderWithProviders(element: ReactNode, initialRoute = '/'): RenderResult {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MantineProvider theme={theme}>
      <QueryClientProvider client={queries}>
        <MemoryRouter initialEntries={[initialRoute]}>{element}</MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}
```

- [ ] **Step 5: Wire both workspaces into the root scripts**

```json
"dev": "bun run dev:api & bun run dev:web",
"dev:web": "cd apps/web && bun run dev",
"build:web": "cd apps/web && bun run build",
"typecheck": "bunx tsc --noEmit -p apps/api/tsconfig.json && bunx tsc --noEmit -p apps/web/tsconfig.json",
"test": "bun test apps/api/tests && cd apps/web && bun run test"
```

And `apps/web/dist` goes into `.gitignore`.

- [ ] **Step 6: Prove the shell builds and the test runner works**

Run: `cd apps/web && bun run build && bun run test`
Expected: the build produces `dist/index.html` and `dist/assets/*` with hashes in the names; the suite
runs with zero tests and exits `0`.

- [ ] **Step 7: Commit**

```bash
git status --short
git add package.json .gitignore bun.lock apps/web/package.json apps/web/tsconfig.json \
        apps/web/vite.config.ts apps/web/index.html apps/web/src/main.tsx \
        apps/web/src/testSetup.ts apps/web/src/testSupport.tsx
git commit -m "chore(web): front skeleton with Vite, React 19 and Vitest"
```

---

### Task 18: Formatters

**Files:**
- Create: `apps/web/src/shared/format/date.ts`, `number.ts`, `cpf.ts`, `index.ts`, and the three matching `.test.ts`

**Interfaces:**
- Produces: `formatDate`, `formatDateTime`, `formatGrade`, `formatPercent`, `formatRate`, `formatCpf` — signatures identical to those in `src/web/render.ts`.

**Context:** these are literal ports. Two rules come with them and must not be lost in translation, and
so each one gets a test that names it.

- [ ] **Step 1: Write the failing tests**

```ts
test('a grade is truncated, never rounded', () => {
  // Rounding 5.99 to 6.0 would show "aprovado" next to a "reprovado" status, and the divergence
  // between the number printed and the number that decided is what the domain forbids.
  expect(formatGrade(5.99)).toBe('5,9');
  expect(formatGrade(9.99)).toBe('9,9');
  expect(formatGrade(null)).toBe('—');
});

test('a rate becomes a percentage in exactly one place', () => {
  // Leaving the multiplication by 100 spread around already cost a screen showing "0,1 %" where it
  // was 12,3 %.
  expect(formatRate(0.123)).toBe('12,3 %');
  expect(formatRate(0)).toBe('0,0 %');
  expect(formatRate(null)).toBe('—');
});

test('an ISO date becomes a Brazilian date without passing through a timezone', () => {
  expect(formatDate('2026-03-15')).toBe('15/03/2026');
  expect(formatDate(null)).toBe('—');
  expect(formatDate('não é data')).toBe('—');
});

test('a CPF comes out punctuated and an invalid one is not made up', () => {
  expect(formatCpf('12345678909')).toBe('123.456.789-09');
  expect(formatCpf(null)).toBe('—');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && bun run test src/shared/format`
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Port from `src/web/render.ts` and `src/shared/document/cpf.ts`**

Copy the internal helpers — date parsing, number parsing, one-decimal truncation, two-digit padding,
the ISO date pattern and the missing-value em dash — and the six public functions. The comment about
truncation comes with them: it is what stops somebody "fixing" it to `Math.round` a year from now.

`formatCpf` is a copy, not an import: the front does not import the domain, and the CPF arithmetic is
the same on both sides. The duplicated test is the price, and it is cheap.

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && bun run test src/shared/format`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git status --short
git add apps/web/src/shared/format
git commit -m "feat(web): formatters for date, grade, rate and CPF"
```

---

### Task 19: The Mantine theme from `app.css`

**Files:**
- Create: `apps/web/src/shared/theme/theme.ts`, `apps/web/src/shared/theme/theme.test.ts`
- Read-only: `apps/api/src/web/public/app.css` (1,004 lines, 44 custom properties)

**Interfaces:**
- Produces: `theme: MantineThemeOverride` — consumed by `MantineProvider` in `main.tsx` and by `renderWithProviders`.

**Context:** the goal is for the screens to stay **recognisable**. The screenshots in the teaching
material must not turn into a different product. This is not a redesign.

- [ ] **Step 1: Extract the custom properties from `app.css`**

```bash
grep -oE '^\s*--[a-z0-9-]+:\s*[^;]+;' apps/api/src/web/public/app.css | sort -u
```

Group the output into five buckets: colour, typography, spacing, radius, shadow. Whatever fits none of
them is component styling and becomes a CSS Module in phase 4 — do not force it into the theme.

- [ ] **Step 2: Write the failing test**

The theme is data, and what you test in data is that it is complete enough for Mantine:

```ts
test('the primary palette has the ten shades Mantine requires', () => {
  const primary = theme.colors?.[theme.primaryColor ?? ''];
  expect(primary).toHaveLength(10);
  expect(primary?.every((shade) => /^#|^oklch|^rgb/.test(shade))).toBe(true);
});

test('font sizes and spacing cover Mantine's five keys', () => {
  for (const key of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
    expect(theme.fontSizes?.[key]).toBeDefined();
    expect(theme.spacing?.[key]).toBeDefined();
  }
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd apps/web && bun run test src/shared/theme`
Expected: FAIL

- [ ] **Step 4: Write `theme.ts`**

```ts
/**
 * The theme is the translation of the handwritten `app.css` into Mantine's vocabulary. It exists so
 * that the migration does not become a redesign: the screens have to stay recognisable, because the
 * stage's teaching material is made of screenshots of them.
 *
 * Mantine requires ten shades per named colour. `app.css` has fewer than that — the intermediate
 * ones were interpolated from the shades that existed, and the original shades are marked.
 */
export const theme: MantineThemeOverride = {
  primaryColor: 'escola',
  colors: { escola: [/* ten shades */] },
  fontFamily: '…',            // from the font custom properties
  fontSizes: { /* xs…xl */ }, // from the text-size custom properties
  spacing: { /* xs…xl */ },   // from the spacing custom properties
  radius: { /* … */ },
  shadows: { /* … */ },
  headings: { /* … */ },
};
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && bun run test src/shared/theme`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/shared/theme
git commit -m "feat(web): Mantine theme derived from the current CSS"
```

---

### Task 20: HTTP client and error translation

**Files:**
- Create: `apps/web/src/shared/api/client.ts`, `error.ts`, `index.ts`, `client.test.ts`, `error.test.ts`

**Interfaces:**
- Produces:
  - `client: AxiosInstance` — the system's only instance
  - `class ApiError extends Error { status: number; erros: readonly ApplicationError[]; correlationId: string; general(): string | null }`
  - `applyErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, warn: (m: string) => void): void`
  - `onSessionExpired(action: () => void): void` — registers what to do when the API answers 401

- [ ] **Step 1: Write the failing tests**

```ts
test('every POST carries a fresh idempotency key', async () => {
  const keys: string[] = [];
  server.use(http.post('*/api/v1/x', ({ request }) => {
    keys.push(request.headers.get('Idempotency-Key') ?? '');
    return HttpResponse.json({ id: '1' }, { status: 201 });
  }));

  await client.post('/x', {});
  await client.post('/x', {});

  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
});

test('every write carries the internal-origin mark; a read does not need it', async () => {
  let writeMark: string | null = null;
  server.use(
    http.post('*/api/v1/x', ({ request }) => {
      writeMark = request.headers.get('X-Requested-By');
      return HttpResponse.json({}, { status: 201 });
    }),
  );

  await client.post('/x', {});

  expect(writeMark).toBe('escolaviva');
});

test('an API error response becomes an ApiError with the fields preserved', async () => {
  server.use(http.post('*/api/v1/x', () =>
    HttpResponse.json(
      { erros: [{ campo: 'name', codigo: 'obrigatorio', mensagem: 'Informe o nome.' }], correlationId: 'abc' },
      { status: 422 },
    ),
  ));

  const error = await client.post('/x', {}).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(422);
  expect((error as ApiError).erros[0].campo).toBe('name');
  expect((error as ApiError).correlationId).toBe('abc');
});

test('a network failure also becomes an ApiError, not a raw Error', async () => {
  server.use(http.get('*/api/v1/x', () => HttpResponse.error()));

  const error = await client.get('/x').catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(0);
});

test('a 401 fires the session-expired action once', async () => {
  let expired = 0;
  onSessionExpired(() => { expired += 1; });
  server.use(http.get('*/api/v1/x', () => HttpResponse.json({ erros: [] }, { status: 401 })));

  await client.get('/x').catch(() => undefined);

  expect(expired).toBe(1);
});

test('an error without a field becomes a general warning, and one with a field goes to the input', () => {
  const set: [string, string][] = [];
  const warnings: string[] = [];
  const error = new ApiError(422, [
    { campo: 'cpf', codigo: 'x', mensagem: 'CPF inválido.' },
    { codigo: 'y', mensagem: 'Já existe um usuário com este e-mail.' },
  ], 'abc');

  applyErrors(error, ((field, options) => set.push([field, options.message ?? ''])) as never,
              (m) => warnings.push(m));

  expect(set).toEqual([['cpf', 'CPF inválido.']]);
  expect(warnings).toEqual(['Já existe um usuário com este e-mail.']);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && bun run test src/shared/api`
Expected: FAIL

- [ ] **Step 3: Write `error.ts`**

```ts
/**
 * The API error is a class, not a loose object, so that `instanceof` works in any screen's `catch`.
 * The `erros` arrive in the format the server already used internally — `{campo, codigo, mensagem}` —
 * and that is why there is no translator between the two ends.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly erros: readonly ApplicationError[],
    readonly correlationId: string,
  ) {
    super(erros[0]?.mensagem ?? 'Não foi possível falar com o servidor.');
    this.name = 'ApiError';
  }

  /** The message belonging to no field — the one that becomes a warning at the top of the form. */
  general(): string | null {
    return this.erros.find((problem) => problem.campo === undefined)?.mensagem ?? null;
  }
}

export function applyErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  warn: (message: string) => void,
): void {
  if (!(error instanceof ApiError)) {
    warn('Não foi possível falar com o servidor. Tente de novo.');
    return;
  }

  for (const problem of error.erros) {
    if (problem.campo === undefined) continue;
    // The `campo` the API returns is the input's `name`: the error lands under the right field.
    setError(problem.campo as Path<T>, { type: 'server', message: problem.mensagem });
  }

  const general = error.general();
  if (general !== null) warn(general);
}
```

- [ ] **Step 4: Write `client.ts`**

```ts
/**
 * The system's only Axios instance. No other file in the front calls `fetch` or assembles an API URL
 * by hand — that is what guarantees the idempotency key, the internal-origin mark and the error
 * translation always happen, rather than wherever someone remembered.
 *
 * An empty `VITE_API_URL` means the same origin, which is today's state. Filled in, it points at the
 * API published on another subdomain (I23) — and that is all that changes.
 */
const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;
const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export const client = axios.create({
  baseURL: BASE,
  // Without this the session cookie does not travel when the API is on another origin.
  withCredentials: true,
});

client.interceptors.request.use((request) => {
  const method = (request.method ?? 'get').toLowerCase();
  if (!WRITE_METHODS.has(method)) return request;

  request.headers.set('X-Requested-By', 'escolaviva');
  request.headers.set('Content-Type', 'application/json');
  // I4: a fresh key per submission. Two clicks on the same button are two submissions with the same
  // key only if the screen resends the same request — which is exactly the case the table covers.
  if (method === 'post') request.headers.set('Idempotency-Key', crypto.randomUUID());
  return request;
});

let onExpired: () => void = () => undefined;

/** Whoever knows how to navigate is the router, and it does not exist when this module loads. */
export const onSessionExpired = (action: () => void): void => { onExpired = action; };

client.interceptors.response.use(
  (response) => response,
  (failure: unknown) => {
    if (!axios.isAxiosError(failure) || failure.response === undefined) {
      return Promise.reject(new ApiError(0, [NETWORK_ERROR], ''));
    }
    const { status, data } = failure.response;
    const body = data as Partial<ErrorBody>;
    if (status === 401) onExpired();
    return Promise.reject(new ApiError(status, body.erros ?? [], body.correlationId ?? ''));
  },
);
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && bun run test src/shared/api`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/shared/api
git commit -m "feat(web): a single HTTP client, with idempotency and error translation"
```

---

### Task 21: Providers, router, guards and layout

**Files:**
- Create: `apps/web/src/app/App.tsx`, `routes.tsx`, `guards.tsx`, `Layout.tsx`, `guards.test.tsx`; `apps/web/src/features/session/queries.ts`, `mutations.ts`; `apps/web/src/shared/ui/{Table,Pagination,Empty,Loading,LoadFailed}.tsx`; `apps/web/src/shared/state/notices.ts`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Produces:
  - `useSession(): UseQueryResult<SessionUserAsJson>` — the query that hydrates the application
  - `<RequireLogin>`, `<RequireRole role={...}>`
  - `initialDashboard(user: SessionUserAsJson): string`
  - `useNotices()` — a Zustand store with `success(m)`, `error(m)`, `clear()`
  - `<Table columns rows>`, `<Pagination page pages onChange>`, `<Empty message>`, `<Loading>`, `<LoadFailed error>`

**Context — the URLs do not change.** React Router receives exactly the paths Hono served today,
`/login` included. Bookmarks survive and the screenshots in the material stay valid.

- [ ] **Step 1: Write the failing guard tests**

```ts
test('role precedence decides the landing screen for someone holding several roles', () => {
  // A registrar who is also a student's mother lands on the screen with the widest network scope.
  const several = userWith(['registrar', 'guardian']);
  const guardianOnly = userWith(['guardian']);

  expect(initialDashboard(several)).toBe('/registrar');
  expect(initialDashboard(guardianOnly)).toBe('/guardian');
});

test('an account with no role goes to the screen that explains it, not to a dashboard', () => {
  expect(initialDashboard(userWith([]))).toBe('/no-role');
});

test('someone without the role sees the no-permission screen, and the API is what actually blocks', async () => {
  server.use(http.get('*/api/v1/session', () =>
    HttpResponse.json({ user: userWith(['guardian']) }),
  ));

  renderWithProviders(
    <RequireRole role="registrar"><span>tela da secretaria</span></RequireRole>,
  );

  expect(await screen.findByText(/não tem permissão/i)).toBeVisible();
  expect(screen.queryByText('tela da secretaria')).toBeNull();
});

test('with no session, the guard leads to the login screen', async () => {
  server.use(http.get('*/api/v1/session', () =>
    HttpResponse.json({ erros: [], correlationId: '' }, { status: 401 }),
  ));

  renderWithProviders(<RequireLogin><span>conteúdo</span></RequireLogin>, '/registrar');

  expect(await screen.findByText(/entrar/i)).toBeVisible();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && bun run test src/app`
Expected: FAIL

- [ ] **Step 3: Write `features/session/queries.ts`**

```ts
export const sessionKey = ['session'] as const;

/**
 * The query that hydrates the application. It replaces the server's `GET /dashboard`: whoever decides
 * where to take the person who signed in is the front, because role precedence is presentation and
 * always was.
 */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: () => client.get<{ user: SessionUserAsJson }>('/session')
      .then((r) => r.data.user),
    // A 401 is an answer, not a network failure: retrying three times would only delay the trip to
    // the login screen.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Write `guards.tsx`**

```tsx
/**
 * WARNING: these guards are navigation convenience, **not** access control. What decides what a
 * person may see is the API, which answers 403 or 404 for any request outside their scope —
 * including the ones this component would let through. Loosening the guard opens no door;
 * loosening the server's rule does.
 */
const PRECEDENCE: readonly { role: Role; target: string }[] = [
  { role: 'network_admin', target: '/network' },
  { role: 'registrar', target: '/registrar' },
  { role: 'teacher', target: '/teacher' },
  { role: 'guardian', target: '/guardian' },
];

export const hasRole = (user: SessionUserAsJson, role: Role): boolean =>
  user.roles.some((assignment) => assignment.role === role);

export const initialDashboard = (user: SessionUserAsJson): string =>
  PRECEDENCE.find(({ role }) => hasRole(user, role))?.target ?? '/no-role';

export function RequireLogin({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useSession();
  if (isPending) return <Loading />;
  if (user === undefined) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { data: user, isPending } = useSession();
  if (isPending) return <Loading />;
  if (user === undefined) return <Navigate to="/login" replace />;
  if (!hasRole(user, role)) return <NoPermission />;
  return <>{children}</>;
}
```

- [ ] **Step 5: Write `routes.tsx` with today's URLs and one chunk per role**

```tsx
/**
 * One `lazy()` per role, not per screen: that is what gives one bundle chunk per role. Whoever signs
 * in as a guardian does not download the registrar — and the guardian portal is the system's worst
 * network case, the same one that justifies I4.
 */
const Network = lazy(() => import('../features/network/routes'));
const Registrar = lazy(() => import('../features/registrar/routes'));
const Teacher = lazy(() => import('../features/teacher/routes'));
const Guardian = lazy(() => import('../features/guardian/routes'));
const Announcements = lazy(() => import('../features/announcements/routes'));

export const router = createBrowserRouter([
  { path: '/login', element: <SignInScreen /> },
  {
    element: <RequireLogin><Layout /></RequireLogin>,
    children: [
      { path: '/', element: <ToDashboard /> },
      { path: '/dashboard', element: <ToDashboard /> },
      { path: '/account/password', element: <PasswordChange /> },
      { path: '/no-role', element: <AccountWithoutRole /> },
      { path: '/network/*', element: <RequireRole role="network_admin"><Network /></RequireRole> },
      { path: '/registrar/*', element: <RequireRole role="registrar"><Registrar /></RequireRole> },
      { path: '/teacher/*', element: <RequireRole role="teacher"><Teacher /></RequireRole> },
      { path: '/guardian/*', element: <RequireRole role="guardian"><Guardian /></RequireRole> },
      { path: '/announcements/*', element: <Announcements /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
```

Each `features/<role>/routes.tsx` is created **empty** in this task, with an `<Outlet />` and no child
routes — the phase 4 fronts each fill in their own, without touching one another.

- [ ] **Step 6: Wire the 401 to the router in `main.tsx`**

```tsx
// Translating a 401 into navigation lives here because this is where the router exists. The whole
// cache goes with it: data from a closed session must not linger on the next one's screen.
onSessionExpired(() => {
  queries.clear();
  void router.navigate('/login');
});
```

- [ ] **Step 7: Write the five components in `shared/ui/`**

`Table`, `Pagination`, `Empty`, `Loading` and `LoadFailed` — the equivalents of
`partials/_pagination.eta`, `partials/_empty.eta` and `partials/_messages.eta`. `Pagination`
reproduces the seven-number window from `src/web/pagination.ts`: seven fit on a phone line without
wrapping. `LoadFailed` shows the message and the `correlationId` — the code support uses to find the
trail in the log.

- [ ] **Step 8: Run the tests**

Run: `cd apps/web && bun run test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git status --short
git add apps/web/src/app apps/web/src/main.tsx apps/web/src/shared/ui \
        apps/web/src/shared/state apps/web/src/features/session
git commit -m "feat(web): router with today's URLs, guards and list components"
```

---

### Task 22: Sign-in and password change

**Files:**
- Create: `apps/web/src/features/session/SignInScreen.tsx`, `schemas.ts`, `SignInScreen.test.tsx`; `apps/web/src/features/account/PasswordChange.tsx`, `schemas.ts`, `PasswordChange.test.tsx`
- Modify: `apps/web/src/app/routes.tsx`

**Interfaces:**
- Produces: `useSignIn()`, `useSignOut()`, `useChangePassword()` — the three mutations the `Layout` and the sign-in screen consume.

**Context:** it is the first real screen, and it proves the whole shell end to end — client, error,
guard, router and theme. Two decisions from the original file still hold:

- **the screen is not an oracle**: a nonexistent network, an unknown identifier and a wrong password
  all come back through the same door, with the message `identity.authenticate` already chose;
- **the password is not trimmed**: a leading or trailing space is part of what the person chose. The
  network and the identifier are.

- [ ] **Step 1: Write the failing tests**

```tsx
test('signing in leads to the dashboard of the widest role', async () => {
  server.use(
    http.post('*/api/v1/session', () =>
      HttpResponse.json({ user: userWith(['registrar', 'guardian']) }, { status: 201 }),
    ),
  );
  renderWithProviders(<App />, '/login');

  await userEvent.type(screen.getByLabelText('Rede'), 'demo');
  await userEvent.type(screen.getByLabelText('CPF'), '529.982.247-25');
  await userEvent.type(screen.getByLabelText('Senha'), 'escolaviva');
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

  expect(await screen.findByText('Painel da secretaria')).toBeVisible();
});

test('a refused credential shows the server message and keeps what was typed', async () => {
  server.use(
    http.post('*/api/v1/session', () =>
      HttpResponse.json(
        { erros: [{ codigo: 'credenciais_invalidas', mensagem: 'CPF ou senha inválidos' }],
          correlationId: 'abc' },
        { status: 422 },
      ),
    ),
  );
  renderWithProviders(<SignInScreen />);

  await userEvent.type(screen.getByLabelText('Rede'), 'demo');
  await userEvent.type(screen.getByLabelText('CPF'), '529.982.247-25');
  await userEvent.type(screen.getByLabelText('Senha'), 'errada');
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

  expect(await screen.findByText('CPF ou senha inválidos')).toBeVisible();
  // Whoever got the password wrong should not be forced to retype the rest.
  expect(screen.getByLabelText('Rede')).toHaveValue('demo');
  expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
  expect(screen.getByLabelText('Senha')).toHaveValue('');
});

test('the typed password never appears in the URL or in a document attribute', async () => {
  renderWithProviders(<SignInScreen />);

  await userEvent.type(screen.getByLabelText('Senha'), 'segredo123');

  expect(window.location.search).not.toContain('segredo123');
  expect(document.body.innerHTML).not.toContain('segredo123');
});

test('a mismatched confirmation is blocked before it reaches the server', async () => {
  let called = false;
  server.use(http.put('*/api/v1/account/password', () => { called = true; return new HttpResponse(null, { status: 204 }); }));
  renderWithProviders(<PasswordChange />);

  await userEvent.type(screen.getByLabelText('Senha atual'), 'antiga');
  await userEvent.type(screen.getByLabelText('Senha nova'), 'nova-senha-longa');
  await userEvent.type(screen.getByLabelText('Confirme a senha nova'), 'outra-coisa');
  await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));

  expect(await screen.findByText(/não confere/i)).toBeVisible();
  expect(called).toBe(false);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && bun run test src/features/session src/features/account`
Expected: FAIL

- [ ] **Step 3: Write the comfort schemas**

```ts
/**
 * Comfort Zod: it exists for immediate feedback, and decides nothing. The truth about who signs in
 * is still `identity.authenticate`, on the server (I22).
 */
export const signInSchema = z.object({
  networkSlug: z.string().trim().min(1, 'Informe a rede.'),
  cpf: z.string().trim().min(1, 'Informe seu CPF.'),
  // No `.trim()`: a leading or trailing space is part of the password the person chose.
  password: z.string().min(1, 'Informe a senha.'),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: z.string().min(1, 'Informe a senha nova.'),
    passwordConfirmation: z.string().min(1, 'Repita a senha nova.'),
  })
  // Checking here avoids a round trip to the server to discover the person mistyped the repeat.
  // The server checks again — this check is comfort, not a guarantee.
  .refine((values) => values.newPassword === values.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'A confirmação não confere com a senha nova.',
  });
```

- [ ] **Step 4: Write the two screens** (P8)

The sign-in screen uses the public layout — no menu, no application header. After success,
`navigate(initialDashboard(user), { replace: true })`.

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && bun run test`
Expected: PASS

- [ ] **Step 6: Prove it against the real API, by hand**

```bash
bun run dev
```
Open `http://localhost:5173/login`, sign in with `demo` / the registrar's CPF / `escolaviva`, confirm
you land on `/registrar`, change the password and sign out. It is the plan's only manual check, and it
exists because no test proves that a first-party cookie survives Vite's proxy.

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/session apps/web/src/features/account \
        apps/web/src/app/routes.tsx
git commit -m "feat(web): sign in, sign out and password change"
```

---

# PHASE 4 — The screens, by role

Six parallel fronts, the same as in phase 2. Each fills in its own
`features/<role>/routes.tsx`, created empty in Task 21, and **touches nothing else**.

**Script common to T23–T28:**

1. Write `queries.ts` with the keys and the read hooks (P6).
2. Write `mutations.ts` with the write hooks and the invalidations (P7).
3. Write `schemas.ts` — comfort Zod, never rules.
4. Write the screens: list (P9), record and form (P8).
5. Write the tests with MSW (P10).
6. Fill in the front's `routes.tsx` with the child routes.
7. `bun run verify` green and a commit of only that front's files.

**Three rules that apply to all six fronts and are not repeated in each task:**

- **Forms live on their own page.** A list is only the table. Refusing a form never reloads the
  paginated query nobody asked for.
- **Filters and the page live in the URL**, via `useSearchParams`. Never in `useState`, never in
  Zustand.
- **No optimistic updates.** The write is synchronous and the user waits; hiding the wait would hide
  the pain the later stages exist to solve.

---

### Task 23: Screens — Network

**Files:**
- Create under `apps/web/src/features/network/`: `queries.ts`, `mutations.ts`, `schemas.ts`, `routes.tsx`, `Dashboard.tsx`, `SchoolList.tsx`, `SchoolForm.tsx`, `UserList.tsx`, `UserForm.tsx`, `AcademicYearList.tsx`, `AcademicYearForm.tsx`, and the matching `.test.tsx`

| Browser route | Screen | Endpoint |
|---|---|---|
| `/network` | `Dashboard` | `GET /network/dashboard` |
| `/network/schools` | `SchoolList` | `GET /network/schools?p=` |
| `/network/schools/new` | `SchoolForm` | `POST /network/schools` |
| `/network/users` | `UserList` | `GET /network/users?p=` |
| `/network/users/new` | `UserForm` | `POST /network/users` + `GET /options/{schools,guardians}` |
| `/network/academic-years` | `AcademicYearList` | `GET /network/academic-years?p=` |
| `/network/academic-years/new` | `AcademicYearForm` | `POST /network/academic-years` |

**The invitation screen is the front's most delicate.** The temporary password comes in the `201` body
and is shown **once**, on the success screen. It does not go to the URL, does not go to Zustand, does
not go to `localStorage` and is not re-shown by `invalidateQueries`. The component that shows it
receives it in local state and loses it on navigation — which is the same lifetime as the 120-second
cookie it used to have.

The role-assignment form stops being three fixed rows: with React, "one or more" is React Hook Form's
`useFieldArray`, with add and remove buttons. The fixed rows existed for lack of JavaScript on the
client, and that constraint is over.

**Mandatory test cases:**

| Case | Expects |
|---|---|
| a successful invitation | the temporary password appears once |
| navigating away and back | the password does **not** appear again |
| the password is not in the DOM after leaving the screen | `document.body.innerHTML` does not contain it |
| a `422` on the `cpf` field | a message under the CPF field |
| an error with no field | a warning at the top of the form |
| a role assignment with no school | blocked by the comfort Zod, with no trip to the server |
| a list with `?p=3` in the URL | the table opens on the third page |

- [ ] **Step 1: `queries.ts` (P6) and the read tests**
- [ ] **Step 2: `mutations.ts` (P7) and the write tests**
- [ ] **Step 3: `schemas.ts` — comfort, never rules**
- [ ] **Step 4: The seven screens (P8, P9) with the P10 tests**
- [ ] **Step 5: The front's `routes.tsx`**
- [ ] **Step 6: `bun run verify` green**
- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/network
git commit -m "feat(web): network administration screens"
```

---

### Task 24: Screens — Registrar A: students, guardians and enrollments

**Files:**
- Create under `apps/web/src/features/registrar/students/` and `.../guardians/`: `queries.ts`, `mutations.ts`, `schemas.ts`, `StudentSearch.tsx`, `StudentForm.tsx`, `StudentRecord.tsx`, `GuardianLinkForm.tsx`, `EnrollmentForm.tsx`, `TransferForm.tsx`, `GuardianList.tsx`, `GuardianForm.tsx`, and the `.test.tsx`
- Create: `apps/web/src/features/registrar/routes.tsx` (shared with Task 25 — see the note)

| Browser route | Screen | Endpoint |
|---|---|---|
| `/registrar` | `Dashboard` | `GET /registrar/dashboard?p=` |
| `/registrar/students` | `StudentSearch` | `GET /registrar/students?q=&p=` |
| `/registrar/students/new` | `StudentForm` | `POST /registrar/students` |
| `/registrar/students/:id` | `StudentRecord` | `GET /registrar/students/:id` |
| `/registrar/students/:id/guardians/new` | `GuardianLinkForm` | `GET .../available-guardians`, `POST .../guardians` |
| `/registrar/students/:id/enroll` | `EnrollmentForm` | `GET /options/class-groups`, `POST /registrar/enrollments` |
| `/registrar/enrollments/:id/transfer` | `TransferForm` | `GET /registrar/enrollments/:id`, `POST .../transfer` |
| `/registrar/guardians` | `GuardianList` | `GET /registrar/guardians?p=` |
| `/registrar/guardians/new` | `GuardianForm` | `POST /registrar/guardians` |

**Note on `routes.tsx`:** Tasks 24 and 25 share the same role folder. To avoid colliding, the
registrar's `routes.tsx` is created by **Task 24** already containing both sets of routes, and Task 25
does not edit it — it only creates the components that file imports. If Task 25 runs first, it stops
and reports.

**Screen rules that come from today's behaviour:**

- the student search **opens empty**: no term means no query. It is the `enabled: term !== ''` of P6;
- the term lives in `?q=`, not in component state — a search is a shareable address;
- the two tables on the record have their own `?pGuardians=` and `?pEnrollments=`;
- the transfer button comes from the **active** enrollment, queried separately, and keeps appearing on
  the second page of the history;
- the source class group does not appear in the transfer selector: transferring to where you already
  are is not a transfer.

**Mandatory test cases:**

| Case | Expects |
|---|---|
| the search screen with no `?q=` | no request fired; text inviting a search |
| typing and submitting | `?q=` in the URL and the request carrying the term |
| the record with `?pEnrollments=2` | only the enrollments table advances |
| a registration refused with `campo: 'name'` | a message under the field |
| a guardian already linked | does not appear in the selector |
| a `404` from the API on the record | a "not found" screen, not a blank one |

- [ ] **Step 1: `queries.ts` (P6) and the read tests**
- [ ] **Step 2: `mutations.ts` (P7) and the write tests**
- [ ] **Step 3: `schemas.ts`**
- [ ] **Step 4: The nine screens (P8, P9) with the P10 tests**
- [ ] **Step 5: The registrar's `routes.tsx`, with the routes of Tasks 24 and 25**
- [ ] **Step 6: `bun run verify` green**
- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/registrar/students \
        apps/web/src/features/registrar/guardians \
        apps/web/src/features/registrar/routes.tsx \
        apps/web/src/features/registrar/Dashboard.tsx
git commit -m "feat(web): student, guardian and enrollment screens"
```

---

### Task 25: Screens — Registrar B: class groups and subjects

**Files:**
- Create under `apps/web/src/features/registrar/class-groups/` and `.../subjects/`: `queries.ts`, `mutations.ts`, `schemas.ts`, `ClassGroupList.tsx`, `ClassGroupForm.tsx`, `ClassGroupRecord.tsx`, `AssignmentForm.tsx`, `SubjectList.tsx`, `SubjectForm.tsx`, and the `.test.tsx`
- **Does not edit** `apps/web/src/features/registrar/routes.tsx` — see the note in Task 24

| Browser route | Screen | Endpoint |
|---|---|---|
| `/registrar/class-groups` | `ClassGroupList` | `GET /registrar/class-groups?school=&year=&p=` |
| `/registrar/class-groups/new` | `ClassGroupForm` | `GET /options/{schools,academic-years}`, `POST /registrar/class-groups` |
| `/registrar/class-groups/:id` | `ClassGroupRecord` | `GET /registrar/class-groups/:id` |
| `/registrar/class-groups/:id/subjects/new` | `AssignmentForm` | `GET /options/{subjects,teachers}`, `POST .../subjects` |
| `/registrar/subjects` | `SubjectList` | `GET /registrar/subjects?p=` |
| `/registrar/subjects/new` | `SubjectForm` | `POST /registrar/subjects` |

**Screen rules:**

- the school and year filters live in `?school=` and `?year=`. Changing either one goes back to page 1
  — the third page of the previous filter does not exist in the new one;
- the assignment's teacher selector depends on **the class group's** school, not on a user choice:
  `GET /options/teachers?schoolId=<the class group's school>`;
- the class-group record has its own `?pSubjects=` and `?pEnrollments=`;
- the shift labels (`Matutino`, `Vespertino`, `Noturno`, `Integral`) belong to the front; the values
  come from `SHIFTS`, imported from `contracts/enumerations.ts`.

**Mandatory test cases:**

| Case | Expects |
|---|---|
| changing the school filter while on `?p=3` | `p` disappears from the URL |
| `?school=` and `?year=` together | both go in the request |
| an assignment in a class group whose school has no teacher | an empty selector with a message, not an error |
| the shift shown in the table | a Portuguese label, not the raw value |
| `422` with `campo: 'name'` on class-group registration | a message under the field |

- [ ] **Step 1: `queries.ts` (P6) and the read tests**
- [ ] **Step 2: `mutations.ts` (P7) and the write tests**
- [ ] **Step 3: `schemas.ts`**
- [ ] **Step 4: The six screens (P8, P9) with the P10 tests**
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/features/registrar/class-groups \
        apps/web/src/features/registrar/subjects
git commit -m "feat(web): class group and subject screens"
```

---

### Task 26: Screens — Teacher

**Files:**
- Create under `apps/web/src/features/teacher/`: `queries.ts`, `mutations.ts`, `schemas.ts`, `routes.tsx`, `MyClassGroups.tsx`, `Grades.tsx`, `RollCall.tsx`, `Closing.tsx`, `grade.ts`, `grade.test.ts`, and the `.test.tsx`

| Browser route | Screen | Endpoint |
|---|---|---|
| `/teacher` | `MyClassGroups` | `GET /teacher/class-groups` |
| `/teacher/subjects/:id/grades` | `Grades` | `GET`/`PUT /teacher/subjects/:id/grades` |
| `/teacher/class-groups/:id/roll-call` | `RollCall` | `GET`/`PUT /teacher/class-groups/:id/roll-call` |
| `/teacher/class-groups/:id/closing` | `Closing` | `GET`/`POST /teacher/class-groups/:id/closing` |

**Parsing a typed grade moves here.** The server now receives a `number`; what accepts a comma is the
field. `grade.ts` is a pure module, with a test of its own:

```ts
/**
 * A comma and a dot are the same separator for whoever types, and a blank field clears the grade.
 * This lived on the server while a form could only send text; with JSON it is a screen decision.
 *
 * `undefined` is the third case and must not become `null`: it means "typed and invalid", which is
 * what lights the error in the cell instead of clearing somebody's grade.
 */
export const asGrade = (typed: string): number | null | undefined => {
  if (typed.trim() === '') return null;
  const number = Number(typed.replace(',', '.'));
  if (!Number.isFinite(number) || number < 0 || number > 10) return undefined;
  return number;
};
```

```ts
test('a comma and a dot produce the same number', () => {
  expect(asGrade('7,5')).toBe(7.5);
  expect(asGrade('7.5')).toBe(7.5);
});

test('a blank field clears the grade; a value out of range lights the error', () => {
  expect(asGrade('')).toBeNull();
  expect(asGrade('   ')).toBeNull();
  expect(asGrade('11')).toBeUndefined();
  expect(asGrade('-1')).toBeUndefined();
  expect(asGrade('abc')).toBeUndefined();
});
```

**Screen rules:**

- the term lives in `?term=`. A value outside 1–4 in the URL falls back to the 1st: it is navigation,
  not a write;
- roll call opens with **everybody present** — an absence is the exception;
- the roll-call date lives in `?date=`, with the previous-day and next-day buttons changing the URL;
- a closed term leaves the grade grid read-only, with the reason written on the screen;
- **closing is synchronous and the wait is visible.** The button disables and shows that it is
  processing. Nothing optimistic, no fake queue: that wait is the planted pain that justifies Stage
  05, and hiding it would erase the evidence.

**Mandatory test cases:**

| Case | Expects |
|---|---|
| `?term=9` | the screen opens on term 1 |
| changing the term | `?term=` changes and the grid reloads |
| a grade of `11` typed | an error in the cell, and **no** submission |
| a grade cleared | sends `value: null` for that enrollment |
| a `422` from the server with an enrollment `campo` | the error in the right cell |
| a closed term | fields disabled and the reason on the screen |
| roll call with no record for the day | every box ticked |
| a closing with items missing | the list of what is missing appears on the screen |
| a closing in progress | the button disabled, no second submission possible |

- [ ] **Step 1: `grade.ts` and its test — the pure module first**
- [ ] **Step 2: `queries.ts` (P6) and the read tests**
- [ ] **Step 3: `mutations.ts` (P7) and the write tests**
- [ ] **Step 4: The four screens (P8, P9) with the P10 tests**
- [ ] **Step 5: The front's `routes.tsx`**
- [ ] **Step 6: `bun run verify` green**
- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/teacher
git commit -m "feat(web): the teacher's class journal"
```

---

### Task 27: Screens — Guardian

**Files:**
- Create under `apps/web/src/features/guardian/`: `queries.ts`, `mutations.ts`, `routes.tsx`, `MyStudents.tsx`, `ReportCard.tsx`, `Attendance.tsx`, `Board.tsx`, `Announcement.tsx`, and the `.test.tsx`

| Browser route | Screen | Endpoint |
|---|---|---|
| `/guardian` | `MyStudents` | `GET /guardian/dashboard?p=` |
| `/guardian/enrollments/:id/report-card` | `ReportCard` | `GET .../report-card` |
| `/guardian/enrollments/:id/attendance` | `Attendance` | `GET .../attendance?p=` |
| `/guardian/board` | `Board` | `GET /guardian/board?pUnread=&pRead=` |
| `/guardian/board/:id` | `Announcement` | `GET .../board/:id`, `POST .../read` |

**The most important rule in the whole plan is in this task.** Opening an announcement does **not**
mark it read. There is no `useEffect` firing `POST /read`; the only thing that writes is the button
click. The 12 % rate is the measurement that turns "nobody reads the board" from hallway opinion into
a number, and it is what justifies Stage 04. A load effect — the easiest mistake to make in an SPA —
would invent reads nobody performed and destroy the evidence.

Write this as a comment in the component, not only here.

**Screen rules:**

- an account with no linked `guardianId` sees the screen with the explanation, not an error. It is not
  a failure: it is an account the registrar has not linked yet;
- no arithmetic is done on the front. Average, percentage and status come from `assessment` and are
  only formatted — recalculating would produce a second number, and it is the divergence between the
  two that the report card exists not to have;
- the two board lists have their own `?pUnread=` and `?pRead=`: marking an announcement read moves a
  row from one list to the other, and both have to move without dragging their neighbour;
- **this is the system's worst network case.** This front's chunk is what the bundle budget in Task 32
  measures.

**Mandatory test cases:**

| Case | Expects |
|---|---|
| opening the announcement | **no** `POST` request fired |
| clicking "Marcar como lido" | one `POST /read`, and the unread list invalidated |
| clicking twice quickly | a single submission (the button disables meanwhile) |
| an account with no linked guardian | explanatory text, no error |
| a report card with a `5.99` grade | the screen shows `5,9` |
| attendance with `?p=2` | the second page of days |
| a `404` on the report card | a "not found" screen |

- [ ] **Step 1: `queries.ts` (P6) and the read tests, including "opening does not mark"**
- [ ] **Step 2: `mutations.ts` (P7) and the button test**
- [ ] **Step 3: The five screens (P8, P9) with the P10 tests**
- [ ] **Step 4: The front's `routes.tsx`**
- [ ] **Step 5: `bun run verify` green**
- [ ] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/features/guardian
git commit -m "feat(web): the guardian portal"
```

---

### Task 28: Screens — Announcements

**Files:**
- Create under `apps/web/src/features/announcements/`: `queries.ts`, `mutations.ts`, `schemas.ts`, `routes.tsx`, `AnnouncementList.tsx`, `AnnouncementForm.tsx`, and the `.test.tsx`

| Browser route | Screen | Endpoint |
|---|---|---|
| `/announcements` | `AnnouncementList` | `GET /announcements?schoolId=&p=` |
| `/announcements/new` | `AnnouncementForm` | `GET /announcements/recipients?schoolId=`, `POST /announcements` |

**Sending stops having two steps.** Today it is a `GET` to choose the school and then the form,
because without JavaScript the recipient list can only be assembled once the school is known. With
React, changing the school fires `GET /announcements/recipients?schoolId=` and the list appears on the
same screen. It is the third real simplification the migration brings.

**What does not change:** checking the recipients stays on the server. The fact that React only offers
the right ones guarantees nothing — the list that comes back is external input.

**Screen rules:**

- the read rate is the reason this screen exists, and it sits at the top, measuring the whole slice.
  Changing page does **not** recalculate it;
- the school filter lives in `?schoolId=`;
- `network_admin` with no filter sees the whole network; `registrar` with no filter sees their first
  school;
- a registrar with no assigned school sees the explanation, not an empty list with no context.

**Mandatory test cases:**

| Case | Expects |
|---|---|
| changing the school in the form | a new recipients request, the previous selection cleared |
| the "whole school" audience | sends `guardians: []` |
| the "selected" audience with nobody ticked | blocked by the comfort Zod |
| `422` with `campo: 'recipients'` | a message next to the list |
| going to `?p=2` | the displayed rate does not change |
| a rate of `0.123` | the screen shows `12,3 %` |

- [ ] **Step 1: `queries.ts` (P6) and the read tests**
- [ ] **Step 2: `mutations.ts` (P7) and the write tests**
- [ ] **Step 3: `schemas.ts`**
- [ ] **Step 4: The two screens (P8, P9) with the P10 tests**
- [ ] **Step 5: The front's `routes.tsx`**
- [ ] **Step 6: `bun run verify` green**
- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/announcements
git commit -m "feat(web): announcements and the read rate"
```

---

**Exit gate for phase 4.**

- [ ] `bun run verify` green with all six fronts together
- [ ] `bun run build:web` produces a `dist` with no bundle warning
- [ ] `bun run dev` starts both processes, and the four journeys work by hand
- [ ] every route in Task 21's `routes.tsx` resolves to a real screen

---

# PHASE 5 — Quality

### Task 29: Playwright and the network and registrar journeys

**Files:**
- Create: `playwright.config.ts`, `e2e/support.ts`, `e2e/network-journey.spec.ts`, `e2e/registrar-journey.spec.ts`
- Modify: `package.json` (root)

**Interfaces:**
- Produces: `signInAs(page, credentials)` — the support helper Tasks 30 and 31 consume.

**Context:** the journeys are the ones in `docs/archify/06-network-admin-journey` and
`07-registrar-journey`. They run against the real server, with the database seeded by `bun run seed` —
no MSW here.

- [ ] **Step 1: Install and configure**

```bash
bun add -d @playwright/test@latest
bunx playwright install chromium
```

`playwright.config.ts` starts the API and the front with `webServer`, points `baseURL` at
`http://localhost:5173` and uses `retries: 0` — a test that only passes on the second attempt is not a
test.

- [ ] **Step 2: Write `e2e/network-journey.spec.ts`**

Sign in as `admin@escolaviva.test` (by CPF, as the seed prints it), create a school, define the
academic year, invite a user, **confirm the temporary password appears once**, navigate away and
confirm it is gone.

- [ ] **Step 3: Write `e2e/registrar-journey.spec.ts`**

Sign in as `secretaria1@escolaviva.test`, register a student, register a guardian, link them, create a
class group, assign a subject, enrol, transfer. At the end, **reload the page on a deep URL**
(`/registrar/students/<id>`) and confirm the application comes back — that is Task 7's SPA fallback
test, run in a real browser.

- [ ] **Step 4: Run**

Run: `bun run e2e`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git status --short
git add playwright.config.ts e2e/support.ts e2e/network-journey.spec.ts \
        e2e/registrar-journey.spec.ts package.json bun.lock
git commit -m "test(e2e): the network and registrar journeys"
```

---

### Task 30: The teacher journey

**Files:**
- Create: `e2e/teacher-journey.spec.ts`

Sign in as `professor1@escolaviva.test`, open the grade grid, post with a comma (`7,5`), confirm the
screen shows `7,5`, take a day's roll call with one excused absence, go back a day and confirm the
previous roll call is still there, and **close term 3**, confirming the refusal carries the list of
what is missing ("Faltam 45 notas para fechar o bimestre: Arte (20), Ciências (20), Geografia (5).").

Close term 1 and confirm it works. Both cases are planted on purpose in the demo database and are the
proof that the rule survived the migration.

- [ ] **Step 1: Write the test**
- [ ] **Step 2: Run it and watch it pass**
- [ ] **Step 3: Commit**

```bash
git status --short
git add e2e/teacher-journey.spec.ts
git commit -m "test(e2e): the teacher journey"
```

---

### Task 31: The guardian journey, and the proof of the read rate

**Files:**
- Create: `e2e/guardian-journey.spec.ts`

Sign in as one of the guardians the `seed` prints, open the report card, confirm the grade appears
truncated, open attendance, open the board.

**The test that must not be missing:**

```ts
test('opening the announcement does not mark it read; only the button does', async ({ page }) => {
  await signInAs(page, GUARDIAN);
  const unreadBefore = await countUnread(page);

  await page.goto('/guardian/board');
  await page.getByRole('link', { name: ANNOUNCEMENT_TITLE }).click();
  await page.getByRole('heading', { name: ANNOUNCEMENT_TITLE }).waitFor();
  await page.goto('/guardian/board');

  // Reading is a write, and a write may not be a side effect of navigation. The 12 % rate is the
  // measurement that justifies Stage 04 — reads invented by navigation destroy it.
  expect(await countUnread(page)).toBe(unreadBefore);

  await page.getByRole('link', { name: ANNOUNCEMENT_TITLE }).click();
  await page.getByRole('button', { name: 'Marcar como lido' }).click();
  await page.waitForURL('**/guardian/board');

  expect(await countUnread(page)).toBe(unreadBefore - 1);
});
```

- [ ] **Step 1: Write the test**
- [ ] **Step 2: Run it and watch it pass**
- [ ] **Step 3: Commit**

```bash
git status --short
git add e2e/guardian-journey.spec.ts
git commit -m "test(e2e): the guardian journey and the proof of the read rate"
```

---

### Task 32: Bundle budget and accessibility

**Files:**
- Create: `apps/web/budget.test.ts`, `e2e/accessibility.spec.ts`
- Modify: `apps/web/vite.config.ts` if the ceiling is exceeded

**Interfaces:**
- Produces: a test that fails when the guardian bundle goes over the ceiling.

**Context:** the guardian portal is the system's worst network case. I4 exists because a guardian on
bad 4G taps "submit" twice — and that same person now downloads React and Mantine before seeing the
report card. **Ceiling: 150 kB compressed on the guardian's first load.** Exceeding it is a reason to
change component, not to raise the ceiling.

- [ ] **Step 1: Write the budget test**

```ts
const GUARDIAN_CEILING_IN_BYTES = 150 * 1024;

test('the guardian first load fits the budget', async () => {
  // The guardian chunk plus the shared core: this is what a person on 4G downloads before seeing
  // their child's report card. The ceiling is not aesthetic — it is the same constraint that
  // justifies I4.
  const bytes = await sumGzipOfChunks(['index', 'guardian']);
  expect(bytes).toBeLessThanOrEqual(GUARDIAN_CEILING_IN_BYTES);
});

test('no role chunk enters the initial load of the others', async () => {
  const initial = await chunksOfDocument();
  expect(initial).not.toContain('registrar');
  expect(initial).not.toContain('teacher');
});
```

- [ ] **Step 2: Run it and adjust until it passes**

If it goes over, in this order: import Mantine components by path instead of from the barrel; defer
`@mantine/dates` to the screens that use dates; strip `dayjs` locales other than `pt-br`.

- [ ] **Step 3: Write `e2e/accessibility.spec.ts`**

An automated scan per role, plus three by-hand checks the tool does not catch:

| Check | Where |
|---|---|
| full keyboard navigation, with no focus trap | the invitation form and the grade grid |
| every field has an associated `label` and the error is announced | the eight forms |
| theme contrast in text and in the error state | the theme from Task 19 |
| `prefers-reduced-motion` respected | Mantine transitions |

- [ ] **Step 4: Run**

Run: `bun run e2e && cd apps/web && bun run test budget`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git status --short
git add apps/web/budget.test.ts e2e/accessibility.spec.ts apps/web/vite.config.ts
git commit -m "test: the guardian bundle budget and accessibility"
```

---

# PHASE 6 — Removal and documentation

### Task 33: Removing SSR

**Files:**
- Delete: `apps/api/src/web/templates/` (45 files), `apps/api/src/web/render.ts`, `apps/api/src/web/public/app.css`, `scripts/build-assets.ts`, `public/manifest.json`, `apps/api/tests/web/`
- Modify: `apps/api/src/web/routes/*.ts` (removed), `apps/api/src/shared/http/errors.ts`, `idempotency.ts`, `index.ts`, `apps/api/src/web/app.ts`, `apps/api/package.json`, `package.json`

**Context:** only after phase 5 is green. Until the E2E tests prove the four journeys in a browser, SSR
is the safety net.

- [ ] **Step 1: Delete the eight Eta routers and the 45 templates**

`apps/api/src/web/routes/{login,account,network,registrar,teacher,guardian,announcements,index}.ts` and
the `templates/` folder. `app.ts` loses the call to `mountRoutes`.

- [ ] **Step 2: Slim down `shared/http/errors.ts`**

Gone: `registerErrorRenderer`, `ErrorRenderer`, `errorPage`, the minimal page, the HTML escaping, the
title and detail maps and the HTML branch of `errorResponse`. The middleware becomes the four lines
Task 4 announced.

- [ ] **Step 3: Slim down `shared/http/idempotency.ts` and `index.ts`**

Gone: the form `idempotencyMiddleware`, `KEY_FIELD`, `FormBody`. `Variables.body` becomes `unknown`,
with no union.

- [ ] **Step 4: Remove `eta`, `build-assets` and the manifest**

```bash
cd apps/api && bun remove eta
```

`build:assets` leaves the root scripts. `public/` stops existing — I10 now belongs to Vite.

- [ ] **Step 5: Delete `apps/api/tests/web/`, migrating what is left**

`checklist.test.ts` is **not** deleted: it moves to `apps/api/tests/api/checklist.test.ts` with the
paths and submissions updated. The four groups it proves still hold: the module boundary, no file
written to disk, `network_id` in every business table, idempotency, cache and health. It **gains** the
new case:

```ts
test('the application document never goes to cache, and a hashed asset goes forever', async () => {
  const document = await read('/registrar/students/01HZZZ');
  const asset = await read('/assets/index-a1b2c3.js');

  expect(document.headers.get('Cache-Control')).toBe('no-store');
  expect(asset.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
});
```

- [ ] **Step 6: Run the verification**

Run: `bun run verify && bun run e2e`
Expected: PASS. The test count drops (the HTML ones are gone) and coverage rises.

- [ ] **Step 7: Commit**

```bash
git status --short
git add -- apps/api/src/web apps/api/src/shared/http apps/api/tests apps/api/package.json \
        package.json scripts public bun.lock
git commit -m "refactor: remove the Eta SSR"
```

---

### Task 34: Dockerfile, README and environment

**Files:**
- Modify: `infra/Dockerfile`, `.dockerignore`, `README.md`, `.env.example`

- [ ] **Step 1: `infra/Dockerfile` in two stages**

The first installs and runs `bun run build:web`; the second copies the `dist` and the API code. One
image, tag = commit hash — I19 intact. `FRONT_PATH` points at wherever the `dist` was copied.

- [ ] **Step 2: Rewrite the README's "Getting it running" section**

```bash
cp .env.example .env
docker compose up -d database
bun install
bun run migrate
bun run seed
bun run dev          # API on :3000 and the front on :5173
```

`bun run build:assets` leaves the list. The command table gains `dev:web`, `build:web` and `e2e`.
The `cp` still comes before `docker compose`: it is from `.env` that the `COMPOSE_FILE` pointing at
`infra/docker-compose.yml` comes. Swapping the two brings back `no configuration file provided`.

- [ ] **Step 3: Document the three Cloudflare variables**

A new subsection, "Publishing the front separately", explaining that the three variables are the whole
path and that the premise is a subdomain of the same registrable domain.

- [ ] **Step 4: Check the image builds**

Run: `docker build -f infra/Dockerfile -t escolaviva:test . && docker run --rm escolaviva:test bun --version`
Expected: the build completes with no error. The trailing `.` is the context and has to be the root —
it is where `apps/`, `migrations/` and `scripts/` come from, and where the `.dockerignore` the build
reads lives.

- [ ] **Step 5: Commit**

```bash
git status --short
git add infra/Dockerfile .dockerignore README.md .env.example
git commit -m "docs: commands, a two-stage image and the publication variables"
```

---

### Task 35: ADRs and teaching material

**Files:**
- Create: `docs/ADR/0007-spa-and-versioned-api.md`, `docs/ADR/0008-front-origin-as-configuration.md`
- Modify: `docs/ESCOLAVIVA_STAGE_01.md`, `docs/SAAS_EVOLUTION.md`

**Context:** this is the task the user explicitly approved when they chose "total replacement + updated
docs". Without it the repository contradicts its own material.

- [ ] **Step 1: Write ADR 0007**

In the format of the existing ADRs. Context: the request for an SPA. Decision: total replacement.
**Consequences, unvarnished** — two build artefacts, an API to version, validation in two layers, CSRF
the form did not require, and the guardian portal starting to download JavaScript before the report
card. What was rejected alongside and why: React SSR (rent without pain), a token on the client (would
break I2), a response envelope (`Result<T>` already solves it).

- [ ] **Step 2: Write ADR 0008**

I23, the three variables, and the explicit premise: the front and the API on **subdomains of the same
registrable domain**. Leaving that premise is a new decision, not a variable tweak — with a different
domain, `SameSite=Lax` stops serving and the design changes.

- [ ] **Step 3: Fix `docs/ESCOLAVIVA_STAGE_01.md`**

- the sentence in Section 3 ("Server-rendered HTML, no SPA and no public API to version") becomes the
  decision with its cost stated, pointing at ADR 0007;
- the invariants table gains the **I23** row;
- the **I2, I4, I10, I11 and I22** rows gain a note on how the mechanism changed;
- the opening numbers (55 schools, 18 thousand students, two people, one server) **do not change**: the
  scale is the same, and it is what holds up the rest of the argument.

- [ ] **Step 4: Fix `docs/SAAS_EVOLUTION.md`**

The Web Client catalogue lists "adopting an SPA by default" as a trap. The trap is still real — what
changes is the distinction: adopting **by default** is a trap; adopting **with the cost measured and
recorded** is a decision. The line "a separate SPA doubles deploys and forces you to create a versioned
public API" stays as it is: it was right, and this stage paid exactly that price.

- [ ] **Step 5: Commit**

```bash
git status --short
git add docs/ADR/0007-spa-and-versioned-api.md \
        docs/ADR/0008-front-origin-as-configuration.md \
        docs/ESCOLAVIVA_STAGE_01.md docs/SAAS_EVOLUTION.md
git commit -m "docs: record the SPA decision and invariant I23"
```

---

### Task 36: Diagrams

**Files:**
- Modify: `docs/archify/01-architecture.*`, `03-write-request.*`, `06..09-*-journey.*`

Six of the ten diagrams describe the SSR architecture and have become wrong.

| Diagram | What changes |
|---|---|
| `01-architecture` | two artefacts: `apps/web` static and `apps/api`; the `/api/v1` boundary |
| `03-write-request` | POST-Redirect-GET becomes a JSON request with `Idempotency-Key`, and the response becomes a `201` with `Location` |
| `06-network-admin-journey` | React screens; the temporary password in the `201` body, without the invite cookie |
| `07-registrar-journey` | React screens; forms on their own page still |
| `08-teacher-journey` | the grid as a `PUT`; the closing wait stays explicit |
| `09-guardian-journey` | the board, with the mark-as-read button separate from opening |

The remaining four (`02-module-boundary`, `04-enrollment-lifecycle`, `05-term-closing`,
`10-data-flow`) describe the domain and **do not change** — which is the visual proof that the
migration did not touch a business rule.

- [ ] **Step 1: Regenerate the six `.json` and `.html` files**
- [ ] **Step 2: Confirm the four domain ones stay identical**

```bash
git status --short docs/archify
```
Expected: only the six expected files show up as modified.

- [ ] **Step 3: Commit**

```bash
git status --short
git add docs/archify/01-architecture.architecture.json docs/archify/01-architecture.html \
        docs/archify/03-write-request.sequence.json docs/archify/03-write-request.html \
        docs/archify/06-network-admin-journey.workflow.json docs/archify/06-network-admin-journey.html \
        docs/archify/07-registrar-journey.workflow.json docs/archify/07-registrar-journey.html \
        docs/archify/08-teacher-journey.workflow.json docs/archify/08-teacher-journey.html \
        docs/archify/09-guardian-journey.workflow.json docs/archify/09-guardian-journey.html
git commit -m "docs: diagrams with the two-artefact architecture"
```

---

## Final check

Before considering the plan complete:

**Behaviour**

- [ ] `bun run verify` green, coverage ≥ 80 % in both workspaces
- [ ] `bun run e2e` green across the four journeys
- [ ] `bun run build:web` within the guardian's 150 kB budget
- [ ] `docker build` completes and the image starts

**Invariants**

- [ ] **I2** — deleting the `session` row in the database drops access on the very next request
- [ ] **I4** — two `POST`s with the same `Idempotency-Key` produce one record
- [ ] **I10** — every file under `/assets/` has a hash in its name
- [ ] **I11** — `/api/*` with a session answers `private, no-store`; `index.html` answers `no-store`
- [ ] **I17** — the temporary password is neither in the log nor in `idempotent_request`
- [ ] **I22** — turning off the front's Zod lets no invalid write through
- [ ] **I23** — with `VITE_API_URL` and `ALLOWED_ORIGINS` filled in pointing at another port, the application keeps working with no code change

**Planted measurements**

- [ ] opening an announcement does not change `read_at`
- [ ] the board's rate is still the slice's, not the page's
- [ ] closing term 3 of the demo class group still refuses with the list of what is missing
- [ ] closing is still synchronous, with the wait visible

**Hygiene**

- [ ] no `console.log` under `apps/web/src`
- [ ] no file over 800 lines
- [ ] `grep -rn "eta" apps/api/src` does not find the template engine
- [ ] `bunx depcruise` passes, with the `contracts-without-dependencies` rule active
- [ ] `grep -rn "academics\|identity\|shared/db" apps/web/src` finds nothing
