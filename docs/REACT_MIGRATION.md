# React frontend and the backend as an API — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** replace the Eta-rendered HTML with a React 19 SPA served as static files, turning Hono into a versioned JSON API, without changing any business rule.

**Architecture:** the repository becomes two Bun workspaces — `apps/api` (today's four domain modules, plus a **new** `src/http/` folder that answers JSON under `/api/v1` created *beside* the existing `src/web/`, which keeps serving Eta until Task 33 deletes it) and `apps/web` (Vite + React, pure static). The session stays a signed cookie resolved in the database; idempotency moves from the form body to the `Idempotency-Key` header; the asset hash becomes Vite's. Three empty environment variables (`VITE_API_URL`, `ALLOWED_ORIGINS`, `COOKIE_DOMAIN`) make a future Cloudflare Pages publication a configuration change.

**Tech Stack:** Bun · TypeScript · Hono 4 · PostgreSQL 16 via `Bun.sql` · Zod 4 · `bun:test` · React 19 · Vite 7 · React Router 7 · Mantine 8 · TanStack Query 5 · React Hook Form 7 · Zustand 5 · Axios 1 · Vitest 4 · MSW 2 · Playwright

## Global Constraints

They apply to **every** task. Not repeated in the individual tasks.

- **Language:** every identifier, file name and folder name in **English**. Screen text and messages the end user reads stay in **Brazilian Portuguese**, with correct accents. This applies equally in `.ts`, `.tsx` and `.css`. What this line used to say ("every identifier, comment, error message and screen text in Brazilian Portuguese") was revoked on 2026-08-16: the repository has been converted to English, and the canonical glossary is the source of truth for the terms.
- **No comments under `apps/api/src/` or `scripts/` — and the guard is a test, not a convention.** `tests/shared/no_comments.test.ts` fails on *every* comment in those two trees, `//` and `/* … */` alike (JSDoc included). The only tolerated text is the `magic-values: allowed — <reason>` directive, and the repository satisfies the rule today with **zero** comment lines across its 108 server `.ts` files. So the `/** … */` blocks **and the `//` lines** in this plan's **server** code samples are the plan explaining itself to *you*: **strip them when you paste the code in**, and let the "why" live in the task prose, in the commit message and in the names — that is the decision this codebase already made. Under `apps/web/src/` the guard does not reach, so comments there are allowed and welcome; that asymmetry is a deliberate decision, not an oversight. Task 1 must also repoint the guard, because after the move its `ROOT` becomes `apps/api`: `src` still resolves, `scripts` does not, and `Bun.Glob(...).scan()` over a missing directory throws `ENOENT` and takes the whole suite down at import time.
- **`bun run verify` green before any commit.** It is four sequential steps and nothing else: `bun run typecheck && bun run check && bun run magic && bun run test`. No lint, no formatter, and no CI — there is no `.github/` in this repository, so the local gate is the only gate. After Task 1 `typecheck` is **two** passes — the bare root `bunx tsc --noEmit`, which still owns `scripts/`, then `-p apps/api/tsconfig.json`, which owns `src/` and the suite. Neither alone is enough: a config pointed at `apps/api` never reads `scripts/`, and the root config with `include: ["scripts"]` reads zero test files and only 58 source files (Task 1, Step 4, measured). Task 17 appends the third, `-p apps/web/tsconfig.json`; `check` becomes two cruises, one per workspace, and `test` runs both suites. `references` between the two configs is not an option at any point — a referenced project must be `composite` and must not disable emit, and every config here is `noEmit`. Two things live outside the script and must not be forgotten: the API's coverage gate is in **`bunfig.toml`** (`coverageThreshold = { line = 0.8, function = 0.8 }` — project-wide in that table form, and with **no** branch threshold, unlike the `branches: 80` the Vitest config sets), and `bun test` cannot start at all unless `TEST_DATABASE_URL` is set and different from `DATABASE_URL`, because `tests/support/preload.ts` throws before the first test file loads. The measured baseline before Task 1 is **798 tests across 47 files**, exit 0 — when a task says "the same test count as before", it means exactly that pair of numbers.
- **Commit:** `git add` **explicit, file by file**. Never `git add -A`, `git add .`, `git add -u`, `git commit -a` or `-am`. Run `git status --short` first and confirm only that task's files are staged. This rule applies to sub-agents too.
- **Ask the user for authorisation before every commit and before any push.** Authorisation is scoped: "you may commit" does not authorise a push, and one authorised commit does not authorise the next.
- **Do not create a branch.** Work on the current branch.
- **No AI attribution** in commit messages.
- **Stage 01.** Nothing in this plan may anticipate a later-stage component — no queue, no cache, no contracted CDN, no e-mail delivery, no external service. The three Cloudflare variables are born **empty**.
- **CORS is a cookie problem before it is a configuration problem.** `ev_session` is set with `sameSite: 'Lax'` — a **hardcoded constant** in `shared/constants.ts`, not a config value — and with **no `Domain` attribute**. A genuinely cross-origin front (`apps/web` on one origin, the API on another) therefore never sends the cookie on XHR, and the API sees every request as anonymous however permissive `ALLOWED_ORIGINS` is. So the rule for this stage: while `ALLOWED_ORIGINS` is empty the deployment is **same-origin** — Hono serves `apps/web/dist` — and `SameSite=Lax` stays exactly as it is. The moment that variable is not empty, `SameSite` must become `None` **with** `Secure` (which forces HTTPS on the developer's machine too) and `COOKIE_DOMAIN` must be set; neither is a config-only change. The CORS middleware must also list `Content-Type`, `Idempotency-Key` and `X-Requested-By` in `Access-Control-Allow-Headers`, `X-Correlation-Id` and `Location` in `Access-Control-Expose-Headers` — without the second list the browser can read neither the trace id it is told to show on a failure nor the URL of the resource it just created — and set `credentials: true`. Note too that none of the nine variables the config schema accepts today is CORS-shaped, and the schema is not `.strict()`, so a misspelled new key is stripped in silence rather than refused.
- **No business rule changes.** `*/domain/`, `*/application/`, `*/infra/`, `migrations/` and the domain suites stay as they are, except for the Zod migration (Task 2) and the file paths (Task 1).
- **Do not loosen scope — and do not flatten the two statuses into one.** The rule is *wrong role → **403**, wrong scope → **404***. A record outside the schools where the person holds the role answers 404 because the existence of a student is already information; but `requireRole` really does answer 403, so "always 404, never 403" is false as stated. That rule is implemented today by **two different mechanisms**, and a JSON error layer that only catches thrown exceptions converts just one of them: the registrar routes `return notFound(c)` — a *rendered* response from a local helper, 13 call sites in `routes/registrar.ts` — while teacher, guardian and announcements `throw new NotFound(...)` and let `errorsMiddleware` map it. Two more responses never throw either: `requireRole` returns `c.html(errorPage(403), 403)` and `idempotencyMiddleware` returns `c.html(errorPage(400), 400)`. Each of those must be converted by hand, or the JSON API leaks HTML pages. One documented exception must survive the port **unchanged**: `POST /registrar/guardians` answers an out-of-scope `schoolId` with the field error `guardianSchoolRequired`, not a 404. State the rule uniformly and you either tighten that form into a 404 or loosen the four writes that really do 404 on a body-supplied id (`POST /enrollments` on `studentId` and `classGroupId`, `POST /enrollments/:id/transfer` on `targetClassGroupId`, `POST /class-groups` on `schoolId`, `POST /announcements/new` on `schoolId`) — and a test written from the plan would then bless the regression. The URLs in that list are today's SSR ones; `POST /announcements/new` is the single case where the API does not keep the path, because Task 16 publishes to `POST /api/v1/announcements` (the `/new` suffix was an artefact of the HTML form, not of the resource). The 404 obligation travels with the route to its new URL — the path changed, the scope rule did not. Query-string **filters** behave differently again: an out-of-scope `?school=` or an unknown `?year=` is silently ignored and answers 200, never 404.
- **`ApplicationError`** is `{ field?: string; code: string; message: string }` in `apps/api/src/shared/result.ts`. Use `fieldFailure(field, code, message)` for an error anchored to a field. It is this array that travels to React Hook Form — no translator between the two ends. The front does **not** import it from there: `apps/api/src/http/contracts/errors.ts` (Task 8) restates `ApplicationError` and `ErrorBody`, because `contracts/` is the only server folder `apps/web` may read.
- **Four front-side rules that hold in every screen of phases 3 and 4**, stated once here so no task has to repeat them: the filters and the page number live in the **URL** (`useSearchParams`), never in `useState` and never in Zustand; there are **no optimistic updates** — `useOptimistic` and a pre-emptive `setQueryData` are refused by name, because the wait is the evidence the later stages exist to answer; every `lazy()` element sits under a `<Suspense fallback={<Loading />}>` **and** an `<ErrorBoundary>` declared in the same file (P11), the only boundary component in this plan; and nothing ever logs, stores or asserts on a credential, a CPF or a contact detail — not in `localStorage`, not in a URL, not in a boundary that prints the props that crashed it.
- **Versions: pin the majors this plan was written against; let `bun.lock` record the patch.** Install with the major named — `react@19`, `react-dom@19`, `vite@7`, `react-router@7`, `@mantine/core@8`, `@tanstack/react-query@5`, `react-hook-form@7`, `@hookform/resolvers@5`, `zustand@5`, `axios@1`, `zod@4`, `vitest@4` — and **never** with a bare `@latest`. As of 2026-08-16 `@latest` resolves to Vite 8, React Router 8 and Mantine 9, three majors past what Tasks 17 through 32 assume: Vite 8 swaps esbuild for Oxc and Rollup for Rolldown (so `build.rollupOptions` becomes `build.rolldownOptions`), React Router 8 deletes the `react-router-dom` package outright and raises the floor to Node 22.22, and Mantine 9 moves `theme.defaultRadius` from `sm` to `md` and turns light-variant CSS variables solid — a visible change on every screenshot in the teaching material. Patch and minor upgrades **inside** a pinned major are fine and expected; a major bump is a separate decision with its own migration pass.
- **The front never imports the domain.** `apps/web` may only import from `apps/api/src/http/contracts/`, and nothing else. Importing `academics`, `identity` or `shared/db` from inside React is an architecture error, not a convenience. Know that **nothing enforces this automatically**: `bun run check` is `depcruise apps/api/src`, so the cruise never sees a file under `apps/web/`, and Task 8's `contracts-without-dependencies` rule guards the *opposite* direction (a contract importing something), not this one. **The decision is to make it a tool, not a habit:** Task 17 creates `apps/web/.dependency-cruiser.js` with a `forbidden` rule whose `from.path` is `^apps/web/src` and whose `to.path` is `^apps/api/src/(?!http/contracts/)`, and `check` becomes two cruises in sequence, one per workspace. A rule everyone believes is automated and is not is worse than no rule, and this is the one constraint in the plan that an ordinary convenience import breaks without anybody noticing. The same blind spot is worth checking for `bun run magic`, whose `TARGETS` are hardcoded root-relative globs (`src/**/*.ts`, `src/web/templates/**/*.eta`, four named scripts): after the move it keeps printing ✔ while it has silently stopped reading 153 of the 157 files it guards, because its empty-sweep failsafe only fires when the glob list matches literally nothing. `TARGETS` is not the only root-relative point in that file — `PRODUCT_MODULE` and `TEMPLATES_WHOSE_SCRIPT_BECOMES_HTML` are two more, and they fail differently (Task 1, Step 5).
- **Real validation stays in `*/application/` (I22).** The HTTP edge validates **shape** and answers 400; the application validates **rules** and answers 422; React's Zod validates **comfort** and decides nothing.

---

## Execution by multiple agents

36 tasks across 7 phases. The odd phases are deliberately narrow — they define the contract, and a contract written by two hands at once diverges. Phases 2, 4, 5 and 6 open into fronts whose files do not touch.

### Dependency graph

```text
PHASE 0   T1 ──▶ T2
                  │
PHASE 1           └▶ T3 ─▶ T4 ─▶ T5 ─▶ T6 ─▶ T7 ─▶ T8 ─▶ T9
                                                           │
PHASE 2   ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┘
          T10    T11    T12    T13    T14    T15    T16      (7 parallel fronts)
          └──────┴──────┴──────┴──────┴──────┴──────┘
                                                    │
PHASE 3   T17 ─▶ T18 ─▶ T19 ─▶ T20 ─▶ T21 ─▶ T22 ◀──┘
                                               │
PHASE 4   ┌──────┬──────┬──────┬──────┬──────┬─┘
          T23    T24    T25    T26    T27    T28              (6 parallel fronts)
          └──────┴──────┴──────┴──────┴──────┴─┘
                                               │
PHASE 5   T29 ─▶ (T30 ‖ T31 ‖ T32)
                           │
PHASE 6   T33 ─▶ (T34 ‖ T35 ‖ T36)
```

`T18` (formatters) depends on `T17` only through `package.json`; the orchestrator may run it in parallel with `T19`.

### File ownership per front

While a parallel phase is in flight, **no front writes outside its own row**. Three files are shared and nobody edits them freely: `api/src/http/routes/api.ts` takes exactly the **one** `api.route(...)` line each phase-2 front registers, at the point the file marks; `web/src/features/registrar/routes.tsx` belongs to Task 24 alone (see its note); and `package.json` and `web/src/app/routes.tsx` are touched only by the phase's closing task. `api/src/http/contracts/shared.ts` is read-only for the whole of phase 2 — it is written once, as an addendum to Task 8.

| Front | Phase 2 writes in | Phase 4 writes in |
|---|---|---|
| Options | `api/src/http/routes/options.ts` · `contracts/options.ts` · `presenters/options.ts` · `tests/api/options.test.ts` | — |
| Network | `api/src/http/routes/network.ts` · `contracts/network.ts` · `schemas/network.ts` · `presenters/network.ts` · `tests/api/network.test.ts` | `web/src/features/network/**` |
| Registrar A | `.../routes/registrar/students.ts` · `contracts/students.ts` · `schemas/students.ts` · `presenters/students.ts` · `tests/api/registrar_students.test.ts` | `web/src/features/registrar/students/**` · `.../guardians/**` · `.../registrar/Dashboard.tsx` · `.../registrar/routes.tsx` |
| Registrar B | `.../routes/registrar/classGroups.ts` · `contracts/classGroups.ts` · `schemas/classGroups.ts` · `presenters/classGroups.ts` · `tests/api/registrar_class_groups.test.ts` | `web/src/features/registrar/class-groups/**` · `.../subjects/**` |
| Teacher | `.../routes/teacher.ts` · `contracts/teacher.ts` · `schemas/teacher.ts` · `presenters/teacher.ts` · `tests/api/teacher.test.ts` | `web/src/features/teacher/**` |
| Guardian | `.../routes/guardian.ts` · `contracts/guardian.ts` · `presenters/guardian.ts` · `tests/api/guardian.test.ts` | `web/src/features/guardian/**` |
| Announcements | `.../routes/announcements.ts` · `contracts/announcements.ts` · `schemas/announcements.ts` · `presenters/announcements.ts` · `tests/api/announcements.test.ts` | `web/src/features/announcements/**` |

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
| `apps/api/src/http/response.ts` | `errorBody` and `created` **only** (Task 4). `pageAsJson` lives in `presenters/page.ts` and `parse` in `schemas/parse.ts`, both created by Task 8 |
| `apps/api/src/http/contracts/*.ts` | response types and enumerations; **no imports at all**. `contracts/errors.ts` restates `ApplicationError` and `ErrorBody` for the same reason `enumerations.ts` restates the closed sets — the front may import nothing else, and `shared/result.ts` is not a contract |
| `apps/api/src/http/schemas/*.ts` | request-body Zod, per resource |
| `apps/api/src/http/presenters/*.ts` | domain → response JSON object |
| `apps/api/src/http/routes/session.ts` | sign in, sign out, who am I |
| `apps/web/src/shared/api/client.ts` | the system's single Axios instance |
| `apps/web/src/shared/api/error.ts` | `ApiError` and `applyErrors` |
| `apps/web/src/shared/theme/theme.ts` | the theme built with **`createTheme({...})`** — Mantine's documented constructor; a bare `MantineThemeOverride` annotation gives no inference on nested keys — derived from `app.css`. It must set `defaultRadius: 0`: the sheet sets `border-radius: 0` on every input, select, textarea and `.button` as a deliberate design decision, and Mantine's default is rounded. The 19 palette tokens are **OKLCH** and have to be converted into the 10-shade hex arrays Mantine expects, and the semantic ink/background couples (`--success-ink` on `--success-background`, and the same for warning and danger) do not map onto a single Mantine colour scale — they are pairs used by `.tag` and `.notice` |
| `apps/web/src/shared/format/*.ts` | formatters ported from `render.ts` |
| `apps/web/src/app/routes.tsx` | the React Router tree, with today's URLs |
| `apps/web/src/app/guards.tsx` | `RequireLogin`, `RequireRole`, `initialDashboard` |
| `apps/web/src/features/**` | one folder per subject, self-contained |
| `e2e/*.spec.ts` · `e2e/support.ts` · `playwright.config.ts` (repository **root**, not inside `e2e/`) | the four journeys and the `signInAs` helper |
| `apps/api/tsconfig.json` · `apps/web/tsconfig.json` | one per workspace; the root one keeps a real `include: ["scripts"]` and **no `references`** — a referenced project cannot be both `composite` and `noEmit` (Task 1, Step 4). **Not** `{ "files": [] }` either: `scripts/` stays at the repository root and would stop being typechecked. Each workspace config is reached by its own `-p` pass instead. `compilerOptions.types` is `["bun"]`, not `["bun-types"]`: workspaces make Bun install in isolated mode and `bun-types` leaves the top-level `node_modules` |
| `apps/web/src/main.tsx` | the entry point. It **must** `import '@mantine/core/styles.css'` — plus `@mantine/dates/styles.css` and `@mantine/notifications/styles.css` for the packages Task 17 installs. Without those imports Mantine renders unstyled, and no task elsewhere in this plan mentions them |
| `apps/web/src/vite-env.d.ts` | types `import.meta.env.VITE_API_URL` by augmenting `ImportMetaEnv` and `ImportMeta`. The file must contain **no** `import` statement, or the augmentation silently stops applying and the value stays untyped |
| `apps/web/postcss.config.cjs` | Mantine's documented PostCSS setup — `postcss-preset-mantine` plus `postcss-simple-vars` carrying the five `mantine-breakpoint-*` variables. This is the arrangement the preset's mixin resolution is tested against; inlining the plugins into `vite.config.ts` diverges from it |
| `apps/web/src/testSetup.ts` · `apps/web/src/testSupport.tsx` | the MSW server, and `renderWithProviders` / `renderRoutes`. There is no `testRender.tsx`: `testSupport.tsx` is the single name every front test imports |
| `apps/web/src/shared/api/pageParams.ts` | the front's copy of the six page-parameter names (`p`, `pGuardians`, `pEnrollments`, `pSubjects`, `pUnread`, `pRead`) and of `requestedPage`. They cannot be imported from the server — `web/constants.ts` is not a contract and dies in Task 33 — and they may not be retyped per screen |
| `apps/web/src/shared/ui/ErrorBoundary.tsx` | a class boundary with `static getDerivedStateFromError`, `componentDidCatch` for logging (redacted — never the form values) and a "Tentar de novo" button that clears the error state. **One above the router outlet and one inside each lazy role bundle**, so one role's crash cannot blank the shell. The plan has none today, and the compound-component guards it also asks for are deliberate render-time throws |
| `apps/web/src/shared/ui/Loading.tsx` | the fallback every `lazy()` route element sits under. Each `lazy(() => import(...))` and its `<Suspense fallback={<Loading />}>` are declared in the same file; a lazy element with no Suspense boundary above it throws on the first navigation to that role |

### Moved

| From | To |
|---|---|
| `src/{identity,academics,assessment,communication,shared}/` | `apps/api/src/…` |
| — | **`public/` does not move**, and two files under `src/web/` reach for it with `import.meta.dir`: `app.ts` (`PUBLIC_DIR`) and `render.ts` (`ROOT`, behind `MANIFEST_PATH`). They are the only points inside `src/` that Task 1 has to edit, and getting them wrong is invisible to the whole suite — see Task 1, Step 5 |
| `src/main.ts` | `apps/api/src/main.ts` |
| `src/web/` — the whole folder: `app.ts`, `constants.ts`, `health.ts`, `pagination.ts`, `render.ts`, `routes/`, `templates/`, `public/` | `apps/api/src/web/…` — **no rename.** Task 1 is a bare `git mv src apps/api/src`, and Tasks 5, 9 and 33 all keep writing `apps/api/src/web/app.ts`. The JSON edge is **new** code created beside it in `apps/api/src/http/`. What dies in Task 33 is `templates/`, `render.ts`, `public/app.css` and the eight Eta routers; `app.ts`, `health.ts` and `pageFromQuery` in `pagination.ts` stay, because the JSON routes go on reading them |
| `tests/` | `apps/api/tests/` — **eight files inside compute a project root as `../..` and will then point at `apps/api/` instead of the repository root, and they need four levels, not three.** The eighth is `tests/support/paths.ts`, whose `existingPath` is called with paths from two different roots at once; Task 1, Step 5 says how that is settled. Three further files anchor at `../..` and must be left alone, because their paths are `src/…` and `apps/api` + `src/…` is now right: `tests/web/template_has_file.test.ts`, `tests/shared/db.test.ts`, `tests/academics/limits.test.ts`. The one that kills the whole run is `tests/support/database.ts`, whose `MIGRATIONS_DIR` becomes `apps/api/migrations` (which will not exist — `migrations/` stays at the root), and `preload.ts` calls `prepareDatabase()` before any test file loads: all **798** tests die at boot, not a subset. The other seven: `tests/support/paths.ts` (backs `existingPath` for everybody else), `tests/shared/stage_document.test.ts` (`docs/` + `migrations/`), `tests/shared/migration_window.test.ts` (`migrations/`), `tests/shared/log.test.ts` (globs `src/**/*.ts`, `src/**/*.eta` **and** `migrations/*.sql` — the two `src/` ones are the only reason a test actually fails on this move), `tests/scripts/backup_and_restore.test.ts` (`scripts/*.sh`), `tests/shared/no_comments.test.ts` (scans `scripts/`) and `tests/web/checklist.test.ts` (`config/`, and it inherits `PROJECT_ROOT` from `tests/web/support.ts` rather than computing its own). Add `tests/web/script_that_becomes_html.test.ts` too: it symlinks `PROJECT_ROOT/node_modules`, which stays at the repository root under Bun workspaces. On Bun 1.3.12 a broken path fails loudly — both `Bun.Glob(...).scan({cwd})` and `Bun.file(...).text()` throw `ENOENT` — so this shows up as a total suite failure, not a silent skip |
| `config/.dependency-cruiser.js` | `apps/api/.dependency-cruiser.js` (leaves `config/` empty; remove the folder) |
| `tests/web/*.test.ts` | `apps/api/tests/api/*.test.ts` (rewritten across phases 1 and 2) |

### Removed at the end (Task 33)

Paths are the post-Task-1 ones, because Task 33 runs long after the move: `apps/api/src/web/templates/` (45 files) · `apps/api/src/web/render.ts` — which also holds `renderError(c, status, title, detail)` **and** the `registerErrorRenderer(...)` call that closes over Eta; deleting the machinery in `shared/http` without deleting this registration leaves a dangling import · `apps/api/src/web/public/app.css` · `apps/api/src/web/routes/routeMap.ts` · `apps/api/src/web/routes/invite.ts` · the eight Eta routers under `apps/api/src/web/routes/` · `scripts/build-assets.ts` · `scripts/golden.ts` · `public/` (manifest included) · `apps/api/tests/web/` (the 76 frozen screens included) · the `eta` dependency · `KEY_FIELD`, `FormBody` and the form `idempotencyMiddleware` in `shared/http/idempotency.ts` · `registerErrorRenderer`, `ErrorRenderer`, `errorPage`, `FALLBACK_PAGE`, the minimal page and `escapeHtml` in `shared/http/errors.ts` · `INVITE_COOKIE` in `web/constants.ts` and `storeInvite`/`takeInvite` in `web/routes/invite.ts`. What survives the same commit and is **not** on this list: `app.ts`, `health.ts` and `pagination.ts` trimmed to `pageFromQuery`, all three renamed into `apps/api/src/http/`.

Two of those are bigger than they look. `errorPage` is **not** exported from the `shared/http` barrel: `authorization.ts` (the 403) and `idempotency.ts` (the 400) import it straight from `./errors`, so both must lose their HTML branch in the same commit or the build breaks. And errors do not converge in one place — besides `errorsMiddleware` and the two direct `errorPage(...)` returns, there is `renderError` in the web layer (the 404 fallback, the two asset 404s, the role-less-account 403 and several route files) and the hand-rolled `app.onError` in `web/app.ts`, which re-invokes `errorsMiddleware` and falls back to `c.text(UNEXPECTED_ERROR_TEXT, 500)`. Four touchpoints, not one.

---

## Implementation Patterns

Every parallel-phase task uses these patterns. They live here, rather than inside a task, because the tasks are read out of order and by different agents. **Read this section before any task in phases 2 and 4.**

### P1 — Paginated read route

`pageFromQuery(c)` reads the `p` query parameter by default, but pagination here is not one pattern and the parameter names are part of the contract. Three screens carry **two independent cursors**, because advancing one table must not move the other: `pGuardians` + `pEnrollments` on the student record, `pSubjects` + `pEnrollments` on the class group, `pUnread` + `pRead` on the guardian board. Pass the name explicitly — `pageFromQuery(c, PARAMS.guardiansPage)` — and keep the six names verbatim. Two of the fourteen paginated lists are not database-paginated at all and use `sliceItems` over an array already in memory (the registrar dashboard slices the session's own role assignments; the student record slices already-materialised guardian contacts); one is pinned to page 1 by a literal (the guardian dashboard's unread block); and `GET /registrar/students` returns a hard-coded empty page when `q` is blank, never touching the database. Port each of those as it is — turning any of them into a database page is a behaviour change dressed as a refactor.

```ts
registrarRoutes.get('/guardians', async (c) => {
  const page = await identity.usersPage(
    currentNetwork(c),
    pageFromQuery(c),
    DEFAULT_PAGE_SIZE,
    ROLE.guardian,
  );
  return c.json(pageAsJson(page, guardianAsJson));
});
```

### P2 — Write route

```ts
registrarRoutes.post('/students', async (c) => {
  const input = parse(studentSchema, c.get('body'));
  if (!input.ok) return c.json(errorBody(input.errors), 400);

  const result = await academics.registerStudent({ networkId: currentNetwork(c), ...input.value });
  if (!result.ok) return c.json(errorBody(result.errors), 422);

  return created(c, `/api/v1/registrar/students/${result.value.id}`, { id: result.value.id });
});
```

The edge validates **shape** and answers 400; the use case decides the **rules** and answers 422 (I22). The two comments this block used to carry were moved into this sentence on purpose — `tests/shared/no_comments.test.ts` fails on any `//` or `/* … */` inside `apps/api/src/`, so the block above is paste-ready exactly as it stands. And note the accessor: `Result<T>` is `{ ok: true; value: T } | { ok: false; errors: ApplicationError[] }`. It is `.value`, never `.valor`, and `.errors`, never `.erros`.

`created` writes the `Location` header, and it is from there that the idempotency middleware takes what it stores in `response_location`. A write that answers 201 without a `Location` breaks I4 silently.

Read that against the middleware that exists **today** before you trust it. The current `idempotencyMiddleware` keeps the key only when `isRedirect(c.res.status)` — `status >= 300 && status < 400` — so a `201 Created` with a perfectly good `Location` *releases* the key, and the second tap creates a second record. `jsonIdempotencyMiddleware` (Task 5) is what changes the test to `location === null || c.res.status >= 400`; until that task lands, the sentence above describes an intention, not the code. Two more facts from the same file: a replay answers a `303` to the stored location (falling back to the hard-coded `/dashboard` when it is still empty) rather than a body, and the middleware returns early for anonymous users — which is why `POST /login` was never key-protected and `POST /logout` never even had the middleware mounted.

And note what `parse(studentSchema, c.get('body'))` is standing on: `idempotencyMiddleware` is the **only** place in the codebase that parses a request body (`await c.req.parseBody()` into `c.set('body', …)`); there is no `c.req.json()` call anywhere today, and all nineteen POST handlers read `c.get(CONTEXT_VARIABLES.body)`. Moving the key to a header and moving the body to JSON are therefore **one** change, not two — Task 5 replaces the parser every write route depends on.

### P3 — Presenter

One per aggregate, in `presenters/`. It decides what goes out — never `...databaseRow`:

```ts
export const guardianAsJson = (guardian: UserSummary): GuardianInList => ({
  id: guardian.id,
  name: guardian.name,
  email: guardian.email,
  phone: guardian.phone,
  cpf: guardian.cpf,
});
```

The return type comes from `contracts/`, and it is what the front imports. Take the **argument** type from the module barrel, not from a name you wish existed: there is no `Guardian` aggregate in this codebase — a guardian is an `identity.UserSummary` that holds the `guardian` role in some school, reached through `student_guardian.user_id`, and `app_user` has no `guardian_id` column. Two more names to check before typing a presenter: `src/academics/index.ts` declares `Shift` and `TeacherClassGroupSubject` but does **not** re-export them (only the runtime value `SHIFTS` is exported), which is why `src/web/routes/teacher.ts` works around the gap with `type Assignment = Awaited<ReturnType<typeof academics.teacherClassGroupSubjects>>[number]`.

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
import { read, signIn, write } from '../web/support';

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
    const { errors } = await response.json();
    expect(errors[0].field).toBe('name');
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
| write | success · edge refusal (400 with `field`) · rule refusal (422 with `field`) · missing or malformed `Idempotency-Key` (400) · the **same** key twice creates one record and the repeat answers `{ repeated: true, location }` · no session (401) · wrong role (403) · target out of scope (404) |
| read | success · no session (401) · wrong role (403) · target out of scope (404) · `?p=` changes the page · `?p=999` answers **200 with the last page** — never an empty page, never a 404 |

Three things about that table are easy to get wrong:

- **Page size is not a request parameter.** `DEFAULT_PAGE_SIZE` is 10, it is a server-side default argument on the query functions, and no route reads `size`, `limit` or `per_page` today. Do not add one: there is no max-page-size guard to port because there is nothing to guard, and adding the parameter is new behaviour rather than a port.
- **An over-range cursor is not an error.** `queryPage` clamps to the last page and **re-runs the query** for it (two round trips in that case); `sliceItems` clamps the same way. A test that asserts an empty page or a 404 for `?p=999` is specifying a regression, not a contract.
- **401 and 403 are not always thrown.** For an anonymous request `rejectAnonymous` *redirects* on GET (`c.redirect('/login', 303)`) and only throws `Unauthorized` on non-GET; `requireRole` never throws at all — it renders an HTML 403 directly. The JSON edge must answer both with a body, so a test that only exercises the thrown path proves nothing about the two paths that actually leak HTML.

The helpers come from `apps/api/tests/web/support.ts`, where Task 8 adds `read`, `write` and `writeWithKey` beside the form ones. When Task 33 deletes `apps/api/tests/web/`, `support.ts` moves to `apps/api/tests/api/support.ts` together with `checklist.test.ts`, and the import above becomes `'./support'`.

### P6 — TanStack Query keys and queries

```ts
export const studentKeys = {
  root: ['registrar', 'students'] as const,
  search: (term: string, page: number) =>
    [...studentKeys.root, 'search', term, page] as const,
  record: (id: string) => [...studentKeys.root, 'record', id] as const,
};

export function useStudents(term: string, page: number) {
  return useQuery<Page<StudentInList>, ApiError>({
    queryKey: studentKeys.search(term, page),
    queryFn: ({ signal }) =>
      client
        .get<Page<StudentInList>>('/registrar/students', { params: { q: term, p: page }, signal })
        .then((response) => response.data),
    enabled: term !== '',
    placeholderData: keepPreviousData,
  });
}
```

Four decisions are packed in there:

- **`enabled: term !== ''`** reproduces the server: `GET /registrar/students` returns a hard-coded
  empty page when `q` is blank and never touches the database. **But `enabled: false` does not mean
  "loaded"**: a disabled query sits at `status: 'pending'` with `fetchStatus: 'idle'` for as long as
  it stays disabled. Guarding a screen with `query.isPending` therefore spins forever on the empty
  search. Guard with `query.isLoading` — which v5 defines as `isPending && isFetching` — and give the
  disabled case its own empty state ("Comece pela busca").
- **The error generic is not optional.** TanStack Query 5 types `TError` as `Error`, not `unknown`.
  `LoadFailed` is specified to show the `correlationId`, which only `ApiError` carries, so every query
  that feeds it declares `useQuery<TData, ApiError>` — otherwise the plan's own `tsc --noEmit` gate
  fails at the first screen.
- **`signal`** is handed to `queryFn` and Axios honours it. Without it, a term typed quickly leaves
  superseded requests in flight against a paginated endpoint.
- **`placeholderData: keepPreviousData`** is the v5 spelling of the old `keepPreviousData: true`, and
  the flag to read afterwards is `isPlaceholderData`, not `isPreviousData`. The table then does not
  flicker when the page changes: the previous one stays until the new one lands.

The key mirrors the URL (`q`, `p`), which is what makes the cache and the address bar agree.

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

No optimistic updates at this stage: the write is synchronous and the user waits. Hiding the wait would
hide the pain the later stages exist to solve.

That refusal has names, and they are refused **by name** so nobody "modernises" them back in:

- **`useOptimistic`** (React 19) — no. The whole point of Stage 01 is that a slow write *looks* slow;
  a stage that hides it removes the evidence the later stages exist to answer.
- **`useActionState`** (React 19, the renamed `useFormState`) — no. Forms go through react-hook-form
  plus a TanStack Query mutation, which is the only path where `applyErrors` can place a server error
  under the right field.
- **`use(promise)`** — no. It does not support a promise created during render, and the data layer
  here is TanStack Query.

One v5 asymmetry this snippet depends on: `onSuccess` / `onError` / `onSettled` were **removed from
queries** in TanStack Query 5 and **kept on mutations**. Invalidation belongs here, on the mutation;
a query that wants to react to its own result does it in render, not in a callback that no longer
exists.

### P8 — Form

```tsx
export function StudentForm() {
  const navigate = useNavigate();
  const { error: warn } = useNotices();
  const registration = useRegisterStudent();
  const { register, handleSubmit, setError, formState } = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const submit = handleSubmit(async (values) => {
    try {
      const { id } = await registration.mutateAsync(values);
      navigate(studentPath(id));
    } catch (error) {
      applyErrors(error, setError, warn, STUDENT_FIELDS);
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
      <Button type="submit" loading={registration.isPending}>Cadastrar</Button>
    </form>
  );
}
```

The `field` the API returns is the input's `name`: the error lands under the right field with no
translator between the two ends. Six rules make that true instead of merely hoped for:

- **`applyErrors` must know which fields the form has.** `setError` on a name that was never
  `register`ed attaches an error that **no input renders** — it fails silently. Pass the form's field
  list (`STUDENT_FIELDS`) and route anything outside it, and anything with no `field` at all, to
  `warn`. `ApplicationError.field` is optional: a root-level schema error omits the key entirely.
- **Every input renders its own error next to it.** No form shows a single combined list as its only
  channel; the server's summary block was a *second* rendering, never a replacement for the inline
  one, and the same holds here.
- **`mode: 'onSubmit'` + `reValidateMode: 'onChange'` are chosen, not inherited.** They are what makes
  a server error placed by `setError` clear the moment the person edits that field. `criteriaMode`
  stays `firstError`: one message per field, exactly what `field__error` showed.
- **The button follows the mutation, not the form.** `formState.isSubmitting` covers only the
  `handleSubmit` promise; `registration.isPending` is the request.
- **Zod 4 and the resolver.** `zodResolver`'s overloads are branded with Zod's minor version and fail
  to match against zod 4.3+ **at type level only** — runtime is fine, `tsc --noEmit` is not, and
  `tsc --noEmit` is a `verify` step. Pin the pair, or import `standardSchemaResolver` from
  `@hookform/resolvers/standard-schema`, which accepts the same Zod 4 schema.
- **React 19: `ref` is a plain prop.** Nothing in a shared input needs `forwardRef`; it is deprecated
  for new components and writing it is dead ceremony.

`useNotices()` here is not a store subscription: it is the wrapper over `@mantine/notifications` that
Task 21 defines, returning a stable object with `success`, `error` and `clear`. Destructuring it costs
nothing and triggers no re-render, which is why this form is safe where the same shape read from a
Zustand selector would not be — see the Zustand-5 `useShallow` rule stated in Task 21 for the day a
real store arrives.

And the privacy line that applies to every form in this plan: the password screens and the invitation
reveal handle credentials and CPF. They are never logged, never written to `localStorage`, never put
in a URL, and never asserted on by value in a test.

### P9 — List screen

A list screen is **only the table**, with the button that leads to the form on its own page. A write form never shares the page with the listing — that was decided and implemented in the current state, and the migration may not undo it.

```tsx
export function GuardianList() {
  const [params, setParams] = useSearchParams();
  const page = requestedPage(params.get(PAGE_PARAMS.default));
  const query = useGuardians(page);

  const goToPage = useCallback(
    (number: number) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (number <= 1) next.delete(PAGE_PARAMS.default);
          else next.set(PAGE_PARAMS.default, String(number));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  if (query.isLoading) return <Loading />;
  if (query.isError) return <LoadFailed error={query.error} />;
  if (query.data === undefined || query.data.total === 0) {
    return (
      <Empty
        title="Nenhum responsável cadastrado."
        text="Cadastre o primeiro responsável desta rede."
        action={{ href: '/registrar/guardians/new', text: 'Cadastrar responsável' }}
      />
    );
  }

  return (
    <>
      <Table columns={COLUMNS} rows={query.data.items} />
      <Pagination
        page={query.data.page}
        pages={query.data.pages}
        param={PAGE_PARAMS.default}
        onChange={goToPage}
      />
    </>
  );
}
```

`PAGE_PARAMS` and `requestedPage` come from `apps/web/src/shared/api/pageParams.ts` (Task 21), the
front's own copy of the six parameter names and of the server's clamping rule. They are **not**
importable from the server: `web/constants.ts` is not a contract, and it dies with the templates in
Task 33. `Empty` takes `title`, `text` and an optional `action` — the shape `_empty.eta` already has,
never a single `message` prop.

The page lives in the query string, not in component state: the third page stays a copyable address
and the back button keeps working without anyone programming it. Six rules come with that, and each
one is a behaviour the server already has:

- **Never `setParams({ p })`.** The object form *replaces* the whole query string — on
  `/registrar/students?q=ana` it would erase the search and reset the table. Always build from the
  current params.
- **Page 1 deletes the parameter.** `src/web/pagination.ts` does exactly this today, so
  `/registrar/guardians` and `/registrar/guardians?p=1` are the same address. A React version that
  writes `p=1` creates a second URL for one screen and breaks every frozen link.
- **The parameter name is an argument, not a constant `'p'`.** Three screens paginate two tables at
  once — `pGuardians` + `pEnrollments`, `pSubjects` + `pEnrollments`, `pUnread` + `pRead` — and a
  single global page state moves both. The guardian dashboard's unread block is pinned to page 1 by a
  literal and takes no parameter at all.
- **`requestedPage` clamps.** `Number(params.get('p') ?? 1)` is `NaN` for `?p=abc`; the shared
  `requestedPage` coerces anything non-finite to 1 and floors at 1, which is what the server does.
  And `?p=999` returns the **last** page with HTTP 200 — the server clamps and re-queries — never an
  empty page and never a 404.
- **`isLoading`, not `isPending`.** A query disabled by P6's `enabled` stays `pending` forever;
  `isLoading` is `isPending && isFetching` and is the guard that actually resolves. The `data ===
  undefined` branch then covers the disabled case with the screen's own empty state.
- **`onChange` is stable.** `useCallback` keeps one reference across renders so `Pagination` can be a
  memoised sibling; an inline arrow makes it re-render on every keystroke in the search box and buys
  nothing.

**Virtualization: no, and this is the decision, not an omission.** Every list in this system is
server-paginated at ten rows, so `@tanstack/react-virtual` would be a new dependency solving a problem
the data model already solved — and it would spend bytes from the bundle ceiling. Virtualize only a
list that renders an unbounded number of rows at once; none exists here.

`Table` and `Pagination` are **siblings that take `children` and props**, never a base component that
variants extend. If they ever come to share state, it travels through a private context and each part
throws a named error when rendered outside its provider — the same guard the rest of the shared
components use.

### P10 — Front test

```tsx
import { expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../testSetup';
import { renderWithProviders } from '../../../testSupport';

test('a field error coming from the API appears under the field', async () => {
  server.use(
    http.post('*/api/v1/registrar/students', () =>
      HttpResponse.json(
        {
          errors: [{ field: 'name', code: 'name_in_use', message: 'Já existe um aluno com este nome.' }],
          correlationId: 'teste',
        },
        { status: 422 },
      ),
    ),
  );
  const { user } = renderWithProviders(<StudentForm />);

  await user.type(screen.getByLabelText('Nome'), 'Ana Souza');
  await user.type(screen.getByLabelText('Data de nascimento'), '2015-03-11');
  await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

  expect(await screen.findByText('Já existe um aluno com este nome.')).toBeVisible();
});
```

Four things this file assumes and every front test repeats:

- **`userEvent.setup()` before `render`.** The direct `userEvent.type(...)` form is a v13 migration
  affordance: it builds a fresh instance per call and is the idiom that trips over Mantine's overlays
  and pointer-events checks. `renderWithProviders` already calls `setup()` before rendering and hands
  the instance back, so **destructure `user` from its return** rather than calling `setup()` again.
  One `user` per test.
- **`renderWithProviders`, not `render`.** It wraps MantineProvider (with the theme), a
  QueryClientProvider whose client is fresh per test and configured `retry: false`, a `Suspense`
  boundary and a `MemoryRouter`. It is created in Task 17 and lives in `apps/web/src/testSupport.tsx`
  — there is no `testRender.tsx`; nothing imports bare `render`. Anything that exercises the **data**
  router (a route-level `errorElement`, the `router.navigate` fired from outside React on a 401) uses
  `renderRoutes` from the same file instead.
- **`toBeVisible` comes from jest-dom.** `import '@testing-library/jest-dom/vitest'` goes in the
  Vitest setup file, once, or every assertion of this shape is a type error and a runtime failure.
- **MSW handlers reset between tests** (`server.resetHandlers()` in `afterEach`), otherwise the 422
  above leaks into the next case.

And the privacy rule, which the fixtures must respect: synthetic data only — no real CPF, no real
contact detail, and no test that asserts on a password by value or prints one on failure.

### P11 — Boundaries: one for loading, one for failing

Every `lazy()` route element sits under a `Suspense` boundary **declared in the same file as the lazy
import**, and every role area sits under an error boundary of its own. Neither is optional: a lazy
element with no boundary above it throws on first navigation, and a render-time throw with no boundary
blanks the entire application — including the deliberate throws the compound-component and context
guards prescribe.

There is exactly **one** boundary component in this plan and its name is `ErrorBoundary`, at
`apps/web/src/shared/ui/ErrorBoundary.tsx`, created by Task 21. It is not `AreaErrorBoundary` and not
`FeatureBoundary`; three names for one file is how two fronts end up writing it twice.

```tsx
const Registrar = lazy(() => import('../features/registrar/routes'));

export function RegistrarRoute() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Registrar />
      </Suspense>
    </ErrorBoundary>
  );
}
```

```tsx
type BoundaryState = { readonly failure: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failure: null };

  static getDerivedStateFromError(failure: Error): BoundaryState {
    return { failure };
  }

  componentDidCatch(failure: Error, info: ErrorInfo): void {
    reportRenderFailure(failure, info);
  }

  render(): ReactNode {
    if (this.state.failure === null) return this.props.children;
    return (
      <LoadFailed
        error={this.state.failure}
        onRetry={() => this.setState({ failure: null })}
      />
    );
  }
}
```

Where they go:

- **One boundary above the router outlet**, so a crash in the shell still renders something the person
  can act on;
- **one inside each lazy role bundle**, so a crash in the teacher screens cannot blank the guardian's
  session;
- the fallback is the shared `Loading`, never `null` — a `null` fallback is a blank screen with no
  explanation, which is exactly what the boundaries exist to prevent;
- the retry resets `failure` and re-renders; it does not reload the page, because reloading loses the
  query cache and the address.

`reportRenderFailure` writes to the console with the same **redaction** rule the server log has: no
credential, no CPF, no contact detail, no request or response body. A boundary that prints the props
that crashed it is a leak with a friendly face.

---

## PHASE 0 — Foundation

Nothing here changes behaviour. Two mechanical tasks that have to be green before anything else,
because debugging a file-path change alongside an HTTP-contract change is debugging two things at
once.

### Task 1: Workspaces and moving `src/` to `apps/api/`

> **Executed on 2026-08-16.** `bun run verify` at 798 tests across 47 files, exit 0 — the measured
> baseline, unchanged. The steps below were rewritten after the run: sixteen points did not survive
> contact with the repository, and the corrections are called out inline so Task 17, which repeats
> the same per-workspace `tsconfig` pattern, does not inherit them.
>
> **The two worst ones were invisible to the suite.** Moving `src/` broke the stylesheet — every
> `/public/*.css` request started answering 404 and every page started linking a hashless
> `app.css` — and all 798 tests stayed green, because the one assertion that looks at that URL
> checks only its `Cache-Control` and the 76 frozen screens normalize the hash away with an optional
> capture group. Both nets were tightened in this task. The Dockerfile shipped a second invisible
> regression: an image that builds clean and dies on its first import. Read "a green `verify` is not
> enough" in Step 6 before treating any later task as finished.

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Modify: `package.json`, `tsconfig.json`, `bunfig.toml`, `infra/Dockerfile`, `.dockerignore`
- Move: `src/` → `apps/api/src/`, `tests/` → `apps/api/tests/`, `config/.dependency-cruiser.js` → `apps/api/.dependency-cruiser.js`

> `.dockerignore` stays at the root even with the Dockerfile in `infra/`: Docker looks for it at the
> root of the build context, not next to the Dockerfile. See "Where everything lives" in the README.

**Interfaces:**
- Produces: a root where `bun run verify`, `bun run dev:api`, `bun run migrate` and `bun run seed` work from the new paths. Every later task assumes `apps/api/src/…`.

- [x] **Step 1: Move the tree with `git mv`, preserving history**

```bash
mkdir -p apps/api
git mv src apps/api/src
git mv tests apps/api/tests
git mv config/.dependency-cruiser.js apps/api/.dependency-cruiser.js
rmdir config
```

- [x] **Step 2: Create `apps/api/package.json`**

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

- [x] **Step 3: Rewrite the root `package.json`**

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
    "golden": "bun scripts/golden.ts",
    "check": "bunx depcruise apps/api/src --config apps/api/.dependency-cruiser.js",
    "magic": "bun scripts/magic-values.ts",
    "typecheck": "bunx tsc --noEmit && bunx tsc --noEmit -p apps/api/tsconfig.json",
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

`golden` stays. `scripts/golden.ts` still exists, the README still documents it, and the 76 frozen
screens under `tests/web/golden/` are the only guard on the SSR output while phases 1 to 5 keep it
alive. It dies with the templates in Task 33, not here — dropping the entry point while the script and
its fixtures remain leaves a broken command with no task to fix it. `typecheck` becomes **two passes**
for the reason measured in Step 4.

- [x] **Step 4: Create `apps/api/tsconfig.json` and slim down the root one**

`apps/api/tsconfig.json` receives the content of today's `tsconfig.json`, with `include` pointing at
`src` and `tests`, and with **one change to `compilerOptions`**: `"types": ["bun-types"]` becomes
`"types": ["bun"]`. Declaring `workspaces` switches Bun from a hoisted install to an isolated one, and
`bun-types` — a transitive dependency of `@types/bun`, never a direct one — leaves the top-level
`node_modules` for `node_modules/.bun/`. `tsc` then answers `TS2688: Cannot find type definition file
for 'bun-types'` and every step after this one fails for a reason that has nothing to do with the move.
`@types/bun` stays at the top level, so `["bun"]` resolves.

The root one keeps a real `include` for what stays at the root:

```json
{
  "extends": "./apps/api/tsconfig.json",
  "include": ["scripts"]
}
```

**No `references`.** `"references": [{ "path": "apps/api" }]` does not compile: a referenced project
must set `composite: true` (`TS6306`) and may not disable emit (`TS6310`), and `apps/api/tsconfig.json`
is `noEmit` by design. The two settings exclude each other. Nothing is lost — `typecheck` never calls
`tsc --build`, so the reference would carry no weight even if it were accepted.

**Why `typecheck` is two passes and not one.** `scripts/` does not move: it stays at the repository
root, imports `../apps/api/src/…` in 15 places, and contains the 1529-line magic-values checker — all
of it typechecked today by the root `include: ["src", "scripts", "tests"]`. A bare `tsc --noEmit -p
apps/api` never looks at `scripts/` at all. But the mirror image is just as bad, and it is the one
that is easy to miss: with `include: ["scripts"]`, the root pass reads **zero** test files and only
**58** of the source files — the ones `scripts/` happens to reach through an import. That is measured,
not estimated (`tsc --noEmit --listFiles | grep -c apps/api/tests/` → 0). So the script runs the root
config **and** `-p apps/api/tsconfig.json`, and the union is exactly what the baseline covered:

```json
"typecheck": "bunx tsc --noEmit && bunx tsc --noEmit -p apps/api/tsconfig.json"
```

From Task 17 the web workspace joins with its own `tsconfig.json` and a third pass is appended — which
is what Global Constraint "`tsc --noEmit` in both workspaces" already promises.

- [x] **Step 5: Fix the paths left behind**

Points that reference `src/` and are not resolved by `git mv`.

**The arithmetic first, because the plan got it wrong twice.** A test file at `apps/api/tests/web/`
is **four** segments deep, so `..` four times reaches the repository root — not two, not three. Every
row below that says "anchor at the repository root" means `'..', '..', '..', '..'`.

**And the second rule: not every anchor moves.** A file whose anchor is `../..` *and* whose paths are
`src/…` is already correct after the move, because `apps/api/tests/x` → `../..` is `apps/api`, and
`apps/api` + `src/…` is where the code now lives. Three files are in that position and must be left
alone: `tests/web/template_has_file.test.ts`, `tests/shared/db.test.ts` and
`tests/academics/limits.test.ts`. "Fixing" them breaks them.

| File | What changes |
|---|---|
| `bunfig.toml` | `preload` → `apps/api/tests/support/preload.ts` |
| `apps/api/.dependency-cruiser.js` | **nine** `^src/` occurrences across eight lines (one line carries two) → `^apps/api/src/`. Counting five leaves four unmigrated, and a rule whose regex matches nothing exits 0. **`options.tsConfig.fileName` stays `'tsconfig.json'`** — the root one. dependency-cruiser resolves that config's `include` against the **cwd**, not against the config file's own directory, so pointing it at `apps/api/tsconfig.json` turns `["src","tests"]` into `raiz/src` and `raiz/tests`, neither of which exists, and `check` dies with `TS18003: No inputs were found`. The root config `extends` the api one, so the compilerOptions are identical either way |
| `scripts/magic-values.ts` | **three** root-relative points, not one. (a) `TARGETS`: `src/**/*.ts` → `apps/api/src/**/*.ts`, `src/web/templates/**/*.eta` → `apps/api/src/web/templates/**/*.eta`. (b) `PRODUCT_MODULE = 'src/'` → `'apps/api/src/'`, the prefix two whole rules test with `file.startsWith(...)`. (c) `TEMPLATES_WHOSE_SCRIPT_BECOMES_HTML`, one hardcoded `.eta` path. **`TARGETS` fails open**: the empty-sweep failsafe trips only when the whole glob list matches nothing, and the four individually named `scripts/*.ts` still match — so leaving it alone drops 153 of the 157 swept files and still prints ✔. `PRODUCT_MODULE` fails loudly instead, and in a way that reads as someone else's bug: the two rules stop firing, the six `magic-values: allowed` markers in the templates are left silencing nothing, and the checker reports six **dead suppressions** |
| `scripts/build-assets.ts` | two points: the import of `../src/shared/constants`, counted in the `scripts/*.ts` row below, **and** `SOURCE = join(ROOT, 'src', 'web', 'public', 'app.css')` — a path literal, not an import, so no import rewrite reaches it |
| `apps/api/src/web/app.ts` · `apps/api/src/web/render.ts` | **`src/` is not exempt, and this is the row that cost the most.** The move is safe for imports because both trees travel together — but `public/` does **not** travel, and two files reach for it: `PUBLIC_DIR = join(import.meta.dir, '..', '..', ASSETS.directory)` in `app.ts`, and `ROOT` in `render.ts`, which backs `MANIFEST_PATH`. Both need four levels. Leave them and the application still boots, still answers every route, and still passes all 798 tests — while **every stylesheet request answers 404** and every rendered page links `/public/app.css`, hashless, because `readManifest` swallows the failure in a `catch` and `asset()` falls back to the logical name. Two silent regressions, zero red tests. Grep `import.meta.dir` under `apps/api/src/` before declaring this step done: those two are the whole list today |
| `apps/api/tests/web/golden.ts` | `VERSIONED_ASSET = /\/public\/app\.(?:[0-9a-f]{6,}\.)?css/g` makes the hash **optional**, so `/public/app.css` normalizes to the same `{{cssHash}}` marker as `/public/app.0b878f01.css`. That is why all 76 frozen screens stay green while the asset pipeline is broken. Make the group mandatory — `/\/public\/app\.[0-9a-f]{6,}\.css/g` — and the screens start noticing |
| `apps/api/tests/support/database.ts` | `MIGRATIONS_DIR = resolve(import.meta.dir, '..', '..', 'migrations')` must anchor at the repository root: `migrations/` does not move. `preload.ts` calls `prepareDatabase()` **before any test file loads**, so getting this wrong kills all 798 tests at boot, not a subset |
| `apps/api/tests/support/paths.ts` | the file the plan first forgot, and the one that resolves an outright conflict. `PROJECT_ROOT` here backs `existingPath`, which five call sites use with paths from **two different roots**: `docs/…` and `migrations/…` (repository root) against `src/web/…` (`apps/api`). One anchor cannot serve both. The decision: anchor `paths.ts` at the **repository root** and rewrite the three `src/`-relative call sites to `apps/api/src/…` — `tests/web/stylesheet.test.ts`, `tests/web/field_anchored_to_id.test.ts` and `tests/web/script_that_becomes_html.test.ts`. Those three also each keep their own `../..`, which becomes four levels |
| `apps/api/tests/shared/stage_document.test.ts` | reaches `docs/` **and** `migrations/` at the root |
| `apps/api/tests/shared/migration_window.test.ts` | reaches `migrations/` at the root |
| `apps/api/tests/shared/log.test.ts` | its `SOURCE_PATTERNS` is **three** globs, not one: `src/**/*.ts` and `src/**/*.eta` → `apps/api/src/…`, plus `migrations/*.sql` at the root. Miss the two `src/` ones and the denylist-anchoring case fails — the only test in the suite that breaks on this move. The file's own empty-sweep failsafe (`sources.length > 10_000`) does **not** catch it: the migrations alone clear 10 000 characters |
| `apps/api/tests/shared/no_comments.test.ts` | `ROOT` anchors at the repository root and `CODE_DIRECTORIES = ['src', 'scripts']` → `['apps/api/src', 'scripts']`; the `scripts/backup.sh` / `scripts/restore-test.sh` shebang assertions keep pointing at the root |
| `apps/api/tests/scripts/backup_and_restore.test.ts` | reaches `scripts/*.sh` at the root |
| `apps/api/tests/web/support.ts` | `PROJECT_ROOT` must keep resolving to the **repository root** — four levels up, not two — because `runProcess` runs root-level scripts; the two `import('./src/web/app.ts')` inside the spawned processes become `./apps/api/src/web/app.ts`. The static `import { app } from '../../src/web/app'` needs no change: both trees moved together |
| `apps/api/tests/web/checklist.test.ts` | **six** separate points, not five: (a) it spawns depcruise itself with `['x','depcruise','src','--config','config/.dependency-cruiser.js']` → `apps/api/src` and `apps/api/.dependency-cruiser.js`; (b) the 12 planted `VIOLATIONS` paths; (c) the module scan at `join(PROJECT_ROOT,'src')`; (d) the "no module writes a file" glob; (e) `runMain` spawns the entry point itself with `runProcess(['src/main.ts'], …)` → `apps/api/src/main.ts`, and without it the four "the process does not start" cases pass for the wrong reason; (f) the hardcoded `'/public/app.0b878f01.css'` assertion keeps its path — `app.css` does not change content, so `build-assets` republishes the same hash — but the assertion itself has to grow an `expect(response.status).toBe(200)`. It is billed as the only test that would notice a broken asset pipeline and it notices nothing: `cacheControlMiddleware` decides by URL prefix, before anyone knows whether the file is on disk, so a 404 answers `immutable` exactly like a 200. Add the status line and it becomes the net it was believed to be. If the config is re-anchored while the argv is not, depcruise matches nothing, exits 0, and all 12 "the rule brings the check down" cases fail |
| `apps/api/tests/web/script_that_becomes_html.test.ts` | symlinks `join(PROJECT_ROOT, 'node_modules')` into a temp probe area; under Bun workspaces `node_modules` stays at the repository root, so this `PROJECT_ROOT` — inherited from `./support` — must be the root or the probe dies |
| `scripts/*.ts` | 15 imports of `../src/…` → `../apps/api/src/…` (migrate 2, seed-volume 5, seed 7, build-assets 1) |
| `scripts/golden.ts` | `TEST_FILE = 'tests/web/golden.test.ts'` → `apps/api/tests/web/golden.test.ts` |
| `infra/Dockerfile` | five points, and only a real `docker build` plus `docker run` finds the last one: `COPY src ./src` → `COPY apps/api/src ./apps/api/src`, in **both** the `assets` and the `runtime` stages; the `dependencies` stage copies only `package.json bun.lock` before `bun install --frozen-lockfile` — under workspaces it also needs `apps/api/package.json` (and, from Task 17, `apps/web/package.json`) or the install cannot resolve the members; the `runtime` stage needs that same member manifest; **`ENTRYPOINT ["bun", "src/main.ts"]`**, which no import rewrite touches and which leaves the image booting a path that is not there; and **a second `node_modules`**. Declaring `workspaces` switches Bun to an isolated install: `/app/node_modules` keeps only the `.bun/` store, and what `apps/api` actually resolves are symlinks under `/app/apps/api/node_modules` pointing into it. Copying only the top-level folder builds a perfectly green image that dies on its first import with `Cannot find package 'hono'`, so add `COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules` beside the existing one. There is no `COPY tests` in this file to fix |
| `.dockerignore` | the bare `tests` pattern only matches the root-level folder; once the suite lives at `apps/api/tests` it stops matching and the whole suite starts shipping into the build context. Use `apps/api/tests` |

> Read the depcruise and magic-values rows together: after this move, `bun run check` and `bun run
> magic` are the two gates that can go green while enforcing nothing. Prove they still bite before
> moving on. `check` proves itself — the 12 planted cases in `checklist.test.ts` are exactly that
> proof, and a green suite is the receipt. `magic` has no such test, so plant one by hand: a file
> under `apps/api/src/` holding a literal some `constants.ts` already owns (`'/academic-years'` does
> it) must make the command exit non-zero and name the file. Delete the probe afterwards.

- [x] **Step 6: Run the whole verification**

Run: `bun install && bun run verify`
Expected: PASS — the same test count as before the move. No new test, none fewer.
Measured: 798 pass, 0 fail, 47 files, exit 0. `check` at 118 modules and 512 dependencies cruised;
`magic` at 157 files swept and 7 indexed — the same sweep as before. One assertion is added rather
than a test, so the `expect()` count goes from 1515 to 1516.

**A green `verify` is not enough to close this step, and that is the lesson of the task.** Two of the
regressions it introduced were invisible to all 798 tests: the stylesheet answering 404 everywhere,
and the Dockerfile shipping an image that cannot import `hono`. Both were found by running the thing,
not by running the suite. So the step also requires:

```bash
docker build -f infra/Dockerfile -t escolaviva:probe .
docker run -d --name ev-probe -p 43331:3000 \
  -e APP_ENV=production -e PORT=3000 \
  -e DATABASE_URL='postgres://escolaviva:escolaviva_dev@host.docker.internal:5442/escolaviva' \
  -e SESSION_SECRET='segredo-de-teste-com-mais-de-32-caracteres' \
  escolaviva:probe
```

and four checks against it: `/health/live` 200, `/health` 200 (the database is really reachable),
`/public/app.0b878f01.css` **200** — not merely cached — and the `<link>` on `/login` carrying the
hash. Then `docker inspect --format '{{.State.Health.Status}}'` must read `healthy`, which exercises
the `HEALTHCHECK` and therefore the `ENTRYPOINT`. Remove the container and the image afterwards.

- [x] **Step 7: Commit**

`bun.lock` belongs in the list: declaring `workspaces` rewrites it, and leaving it out commits a
`package.json` the lockfile does not describe — which is exactly what `--frozen-lockfile` refuses
inside the Dockerfile.

```bash
git status --short
git add package.json tsconfig.json bunfig.toml bun.lock infra/Dockerfile .dockerignore \
        apps/api/package.json apps/api/tsconfig.json apps/api/.dependency-cruiser.js \
        apps/api/src apps/api/tests scripts
git commit -m "refactor: repository as workspaces, backend under apps/api"
```

---

### Task 2: Zod 3 → Zod 4

> **Executed on 2026-08-16.** `zod@4.4.3`, `bun run verify` exit 0 twice, 798 tests across 47 files —
> no test changed. Unlike Task 1, this one was mechanical and the plan was almost right: two steps
> needed correcting and the migration itself landed as written. What the task did **not** have is the
> behaviour that changed underneath a green suite, written into Step 7 below — `code` and `.uuid()`
> both moved, and Task 8 turns `code` into a contract the React side reads.

**Files:**
- Modify: `apps/api/src/shared/config/schema.ts`, `apps/api/src/identity/application/inviteUser.ts`, `apps/api/src/shared/result.ts`, `apps/api/package.json`
- Test: `apps/api/tests/shared/config.test.ts` (already exists and covers the messages)

**Interfaces:**
- Produces: `schemaErrors(issues: { path: PropertyKey[]; message: string; code: string }[]): ApplicationError[]` — the signature used by every use case and, from Task 8 on, by `parse()` as well.

**Context:** 21 files import `zod`, but only two use API that changed shape. The other 19 use
`z.object`, `z.string`, `.min`, `.safeParse` and `.issues`, which are the same in both versions.

- [x] **Step 1: Run the suite and note the starting green**

Run: `bun run test`
Expected: PASS. Note the test count — it must not change in this task.

- [x] **Step 2: Swap the 8 occurrences in `apps/api/src/shared/config/schema.ts`**

No message string is written inline: the file has held every one of them in `CONFIG_MESSAGES`
(`shared/constants.ts`) since the magic-values work, and inlining any of them fails `bun run magic`.
The messages are also already in English — they were translated on 2026-08-16 along with the rest of
the codebase. Only the **option key** changes.

| Before (v3) | After (v4) |
|---|---|
| `z.enum(ENV_BOOLEANS, { errorMap: () => ({ message: CONFIG_MESSAGES.invalidBoolean }) })` | `z.enum(ENV_BOOLEANS, { error: CONFIG_MESSAGES.invalidBoolean })` |
| `z.enum(ENVIRONMENTS, { errorMap: () => ({ message: CONFIG_MESSAGES.invalidEnvironment }) })` | `z.enum(ENVIRONMENTS, { error: CONFIG_MESSAGES.invalidEnvironment })` |
| `z.enum(LOG_LEVELS, { errorMap: () => ({ message: CONFIG_MESSAGES.invalidLogLevel }) })` | `z.enum(LOG_LEVELS, { error: CONFIG_MESSAGES.invalidLogLevel })` |
| `z.coerce.number({ invalid_type_error: CONFIG_MESSAGES.invalidPort })` | `z.coerce.number({ error: CONFIG_MESSAGES.invalidPort })` |
| `z.coerce.number({ invalid_type_error: CONFIG_MESSAGES.invalidDuration })` | `z.coerce.number({ error: CONFIG_MESSAGES.invalidDuration })` |
| `z.coerce.number({ invalid_type_error: CONFIG_MESSAGES.invalidTimeout })` | `z.coerce.number({ error: CONFIG_MESSAGES.invalidTimeout })` |
| `z.string({ required_error: CONFIG_MESSAGES.missingDatabaseUrl })` | `z.string({ error: CONFIG_MESSAGES.missingDatabaseUrl })` |
| `z.string({ required_error: CONFIG_MESSAGES.missingSessionSecret })` | `z.string({ error: CONFIG_MESSAGES.missingSessionSecret })` |

`.min(1, CONFIG_MESSAGES.missingDatabaseUrl)` and
`.min(MINIMUM_SECRET_LENGTH, CONFIG_MESSAGES.shortSessionSecret)` keep their positional message
argument — that form is unchanged in Zod 4.

- [x] **Step 3: Swap the occurrence in `inviteUser.ts`**

```ts
role: z.enum(ROLES, { error: MESSAGES.user.unknownRole }),
```

The message is the constant the file already reads, not an inline string. An earlier draft of this
step wrote `{ error: 'papel desconhecido' }` and that fails `bun run magic` on the spot — the same
rule Step 2 states one paragraph earlier. Nothing about the message changes in this task; only the
option key does.

- [x] **Step 4: Widen the signature of `schemaErrors` in `shared/result.ts`**

In Zod 4 `issue.path` is `PropertyKey[]`, which includes `symbol`. `join('.')` keeps working; it is the
type that has to follow:

```ts
export const schemaErrors = (
  issues: readonly { path: PropertyKey[]; message: string; code: string }[],
  fieldNames: Readonly<Record<string, string>> = {},
): ApplicationError[] =>
  issues.map((issue) => {
    const path = issue.path.map(String).join(FIELD_PATH_SEPARATOR);
    const field = fieldNames[path] ?? path;
    const error: ApplicationError = { code: issue.code, message: issue.message };
    return field === '' ? error : { ...error, field };
  });
```

Only the **type** of `path` moves. Two behaviours that must survive verbatim:

- **`fieldNames` is live, not decorative.** `authenticate` calls
  `schemaErrors(parsed.error.issues, SCHEMA_FIELD_NAMES.login)` to rename the internal schema path
  `loginIdentifier` into the form field `cpf`. Declaring the parameter and not reading it would anchor
  a login error to a field no form has, and the message would vanish on the screen.
- **The separator is `FIELD_PATH_SEPARATOR`**, already in this file. `bun run magic` refuses the
  inline `'.'`.

An error at the schema root has no field: omitting the key is different from storing it as
`undefined` — the screen decides between highlighting an input and showing a general warning. That
reasoning belongs here, in the plan, not as a comment in the file: `tests/shared/no_comments.test.ts`
asserts zero comments in `src/` and `scripts/`.

- [x] **Step 4b: Widen `invalidConfigMessage` in `shared/config/schema.ts` too**

`schemaErrors` is not the only consumer of `issue.path`. `invalidConfigMessage` — in the same file
Step 2 edits — is typed `(string | number)[]` and is handed `parsed.error.issues` directly, so it
breaks for the same reason:

```ts
const invalidConfigMessage = (
  issues: readonly { path: PropertyKey[]; message: string }[],
): string => {
  const lines = issues.map((issue) => {
    const where = issue.path.map(String).join(PATH_SEPARATOR) || CONFIG_MESSAGES.rootLabel;
    return `  - ${where}: ${issue.message}`;
  });
  return [CONFIG_MESSAGES.reportHeader, ...lines, CONFIG_MESSAGES.reportFooter].join(LINE_BREAK);
};
```

No new file joins the task: `shared/config/schema.ts` is already in its list. Sweep for any other
`{ path: (string | number)[] }` before moving on — that shape is the signature of a Zod-3 assumption.

- [x] **Step 5: Verify with Zod 4 still on the subpath, before swapping the package**

The installed version (`zod@3.25.76`) already exposes Zod 4 at `zod/v4`. Temporarily switching the
imports of the two changed files to `from 'zod/v4'` and running the suite proves the two edits without
touching the lockfile.

Run: `bun run test apps/api/tests/shared/config.test.ts apps/api/tests/identity`
Expected: PASS, with the same configuration error messages as before. Measured: 117 pass across 4
files.

**Know what this step does not prove.** Only the two edited files are on `zod/v4`; the other 19
importers stay on v3, so the process runs two copies of Zod at once and the green says nothing about
them. The steps that follow are where the version actually changes for everybody, and Step 7 is where
that gets examined.

- [x] **Step 6: Bump the package and put the imports back to `'zod'`**

```bash
bun add zod@4 --cwd apps/api
```

**`zod@4`, not `zod@latest`.** The `@latest` in an earlier draft contradicts the Global Constraint
that pins majors by name and forbids the bare `@latest` outright — Zod is on that very list. Note
also that `bun add zod@4` writes `"zod": "4"` into the manifest, with no caret, which is
`4.x` all the same but breaks the shape of a file whose other three entries read `^3`, `^4` and `^9`.
Normalise it to `"^4"` and run `bun install` once so the lockfile agrees. Measured: `zod@4.4.3`.

Revert the two `'zod/v4'` imports to `'zod'`.

- [x] **Step 7: Run the whole verification — then examine what it cannot see**

Run: `bun run verify`
Expected: PASS, with the same test count as Step 1. Measured: exit 0 twice, 798 tests across 47 files.

A green suite closes the mechanical half of this task and not the other one. Zod 4 changes behaviour
in three places that no test here observes, because nothing in the repository consumes them **yet**:

- **`issue.code` has a new vocabulary.** `invalid_string` → **`invalid_format`** (that is `.uuid()`,
  `.email()`, `.url()`) and `invalid_enum_value` → **`invalid_value`**. `too_small`, `too_big`,
  `custom` and `invalid_type` are unchanged. Today `code` travels into `ApplicationError` and no
  reader ever looks at it — grep it and the only hits are a CSS class of the same name. From Task 8
  it is a field of `ErrorBody`, which is to say a contract the React side reads, so any table keyed
  on the Zod-3 names has to be written against these.
- **`.uuid()` is strict now.** Zod 3 accepted anything shaped `8-4-4-4-12`; Zod 4 checks the version
  and variant nibbles, so `11111111-1111-1111-1111-111111111111` is rejected where it used to pass.
  The repository survives this by luck rather than design: it holds exactly one literal UUID,
  `00000000-0000-4000-8000-000000000000`, and that one is a well-formed v4. A future fixture written
  as a row of repeated digits will fail validation for a reason that reads like a bug in the domain.
- **Default messages were rewritten.** `String must contain at least 3 character(s)` became
  `Too small: expected string to have >=3 characters`, and `Required` became `Invalid input: expected
  number, received undefined`. Every schema the user's input reaches carries a message of its own out
  of a `constants.ts`, so no screen changes — but the eleven `networkId: z.string().uuid()` and their
  kin have no message, and they would now surface the new English text if they ever failed. They do
  not fail because those ids come from the session, not from a form.

- [x] **Step 8: Commit**

```bash
git status --short
git add apps/api/package.json apps/api/src/shared/config/schema.ts \
        apps/api/src/shared/result.ts apps/api/src/identity/application/inviteUser.ts \
        bun.lock
git commit -m "chore: migrate validation to Zod 4"
```

---

## PHASE 1 — The edge

Seven sequential tasks that define the HTTP contract. They are deliberately narrow: each changes one
mechanism and keeps the suite green. By the end of the phase, `/api/v1/session` answers JSON and the
server knows how to deliver a `dist` that does not exist yet.

While this phase runs, **SSR keeps working** — the Eta routes stay mounted and the `tests/web/` tests
keep passing. That is what makes it possible to stop at any task without leaving the system on the
floor.

> **One ordering fact that applies to Tasks 4 through 7.** The JSON test helpers `read`, `write` and
> `writeWithKey` are written in **Task 8**, not before. The test snippets in Tasks 4, 5 and 7 are
> shown in their final form because that is what they become, but until Task 8 lands each of those
> cases is either a bodiless `test.todo('…')` — which is what those tasks' Step 5 already instructs —
> or a raw `app.request(...)` call, the form Tasks 5 and 6 use for the cases that must run
> immediately. Do not add a second copy of the helpers to `tests/web/support.ts` to make an earlier
> task green; Task 8 owns that file's JSON half.

### Task 3: New configuration and a cookie with a domain

> **Executed on 2026-08-16.** `bun run verify` exit 0 twice, 803 tests across 47 files — five more
> than the 798 baseline, and every one of them new here: three for the configuration and two for the
> cookie. The plan was right about the mechanism and short in one place: it never asks anyone to
> exercise the branch it adds. See Step 4b.

**Files:**
- Modify: `apps/api/src/shared/config/schema.ts`, `apps/api/src/shared/http/session.ts`, `.env.example`
- Test: `apps/api/tests/shared/config.test.ts`, `apps/api/tests/web/authentication.test.ts`

**Interfaces:**
- Produces: `config.allowedOrigins: string[]`, `config.cookieDomain: string | null`. Consumed by Task 6 (CORS) and by `cookieOptions()`.

- [x] **Step 1: Write the failing test**

In `apps/api/tests/shared/config.test.ts`:

```ts
test('allowed origins are born empty and accept a comma-separated list', () => {
  const withoutList = loadConfig({ ...REQUIRED });
  expect(withoutList.allowedOrigins).toEqual([]);

  const withList = loadConfig({
    ...REQUIRED,
    ALLOWED_ORIGINS: 'https://app.escolaviva.test, https://admin.escolaviva.test',
  });
  expect(withList.allowedOrigins).toEqual([
    'https://app.escolaviva.test',
    'https://admin.escolaviva.test',
  ]);
});

test('the cookie domain is null when it is not declared', () => {
  expect(loadConfig({ ...REQUIRED }).cookieDomain).toBeNull();
  expect(
    loadConfig({ ...REQUIRED, COOKIE_DOMAIN: '.escolaviva.test' }).cookieDomain,
  ).toBe('.escolaviva.test');
});

test('an empty string is the same as an absent variable', () => {
  const blank = loadConfig({ ...REQUIRED, ALLOWED_ORIGINS: '', COOKIE_DOMAIN: '' });

  expect(blank.allowedOrigins).toEqual([]);
  expect(blank.cookieDomain).toBeNull();
});
```

The file's minimum-environment constant is `REQUIRED` — the two variables with no default,
`DATABASE_URL` and `SESSION_SECRET` — not `MINIMUM_ENVIRONMENT`, which does not exist anywhere in the
suite and would not compile. The third case matters because `loadConfig` runs `withoutEmptyValues`
first: `ALLOWED_ORIGINS=` in a `.env` arrives as `undefined`, not as `''`, and only the schema default
rescues it.

- [x] **Step 2: Run it and watch it fail**

Run: `bun test apps/api/tests/shared/config.test.ts`
Expected: FAIL — `allowedOrigins` and `cookieDomain` do not exist on `Config`. Measured: 3 fail,
36 pass, each failure on the assertion and not on a compile error.

- [x] **Step 3: Implement**

In `schema.ts`, two lines in the schema and two in the return. `commaSeparatedList` already exists and
is reused — it is the same function that handles `TRUSTED_PROXIES`:

```ts
ALLOWED_ORIGINS: z.string().default(''),
COOKIE_DOMAIN: z.string().default(''),
```

```ts
allowedOrigins: commaSeparatedList(raw.ALLOWED_ORIGINS),
cookieDomain: raw.COOKIE_DOMAIN === '' ? null : raw.COOKIE_DOMAIN,
```

And the `Config` type gains both fields. With no declared domain the cookie stays host-only, which is
what a single origin wants — that sentence belongs here and not above the line: `src/` carries no
comments, and an earlier draft of this snippet shipped one.

- [x] **Step 4: Make the session cookie honour the domain**

In `shared/http/session.ts`, the attribute is needed in two places, so it is worth one name rather
than one expression written twice:

```ts
const domainOption = (): { domain?: string } =>
  config.cookieDomain === null ? {} : { domain: config.cookieDomain };

const cookieOptions = () => ({
  path: COOKIE.path,
  httpOnly: true,
  secure: config.secureCookie,
  sameSite: COOKIE.sameSite,
  maxAge: config.sessionDurationHours * TIME.secondsPerHour,
  ...domainOption(),
});
```

`COOKIE.path` and `COOKIE.sameSite` already exist in `shared/constants.ts`; `bun run magic` refuses
the inline `'/'` and `'Lax'`. `Domain` only appears when somebody declares it.

**And say out loud what `Domain` does not solve.** `Domain` covers the case this task was written for
— `app.escolaviva.com.br` and `api.escolaviva.com.br` are the *same site*, so `SameSite=Lax` still
lets the cookie travel. It does **not** cover the case the three Cloudflare variables exist for: a
front published on `pages.dev` and an API on `escolaviva.com.br` are different registrable domains,
and under `SameSite=Lax` the browser sends no cookie at all on XHR — the API would see every request
as anonymous no matter what `ALLOWED_ORIGINS` says. That deployment needs `SameSite=None; Secure`,
which forces HTTPS in development too. `sameSite` is a hardcoded constant today; turning it into a
configured value is a decision for the day someone actually publishes cross-site, and this plan
records it rather than doing it.

`closeSession` gets the same treatment — deleting a cookie with a `Domain` requires repeating the
`Domain`. Note that it currently passes only `{ path, secure }`, so the domain has to be threaded
through there explicitly.

- [x] **Step 4b: Prove the branch runs, because nothing else will**

The three cases from Step 1 exercise `loadConfig`, which is pure. They say nothing about
`cookieOptions`, and the suite has no way to say anything about it either: `config` is a singleton
resolved at import time, `COOKIE_DOMAIN` is empty in the suite's environment, and therefore the whole
`domain` branch added in Step 4 — in **both** helpers — never executes. The coverage gate does not
notice, because `bunfig.toml` sets thresholds on lines and functions and none on branches, and the
lines around the spread run either way.

Two cases in `apps/api/tests/web/authentication.test.ts` close it. They sign in and sign out for real
in a separate process that has `COOKIE_DOMAIN` declared — the same device the health and boot cases
already use — and read the `Set-Cookie` the application actually wrote:

```ts
expect(cookies.opened).toContain(`Domain=${DOMAIN}`);
expect(cookies.closed).toContain(`Domain=${DOMAIN}`);
```

Assert both, never just the first. A cookie set with a `Domain` is deleted only by a `Set-Cookie`
that repeats it; drop the attribute on the way out and the browser keeps a session the server
believes it closed. Verified by removing `domainOption()` from `closeSession` alone and watching the
case go red.

**One trap in writing that separate process:** it runs with the repository root as its cwd, and under
the isolated install `workspaces` turns on there is no `hono` resolvable from there — only from
`apps/api/`. A script that does `import { Hono } from 'hono'` to build a throwaway app dies with
`Cannot find package 'hono'`. Import `./apps/api/src/web/app.ts` and drive the real routes instead,
which is the better test anyway.

- [x] **Step 5: Run the tests**

Run: `bun test apps/api/tests/shared/config.test.ts apps/api/tests/web/authentication.test.ts`
Expected: PASS

- [x] **Step 6: Record the variables in `.env.example`**

Write them **in Brazilian Portuguese**: every other comment in that file is, and it is prose for
whoever configures the system, not an identifier. Say what empty means, and say what the pair does
not solve — the `SameSite=Lax` limit from the Global Constraints belongs where somebody is about to
fill the variable in, not only in a section of this plan they may never open.

```bash
# Origens autorizadas a falar com a API por CORS, separadas por vírgula. Vazio significa
# mesma origem: nenhum cabeçalho de CORS é emitido, que é o arranjo deste estágio.
ALLOWED_ORIGINS=

# Domínio do cookie de sessão. Vazio significa host-only.
COOKIE_DOMAIN=
```

**Nothing guards this file.** No test compares `.env.example` against the schema, so a variable added
to one and forgotten in the other diverges in silence — worth knowing here, and worth remembering at
Task 7 and Task 34, which both edit it again.

- [x] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/shared/config/schema.ts apps/api/src/shared/http/session.ts \
        apps/api/tests/shared/config.test.ts apps/api/tests/web/authentication.test.ts \
        .env.example
git commit -m "feat(config): allowed origins and cookie domain, both empty"
```

---

### Task 4: Errors in JSON

> **Executed on 2026-08-16.** `bun run verify` exit 0 twice, 814 tests across 48 files. The
> mechanism landed as designed; one factual claim in Step 4 did not survive measurement, and it is
> corrected in place because it teaches something false about `AsyncLocalStorage` and Task 8 builds
> on this section. 817 tests after the 403 branch was covered with a real session rather than
> deferred.

**Files:**
- Create: `apps/api/src/http/response.ts`, `apps/api/src/http/constants.ts`
- Modify: `apps/api/src/shared/http/errors.ts`, `apps/api/src/shared/http/index.ts`, `apps/api/src/shared/http/authorization.ts`, `apps/api/src/shared/constants.ts` (`ERROR_TITLES` gains `415`), `apps/api/src/web/constants.ts` (`ERROR_DETAILS` gains `415`), `apps/api/src/web/app.ts` (`app.onError`)
- Test: `apps/api/tests/api/errors.test.ts`

**Interfaces:**
- Produces:
  - `errorBody(errors: readonly ApplicationError[]): { errors: readonly ApplicationError[]; correlationId: string }`
  - `errorStatus(error: unknown): ErrorStatus` — exported, so the routes can reuse it
  - `errorResponse(c: Context, status: ErrorStatus): Response` — answers JSON on `/api/*` and a page everywhere else, and is called by every one of the four touchpoints. **There is no `jsonErrorsMiddleware`**: an earlier draft of this list promised one, and Step 4 four paragraphs below contradicts it by having the existing `errorsMiddleware` gain the branch. A second middleware for a one-line decision is worse than the branch, and the three touchpoints that never reach a middleware at all would still need this function

**Context:** while phase 1 runs, SSR still answers. The middleware has to decide by path: `/api/*`
gets JSON, the rest keeps getting a page.

**This task also settles who owns the JSON edge's vocabulary**, because the next five tasks all need
it and none of them should invent its own home. `apps/api/src/http/constants.ts` is that owner, and the
line between it and `shared/constants.ts` is drawn by kind, not by convenience. **Header names keep
going to `HEADERS`** in `shared/constants.ts`, beside the six that already live there — Task 5 adds
`idempotencyKey` and `contentType`, Task 6 adds the `X-Requested-By` mark — because a header name is
not an API-versioning decision and splitting that block across two files would leave nobody able to
answer "which headers does this server know about?". What belongs in `http/constants.ts` is the
vocabulary that exists **only** because the edge speaks JSON at a version: the `/api` prefix and the
`v1` segment this middleware matches on, `'application/json'` as a media type, and the API's own
route prefixes as Tasks 9 to 16 register them. The split has a second reason: `web/constants.ts` dies with the templates in Task
33, and the API cannot inherit its vocabulary from a file that is about to be deleted.

The name is load-bearing, and this is the one place the plan says so. `scripts/magic-values.ts`
decides what to index with `INDEXED_FILES = /(?:^|\/)constants\.ts$|(?:^|\/)web\/routes\/routeMap\.ts$/`
— it matches on the **file name**, so any path ending in `/constants.ts` is indexed with no change to
the checker, and `apps/api/src/http/constants.ts` is picked up the moment Task 1 repoints `TARGETS`
to `apps/api/src/**/*.ts`. Call the file `httpConstants.ts` and the regex stops matching: the module
still compiles, `bun run magic` still prints ✔, and every literal it declares silently stops being a
declaration the checker knows about. That failure is invisible, which is exactly why it is written
down here.

- [x] **Step 1: Write the failing test**

```ts
test('an error on an API route comes back as JSON with the correlation code', async () => {
  const response = await read('/api/v1/session');

  expect(response.status).toBe(401);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  const body = await response.json();
  expect(body.errors).toHaveLength(1);
  expect(body.correlationId).not.toBe('');
});

test('the error response leaks no stack, no SQL and no exception message', async () => {
  const response = await read('/api/v1/session');

  const raw = await response.text();
  expect(raw).not.toContain('at ');
  expect(raw).not.toContain('SELECT');
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `bun test apps/api/tests/api/errors.test.ts`
Expected: FAIL — `/api/v1/session` does not exist yet; it answers 404 in HTML.

- [x] **Step 3: Create `apps/api/src/http/response.ts`**

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
  readonly errors: readonly ApplicationError[];
  readonly correlationId: string;
};

/** The correlation code is what support uses to find the trail in the log (I16). */
export const errorBody = (errors: readonly ApplicationError[]): ErrorBody => ({
  errors,
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

`ErrorBody` is declared here only until **Task 8**, which moves it into `contracts/errors.ts` so the
React client can import it and has this file import it back. The shape does not change; only its
address does. `'Location'` is `HEADERS.location`, already in `shared/constants.ts` — the literal here
is for readability and `bun run magic` refuses it.

- [x] **Step 4: Teach `errorsMiddleware` to speak JSON**

In `shared/http/errors.ts`, `errorStatus` becomes exported and the middleware gains the branch:

```ts
const API_PREFIX = '/api/';

const errorResponse = (c: Context, status: ErrorStatus, errors: ApplicationError[]): Response => {
  if (!c.req.path.startsWith(API_PREFIX)) return c.html(errorPage(status), status);
  const correlationId = c.get(CONTEXT_VARIABLES.correlationId) ?? '';
  return c.json({ errors, correlationId }, status);
};
```

**The AsyncLocalStorage scope is still open inside that `catch` — measured, not assumed.** An earlier
draft of this step claimed the opposite: that because `errorsMiddleware` is mounted before
`correlationMiddleware`, the ALS had unwound by the time the `catch` ran, and that reading
`currentContext()` there would ship `correlationId: ""` on exactly the 500s support needs. That is
false in this application. Instrumenting the `catch` and driving a 401 and a 500 through it gives a
populated context both times:

```text
PROBE 401 als= "fec68327-…" ctx= "fec68327-…"
PROBE 500 als= "d9cd43a8-…" ctx= "d9cd43a8-…"
```

The intuition is not silly — a reduced `als.run(...)` → `await` → outer `catch` really does lose the
store — but Hono's `compose` does not nest the way the reduction does. Trust the measurement, and
pin it: `apps/api/tests/api/errors.test.ts` asserts that the `correlationId` in the body equals the
`X-Correlation-Id` on the response, so if that nesting ever changes the suite says so instead of
support losing the trail.

**`errorResponse` still does not import `errorBody` from `http/response.ts`, and the reason is
layering rather than storage.** `errorResponse` lives in `shared/http/errors.ts`, and `shared/` must
not depend on `http/` — that is the arrow this repository draws, and dependency-cruiser has no rule
that would catch the inversion. The way out is one function, not two: `errorBody` is **declared** in
`shared/http/errors.ts`, beside its heaviest user, and `apps/api/src/http/response.ts` re-exports it
so the API edge still imports it from the address the plan promises. Same contract, one
implementation, no duplicated shape drifting apart later.

The same ordering has a second consequence worth stating: `cacheControlMiddleware` does its work
*after* `next()` with no `try/finally`, so a thrown error skips it and the JSON error response carries
**no `Cache-Control` at all**. If that matters for the API, set it inside `errorResponse`; do not
assume the middleware covered it.

While SSR exists the path decides the format. In Task 33, when the Eta screens go, the HTML branch
goes with them and this middleware becomes four lines. `API_PREFIX`, the context-variable name and
the status codes all come from constants modules — `bun run magic` refuses a loose literal outside an
UPPER_SNAKE_CASE const.

**And the checker has to be taught the new vocabulary, or it refuses correct code.**
`scripts/magic-values.ts` exempts a number only when it is an HTTP status *and* it sits in a position
the checker recognises: `HTTP_STATUSES` is a closed set that **does not contain 415**, and
`ERROR_RENDERERS` is a closed set of function names — `renderError` and `errorPage` — whose numeric
arguments are understood to be statuses. Introduce `errorResponse` and a 415 and four legitimate
literals are reported at once. Add `415` to the first set and `errorResponse` to the second; do
**not** reach for `// magic-values: allowed`, because the checker audits its own suppressions and a
justification nobody validated is exactly what it is built to reject. Note that the `HTTP_STATUSES`
guard is what keeps this honest — teaching it `errorResponse` does not let `errorResponse(c, 42)`
through.

The `errors` of an exception is a single line, with the status code and its generic message — **never**
the exception's message, which is operational information and belongs in the log:

```ts
const ERRORS_BY_STATUS: Record<ErrorStatus, ApplicationError> = {
  400: { code: 'invalid_request', message: 'A requisição chegou incompleta ou malformada.' },
  401: { code: 'no_session', message: 'Entre para continuar.' },
  403: { code: 'forbidden', message: 'Sua conta não tem permissão para esta operação.' },
  404: { code: 'not_found', message: 'O registro não existe ou não está ao seu alcance.' },
  415: { code: 'unsupported_media_type', message: 'O corpo precisa chegar como JSON.' },
  422: { code: 'business_rule', message: 'A situação atual não permite concluir esta operação.' },
  500: { code: 'internal_failure', message: 'Algo falhou do nosso lado. A ocorrência foi registrada.' },
};
```

Three things this map costs that are easy to miss:

- **The `code` is a wire value and stays English.** `falha_interna` would be the only Portuguese key in
  a contract the front switches on; the message beside it is what the person reads and stays in
  Brazilian Portuguese.
- **`ErrorStatus` is a closed union**, and it keys two other maps: `ERROR_TITLES` in
  `shared/constants.ts` and `ERROR_DETAILS` in `web/constants.ts`. Adding `415` here — which Task 6
  needs — is a type change in three files, not a new entry in one. Do it in this task, before Task 6
  tries to return a status the type does not admit.
- The map itself lives in a constants module. `bun run magic` refuses a loose string literal outside an
  UPPER_SNAKE_CASE const, and these are eight of them.

The failure logging does not change a line: the log still carries stack, route, type and correlation.

- [x] **Step 4b: Convert the three error paths that never throw**

`errorsMiddleware` is not the only place an error response is born, and a wrapper that only catches
exceptions leaks HTML out of a JSON API. There are four touchpoints:

| Where | How it answers today | What `/api/*` needs |
|---|---|---|
| `shared/http/authorization.ts` — `requireRole` | `return c.html(errorPage(403), 403)`; it never throws | branch on the path and return `c.json(errorBody([...]), 403)` |
| `shared/http/authorization.ts` — `rejectAnonymous` | **redirects** on GET (`c.redirect('/login', 303)`) and throws `Unauthorized` only for non-GET | a JSON request must get 401 for **both** verbs; a 303 to an HTML screen is not an API answer |
| `shared/http/idempotency.ts` | `return c.html(errorPage(400), 400)` for a missing or malformed key; it never throws | `jsonIdempotencyMiddleware` (Task 5) already answers JSON — confirm the form one stays on the Eta routes only |
| `web/render.ts` — `renderError(c, status, title, detail)` | a rendered page, bypassing `ErrorRenderer` altogether; used by the 404 fallback, the two asset 404s, the role-less-account 403 and the **thirteen** registrar out-of-scope 404s (`return notFound(c)`, not `throw`) | the `/api/v1` registrar routes must `throw new NotFound(...)` like teacher/guardian/announcements already do, so one mechanism covers the whole API |
| `web/app.ts` — `app.onError` | re-invokes `errorsMiddleware` by hand and falls back to `c.text('Erro inesperado', 500)` | the fallback must be JSON for `/api/*`, or a crashed 500 answers `text/plain` |

And one accounting correction for Task 33's removal list: `errorPage` is **not** exported from the
`shared/http` barrel. `idempotency.ts` and `authorization.ts` import it directly from `./errors`, so
deleting it forces both of them to change in the same commit.

- [x] **Step 5: Run the tests — and do not settle for `test.todo`**

Run: `bun run test`
Expected: PASS. Measured: 814 tests across 48 files, exit 0.

An earlier draft parked the new cases as `test.todo` until Task 9 supplied `/api/v1/session`. That is
not necessary and it costs the whole task its evidence. Converting `app.notFound` in Step 4b makes
`/api/v1/<anything>` answer real JSON **now**, which is enough to assert the status, the media type,
the single error, the correlation code and the absence of any HTML — today, in the task that
introduces them.

Two branches have no route to run through yet, and they are the ones the suite would otherwise never
see: `requireRole` and `rejectAnonymous` only fire on a mounted route, and the first `/api` route
arrives in Task 9. Do not leave them uncovered on that account — mount a throwaway `Hono` with the
production middleware stack inside the test and drive them directly. It is the same blind spot
Task 3 had with the cookie domain, and it has the same cheap answer.

**And do not stop at the anonymous case, which is the easy half.** An anonymous request to a
`requireRole` route answers **401**, because the session is checked before the role is: it proves
nothing about the 403 branch. Reaching that branch needs a real session, and one is available in this
task without waiting for Task 9 — `fullScenario()` plus the suite's `signIn` gives a registrar's
cookie, and a probe route guarded by `requireRole('teacher')` then exercises exactly the refusal that
matters. Keeping the two apart is the point of the rule this plan states as *wrong role → 403, wrong
scope → 404*: collapse 401 into 403 and the front can no longer tell "sign in again" from "ask your
administrator". Assert as well that the body names neither the role, nor the user, nor the route —
`requireRole` logs all three, and the log is where they belong.

Prove each conversion the way the rest of this plan proves things: revert one and watch which cases
go red. Measured — `errorsMiddleware` 3 red, `rejectAnonymous` 2, `app.notFound` 4. And give `created`
a case of its own; it has no caller until Task 9, and a helper that ships without ever running is a
helper nobody checked. Assert the `Location` header in particular, because that is what the
idempotency middleware reads, not what a human looks at.

- [x] **Step 6: Commit**

The list below is the corrected one. An earlier draft left out `apps/api/src/http/constants.ts` —
which the task's own opening section says to create — and `scripts/magic-values.ts`, without which
`bun run magic` refuses the code this task writes.

```bash
git status --short
git add apps/api/src/http/constants.ts apps/api/src/http/response.ts \
        apps/api/src/shared/http/errors.ts apps/api/src/shared/http/index.ts \
        apps/api/src/shared/http/authorization.ts apps/api/src/shared/constants.ts \
        apps/api/src/web/constants.ts apps/api/src/web/app.ts \
        scripts/magic-values.ts apps/api/tests/api/errors.test.ts
git commit -m "feat(http): API errors in JSON, with the correlation code"
```

---

### Task 5: Header idempotency

> **Executed on 2026-08-16.** `bun run verify` exit 0, 828 tests across 49 files. The four facts the
> task states about today's middleware all check out — including that a 201 fails the form
> middleware's replay test, which is now demonstrated rather than asserted. **Step 4 as written does
> not compile**, and it breaks the SSR routes it promises not to touch; the correction is in place
> below.

**Files:**
- Modify: `apps/api/src/shared/http/idempotency.ts`, `apps/api/src/shared/http/index.ts`, `apps/api/src/shared/constants.ts` — `HEADERS` gains `idempotencyKey` and `contentType` (it holds `cacheControl`, `vary`, `cookie`, `location`, `correlation` and `forwarded` today), and `METHODS`, which today holds only `get` and `post`, gains `put`, `patch` and `delete`. All of them are used by the block below and by Task 6, and all of them are the kind of literal `bun run magic` reports when it is written inline instead
- Test: `apps/api/tests/api/idempotency.test.ts`

**Interfaces:**
- Produces: `jsonIdempotencyMiddleware: MiddlewareHandler`. It reads `Idempotency-Key`, leaves the JSON body in `c.get('body')` and stores the `Location` on a repeat. The form `idempotencyMiddleware` stays in place until Task 33.

**Context:** the `idempotent_request` table **does not change**. What changes is where the key comes
from and what a repeat answers.

Four facts about today's middleware that this task inherits and must not misdescribe:

- **It is the only body parser in the codebase.** `await c.req.parseBody()` appears exactly once, in
  `idempotencyMiddleware`, and all nineteen POST handlers read `c.get(CONTEXT_VARIABLES.body)`; there
  is no `c.req.json()` anywhere. Moving the key to a header therefore also moves the parser: the two
  changes are one change.
- **Login and logout never had a key.** `idempotencyMiddleware` returns early for an anonymous user,
  so `POST /login` is parsed but never key-checked; `POST /logout` sits in `ROUTES.public` and is not
  in `WRITE_GROUPS` at all, so it is never even parsed. Demanding `Idempotency-Key` on
  `POST /api/v1/session` would be **new behaviour**, not a port — which is why the middleware below
  keeps letting the anonymous case through.
- **`201 Created` fails today's replay check.** `isRedirect` is `status >= 300 && status < 400`, so a
  201 with a `Location` releases the key and the second click creates a second record. That is why
  `jsonIdempotencyMiddleware` keys off the presence of `Location` instead of the 3xx range; the form
  middleware is not being fixed, it is being left alone until Task 33.
- **A replay does not replay the body.** The stored row holds only `response_location`; nothing of the
  first response is kept, deliberately (I17 — an invitation's temporary password must not sit at rest).
  There is also no reaper for `idempotent_request`: the only scheduled job in the process is the
  expired-session purge, and this plan does not add one.

- [x] **Step 1: Write the failing tests**

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

- [x] **Step 2: Run them and watch them fail — and then do not settle for `test.todo`**

Run: `bun test apps/api/tests/api/idempotency.test.ts`
Expected: FAIL — the `/api/v1` routes do not exist yet.

An earlier draft stopped there and parked everything except the `PUT` case as `test.todo` until
Tasks 12 and 14. That defers the evidence for the whole feature, and it is not necessary: **the
middleware is the subject, not the routes**. Mount it on a throwaway `Hono` with the production
stack — `errorsMiddleware`, `correlationMiddleware`, the real `createSessionMiddleware`, then
`jsonIdempotencyMiddleware` — give it a write route that answers `created(...)` and a refusing route
that answers 422 with no `Location`, and every branch is reachable now, against the real table and a
real session. Measured: 11 cases, all running.

Two traps in writing them. **Build one application per case, not one per request** — a helper that
calls the factory on every call restarts the route's own counter, so two distinct keys hand back the
same `Location` and the "distinct keys create two records" case passes while proving nothing. And
assert the *pair* on a repeat: the second status alone would also pass against a middleware that
blindly refuses every retry; what must hold is that one record exists and the repeat points at it.

- [x] **Step 3: Implement `jsonIdempotencyMiddleware`**

I4 still holds word for word: the browser is external input, and a guardian on bad 4G taps "submit"
twice. What changes is how the key travels — a header, not a hidden form field — and what a repeat
returns: instead of a 303 to the page, a 200 with the path of the resource the first one created.
`PUT` and `DELETE` need no key: they are idempotent by method, and charging them one would be rent
without pain. The header name itself is **not** declared locally — it joins `HEADERS` in
`shared/constants.ts` beside `HEADERS.correlation`, because that file is indexed and `bun run magic`
reports a literal that duplicates a constant it owns.

Both the codes and the messages below are shown inline for readability and **must not be pasted that
way**: `bun run magic` reports every one of them. The codes join `ERROR_CODES` in
`shared/constants.ts`, beside the seven Task 4 put there, and the two messages become an
`IDEMPOTENCY_MESSAGES` block in the same file — a message the user reads is exactly the kind of value
that file owns.

```ts
const MISSING_KEY: ApplicationError = {
  code: 'missing_idempotency_key',
  message: `Toda criação precisa do cabeçalho ${HEADERS.idempotencyKey}.`,
};

const MALFORMED_BODY: ApplicationError = {
  code: 'malformed_body',
  message: 'O corpo da requisição não é um JSON válido.',
};

const BODY_METHODS = new Set<string>([METHODS.post, METHODS.put, METHODS.patch]);

export const jsonIdempotencyMiddleware: MiddlewareHandler = async (c, next) => {
  if (!BODY_METHODS.has(c.req.method)) return next();

  let body: JsonBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody([MALFORMED_BODY]), 400);
  }
  c.set(CONTEXT_VARIABLES.jsonBody, body);

  if (c.req.method !== METHODS.post) return next();

  const user = currentUserOrNull(c);
  if (user === null) return next();

  const key = c.req.header(HEADERS.idempotencyKey);
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
    return c.json({ repeated: true, location: saved[0]?.response_location ?? '' }, 200);
  }

  try {
    await next();
  } catch (error) {
    await releaseKey(sql, key);
    throw error;
  }

  const location = c.res.headers.get(HEADERS.location);
  if (location === null || c.res.status >= 400) {
    await releaseKey(sql, key);
    return;
  }

  const hash = new Bun.CryptoHasher(RESPONSE_HASH.algorithm)
    .update(location)
    .digest(RESPONSE_HASH.encoding);
  await sql`
    UPDATE idempotent_request
       SET response_location = ${location}, response_hash = ${hash}
     WHERE idempotency_key = ${key}`;
};
```

Read the two method gates carefully, because Task 14 depends on the difference. The **first** gate is
`BODY_METHODS` — `POST`, `PUT`, `PATCH` — and everything past it gets its body parsed and left in
`c.get(CONTEXT_VARIABLES.body)`. The **second** gate is `POST` only, and everything past *that* is
charged an `Idempotency-Key`. So a `PUT` handler reads its body from the context exactly like a `POST`
handler does; what it does not do is carry a key. `DELETE` is outside both gates, which is why
`DELETE /api/v1/session` is never asked for a body it does not have.

The block is paste-ready as it stands, and the three explanations it no longer carries as comments are
these. The anonymous early return is there because the row requires `user_id`, and the only anonymous
write is login itself — repeating a login merely creates another session, so there is no record to
protect. No response body is stored, only where to go: an invitation's temporary password must not sit
at rest in a table (I17). And without a `Location` no creation completed, so the key is released and
the correction can be submitted under the same key.

`HEADERS.location` and `RESPONSE_HASH.{algorithm,encoding}` already exist in `shared/constants.ts` —
the current form middleware uses both — so writing `'Location'`, `'sha256'` or `'hex'` here is a
literal duplicating a constant an indexed `constants.ts` owns, which is exactly what `bun run magic`
reports.

- [x] **Step 4: Give the JSON body a context key of its own — do not widen `body`**

The instinct is to widen the existing key so both middlewares can write to it. That does not work,
and an earlier draft of this step got it wrong in a way worth keeping on record, because the wrong
version explains its own failure and then commits it:

```ts
body: FormBody | JsonBody | undefined;   // with  type JsonBody = unknown
```

The draft correctly warned that `FormBody | unknown` collapses to `unknown`, that the eighteen
`c.get(CONTEXT_VARIABLES.body)` reads in the Eta routes index into that value, and that the next
`bunx tsc --noEmit` would fail across `web/routes/` while SSR is still alive. Then it claimed naming
the alias keeps the union honest. **It does not.** TypeScript resolves the alias before forming the
union, so `FormBody | JsonBody` *is* `unknown`, and a reduced case says so:

```text
error TS18046: 'b' is of type 'unknown'.
```

The way out is not a cleverer union. Two middlewares parse two different things, so they get two
keys — `body` stays exactly as it is, `FormBody`, and the JSON edge writes to `jsonBody`:

```ts
export type Variables = {
  correlationId: string;
  sessionId: string | null;
  user: SessionUser | null;
  body: FormBody;
  jsonBody: JsonBody;
};

export type JsonBody = unknown;
```

`CONTEXT_VARIABLES` gains `jsonBody` beside `body`, and `jsonIdempotencyMiddleware` sets that one.
Nothing in `web/routes/` is touched, the eighteen reads keep their type, and each side is honest
about what it holds. When Task 33 deletes the form middleware, `body` goes with it and `jsonBody`
stays — the rename is a one-line decision then, not a type puzzle now.

- [x] **Step 5: Run the verification**

Run: `bun run verify`
Expected: PASS — the old middleware is still mounted on the Eta routes and nothing regresses.
Measured: 828 tests across 49 files, exit 0.

Prove the middleware bites, the way the rest of this plan proves things. Measured, two cases red
each: letting a keyless POST through, and not releasing the key when the write fails. The third
reversion is the one worth doing deliberately, because it demonstrates the fourth fact stated at the
top of this task rather than taking it on faith — swap `c.res.status >= 400` back for the form
middleware's `!isRedirect(c.res.status)` and watch the replay cases fail: a 201 is not in the 3xx
range, so the key is released and the second click creates a second record.

- [x] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/shared/http/idempotency.ts apps/api/src/shared/http/index.ts \
        apps/api/src/shared/constants.ts apps/api/tests/api/idempotency.test.ts
git commit -m "feat(http): idempotency through the Idempotency-Key header"
```

---

### Task 6: Secure writes and CORS

> **Executed on 2026-08-16.** `bun run verify` exit 0, 850 tests across 51 files. The two middlewares
> landed as designed. What the task did not have is the collision between `Vary: Origin` and the
> cache layer, which is a real caching defect and is fixed here — see Step 4b.

**Files:**
- Create: `apps/api/src/http/secureWrite.ts`, `apps/api/src/http/cors.ts`
- Modify: `apps/api/src/shared/constants.ts` — `CORS_HEADERS`, `CORS` and `APPLICATION_MARK` are new blocks there, `HEADERS` gains `requestedBy` and `origin`, `METHODS` gains `options`, `ERROR_CODES` gains `writeWithoutMark` and `INTERNAL_REASONS` gains the matching reason beside the `writeWithoutKey` it already holds; `apps/api/src/shared/http/cacheControl.ts` — see Step 4b
- Test: `apps/api/tests/api/secure_write.test.ts`, `apps/api/tests/api/cors.test.ts`

**Interfaces:**
- Produces: `secureWriteMiddleware: MiddlewareHandler`, `createCorsMiddleware(origins: readonly string[]): MiddlewareHandler`

**Context:** an automatic cookie plus writes in JSON opens cross-site request forgery, which the form
with PRG did not have. This is the defence, and it is the first concrete cost of the SPA decision.

- [x] **Step 1: Write the failing tests**

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

- [x] **Step 2: Run them and watch them fail**

Run: `bun test apps/api/tests/api/secure_write.test.ts apps/api/tests/api/cors.test.ts`
Expected: FAIL — neither module exists.

- [x] **Step 3: Implement `secureWrite.ts`**

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
const WRITE_METHODS = new Set<string>([METHODS.post, METHODS.put, METHODS.patch, METHODS.delete]);
export const INTERNAL_ORIGIN_HEADER = 'X-Requested-By';
export const APPLICATION_MARK = 'escolaviva';
const JSON_TYPE = 'application/json';

export const secureWriteMiddleware: MiddlewareHandler = async (c, next) => {
  if (!WRITE_METHODS.has(c.req.method)) return next();

  if (c.req.header(INTERNAL_ORIGIN_HEADER) !== APPLICATION_MARK) {
    logger.warn(redact({ route: c.req.path, method: c.req.method }), INTERNAL_REASONS.writeWithoutMark);
    return c.json(errorBody([WRITE_WITHOUT_MARK]), 403);
  }

  // DELETE carries no body, and charging it a content type would charge for something that does not
  // exist.
  if (c.req.method === METHODS.delete) return next();

  if (!(c.req.header(HEADERS.contentType) ?? '').startsWith(JSON_TYPE)) {
    return c.json(errorBody([UNSUPPORTED_TYPE]), 415);
  }

  return next();
};
```

`METHODS` is the one Task 5 extended with `put`, `patch` and `delete`; writing `'POST'` or `'DELETE'`
here is a literal duplicating a value an indexed `constants.ts` owns, which is what `bun run magic`
reports. It also gains `options`, which `cors.ts` needs for the preflight.

**`X-Requested-By` does not get declared locally.** The snippet above shows it as a module-level
`INTERNAL_ORIGIN_HEADER`, and that contradicts Task 4, which states that header names keep going to
`HEADERS` in `shared/constants.ts` and names this very mark as the one Task 6 adds. Splitting the
block is exactly what that rule exists to prevent — nobody could then answer "which headers does this
server know about?". So: `HEADERS.requestedBy`, `HEADERS.origin`, and `APPLICATION_MARK` as a value of
its own beside them. `application/json` is not redeclared either: `API.mediaType` already owns it, and
`secureWrite.ts` lives in `http/`, so importing it is the correct direction.

Compare the type with `startsWith`, not equality. A browser sends
`application/json; charset=utf-8`, and an exact match would refuse the very client this API is
built for.

- [x] **Step 4: Implement `cors.ts`**

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
  const allowedHeaders = [HEADERS.contentType, HEADERS.idempotencyKey, INTERNAL_ORIGIN_HEADER].join(', ');
  const exposedHeaders = [HEADERS.location, HEADERS.correlation].join(', ');

  return async (c, next) => {
    if (allowed.size === 0) return next();

    const origin = c.req.header('Origin');
    if (origin === undefined || !allowed.has(origin)) {
      // A request with no origin is the server itself or a client that is not a browser; it goes
      // through. An unknown origin also goes through, but without an echo: the browser is what
      // blocks it, by not receiving permission.
      return c.req.method === 'OPTIONS' ? c.body(null, 204) : next();
    }

    c.header(CORS_HEADERS.allowOrigin, origin);
    c.header(CORS_HEADERS.allowCredentials, CORS.credentials);
    c.header(HEADERS.vary, CORS.originHeader, { append: true });
    c.header(CORS_HEADERS.exposeHeaders, exposedHeaders);

    if (c.req.method === CORS.preflightMethod) {
      c.header(CORS_HEADERS.allowMethods, CORS.methods);
      c.header(CORS_HEADERS.allowHeaders, allowedHeaders);
      c.header(CORS_HEADERS.maxAge, CORS.maxAge);
      return c.body(null, 204);
    }

    return next();
  };
}
```

`exposedHeaders` is `[HEADERS.location, HEADERS.correlation].join(', ')` and it is **not optional**.
A cross-origin browser hides every response header outside the CORS-safelisted six, so without it:

- `Location` is invisible, and the front cannot navigate to the resource a 201 just created — the
  whole `created(...)` contract of P2 dies silently;
- `X-Correlation-Id` is invisible, and `LoadFailed` cannot show the code the person is supposed to
  quote to support.

All the literal strings live in a constants module: `bun run magic` refuses a loose `'Access-Control-…'`
or `'GET, POST, PUT, DELETE, OPTIONS'` outside an UPPER_SNAKE_CASE const.

- [x] **Step 4b: The `Vary` collision — a real caching defect this task uncovers**

`createCorsMiddleware` appends `Origin` to `Vary` *before* calling `next()`.
`cacheControlMiddleware` writes `Vary: Cookie` *after* `next()` returns, and it **sets** rather than
appends. Mounted in the order the application uses, the second one therefore erases the first, and an
authenticated cross-origin response goes out saying it varies by cookie alone:

```text
Expected to contain: "Origin"
Received: "Cookie"
```

A shared cache that believes that can hand one origin's response — including its
`Access-Control-Allow-Origin` — to a request from another. Fix it where the bug is: `cacheControl.ts`
appends too. With no CORS in play the appended value is still just `Cookie`, so the existing
assertion in `checklist.test.ts` that reads `Vary: Cookie` exactly keeps passing.

The case that catches this has to **stack the real cache middleware and a real session** underneath
the CORS one. Tested alone, `set` and `append` are indistinguishable, and an isolated case would have
gone green over the defect. This is the same lesson as the `Domain` branch in Task 3: the middleware
under test is not the whole system it will live in.

- [x] **Step 5: Run the tests**

Run: `bun test apps/api/tests/api/cors.test.ts apps/api/tests/api/secure_write.test.ts`
Expected: PASS. Measured: 22 cases, all running.

An earlier draft left `secure_write.test.ts` as `test.todo` until the routes exist. That is not
needed — the middleware is the subject, and a throwaway `Hono` reaches every branch now, the same way
Task 5 does. Cover all four write verbs rather than POST alone: a forged `PUT` or `DELETE` is exactly
as damaging, and a guard tested on one verb reads as if it covered them all.

Prove they bite. Measured, by reverting one thing at a time: dropping the mark check turns 5 cases
red, dropping the content-type check 2, removing `Access-Control-Expose-Headers` 1, and echoing `*`
instead of the origin 2.

- [x] **Step 6: Commit**

```bash
git status --short
git add apps/api/src/http/secureWrite.ts apps/api/src/http/cors.ts \
        apps/api/src/shared/constants.ts apps/api/src/shared/http/cacheControl.ts \
        apps/api/tests/api/secure_write.test.ts apps/api/tests/api/cors.test.ts
git commit -m "feat(http): internal-origin mark required on writes, and CORS from the environment"
```

---

### Task 7: Cache and static delivery

> **Executed on 2026-08-16.** `bun run verify` exit 0, 865 tests across 52 files. Two things the
> task assumes do not hold: `mountStatic` cannot read `config.frontPath` and still be testable, and
> the `index.html` cache branch cannot be recognised by content type. Both are corrected below. One
> prerequisite it lists — teaching `app.notFound` the path branch — was already paid in Task 4.

**Files:**
- Create: `apps/api/src/http/static.ts`
- Modify: `apps/api/src/shared/http/cacheControl.ts`, `apps/api/src/web/app.ts`, `apps/api/src/shared/config/schema.ts`, `.env.example`
- Test: `apps/api/tests/api/static.test.ts`

> **On `app.ts`'s address.** The "Moved" table at the top of this plan describes the **end state**,
> after Task 33. Task 1 runs a single `git mv src apps/api/src` and nothing else, so `app.ts`,
> `health.ts` and `pagination.ts` stay at `apps/api/src/web/…` for the whole of phases 1 to 5 — they
> are the files SSR is still mounted on. Every task before 33 that says "`app.ts`" means
> `apps/api/src/web/app.ts`. Moving them to `src/http/` early breaks the imports of every front in
> flight.

**Interfaces:**
- Consumes: the empty-variable pattern established in Task 3.
- Produces: `mountStatic(app: WebApplication, frontRoot = config.frontPath): void` — registers `/assets/*` and the SPA fallback; `config.frontPath: string`. **The second parameter is not decoration.** `config` is a singleton resolved at import time, so a test cannot point `FRONT_PATH` at a temporary folder from inside the process — the same wall Task 3 hit with `COOKIE_DOMAIN`. Defaulting the argument keeps the call site in `app.ts` unchanged and makes the whole task testable.

**Context:** the `dist` does not exist yet. This task's tests create a fake `dist` in a temporary
folder and point `FRONT_PATH` at it — that is what makes it possible to prove the fallback before
there is a front.

- [x] **Step 1: Write the failing tests**

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

- [x] **Step 2: Run them and watch them fail**

Run: `bun test apps/api/tests/api/static.test.ts`
Expected: FAIL — `mountStatic` does not exist.

- [x] **Step 3: Implement `static.ts`**

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

export function mountStatic(app: WebApplication, frontRoot = config.frontPath): void {

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

The sample above spells `ASSET_NAME` and the type map out for readability, but **neither is new**:
`web/constants.ts` already owns `ASSET_NAME` (the same regex, for the `/public/*` handler) and
`ASSET_TYPES` (css, js, svg, ico, woff2). Import them and add `png` to the existing map rather than
restating either — a literal that duplicates a value an indexed `constants.ts` owns is exactly what
`bun run magic` reports. `SERVER_PATHS` and `ASSET_PREFIX` are genuinely new and belong there too.
Task 33 keeps both maps when `web/constants.ts` becomes `http/constants.ts`, for this handler.

`config.frontPath` goes into `shared/config/schema.ts` with `FRONT_PATH` empty by default, resolved to
`<repository root>/apps/web/dist`. The variable exists for `infra/Dockerfile`, which copies the `dist`
somewhere else inside the image.

Three things that come with it and are easy to forget:

- **It is the twelfth variable** — the schema accepted nine before this plan started and Task 3 added
  `ALLOWED_ORIGINS` and `COOKIE_DOMAIN` — **and adding one touches four places**: the `Config` type, the return of
  `loadConfig`, `.env.example` (whose blocks are in Portuguese — match the file, do not start a second
  language in it), and a decision about `RENAMED_ENVIRONMENT_VARIABLES`. Boot already dies with a
  dedicated message on six old Portuguese names; a new variable born in English needs no entry, but
  the plan should say so rather than leave it silent. Note also that the schema object is **not**
  `.strict()`, so a typo in the variable name is stripped without error and the default slips in — the
  test is the only thing that catches it.
- **`app.notFound` renders HTML.** The test above expects `GET /api/v1/inexistente` to answer JSON,
  but today `app.notFound` calls `renderError(c, 404, ...)` and returns a page. `c.notFound()` inside
  `mountStatic` routes straight into it. Teach `app.notFound` the same path branch `errorResponse`
  learned in Task 4, or that test cannot pass.
- **`pageFromQuery` has no home in the new tree.** Every phase-2 front calls it (P1), and it lives in
  `src/web/pagination.ts` with its per-table `param` argument. It stays where it is while SSR is alive
  and moves to `apps/api/src/http/pagination.ts` in Task 33; until then the `/api/v1` routers import
  it from `../../web/pagination`. Say which, or seven fronts will each invent their own.

- [x] **Step 4: Add the `/assets/` prefix in `cacheControl.ts` — do not swap the old one**

```ts
const IMMUTABLE_PREFIXES = [ASSETS.urlPrefix, ASSETS.buildUrlPrefix] as const;
```

Do not *swap* the prefix in phase 1 — *add* one. SSR is still mounted for the whole of phases 1 and 2,
`/public/app.<hash>.css` is still the stylesheet the Eta layouts point at, and
`tests/web/checklist.test.ts` asserts `public, max-age=31536000, immutable` on exactly that URL.
Re-anchoring the check to `/assets/` strips the immutable header off every SSR asset and takes that
test down with it. Both prefixes carry the same policy until Task 33 removes the first.

`ASSETS.urlPrefix` (`/public/`) and `CACHE.asset` already exist in `shared/constants.ts`; the new
`/assets/` value joins them there as `ASSETS.buildUrlPrefix`, because `bun run magic` refuses a
literal that duplicates one an indexed `constants.ts` owns.

And the document branch, before the session check:

```ts
if (isApplicationDocument(c)) {
  c.header(HEADERS.cacheControl, CACHE.anonymous);
  return;
}
```

**Do not recognise the document by its content type.** The obvious `isApplicationDocument` reads
`Content-Type` and looks for HTML — and every Eta screen is HTML too, so that branch would strip
`private, no-store` off every authenticated SSR page while SSR is still the whole application.
`mountStatic` marks the response instead, through a `CONTEXT_VARIABLES.applicationDocument` flag that
`Variables` gains alongside `body` and `jsonBody`, and the cache layer reads the flag. Explicit beats
inferred here, and the inference is actively wrong.

- [x] **Step 5: Mount it in `app.ts`, after the routes**

`mountStatic(app)` goes in **after** `mountRoutes(app)` and replaces today's `app.notFound` for screen
paths. `app.notFound` keeps existing for `/api` and `/health`.

- [x] **Step 6: Run the tests**

Run: `bun run verify`
Expected: PASS. Measured: 865 tests across 52 files, exit 0.

Prove the guards bite, and expect two of them to disappoint on the first attempt — both were caught
this way and both cases had to be rewritten:

- **the asset name check protected nothing.** Hono does **not** decode `%2F` in `c.req.path`, so
  `..%2Fsegredo.txt` arrives literal, becomes a filename that does not exist, and answers 404 with or
  without the regex. A case built on `sub/dir.css` is no better: that file does not exist either. The
  handler now `decodeURIComponent`s the name before testing it — which makes the guard real, since
  `../segredo.txt` then resolves one level out of `assets/` — and the case is written against a file
  that **does** exist there. Remove the check and it reads that file;
- **the `index.html` branch made no difference anonymously.** Without a session the response gets
  `no-store` from the anonymous rule anyway, so the case passed whether or not the branch existed.
  Signed in, the difference is the whole point: `private, no-store` would let the browser keep the
  document. The case signs in.

The `/public/` half of Step 4 is proved by removing it and watching `checklist.test.ts` go red.

- [x] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/http/static.ts apps/api/src/http/constants.ts \
        apps/api/src/shared/http/cacheControl.ts apps/api/src/shared/http/index.ts \
        apps/api/src/shared/constants.ts apps/api/src/shared/config/schema.ts \
        apps/api/src/web/app.ts apps/api/tests/api/static.test.ts .env.example
git commit -m "feat(http): serve the Vite dist with an SPA fallback"
```

---

### Task 8: Contracts, base presenters and the JSON test support

> **Executed on 2026-08-16.** `bun run verify` exit 0, 872 tests across 53 files. The design holds.
> What does not is the assumption that a `magic-values: allowed` directive is enough to license the
> restated enumerations — the checker audits its own suppressions and refuses this one on structural
> grounds. Step 3 now says what to do about it.

**Files:**
- Create: `apps/api/src/http/contracts/index.ts`, `contracts/page.ts`, `contracts/enumerations.ts`, `contracts/errors.ts`, `contracts/session.ts`, `contracts/shared.ts`, `apps/api/src/http/presenters/page.ts`, `apps/api/src/http/schemas/parse.ts`
- Modify: `apps/api/.dependency-cruiser.js`, `apps/api/tests/web/support.ts`, `apps/api/src/http/response.ts` (it takes `ErrorBody` from `contracts/errors.ts` instead of declaring it)
- Test: `apps/api/tests/api/contracts.test.ts`

**Interfaces:**
- Produces:
  - `type Page<T> = { items: readonly T[]; page: number; pages: number; total: number; size: number }`
  - `pageAsJson<T, U>(page: DomainPage<T>, item: (value: T) => U): Page<U>`
  - `parse<T>(schema: ZodType<T>, body: unknown): Result<T>`
  - `SHIFTS`, `ROLES`, `TERMS`, `ENROLLMENT_STATUSES` — closed sets from the domain
  - `type ApplicationError`, `type ErrorBody` — in `contracts/errors.ts`
  - `type SessionUserAsJson`
  - `type SimpleOption`, `type EnrollmentInList`, `type SchoolCounts`, `type Shift` — in `contracts/shared.ts`, the four types more than one phase-2 front needs
  - test support: `read(path, cookie?)`, `write(method, path, body, cookie?)`, `writeWithKey(...)`, `signIn(credentials)`

**Context:** `contracts/` is the only server folder the front may import. It has to stay loadable by a
browser bundler, which means **zero imports** — not from `zod`, not from `hono`, not from another file
in the project (a file inside `contracts/` importing another file inside `contracts/` is fine, and is
what `contracts/index.ts` is).

- [x] **Step 1: Write the dependency-cruiser rule that fails**

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

- [x] **Step 2: Run it to see the rule exists and passes over the empty folder**

Run: `bun run check`
Expected: PASS (nothing in `contracts/` yet).

- [x] **Step 3: Write the contracts**

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
// magic-values: allowed — contracts/ has zero imports by rule (it is bundled by the browser), so the
// closed sets are restated here rather than imported from identity/ and academics/. The duplication
// is the price of the isolation, and tests/api/contracts.test.ts asserts the two lists stay equal.
export const SHIFTS = ['morning', 'afternoon', 'evening', 'full_time'] as const;
export const ROLES = ['network_admin', 'registrar', 'teacher', 'guardian'] as const;
export const TERMS = [1, 2, 3, 4] as const;
export const ENROLLMENT_STATUSES = ['active', 'transferred', 'cancelled', 'completed'] as const;

export type Shift = (typeof SHIFTS)[number];
export type Role = (typeof ROLES)[number];
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
```

Two consequences that the isolation rule buys and this task has to pay for:

- **The values collide with an indexed constants file, and the directive alone does not settle it.**
  `'network_admin'`, `'registrar'`, `'teacher'` and `'guardian'` duplicate `ROLE` in
  `src/identity/constants.ts`, which `bun run magic` indexes. Three separate things go wrong here and
  only the first is obvious:
  - the directive has to sit **on the literal's line or the one directly above it**. A block comment
    at the top of the file silences nothing, and the checker reports it as a *dead suppression*;
  - `src/` carries no comments, so that block would fail `no_comments.test.ts` anyway — only lines
    that *contain* the directive are tolerated. One directive line per declaration, not a paragraph;
  - and then the suppression is refused on its merits: **`'network_admin'` is CONSUMED from a
    constant in `identity/domain/role.ts`**, and the checker's rule is that the same form cannot be a
    copy there and a decision of its own here. No wording fixes that — it is structural.

  The resolution is to teach the checker, the way Task 4 taught it `errorResponse` and 415: the
  contradiction audit **skips `apps/api/src/http/contracts/`**. That exemption is narrow and earned —
  dependency-cruiser guarantees, in this very task, that nothing in that folder may import anything,
  so a literal there *cannot* be replaced by consuming a constant. Every other rule still applies to
  the folder, and the exemption is worth exactly as much as the test in the next bullet.
- **Add `apps/api/tests/api/contracts.test.ts`** asserting each restated set equals its domain
  counterpart. Nothing else can: the zero-imports rule is precisely what stops the compiler from
  noticing when the two drift apart.

And a name to check before typing a presenter against these: `Shift` and `TeacherClassGroupSubject`
are **not** re-exported from `src/academics/index.ts` — only the runtime value `SHIFTS` is — so a
presenter that types a field `shift: Shift` takes the type from `contracts/enumerations.ts`, not from
the domain.

`contracts/errors.ts` — the shape every failure travels in, and the one the front's `ApiError` is
built from:

```ts
export type ApplicationError = {
  readonly field?: string;
  readonly code: string;
  readonly message: string;
};

export type ErrorBody = {
  readonly errors: readonly ApplicationError[];
  readonly correlationId: string;
};
```

This is a **restatement**, for the same reason `enumerations.ts` is one: `apps/web` may import from
`contracts/` and from nowhere else, and `shared/result.ts` is not a contract. `http/response.ts`
(Task 4) drops its local `ErrorBody` declaration and imports this one instead, so there is exactly one
wire shape; `shared/result.ts` keeps its own `ApplicationError` untouched, and the two are structurally
identical by construction. Do **not** make `contracts/` import `shared/result.ts` to "avoid the
duplication" — that is the rule Step 1 exists to enforce.

`contracts/shared.ts` — the four types more than one phase-2 front needs, written **before** the phase
opens so that no front has to edit another's file. `SimpleOption` (Options produces it; Registrar A and
Announcements consume it), `EnrollmentInList` (Registrar A produces it; Guardian consumes it),
`SchoolCounts` (Registrar A's dashboard — it cannot come from `academics`, because a file in
`contracts/` may have zero imports) and `Shift` (three fronts; the `academics` barrel does not export
the type at all, only the `SHIFTS` value, so `Shift` is re-exported here from `enumerations.ts`).
During phase 2 this file is read-only for every front; a front that needs a fifth shared type stops and
reports.

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
};
```

There is no `guardianId`, on the user or on the session. `app_user` has no such column: whoever
answers for a student is a row in `app_user` reached through `student_guardian.user_id`, and
`linkGuardian` takes `userId`. A screen that needs "an account with the guardian role and no
`student_guardian` row" is asking a **query**, not reading a session field — and the guardian routes
already answer it through `academics.studentGuardians` / `academics.guardianEnrollments`. Wherever a
later task says `guardianId`, it means the guardian's `userId`.

- [x] **Step 4: Write `presenters/page.ts` and `schemas/parse.ts`**

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

- [x] **Step 5: Extend the test support with JSON**

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

- [x] **Step 6: Run the verification**

Run: `bun run verify`
Expected: PASS, with the `contracts-without-dependencies` rule active and no violation.
Measured: 872 tests across 53 files, exit 0.

Prove both guards. Add an import to any file under `contracts/` and `check` names the rule and the
edge it refuses; drop a value from a restated set and `contracts.test.ts` goes red on that set alone.
Assert **order**, not membership: the front builds selects by iterating these, and a reordered set
would pass a membership check while every dropdown silently changed.

One friction worth expecting: the domain types `TERMS` as `readonly number[]` while the contract
narrows it to the four literals, so the comparison has to be widened on the contract side. The front
wants the literal union to type a term parameter; the domain has no reason to.

- [x] **Step 7: Commit**

```bash
git status --short
git add apps/api/src/http/contracts apps/api/src/http/presenters/page.ts \
        apps/api/src/http/schemas/parse.ts apps/api/src/http/response.ts \
        apps/api/.dependency-cruiser.js apps/api/tests/web/support.ts \
        apps/api/tests/api/contracts.test.ts
git commit -m "feat(http): dependency-free contracts and the response vocabulary"
```

---

### Task 9: Session, account and mounting `/api/v1`

> **Executed on 2026-08-16.** `bun run verify` exit 0 twice, 892 tests across 55 files; the 230 SSR
> cases stay green. This is the task where everything phases 1 built stops being a probe and starts
> answering on a mounted route. One claim in Step 1 does not match the domain — see the note on the
> refusals — and Step 3 reads the body from the wrong context key.

**Files:**
- Create: `apps/api/src/http/routes/session.ts`, `apps/api/src/http/routes/account.ts`, `apps/api/src/http/routes/api.ts`, `apps/api/src/http/presenters/session.ts`, `apps/api/src/http/schemas/session.ts`
- Modify: `apps/api/src/web/app.ts`, `apps/api/src/http/constants.ts` (the `/api` prefix and the `v1` segment become the mount point the whole API hangs from — Task 4 created the module for exactly this), `apps/api/tests/web/support.ts`
- Test: `apps/api/tests/api/session.test.ts`, `apps/api/tests/api/account.test.ts`

**Interfaces:**
- Produces: `mountApi(app: WebApplication): void` — hangs `/api/v1` with the correct middleware order. The phase 2 fronts register their routers inside `routes/api.ts`.
- Produces: `signIn(credentials): Promise<string>` in the support module, now talking to `POST /api/v1/session`.

- [x] **Step 1: Write the failing tests**

```ts
test('valid credentials open a session and return the user', async () => {
  const scenario = await fullScenario();
  const registrar = scenario.registrar;

  const response = await write('POST', '/api/v1/session', {
    networkSlug: scenario.network.slug,
    cpf: registrar.cpf,
    password: DEFAULT_PASSWORD,
  });

  expect(response.status).toBe(201);
  const { user } = await response.json();
  expect(user.networkSlug).toBe(scenario.network.slug);
  expect(user.roles.some((r) => r.role === ROLE.registrar)).toBe(true);
  expect(response.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=`);
});

test('a wrong network, identifier and password all come back through the same door', async () => {
  const scenario = await fullScenario();

  const wrongNetwork = await write('POST', '/api/v1/session', {
    networkSlug: 'rede-que-nao-existe',
    cpf: scenario.registrar.cpf,
    password: DEFAULT_PASSWORD,
  });
  const wrongPassword = await write('POST', '/api/v1/session', {
    networkSlug: scenario.network.slug,
    cpf: scenario.registrar.cpf,
    password: 'senha-errada',
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
  const scenario = await fullScenario();

  const accepted = await write('POST', '/api/v1/session', {
    networkSlug: scenario.network.slug,
    cpf: scenario.registrar.cpf,
    password: DEFAULT_PASSWORD,
  });
  const refused = await write('POST', '/api/v1/session', {
    networkSlug: scenario.network.slug,
    cpf: scenario.registrar.cpf,
    password: 'senha-errada',
  });

  expect(await accepted.text()).not.toContain(DEFAULT_PASSWORD);
  expect(await refused.text()).not.toContain('senha-errada');
});
```

The credentials come from the factories, not from imagination. `tests/support/factories.ts` mints
network slugs as `rede-teste-<n>` and every account with `DEFAULT_PASSWORD` (`teste-1234`); there is no
`demo` network and no `escolaviva` password anywhere in the suite, so a test written with those refuses
at 422 and fails on the first case. The cookie name is `SESSION_COOKIE` (`ev_session`), taken from the
constant rather than retyped.

**The three refusals are not one door, and the task overstates it.** `identity.authenticate` answers
an unknown **network** with `network_unavailable` on the `networkSlug` field — a different code, a
different shape and a different field from the `invalid_credentials` an unknown CPF or a wrong
password gets. Asserting the three come back identical fails on the first run. What *is* true, and
what the case should assert, is the half that protects a person: an unknown CPF and a wrong password
are indistinguishable, so the endpoint cannot be used to find out who exists inside a network.

The network half stays as it is. This migration may not change a business rule, the SSR screen has
always shown that refusal, and closing it is a decision for whoever owns the stage — so the port
keeps the behaviour and adds a case that **pins** it, with the reasoning written down, rather than
tightening it silently or leaving it untested.

And do **not** assert against `'escolaviva'` in the leak test: that string is `APPLICATION_MARK`, the
value the **client** puts in `X-Requested-By`, so asserting on it proves the request header travelled,
not that the password stayed out of the response. Assert on the password the test actually typed —
which is why the case exercises both the accepted and the refused submission.

- [x] **Step 2: Run them and watch them fail**

Run: `bun test apps/api/tests/api/session.test.ts`
Expected: FAIL — `/api/v1/session` does not exist; the SPA fallback answers HTML.

- [x] **Step 3: Implement `routes/session.ts`**

The logic is that of `web/routes/login.ts`, with three differences: the body arrives from
`c.get('body')` already as JSON, the response is a `201` with the user instead of a `303`, and logout
becomes a `DELETE` answering `204`. The two decisions that govern the file still hold, and they are
recorded here rather than in the file, because `tests/shared/no_comments.test.ts` forbids comments
under `src/`: the screen is not an oracle — a wrong network, a wrong identifier and a wrong password
are indistinguishable to whoever is guessing — and the attempt goes to the log while the CPF typed
does not.

```ts
sessionRoutes.post('/', async (c) => {
  if (currentUserOrNull(c) !== null) {
    return c.json({ user: userAsJson(currentUser(c)) }, 200);
  }

  const input = parse(signInSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), 400);

  const { networkSlug, cpf, password } = input.value;
  const ip = clientIp(c.req.raw, remoteAddress(c), config.trustedProxies);
  const result = await identity.authenticate({
    networkSlug,
    loginIdentifier: cpf,
    password,
    ip,
  });

  if (!result.ok) {
    logger.warn(
      { network_slug: networkSlug, result: LOG_EVENTS.rejected, ip },
      LOG_EVENTS.signInAttempt,
    );
    return c.json(errorBody(result.errors), 422);
  }

  await openSession(c, result.value.sessionId);
  logger.info(
    { network_slug: networkSlug, result: LOG_EVENTS.success, ip },
    LOG_EVENTS.signInAttempt,
  );
  return c.json({ user: userAsJson(result.value.user) }, 201);
});
```

Three details in there are not style:

- **`identity.authenticate` takes `loginIdentifier`, not `cpf`.** Spreading `...input.value` from a
  schema whose field is `cpf` passes the wrong key and the use case sees `loginIdentifier: undefined`.
  The existing `web/routes/login.ts` maps it explicitly for exactly this reason, and `schemaErrors`
  maps the path back with `SCHEMA_FIELD_NAMES.login` so the error lands on the `cpf` input.
- **The user to present is `result.value.user`, not `currentUser(c)`.** The session middleware ran long
  before this route and set the context variable to `null` for an anonymous request; `openSession`
  only writes the cookie. Reading `currentUser(c)` here returns `null` and the 201 answers with no
  user at all.
- **The accessor is `.value`.** `Result<T>` is `{ ok: true; value: T } | { ok: false; errors: … }`;
  `.valor` was removed when the codebase was converted to English on 2026-08-16.
- **The body is on `jsonBody`, not on `body`.** Task 5 gives the JSON edge a context key of its own,
  because widening the existing one collapses to `unknown` and breaks every Eta route. `c.get(body)`
  here reads the form parser's value, which no `/api/v1` request ever populates.

And every path in these three files comes from `API_ROUTES` in `http/constants.ts` — `'/'`,
`'/session'`, `'/account'` and `'/password'` are all reported by `bun run magic` when written inline.
That module is where Task 4 said the API's own route prefixes would live, and this is the task that
starts filling it.

`signInSchema` **does not trim the password**: a leading or trailing space is part of what the person
chose. The network slug and the CPF are trimmed.

- [x] **Step 4: Implement `routes/account.ts`**

`PUT /password`, with the confirmation check before calling the use case — checking here avoids
spending a hundred milliseconds of hash verification to discover the person mistyped the repeat. It
answers `204`. No password comes back to the screen or enters a log line.

- [x] **Step 5: Implement `routes/api.ts` with the middleware order**

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

- [x] **Step 6: Swap `signIn` in the test support**

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

- [x] **Step 7: Nothing to un-`todo`**

This step assumed Tasks 4, 5 and 6 had parked cases waiting for a mounted route. They did not: each
of those tasks drove its middleware through a throwaway application instead of deferring, so there is
nothing here to switch on. What this task does add is the first coverage of those middlewares **in
the order the application actually composes them** — CORS, then secure write, then idempotency, over
a real session — which a probe stack cannot prove.

- [x] **Step 8: Run the whole verification**

Run: `bun run verify`
Expected: PASS. The `tests/web/` suites stay green — SSR was not touched.
Measured: 892 tests across 55 files, exit 0 twice; the 230 SSR cases across 16 files still pass.

- [x] **Step 9: Commit**

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

## PHASE 2 — The API, by role

Seven parallel fronts. Each follows the same six-step script, with patterns **P1 to P5** from the
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
today. A **wrong role** answers 403 — that is `requireRole`'s own answer, and it is reachable. A
**target outside the role's scope** answers 404, never 403: the existence of a student is already
information. The two are different rules and are not interchangeable.

**About the contract types more than one front needs.** Four of them cross front boundaries —
`SimpleOption`, `EnrollmentInList`, `SchoolCounts` and `Shift` — and no front may write another's
file, so all four are already in `apps/api/src/http/contracts/shared.ts`, written by **Task 8** with
the reasoning for each. During phase 2 that file is read-only for every front: import from it, never
edit it. A front that finds it needs a fifth shared type stops and reports, exactly as it would for
`routes/api.ts`.

---

### Task 10: API — Options

**Files:**
- Create: `apps/api/src/http/routes/options.ts`, `apps/api/src/http/contracts/options.ts`, `apps/api/src/http/presenters/options.ts`
- Modify: `apps/api/src/http/routes/api.ts`
- Test: `apps/api/tests/api/options.test.ts`

**Interfaces:**
- Produces: `type SchoolOption = { id: string; name: string; active: boolean }`, `type AcademicYearOption = { id: string; year: number }`, `type ClassGroupOption = { id: string; name: string; gradeLevel: string; shift: Shift; schoolId: string; schoolName: string; academicYearId: string; year: number | null }`
- Consumes: `SimpleOption` and `Shift` from `contracts/shared.ts` (Task 8). This front is the heaviest user of `SimpleOption` but it does **not** own the declaration — Registrar A and Announcements read it too.

**Context:** these lists exist today scattered inside the `GET /new` screens. Each one had its own way
of slicing; concentrating them is what lets TanStack Query cache them with a long lifetime.

| Endpoint | Source | Scope |
|---|---|---|
| `GET /options/schools` | `identity.listSchools` sliced by the session's roles | any role |
| `GET /options/academic-years` | `academics.listAcademicYears` | `network_admin`, `registrar` |
| `GET /options/guardians` | `identity.listUsers(networkId, ROLE.guardian)` | `network_admin`, `registrar` |
| `GET /options/class-groups` | `academics.listClassGroups` within the registrar's scope, with year and school name | `registrar` |
| `GET /options/subjects` | `academics.listSubjects` | `registrar` |
| `GET /options/teachers?schoolId=` | `identity.schoolTeachers` | `registrar` |

> `academics.listGuardians` **does not exist and may not be reintroduced**: it left `academics`
> together with the guardian record, and `tests/academics/queries.test.ts` records why. A guardian is a
> user holding the `guardian` role, so the list is `identity.listUsers(networkId, ROLE.guardian)` — the
> same call `GET /registrar/students/:id/guardians/new` makes today.
>
> None of these six URLs exists in any form. Each is a slice assembled inside a `GET …/new` screen
> handler, with its own scoping: available guardians at `registrar.ts:349-353`, class groups at
> `registrar.ts:397-414`, subjects and teachers at `registrar.ts:755-758`, schools at `network.ts:196`.
> This front is **new API surface**, not a port, and it should be estimated as such.

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
| `POST /network/users` | `{name, email, cpf, phone, roleAssignments:[{schoolId, role}]}` | `201 {userId, temporaryPassword}` |
| `GET /network/academic-years?p=` | — | `Page<AcademicYearInList>` |
| `POST /network/academic-years` | `{year: number, startDate, endDate}` | `201 {id}` |

**What disappears in this task:** `INVITE_COOKIE`, `storeInvite` and `takeInvite`. They exist today only
because the temporary password had to cross a redirect without entering the URL or the
`response_location` column. With JSON it comes back in the `201` body, is shown once by the front and
sits at rest nowhere.

**What also disappears:** `FOUR_DIGIT_YEAR` and the manual conversion of `year` to a number. With JSON
the field arrives as a number and the check becomes `z.number().int()` in the edge schema.

**What stays exactly the same:** the two uniqueness checks inside `identity.inviteUser` —
`emailExists` and `cpfExists`, each answering with `fieldFailure` on the field the form named. They
stay in the use case; the edge schema only guarantees the fields arrived.

There is **no** cross-module check to preserve here. The invitation never reaches `academics`: a
guardian is an `app_user` holding the `guardian` role, so there is no guardian record whose CPF a
typed CPF could diverge from.

**Mandatory test cases:** beyond the P5 table, one per row:

| Case | Expects |
|---|---|
| a successful invitation | `201` with `temporaryPassword` in the body |
| the temporary password does **not** appear in the log | a scan of the flow's log does not find it |
| the temporary password does **not** enter `idempotent_request` | `SELECT response_location` does not contain it |
| repeating the invitation with the same key | `200 {repeated:true}`, and **one** user created |
| a role assignment with a school but no role | `422`, field `roleAssignments` |
| a CPF already used by another user of the network | `422`, field `cpf` |
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
| `POST /registrar/students/:id/guardians` | `{userId, relationship, financiallyResponsible: boolean}` | `201` |
| `GET /registrar/guardians?p=` | — | `Page<GuardianInList>` |
| `POST /registrar/guardians` | `{name, email, phone, cpf, schoolId}` | `201 {id}` |
| `POST /registrar/enrollments` | `{studentId, classGroupId, academicYearId, enrollmentDate}` | `201 {id}` |
| `GET /registrar/enrollments/:id/transfer` | — | `{enrollment, student, classGroups}` |
| `POST /registrar/enrollments/:id/transfer` | `{targetClassGroupId, date}` | `201 {id}` |

Three corrections against the current code, each of which a test written from the old table would
have blessed:

- the link field is **`userId`**, not `guardianId`. `academics.linkGuardian` takes `userId`, `app_user`
  has no `guardian_id` column, and whoever answers for a student is a row in `student_guardian`
  reached through `user_id`. `guardianId` does not exist anywhere in this schema;
- `POST /registrar/guardians` **requires `schoolId`**: the guardian is invited with
  `roleAssignments: [{ schoolId, role: 'guardian' }]`. This is also the one write in the whole
  registrar that answers an out-of-scope body id with a **field error**
  (`FORM_ERRORS.guardianSchoolRequired`) instead of a 404, and it auto-fills the school when the
  registrar holds exactly one. Keep the asymmetry: tightening it into a 404 is a behaviour change, and
  so is loosening the other four body-scope checks into 422s;
- there is no `GET /registrar/enrollments/:id`. The only `GET` under `/registrar/enrollments` is the
  transfer screen, and what that screen needs is the enrollment, the student and the class groups in
  scope.

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
| `GET /teacher/subjects/:classGroupSubjectId/grades?term=` | — | `GradesScreen` |
| `PUT /teacher/subjects/:classGroupSubjectId/grades` | `{term, grades:[{enrollmentId, value: number\|null}]}` | `200 {saved: number}` |
| `GET /teacher/class-groups/:classGroupId/roll-call?date=` | — | `{date, rows: RollCallRow[]}` |
| `PUT /teacher/class-groups/:classGroupId/roll-call` | `{date, rows:[{enrollmentId, present, excuse}]}` | `204` |
| `GET /teacher/class-groups/:classGroupId/closing` | — | `ClosingState[]` |
| `POST /teacher/class-groups/:classGroupId/closing` | `{term}` | `201` |

The parameter names are **not** free. `apps/api/src/web/routes/teacher.ts` declares them in a `ROUTE_PARAMS`
object closed with `satisfies Params<typeof ROUTES.teacher.grades.pattern | typeof
ROUTES.teacher.rollCall.pattern>`; renaming either one to `:id` stops compiling, and the two
resources — a class-group-subject and a class group — would collide under one name in the same router.

**What changes shape, and why:**

- `grade_<uuid>`, `present_<uuid>` and `excuse_<uuid>` **stop existing**. The fields were named by id
  because `parseBody` keeps one value per name and a repeated name would lose rows silently. With
  JSON the body is an array of objects, and the grade-reading helpers and the three prefix constants
  go with them.
- Grades and roll call are `PUT` because that is what they are: replacing the state of a term or of a
  day. The method already carries the guarantee an idempotency key would give — hence they do not
  require `Idempotency-Key`.
- **A `PUT` body *is* parsed, and by the same middleware — read Task 5's two gates before writing a
  handler here.** `jsonIdempotencyMiddleware` is the only place in the API that ever calls
  `c.set('body', …)`, exactly as `idempotencyMiddleware` is the only body parser today (which is why
  `POST /logout` never sees one). Its **first** gate is `BODY_METHODS` — `POST`, `PUT`, `PATCH` — and
  everything past it gets its body parsed into the context; its **second** gate is `POST` only, and
  that is where the `Idempotency-Key` is charged. So the two `PUT` handlers in this task, and
  `PUT /account/password` from Task 9, read the body the ordinary way:

  ```ts
  const input = parse(gradesSchema, c.get(CONTEXT_VARIABLES.body));
  if (!input.ok) return c.json(errorBody(input.errors), 400);
  ```

  A malformed JSON body never reaches the handler: the middleware answers `400` with `MALFORMED_BODY`
  before `next()`. Do **not** "fix" this by parsing again inside the handler, and do **not** move
  either gate: the key check has to stay POST-only, and `DELETE /api/v1/session` has to stay outside
  `BODY_METHODS`, because it carries no body at all.
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
| a grade outside 0–10 | `422`, with `field` pointing at the enrollment |
| `value: null` | clears that enrollment's grade |
| an enrollment that is not in the class group in the body | ignored; the list of who is in the class group comes from the database |
| a term already closed | `422` |
| a roll-call `PUT` twice with the same body | the same state, with no duplicated row |
| a malformed date | `422` — the handler throws `BusinessRuleViolation`, which `errorStatus` maps to 422, exactly as an out-of-set `term` does |
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

- an account with the `guardian` role and **no** `student_guardian` row sees no student at all — it is
  not an error, it is an account the registrar has not linked yet. The dashboard answers `200` empty.
  There is no `guardianId` in this schema: `app_user` has no such column, `SessionUser` has no such
  member, and "has a linked student" is what `academics.guardianEnrollments(networkId, userId)`
  returns, not something the session carries;
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
| an account with the `guardian` role and no `student_guardian` row | dashboard `200` with empty lists; report card `404` |
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
| `POST /announcements` | `{schoolId, title, body, audience, recipients: string[]}` | `201 {id}` |

**The `/new` suffix does not survive the port.** SSR publishes to `POST /announcements/new` because a
browser form needed a URL of its own to post to, distinct from the one that rendered the list; JSON
needs no such thing, so the collection is `/api/v1/announcements` and the method says the rest. This
is the only route in the plan whose path changes, and it changes for a reason that dies with the
templates. Everything else about the write is unchanged, including the out-of-scope `schoolId` → 404
that Global Constraint 25 lists under the old URL.

The field is **`recipients`**, not `guardians`. `guardians[]` is one of the six web-only field names
that exist only because of the form encoding and die with the templates; `recipients` is what
`communication/constants.ts` declares and what every `ApplicationError` on this write already names —
including the two this task's test table expects. A body keyed `guardians` would send the error to a
field React Hook Form never registered, and `setError` on an unregistered name renders nothing at all.

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

### Phase 2 — what the audit found

The seven fronts were audited adversarially after they landed: twenty-five findings raised across
four lenses, fourteen survived refutation, and all fourteen were fixed — each verified by running the
mutation that used to pass impune. Nothing was left open, because this branch is forked by students
and a defect they inherit is a defect they cannot see.

The three that mattered most, and why each was invisible to a green suite:

- **the teacher's schedule guard had no case that could fail.** Every "not your class group" test
  targeted *another network's* ids, where the tenant filter alone already refuses — so replacing the
  guard with a bare network lookup kept all 45 cases green while opening every grade sheet, roll call
  and term closing in the network to any teacher. The SSR suite had this case; the port dropped it;
- **the idempotency middleware read a navigation header as a completion signal.** A write that
  finishes without a `Location` had its key released, so `POST /guardian/board/:id/read` — a 204 with
  nothing to point at — ran twice on a double tap. The status is the signal now, which closes the
  whole class rather than that one route;
- **seven writes emitted a `Location` that answered 404.** The replay handed the front a dead link,
  and every per-front test asserted the string its own route had just produced.

**The pattern worth carrying into phases 3 to 6.** A refusal test that asserts only the status passes
against a route that refuses *after* doing the work. Where a guard exists to stop a write, the case
has to count the rows. And two smaller ones, both real here: a test can diagnose a defect correctly
and then encode it as the contract — the guardian suite expected `204` twice and its comment
explained exactly why the key was being released; and isolating one guard from a chain of them takes
care, because the obvious fixture is often refused earlier by a different guard, and the case then
passes for the wrong reason.

---

## PHASE 3 — The front shell

Six sequential tasks. By the end of them there is a React application that signs in, signs out,
changes the password and shows the layout — with **no** role screen at all. That is on purpose: the
shell is the contract the six fronts of phase 4 will consume, and it has to be settled before six
agents start using it.

### Task 17: Vite, TypeScript and Vitest

> **Executed on 2026-08-17.** `bun run verify` exit 0 across both workspaces: three typecheck passes,
> two cruises, 1204 API tests and 4 front tests. Three things did not survive contact — the cruiser
> config's module form and its `tsConfig` key (Step 5b), and the claim that an empty Vitest run exits
> 0 (Step 6). A fourth is not in this task at all and would have surfaced in Task 22: jsdom has no
> `matchMedia`, and Mantine needs it.

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/postcss.config.cjs`, `apps/web/.dependency-cruiser.js`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/vite-env.d.ts`, `apps/web/src/testSetup.ts`, `apps/web/src/testSupport.tsx`
- Modify: `package.json` (root), `.gitignore`

**Interfaces:**
- Produces: `bun run dev` starts the API and the front together; `bun run build:web` produces `apps/web/dist`; `renderWithProviders(element)`, `renderRoutes(routes)` and `server` (MSW) for every front's tests.

- [x] **Step 1: Install the dependencies**

```bash
# The majors are pinned on purpose, and this overrides the global "install with @latest" rule for this
# workspace. `@latest` today resolves to Vite 8, React Router 8 and Mantine 9 — three majors past what
# every task below assumes. React Router 8 deleted the `react-router-dom` package; Mantine 9 moved
# `defaultRadius` from 4px to 8px and made light-variant CSS variables solid, which visibly redraws
# every screenshot the teaching material is made of. Let `bun.lock` record the patch versions.
mkdir -p apps/web/src
cd apps/web && bun init -y
bun add react@^19 react-dom@^19 react-router@^7 \
        @tanstack/react-query@^5 axios@^1 zustand@^5 zod@^4 \
        react-hook-form@^7 @hookform/resolvers@^5 \
        @mantine/core@^8 @mantine/hooks@^8 @mantine/dates@^8 \
        @mantine/notifications@^8 dayjs@^1
bun add -d vite@^7 @vitejs/plugin-react@^5 typescript@^5 \
        @types/react@^19 @types/react-dom@^19 \
        postcss@^8 postcss-preset-mantine@^1 postcss-simple-vars@^7 \
        vitest@^4 jsdom@^26 msw@^2 \
        @testing-library/react@^16 @testing-library/user-event@^14 \
        @testing-library/jest-dom@^6 @vitest/coverage-v8@^4
```

- [x] **Step 2: Write `apps/web/vite.config.ts`**

```ts
/**
 * The front is pure static: nothing here depends on the server at runtime. That is what makes a
 * future Cloudflare Pages publication a change of `VITE_API_URL` rather than a rewrite (I23).
 *
 * The proxy applies only in development, and it exists so that `VITE_API_URL` can stay empty on the
 * developer's machine: Vite forwards `/api` to Hono, and the cookie stays first-party.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `defineConfig` comes from `vitest/config`, not from `vite`: `test` is not a key of Vite's own
// config type, and importing it from `vite` fails `tsc --noEmit` — the first step of the very
// `bun run verify` this task wires up.
//
// PostCSS is NOT configured here. Mantine documents the preset in a workspace-root
// `postcss.config.cjs`, and that is the arrangement `postcss-preset-mantine`'s mixin resolution is
// tested against; Vite picks the file up on its own.

export default defineConfig({
  plugins: [react()],
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
    // Stated, not inherited: the default moves with the Vite major, and with it the browsers the
    // school secretaries' machines have to have.
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      // Without `include` the gate measures only the files some test happened to import, so an
      // untested module raises the percentage by being invisible. Naming the denominator is what
      // makes the 80 % mean the same thing as the Bun side's 80 %.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/testSetup.ts', 'src/testSupport.tsx', 'src/main.tsx'],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
```

And `apps/web/postcss.config.cjs`, which is the file the block above deliberately leaves the plugins
to. The five `mantine-breakpoint-*` values are not Mantine's defaults: `md` is **60em**, not 62em,
because `app.css` collapses the sidebar into a scrolling top strip at `max-width: 60rem` and moving
that boundary moves the layout on every screen. They must match the `breakpoints` of the theme
Task 19 writes, one for one:

```js
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '60em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};
```

- [x] **Step 3: Write `index.html` and `main.tsx`**

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

`main.tsx` in this task is the smallest thing that proves the toolchain. Task 19 passes it the theme
and Task 21 replaces the placeholder with the providers and the router:

```tsx
/**
 * Mantine renders completely unstyled without its stylesheet, and each installed package ships its
 * own. They are imported here because this is the only module in the front that runs exactly once.
 *
 * `StrictMode` stays on for good: it double-invokes effects in development, which is how a missing
 * cleanup is found by us instead of by a school secretary.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html sem #root');

createRoot(root).render(
  <StrictMode>
    <MantineProvider>
      <p>EscolaViva</p>
    </MantineProvider>
  </StrictMode>,
);
```

`apps/web/src/vite-env.d.ts` is what types the one environment variable the front reads, and it may
contain **no** `import` statement — a single import turns the file into a module and the augmentation
silently stops applying:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

`apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["vite/client", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts", "budget.test.ts"]
}
```

`apps/web/package.json` scripts — `vitest` without `run` watches forever, and `bun run verify` would
hang instead of failing:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

`budget.test.ts` (Task 32) sits at the workspace root rather than under `src/`, which is why it is
named in `include`: without it `tsc --noEmit -p apps/web/tsconfig.json` — a `verify` step — never
looks at the file, and a broken budget test would ship green.

- [x] **Step 4: Write `testSetup.ts` and `testSupport.tsx`**

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

**And two stubs this file must also carry, or every screen test from Task 22 on dies before its first
assertion.** jsdom implements neither `window.matchMedia` — which `MantineProvider` calls on its very
first render to settle the colour scheme — nor `ResizeObserver`, which every self-measuring Mantine
component uses. Without them the failure is `window.matchMedia is not a function`, with a stack
pointing at React's internals rather than at anything anybody wrote:

```ts
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver = ResizeObserverStub;
```

They are stubs, not fakes, and the distinction is worth keeping: nothing in this application decides
anything from a media query, so a query that never matches and an observer that never fires are the
honest answers. The day a screen depends on either, it needs a real implementation and a test that
says so.

**Write the toolchain's own test in this task, rather than leaving the front's suite empty.** Vitest
exits **non-zero** on a run with no test files — the draft above expected 0 — and the usual answer,
`--passWithNoTests`, buys the green tick by switching off the only signal there is. Four cases
through `renderWithProviders` and `renderRoutes` cost nothing and are what turned the `matchMedia`
gap into a failure here instead of in the middle of the first screen of Task 22.

```tsx
/**
 * Every screen test needs the same providers `main.tsx` mounts, and a fresh `QueryClient` per test is
 * what stops one assertion's cache leaking into the next.
 *
 * Two helpers, not one, because the application runs a **data** router. `renderWithProviders` covers
 * the ordinary case — a component that only uses `useNavigate` or `useSearchParams` — with a
 * `MemoryRouter`. Anything that exercises the data router itself (a route-level `errorElement`, the
 * `router.navigate` fired from outside React on a 401) needs `renderRoutes`, which builds a real
 * memory data router: rendering `<App />` inside `MemoryRouter` nests two routers and does not work.
 *
 * The `Suspense` boundary is not decoration. Every role area is a `lazy()` import, and a lazy element
 * with no boundary above it throws on first navigation.
 */
import { Suspense, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  MemoryRouter,
  RouterProvider,
  createMemoryRouter,
  type RouteObject,
} from 'react-router';
import { theme } from './shared/theme/theme';
import { Loading } from './shared/ui/Loading';

type Rendered = RenderResult & { user: UserEvent };

const withProviders = (children: ReactNode): ReactNode => (
  <MantineProvider theme={theme}>
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </QueryClientProvider>
  </MantineProvider>
);

/** A component under a plain router — what a screen test needs nine times out of ten. */
export function renderWithProviders(element: ReactNode, initialRoute = '/'): Rendered {
  // `setup()` before `render` is user-event v14's contract. Calling `userEvent.type` directly builds
  // a throwaway instance per call and stops agreeing with Mantine's pointer-events checks.
  const user = userEvent.setup();
  return {
    user,
    ...render(withProviders(<MemoryRouter initialEntries={[initialRoute]}>{element}</MemoryRouter>)),
  };
}

/** A real data router, for anything that navigates or leans on a route-level error element. */
export function renderRoutes(routes: RouteObject[], initialRoute = '/'): Rendered {
  const user = userEvent.setup();
  const router = createMemoryRouter(routes, { initialEntries: [initialRoute] });
  return { user, ...render(withProviders(<RouterProvider router={router} />)) };
}
```

`theme` arrives in Task 19 and `Loading` in Task 21; until then both are one-line placeholders created
by this task, replaced in place later.

- [x] **Step 5: Wire both workspaces into the root scripts**

```json
"dev": "bun run dev:api & bun run dev:web",
"dev:web": "cd apps/web && bun run dev",
"build:web": "cd apps/web && bun run build",
"typecheck": "bunx tsc --noEmit && bunx tsc --noEmit -p apps/api/tsconfig.json && bunx tsc --noEmit -p apps/web/tsconfig.json",
"check": "bunx depcruise apps/api/src --config apps/api/.dependency-cruiser.js && bunx depcruise apps/web/src --config apps/web/.dependency-cruiser.js",
"test": "bun test apps/api/tests && cd apps/web && bun run test"
```

`typecheck` is **three** passes, not two. The first one is the bare root call Task 1 fought to keep:
the root config's `include` is `["scripts"]`, and dropping that pass in favour of two `-p` calls would
silently stop typechecking the six scripts that live outside both workspaces and import `apps/api/src`
in fifteen places. The second and third are the workspaces themselves. Two of the three would still
print a green tick — which is the whole problem with measuring a gate by its exit code alone.

And `apps/web/dist` goes into `.gitignore`.

- [x] **Step 5b: Give the front's import boundary a tool**

Global Constraint 29 says `apps/web` may import from `apps/api/src/http/contracts/` and from nothing
else. Until now nothing enforced it: `check` cruised `apps/api/src` only, so the cruise never opened a
file under `apps/web/`. Create `apps/web/.dependency-cruiser.js`:

```js
/**
 * The front sees the API through its contracts, and through nothing else. A React file that reaches
 * for `academics`, `identity` or `shared/db` compiles perfectly and is an architecture error: it
 * couples the browser bundle to a module that exists to be replaced at a later stage, and it drags
 * server-only code (Bun.sql, pino) into a graph that has to run in a browser. The rule is here rather
 * than in the API's config because a cruise reports on what it is pointed at, and these are two trees.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const configuration = {
  forbidden: [
    {
      name: 'web-sees-only-contracts',
      comment:
        'apps/web may import apps/api/src/http/contracts/ and nothing else from the API. ' +
        'A contract file has zero imports of its own (Task 8), so this arrow can never pull ' +
        'the server graph across the boundary.',
      severity: 'error',
      from: { path: '^apps/web/src' },
      to: { path: '^apps/api/src/(?!http/contracts/)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
    },
  },
};

export default configuration;
```

Two corrections against the draft above, both found running it. **`export default`, not
`module.exports`**: `apps/web/package.json` declares `"type": "module"`, so a `.js` config using the
CommonJS form dies with *module is not defined in ES module scope* — the API's own config has used
the ESM form since Task 1 for the same reason.

And **no `tsConfig` key.** dependency-cruiser resolves the `include` of that file against the
**cwd**, not against the file, so pointing it at `apps/web/tsconfig.json` from the repository root
makes `["src", …]` mean `raiz/src` and the cruise dies with `TS18003: No inputs were found` — the
same trap Task 1 hit. It is not needed here anyway: the reason the draft gives is the `@/` alias, and
neither `vite.config.ts` nor `tsconfig.json` declares one. `enhancedResolveOptions` supplies the
extensions instead, and `tsPreCompilationDeps` keeps working — verified below.

`tsConfig` is not decoration: without it the cruise cannot resolve the `@/` alias `vite.config.ts` and
`tsconfig.json` declare, and an unresolvable import is not a violation — it is an import the rule never
sees. `tsPreCompilationDeps: true` is what makes a type-only import count; `import type { StudentAsJson }
from '.../academics/domain/student'` is exactly the convenience import this rule exists to refuse, and
it leaves no trace in the emitted JavaScript.

Prove the rule bites before trusting it, in **three** shapes rather than one — this is the constraint
the plan itself flags as the one an ordinary convenience import breaks without anybody noticing:

| Planted in a file under `apps/web/src` | Expected |
|---|---|
| `import { ROLES } from '../../api/src/identity';` | refused, naming `web-sees-only-contracts` |
| `import type { Student } from '../../api/src/academics/domain/student';` | refused — this is the one that matters, and it leaves no trace in the emitted JavaScript |
| `import type { SessionUserAsJson } from '../../api/src/http/contracts/session';` | allowed |

All three were measured. The type-only case is why `tsPreCompilationDeps: true` is not optional: drop
it and the second row passes silently, which is the exact convenience import this rule exists for.

- [x] **Step 6: Prove the shell builds and the test runner works**

Run: `bun run build:web` and then the front's own `test`.
Expected: `dist/index.html` and `dist/assets/*` with content hashes in the names; the suite runs with
zero test files and exits 0. Measured: `index-BSnw_gFr.css` and `index-Dzezck_F.js`.

**And `mountStatic` is not mounted on the application yet — Task 33 mounts it.** Task 7 built it and
called it from `app.ts`, which was harmless only while no `dist` existed: the handler declines when
`index.html` is missing, so the Eta screens kept answering. The moment this task makes the front
buildable that stops being true. Build the front, run the API suite, and the SPA fallback serves its
document on every path the SSR used to answer with a rendered 404 — two golden screens and one
`errors.test.ts` case go red together, looking exactly like a regression in the API.

Documenting that would have been the wrong fix. This repository is forked by students, and a trap
explained in a plan is still a trap for whoever has not read that paragraph yet: `bun run build:web`
followed by `bun run verify` is an entirely reasonable thing to do, and it must not produce three
red tests. So the call comes out of `app.ts` until the Eta routes are gone. `mountStatic` keeps its
own suite, which mounts it on a throwaway app with an explicit root, so it stays covered while it
waits.

Run: `cd apps/web && bun run build && bun run test`
Expected: the build produces `dist/index.html` and `dist/assets/*` with hashes in the names; the suite
runs with zero tests and exits `0`.

- [x] **Step 7: Commit**

```bash
git status --short
git add package.json .gitignore bun.lock apps/web/package.json apps/web/tsconfig.json \
        apps/web/vite.config.ts apps/web/postcss.config.cjs apps/web/.dependency-cruiser.js \
        apps/web/index.html \
        apps/web/src/main.tsx apps/web/src/vite-env.d.ts \
        apps/web/src/testSetup.ts apps/web/src/testSupport.tsx
git commit -m "chore(web): front skeleton with Vite, React 19 and Vitest"
```

---

### Task 18: Formatters

> **Executed on 2026-08-17.** 19 front tests, `bun run verify` exit 0. A literal port is judged by
> one thing and the task does not name it: **the two sides must agree**. Both implementations were
> run over the same 47 values — every grade, rate, percentage, date and CPF the cases below use,
> plus the boundaries — and they produce identical output. A test per side that passes independently
> would not have shown that.

**Files:**
- Create: `apps/web/src/shared/format/date.ts`, `number.ts`, `cpf.ts`, `index.ts`, and the three matching `.test.ts`

**Interfaces:**
- Produces: `formatDate`, `formatDateTime`, `formatGrade`, `formatPercent`, `formatRate`, `formatCpf` — signatures identical to those in `apps/api/src/web/render.ts`.

**Context:** these are literal ports. Two rules come with them and must not be lost in translation, and
so each one gets a test that names it.

- [x] **Step 1: Write the failing tests**

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

- [x] **Step 2: Run them and watch them fail**

Run: `bun run --cwd apps/web test src/shared/format`
Expected: FAIL — the modules do not exist.

- [x] **Step 3: Port from `apps/api/src/web/render.ts` and `apps/api/src/shared/document/cpf.ts`**

Copy the internal helpers — date parsing, number parsing, one-decimal truncation, two-digit padding,
the ISO date pattern and the missing-value em dash — and the six public functions. The comment about
truncation comes with them: it is what stops somebody "fixing" it to `Math.round` a year from now.

`formatCpf` is a copy, not an import: the front does not import the domain, and the CPF arithmetic is
the same on both sides. The duplicated test is the price, and it is cheap.

- [x] **Step 4: Run the tests, and then check the two sides against each other**

Run: `bun run --cwd apps/web test src/shared/format`
Expected: PASS. Measured: 15 cases.

**Then prove the port, which the cases above cannot.** Each side passing its own suite says both are
self-consistent, not that they agree — and agreement is the whole requirement here, because a number
the server rendered yesterday and the front renders today must not differ. Import both
implementations into one throwaway script and compare them over the same inputs: the grades, the
rates, the dates and the CPFs the cases use, plus the boundaries. Measured: 47 values, no divergence.

Two things that port badly and are worth checking by name in that comparison. `formatDate` must read
an ISO string by its parts and never hand it to `new Date`, which is UTC midnight and prints the
previous day in every timezone in this country. And `formatRate` multiplies by a hundred while
`formatPercent` does not — handing a fraction to the second is the mistake the pair exists to make
visible.

- [x] **Step 5: Commit**

```bash
git status --short
git add apps/web/src/shared/format
git commit -m "feat(web): formatters for date, grade, rate and CPF"
```

---

### Task 19: The Mantine theme from `app.css`

> **Executed on 2026-08-17.** 11 theme tests, `bun run verify` exit 0. Two additions the task does
> not ask for and that turned out to matter: the five breakpoints exist in **two** files and nothing
> compared them, and a theme can be well-formed data that the provider never applies.

**Files:**
- Create: `apps/web/src/shared/theme/theme.ts`, `apps/web/src/shared/theme/theme.test.ts`
- Read-only: `apps/api/src/web/public/app.css` (1,004 lines, 44 custom properties)

**Interfaces:**
- Produces: `theme`, built with `createTheme({...})` — consumed by `MantineProvider` in `main.tsx` and by `renderWithProviders`.

**Context:** the goal is for the screens to stay **recognisable**. The screenshots in the teaching
material must not turn into a different product. This is not a redesign.

- [ ] **Step 1: Extract the custom properties from `app.css`**

```bash
grep -oE '^\s*--[a-z0-9-]+:\s*[^;]+;' apps/api/src/web/public/app.css | sort -u
```

Group the output into five buckets: colour, typography, spacing, radius, shadow. Whatever fits none of
them is component styling and becomes a CSS Module in phase 4 — do not force it into the theme.

- [x] **Step 2: Write the failing test**

The theme is data, and what you test in data is that it is complete enough for Mantine:

```ts
test('the primary palette has the ten shades Mantine requires', () => {
  const primary = theme.colors?.[theme.primaryColor ?? ''];
  expect(primary).toHaveLength(10);
  expect(primary?.every((shade) => /^#|^oklch|^rgb/.test(shade))).toBe(true);
});

test('font sizes and spacing cover the five keys Mantine indexes', () => {
  for (const key of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
    expect(theme.fontSizes?.[key]).toBeDefined();
    expect(theme.spacing?.[key]).toBeDefined();
  }
});

test('the corners stay square, because square corners were the decision', () => {
  // `app.css` sets `border-radius: 0` on every input and on `.button`. Mantine's default is rounded,
  // so a missing `defaultRadius` redesigns every control on every screenshot in the material.
  expect(theme.defaultRadius).toBe(0);
});

test('the breakpoint that collapses the sidebar did not move', () => {
  // `app.css` turns the sidebar grid into a scrolling top strip at `max-width: 60rem`. Mantine
  // reasons in `min-width`, and its default `md` is 62em — two rem later, on every screen.
  expect(theme.breakpoints?.md).toBe('60em');
});
```

- [x] **Step 3: Run it and watch it fail**

Run: `cd apps/web && bun run test src/shared/theme`
Expected: FAIL

- [x] **Step 4: Write `theme.ts`**

```ts
/**
 * The theme is the translation of the handwritten `app.css` into Mantine's vocabulary. It exists so
 * that the migration does not become a redesign: the screens have to stay recognisable, because the
 * stage's teaching material is made of screenshots of them.
 *
 * Mantine requires ten shades per named colour and expects them as CSS colour strings. `app.css`
 * declares its palette in OKLCH and has fewer than ten shades — the intermediate ones are
 * interpolated in OKLCH space, and the shades that came straight from the sheet are marked.
 *
 * Two things do **not** fit and must not be forced in. The semantic couples
 * (`--success-ink` on `--success-background`, and the same for warning and danger) are ink/background
 * pairs used by `.tag` and `.notice`; they are not a Mantine scale and stay as CSS custom properties
 * that the component modules read. And `--text-base`, `--text-medium`, `--text-large`,
 * `--text-title` and `--text-display` are fluid `clamp()` values: they go into `fontSizes` verbatim,
 * not resolved to a fixed rem.
 */
export const theme = createTheme({
  primaryColor: 'escola',
  colors: { escola: [/* ten shades, OKLCH */] },
  // Square corners are a decision, not an omission: `app.css` sets `border-radius: 0` on every input,
  // select, textarea and on `.button`, and the only rounded things in the whole sheet are the 1px
  // focus ring and the dot before a tag. Mantine's default is rounded, so leaving this out redraws
  // every control on every screen.
  defaultRadius: 0,
  fontFamily: '…',            // from --sans
  fontFamilyMonospace: '…',   // from --mono
  headings: { fontFamily: '…' }, // from --serif: h1-h4, legend, .brand, .empty__title
  fontSizes: { /* xs…xl, clamp() kept verbatim */ },
  spacing: { /* xs…xl, from the --s* step scale; there is no --s5, --s7 or --s10 */ },
  radius: { /* every key 0 — nothing in this design is rounded */ },
  shadows: { /* … */ },
  // `max-width` in rem on the CSS side, `min-width` in em on Mantine's: recompute, do not map
  // sm/md/lg by eye. The one that matters is 60rem, where the sidebar collapses into a scrolling
  // top strip.
  breakpoints: { xs: '36em', sm: '48em', md: '60em', lg: '75em', xl: '88em' },
});
```

- [x] **Step 5: Run the tests, and add the two the task does not ask for**

Run: `bun run --cwd apps/web test src/shared/theme`
Expected: PASS.

**Tie the breakpoints to `postcss.config.cjs`.** The five values are written twice — in the theme and
in the PostCSS config that feeds the Mantine mixins — and nothing in the toolchain compares them. A
drift there is subtle and expensive: a component would take its media query from one set and its
layout from the other, and the gap between 60em and 62em is exactly where the sidebar collapses. Read
the config as text (it is CommonJS in an ESM workspace) and assert equality. Changing one file alone
now turns the case red.

**And assert that the provider actually applies the theme.** Every case above examines the object,
and a well-formed object Mantine ignores would pass all of them while the screens rendered as default
Mantine. Render a component through the real provider and read what it wrote: jsdom does not evaluate
Mantine's stylesheet, so a component's computed radius is empty whatever the theme says — but the
custom properties on the root *are* evaluated, and `--mantine-radius-default` is where `defaultRadius`
lands. Deleting that one line turns two cases red instead of one.

- [x] **Step 6: Commit**

```bash
git status --short
git add apps/web/src/shared/theme
git commit -m "feat(web): Mantine theme derived from the current CSS"
```

---

### Task 20: HTTP client and error translation

> **Executed on 2026-08-17.** 20 tests in `src/shared/api`, `bun run verify` exit 0, every guard
> proven by mutation (eight mutations, eight red cases). One trap the task did not mention and that
> would have reached the students: **no `.env` in the repository declares `VITE_API_URL`**, and
> `vite-env.d.ts` typed it as a plain `string`. The compiler would therefore have approved
> `` `${import.meta.env.VITE_API_URL}/api/v1` `` producing the literal string `undefined/api/v1` — a
> relative URL the browser resolves against whichever page happens to be open, so it fails
> differently on every screen and never names the variable that caused it. The declaration is now
> optional, the fallback is explicit, and `baseUrl` is exported so a case can assert on it.
>
> Three cases the task's list does not ask for and that cover real branches: a `PUT` carries the mark
> and **no** key (the plan tested only that a POST carries both, so nothing distinguished the two
> verbs); a read carries neither; and the correlation code falls back to the `X-Correlation-Id`
> header when the body has none — which is every failure the API did not get far enough to shape.

> **Observation — Axios overlaps with what the platform already provides.** Exactly three Axios
> features are used here: `baseURL`, one request interceptor for three headers, and one response
> interceptor that maps a failure onto `ApiError`. All three are a short wrapper over `fetch`, which
> Bun and every browser this build targets ship natively, and TanStack Query is transport-agnostic —
> it never sees the client. Axios stays in the stack because a named instance with two interceptors
> is a clearer teaching object than a hand-rolled wrapper, and because the interceptor is what
> guarantees the idempotency key and the internal-origin mark always travel. The cost is honest and
> should be stated to the class: axios@1 spends bytes against the 150 kB guardian ceiling this plan
> sets for itself in Task 32.

**Files:**
- Create: `apps/web/src/shared/api/client.ts`, `error.ts`, `index.ts`, `client.test.ts`, `error.test.ts`

**Interfaces:**
- Produces:
  - `client: AxiosInstance` — the system's only instance
  - `class ApiError extends Error { status: number; errors: readonly ApplicationError[]; correlationId: string; general(): string | null }`
  - `applyErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, warn: (m: string) => void, known: readonly string[]): void` — the fourth argument is the form's registered field list, and it is not optional (P8)
  - `onSessionExpired(action: () => void): void` — registers what to do when the API answers 401

`ApplicationError` and `ErrorBody` are imported from `apps/api/src/http/contracts/errors.ts` (Task 8).
They are the **only** server types this file may touch: `shared/result.ts` is not a contract, and the
front importing it would be the architecture error Global Constraint "the front never imports the
domain" names.

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
      { errors: [{ field: 'name', code: 'obrigatorio', message: 'Informe o nome.' }], correlationId: 'abc' },
      { status: 422 },
    ),
  ));

  const error = await client.post('/x', {}).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(422);
  expect((error as ApiError).errors[0].field).toBe('name');
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
  server.use(http.get('*/api/v1/x', () => HttpResponse.json({ errors: [] }, { status: 401 })));

  await client.get('/x').catch(() => undefined);

  expect(expired).toBe(1);
});

test('an error without a field becomes a general warning, and one with a field goes to the input', () => {
  const set: [string, string][] = [];
  const warnings: string[] = [];
  const error = new ApiError(422, [
    { field: 'cpf', code: 'x', message: 'CPF inválido.' },
    { code: 'y', message: 'Já existe um usuário com este e-mail.' },
  ], 'abc');

  applyErrors(error, ((field, options) => set.push([field, options.message ?? ''])) as never,
              (m) => warnings.push(m), ['cpf', 'email']);

  expect(set).toEqual([['cpf', 'CPF inválido.']]);
  expect(warnings).toEqual(['Já existe um usuário com este e-mail.']);
});

test('an error naming a field the form does not have becomes a warning, not silence', () => {
  const set: string[] = [];
  const warnings: string[] = [];
  const error = new ApiError(422, [
    { field: 'roleAssignments', code: 'z', message: 'Escolha ao menos uma unidade.' },
  ], 'abc');

  applyErrors(error, ((field) => set.push(field)) as never, (m) => warnings.push(m), ['name', 'cpf']);

  expect(set).toEqual([]);
  expect(warnings).toEqual(['Escolha ao menos uma unidade.']);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && bun run test src/shared/api`
Expected: FAIL

- [ ] **Step 3: Write `error.ts`**

```ts
/**
 * The API error is a class, not a loose object, so that `instanceof` works in any screen's `catch`.
 * The `errors` arrive in the format the server already used internally — `{field, code, message}` —
 * and that is why there is no translator between the two ends.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly ApplicationError[],
    readonly correlationId: string,
  ) {
    super(errors[0]?.message ?? 'Não foi possível falar com o servidor.');
    this.name = 'ApiError';
  }

  /** The message belonging to no field — the one that becomes a warning at the top of the form. */
  general(): string | null {
    return this.errors.find((problem) => problem.field === undefined)?.message ?? null;
  }
}

export function applyErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  warn: (message: string) => void,
  known: readonly string[],
): void {
  if (!(error instanceof ApiError)) {
    warn('Não foi possível falar com o servidor. Tente de novo.');
    return;
  }

  for (const problem of error.errors) {
    // `setError` on a name the form never registered attaches an error that no input renders: it
    // does not throw and does not warn, it simply disappears. So a field the form does not have —
    // and a problem with no field at all — becomes the warning at the top instead of silence.
    if (problem.field !== undefined && known.includes(problem.field)) {
      setError(problem.field as Path<T>, { type: 'server', message: problem.message });
      continue;
    }
    warn(problem.message);
  }
}
```

`known` is the form's registered field list — `STUDENT_FIELDS`, `USER_FIELDS`, one per form, declared
next to the schema it mirrors. Note what the loop replaced: `general()` is still on `ApiError` for a
screen that wants only the fieldless message, but `applyErrors` no longer calls it, because the
fieldless case and the unknown-field case now take the same path.

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
// `import.meta.env.VITE_API_URL` is typed by `src/vite-env.d.ts` (Task 17). Empty means same origin,
// which is today's state.
const BASE = `${import.meta.env.VITE_API_URL}/api/v1`;
const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const SESSION_PATH = '/session';
const CORRELATION_HEADER = 'x-correlation-id';

const NETWORK_ERROR: ApplicationError = {
  code: 'network_unreachable',
  message: 'Não foi possível falar com o servidor.',
};

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
  // `PUT` and `DELETE` carry no key: the method is already idempotent, and `jsonIdempotencyMiddleware`
  // lets them through untouched.
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
    const { status, config, headers } = failure.response;
    const body = failure.response.data as Partial<ErrorBody>;

    // A 401 on `/session` is the answer to "is anybody signed in?", not an expiry. Treating it as one
    // would make the login screen clear the cache and navigate to itself: the cleared 401 is refetched,
    // answers 401 again, and the loop never settles.
    const probingTheSession = (config.url ?? '').endsWith(SESSION_PATH);
    if (status === 401 && !probingTheSession) onExpired();

    // The correlation id is echoed on every response by `correlationMiddleware`; the body carries it
    // only when the API had a chance to build one. The header is the reliable half.
    const correlationId = body.correlationId ?? String(headers[CORRELATION_HEADER] ?? '');
    return Promise.reject(new ApiError(status, body.errors ?? [], correlationId));
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

> **Executed on 2026-08-17.** 110 front tests (50 new), `bun run verify` exit 0, twelve mutations and
> twelve red cases. Five divergences from the task as written, each measured rather than assumed:
>
> 1. **`bun run verify` did not build the front.** Typecheck, boundaries, magic values and both test
>    suites, and then nothing ran `vite build` — so a broken bundle shipped green, and the person who
>    found out was whoever ran `build:web` next. `build:web` is now the last step of `verify`; it
>    costs 1.5 s. This is the trap with the widest blast radius on this branch, because everything
>    after it in the plan is front-end work.
> 2. **Mantine's notification queue is a module-level store and leaked between cases.** `render`
>    cleanup does not touch it — the queue never belonged to the tree — so the second case to fire the
>    same message found two of them and failed on "found multiple elements", pointing at the
>    assertion rather than at the case that leaked. `cleanNotifications()` now runs in `testSetup`'s
>    `afterEach`. Every screen test in phase 4 would have hit this.
> 3. **The task's `RequireLogin` test could not have passed as written.** `<Navigate>` inside a bare
>    `MemoryRouter` changes the URL and renders nothing, so `findByText(/entrar/i)` would fail no
>    matter what the guard did. It uses `renderRoutes` with a two-route table instead, which is what
>    actually proves a redirect.
> 4. **`createBrowserRouter` moved out of `routes.tsx` into `App.tsx`.** At module scope in
>    `routes.tsx` it ran on every import — including every test that only wants the route table for
>    `createMemoryRouter`. `App.tsx` is the module imported exactly once, so the router, the
>    `QueryClient` and the `onSessionExpired` wiring live there together; `main.tsx` is now four lines
>    of mounting.
> 5. **`Pagination` navigates by link, not by `onChange`.** The declared interface asked for a
>    callback, which contradicts this plan's own rule that the page lives in the URL: a callback means
>    local state, and local state means a page number that survives neither a bookmark nor a reload.
>    `<Pagination>` renders anchors carrying the whole query string, exactly as `_pagination.eta` did,
>    and takes `shown` alongside `size` — computing the last row from `size` alone prints "41–50 de 43"
>    on every final page.
>
> `Table` is `columns` + `rows` with a `cell` function per column, and **not** the compound component
> with a context that throws: twenty screens in phase 4 consume it, and a compound API would be noise
> in all twenty to justify a throw the `ErrorBoundary` does not need — a lazy chunk that fails to
> download exercises the same boundary, and that one is real.
>
> Bundle today: **154 kB gzipped** on first load, against the 150 kB ceiling Task 32 sets. Over, and
> known — Task 32 is where the ceiling is enforced, and this is the number it starts from.

> **Decision — one notification system, and Zustand holds nothing at this stage.**
> `@mantine/notifications` is installed in Task 17, and this task **mounts it**: `<Notifications />`
> goes inside `MantineProvider` in `App.tsx`, and it is the plan's only surface for a transitory
> message. It has to go into `testSupport.tsx`'s `withProviders` as well, in the same position: a
> notification fired by a screen whose test tree has no `<Notifications />` renders nowhere, and the
> assertion fails for a reason that has nothing to do with the screen under test. `shared/ui/notices.ts` is a twelve-line module wrapping the package's imperative API behind
> the three names the rest of the plan already calls — `success(m)`, `error(m)`, `clear()` — so no call
> site changes and nobody has to remember which of two systems a screen was written against. Two
> mechanisms for one job is how a codebase ends up with half its messages appearing in a place users
> have learned to ignore.
>
> Choosing Mantine here has a concrete reason beyond taste: the package already solves stacking,
> auto-dismiss, the pause-on-hover the SSR flash messages never had, and the `role="alert"` region that
> makes a message reach a screen reader. A hand-written store would have to grow all of that or quietly
> do without it, and "quietly do without it" is an accessibility regression against the pages this
> migration is supposed to replace without loss.
>
> **What that leaves for Zustand: nothing, at Stage 01.** The session lives in TanStack Query's cache,
> the filters and the page live in the URL by an explicit rule, optimistic state is forbidden here, and
> the notices queue now belongs to Mantine. The dependency stays declared — it is part of the stack this
> material teaches, and it costs zero bytes in the bundle while nothing imports it — but the plan states
> the finding rather than manufacturing a store to justify the install. That is the honest measure of
> how much global state a well-scoped SPA actually needs, and it is a better lesson than a contrived
> one. The first store that earns its place arrives with a later stage.
>
> When it does, one Zustand-5 rule has to be on the table before the first selector is written: the
> store hook no longer takes an equality function, and `useSyncExternalStore` compares with `Object.is`.
> A selector returning a **scalar** — `(s) => s.error` — is safe; one that builds a fresh object or array
> — `(s) => ({ success: s.success, error: s.error })` — is never `Object.is`-equal to the previous
> result, and the component loops until it unmounts with a maximum-update-depth error. Any multi-member
> read goes through `useShallow`. It is written here because this is where somebody will look for it.

**Files:**
- Create: `apps/web/src/app/App.tsx`, `routes.tsx`, `guards.tsx`, `Layout.tsx`, `guards.test.tsx`; the five small screens `routes.tsx` names and no other task creates — `apps/web/src/app/{ToDashboard,AccountWithoutRole,NoPermission,NotFound,UnexpectedError}.tsx`; `apps/web/src/features/session/queries.ts`, `mutations.ts`; `apps/web/src/shared/ui/{Table,Pagination,Empty,Loading,LoadFailed,ErrorBoundary}.tsx`; `apps/web/src/shared/ui/notices.ts`; `apps/web/src/shared/api/pageParams.ts`; the five `apps/web/src/features/<role>/routes.tsx` shells, each empty
- Placeholder here, real in Task 22: `SignInScreen` and `PasswordChange` are already referenced by `routes.tsx`, so this task creates them as one-line stubs and Task 22 replaces them in place — the same arrangement Task 17 used for `theme` and `Loading`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/testSupport.tsx` (its `theme` and `Loading` placeholders become the real ones)

**Interfaces:**
- Produces:
  - `useSession(): UseQueryResult<SessionUserAsJson>` — the query that hydrates the application
  - `<RequireLogin>`, `<RequireRole role={...}>`
  - `initialDashboard(user: SessionUserAsJson): string`
  - `useNotices(): { success(m: string): void; error(m: string): void; clear(): void }` — the wrapper over `@mantine/notifications`. It is a plain hook returning a stable object, not a store: no selector, no subscription, nothing to re-render. `<Notifications />` is mounted once in `App.tsx`
  - `<Table columns rows>`, `<Pagination page pages param onChange>`, `<Empty title text action?>`, `<Loading>`, `<LoadFailed error: unknown onRetry?>`
  - `<ErrorBoundary>` — the plan's **only** boundary component, mounted above the router outlet and again inside each lazy role area. Not `AreaErrorBoundary`, not `FeatureBoundary`
  - `PAGE_PARAMS` and `requestedPage` — the six page-parameter names and the server's clamping rule, ported into `shared/api/pageParams.ts` because `web/constants.ts` is not a contract and dies in Task 33

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
    HttpResponse.json({ errors: [], correlationId: '' }, { status: 401 }),
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

// One role or several: `/announcements` is guarded on the server by
// `requireRole(registrar, network_admin)`, and a guard that cannot say "either of these" would leave
// that route the only unguarded one in the tree.
export function RequireRole({
  role,
  children,
}: {
  role: Role | readonly Role[];
  children: ReactNode;
}) {
  const { data: user, isPending } = useSession();
  if (isPending) return <Loading />;
  if (user === undefined) return <Navigate to="/login" replace />;
  const accepted = Array.isArray(role) ? role : [role as Role];
  if (!accepted.some((one) => hasRole(user, one))) return <NoPermission />;
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

/**
 * Every `lazy()` element sits under a `Suspense` **and** under its own `ErrorBoundary`. The first is
 * not optional: a lazy element with no boundary above it throws on the first navigation to that role.
 * The second is what keeps one role's crash from blanking the whole application — including the
 * deliberate throws a compound component makes when one of its parts is used outside its parent.
 */
const roleArea = (element: ReactNode): ReactNode => (
  <ErrorBoundary>
    <Suspense fallback={<Loading />}>{element}</Suspense>
  </ErrorBoundary>
);

/**
 * The array is exported as well as the router: `createMemoryRouter(routes)` in `testSupport.tsx` is
 * how a navigation test gets a real data router without a browser.
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <SignInScreen /> },
  {
    element: <RequireLogin><Layout /></RequireLogin>,
    errorElement: <UnexpectedError />,
    children: [
      { path: '/', element: <ToDashboard /> },
      { path: '/dashboard', element: <ToDashboard /> },
      { path: '/account/password', element: <PasswordChange /> },
      { path: '/no-role', element: <AccountWithoutRole /> },
      { path: '/network/*', element: <RequireRole role="network_admin">{roleArea(<Network />)}</RequireRole> },
      { path: '/registrar/*', element: <RequireRole role="registrar">{roleArea(<Registrar />)}</RequireRole> },
      { path: '/teacher/*', element: <RequireRole role="teacher">{roleArea(<Teacher />)}</RequireRole> },
      { path: '/guardian/*', element: <RequireRole role="guardian">{roleArea(<Guardian />)}</RequireRole> },
      // Two roles reach the board, exactly as `requireRole(registrar, network_admin)` does on the
      // server. Leaving it unguarded would walk a teacher into a screen whose every request is a 403.
      {
        path: '/announcements/*',
        element: <RequireRole role={['registrar', 'network_admin']}>{roleArea(<Announcements />)}</RequireRole>,
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];

/**
 * `createBrowserRouter` — React Router's **data** mode — with no `loader` and no `action` looks like
 * the wrong choice, and the documentation does recommend declarative `<BrowserRouter>` for an
 * application whose data layer is its own. It is nevertheless required here: `onSessionExpired` calls
 * `router.navigate('/login')` from outside React, and only a data router hands you a router object to
 * call. Do not "simplify" this to `<BrowserRouter>`; 401 handling dies silently with it.
 */
export const router = createBrowserRouter(routes);
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
`partials/_pagination.eta`, `partials/_empty.eta` and `partials/_messages.eta`. Each one carries a
rule that is not obvious from its name:

- **`Pagination`** reproduces the seven-number window from `apps/api/src/web/pagination.ts` (seven fit on a
  phone line without wrapping) and its two quieter contracts: page 1 is expressed by **deleting** the
  parameter, not by setting it to 1, so `/students?q=ana` and `?q=ana&p=1` stay the same address; and
  every other query parameter is preserved. The parameter name is a **prop**, because three screens
  run two independent cursors on one page (`pGuardians`/`pEnrollments`, `pSubjects`/`pEnrollments`,
  `pUnread`/`pRead`) and advancing one may not move the other. Markup keeps what the template had:
  `rel="prev"`/`rel="next"`, `aria-current="page"` on the current number, an inert `aria-hidden` span
  at each end, and the "first–last de total" line, which renders whenever `total > 0` even when there
  is only one page.
- **`Table` and `Pagination` are a compound pair.** Export the parts as named exports and have each
  part read its shared state from a private context that **throws a named error** when the part is
  rendered outside its parent. That throw is precisely why the `ErrorBoundary` above the router is
  not optional.
- **`Empty`** takes `title`, `text` and an optional `action: { href, text }` — the shape
  `_empty.eta` already has. A single `message` prop loses the call to action that half the empty
  states carry.
- **`LoadFailed`** shows the message and the `correlationId` — the code support uses to find the trail
  in the log. It cannot be typed `error: Error`: TanStack Query 5 types `query.error` as `Error`, and
  `correlationId` lives on `ApiError`. Either declare the queries `useQuery<TData, ApiError>` or type
  the prop `error: unknown` and narrow with `instanceof ApiError`, falling back to the plain message.
  Pick one and use it everywhere; mixing them makes every screen decide again.
- **No virtualization, and that is a decision.** Every list in this system is server-paginated at ten
  rows, so nothing ever renders an unbounded number of rows. `@tanstack/react-virtual` would be a new
  dependency solving a problem the data model already solved, and it would spend bytes from the
  150 kB guardian ceiling this plan sets for itself. Virtualize only if a list ever stops being paged.

- [ ] **Step 8: Run the tests**

Run: `cd apps/web && bun run test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git status --short
git add apps/web/src/app apps/web/src/main.tsx apps/web/src/testSupport.tsx \
        apps/web/src/shared/ui apps/web/src/shared/api/pageParams.ts \
        apps/web/src/features/session apps/web/src/features/network/routes.tsx \
        apps/web/src/features/registrar/routes.tsx apps/web/src/features/teacher/routes.tsx \
        apps/web/src/features/guardian/routes.tsx apps/web/src/features/announcements/routes.tsx
git commit -m "feat(web): router with today's URLs, guards and list components"
```

---

### Task 22: Sign-in and password change

> **Executed on 2026-08-17. Phase 3 closes here.** 157 front tests + 1204 API tests, `bun run verify`
> exit 0, twelve mutations across both screens. Step 6 — the plan's only manual check — was run twice:
> once by HTTP through the Vite proxy (201 with `Set-Cookie`, then 200 on `GET /session` with the
> cookie, `PUT /account/password` 204, a mismatched confirmation refused 422 with
> `field: "passwordConfirmation"`, `DELETE /session` 204, and 401 afterwards), and once in a real
> browser against the real API. The seed password was restored to `escolaviva` and verified.
>
> **The browser found four defects that 156 passing tests did not**, all of them accessibility
> regressions against the SSR pages, and all of them invisible to a test that never asks:
>
> 1. **Two `<main>` elements and two `<nav>` elements.** Mantine's `AppShell.Main` and
>    `AppShell.Navbar` already *are* those elements; wrapping each in another of the same kind
>    compiles, renders identically, and hands a screen reader two landmarks where there is one region.
>    The id and the label now go on the Mantine components themselves.
> 2. **The skip link sat inside the region it skips to**, so it was reachable only after tabbing
>    through everything it existed to skip. It is now the first focusable element on the page. The
>    old case asserted the link existed; the new one asserts where it is.
> 3. **`/favicon.ico` 404 on every load.** `partials/_icon.eta` inlined two SVG data URIs and
>    `index.html` carried neither. Both are back, verbatim.
> 4. **Three unnamed icon buttons**: Mantine's password reveal toggle and the notification dismiss
>    button, each announced as "button" — the first next to a password field, the second as the only
>    way out of a refusal that never auto-closes. Named at the one place that fires them.
>
> A fifth, found by reading ahead rather than by the browser: **the area shells created in Task 21
> used `<Outlet />`**, which under the childless splat in `app/routes.tsx` renders null in silence.
> Phase 4's own text says `<Routes>`, and phase 4 is where somebody would have discovered it — as a
> blank page with no error to search for. All five shells were rewritten, and `routes.test.tsx`
> asserts the shape of each one, which is the rare case where a structural assertion earns its keep:
> the property is not observable until the screens exist.
>
> Two mutations survived the first pass and both were real gaps in the tests, not in the code. Landing
> on the wrong dashboard went unnoticed because the case asserted a navigation link was present, and
> somebody holding two roles has both links wherever they land — it now asserts `aria-current`. And
> reverting a shell to `<Outlet />` went unnoticed because the case exercised local components rather
> than the five real shells.
>
> Bundle: **189 kB gzipped** on first load, against Task 32's 150 kB ceiling. Zod, React Hook Form and
> the resolvers arrived with this task.

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
  // `renderRoutes`, not `renderWithProviders(<App />)`: `App` mounts the data router, and mounting it
  // inside the helper's `MemoryRouter` nests two routers.
  const { user } = renderRoutes(routes, '/login');

  await user.type(screen.getByLabelText('Rede'), 'demo');
  await user.type(screen.getByLabelText('CPF'), '529.982.247-25');
  await user.type(screen.getByLabelText('Senha'), 'escolaviva');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));

  expect(await screen.findByText('Painel da secretaria')).toBeVisible();
});

test('a refused credential shows the server message and keeps what was typed', async () => {
  server.use(
    http.post('*/api/v1/session', () =>
      HttpResponse.json(
        { errors: [{ code: 'credenciais_invalidas', message: 'CPF ou senha inválidos' }],
          correlationId: 'abc' },
        { status: 422 },
      ),
    ),
  );
  const { user } = renderWithProviders(<SignInScreen />);

  await user.type(screen.getByLabelText('Rede'), 'demo');
  await user.type(screen.getByLabelText('CPF'), '529.982.247-25');
  await user.type(screen.getByLabelText('Senha'), 'errada');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));

  expect(await screen.findByText('CPF ou senha inválidos')).toBeVisible();
  // Whoever got the password wrong should not be forced to retype the rest.
  expect(screen.getByLabelText('Rede')).toHaveValue('demo');
  expect(screen.getByLabelText('CPF')).toHaveValue('529.982.247-25');
  expect(screen.getByLabelText('Senha')).toHaveValue('');
});

test('the typed password never appears in the URL or in a document attribute', async () => {
  const { user } = renderWithProviders(<SignInScreen />);

  await user.type(screen.getByLabelText('Senha'), 'segredo123');

  expect(window.location.search).not.toContain('segredo123');
  expect(document.body.innerHTML).not.toContain('segredo123');
});

test('a mismatched confirmation is blocked before it reaches the server', async () => {
  let called = false;
  server.use(http.put('*/api/v1/account/password', () => { called = true; return new HttpResponse(null, { status: 204 }); }));
  const { user } = renderWithProviders(<PasswordChange />);

  await user.type(screen.getByLabelText('Senha atual'), 'antiga');
  await user.type(screen.getByLabelText('Senha nova'), 'nova-senha-longa');
  await user.type(screen.getByLabelText('Confirme a senha nova'), 'outra-coisa');
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }));

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
  //
  // `error`, not `message`: Zod 4 collapsed `message`, `invalid_type_error`, `required_error` and
  // `errorMap` into a single `error` key, and a leftover `message` is silently ignored — the screen
  // would show Zod's default English text where the test expects the Portuguese sentence.
  .refine((values) => values.newPassword === values.passwordConfirmation, {
    path: ['passwordConfirmation'],
    error: 'A confirmação não confere com a senha nova.',
  });
```

One toolchain note that belongs to both forms of this task: `zodResolver` from `@hookform/resolvers`
brands its overloads with the Zod **minor** it was built against, and against Zod 4.3+ the overload
match fails. The runtime resolves correctly; only `tsc --noEmit` complains — which is exactly the gate
this plan runs before every commit. Use `standardSchemaResolver` from
`@hookform/resolvers/standard-schema` instead, which takes the same Zod 4 schema through the Standard
Schema interface and carries no version brand:

```ts
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';

useForm<SignInInput>({ resolver: standardSchemaResolver(signInSchema) });
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

- [x] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/session apps/web/src/features/account \
        apps/web/src/app/routes.tsx
git commit -m "feat(web): sign in, sign out and password change"
```

---

## PHASE 4 — The screens, by role

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

**The rules that apply to all six fronts and are not repeated in each task:**

- **Forms live on their own page.** A list is only the table. Refusing a form never reloads the
  paginated query nobody asked for.
- **Filters and the page live in the URL**, via `useSearchParams`. Never in `useState`, never in
  Zustand.
- **No optimistic updates.** The write is synchronous and the user waits; hiding the wait would hide
  the pain the later stages exist to solve. React 19's `useOptimistic` is refused here **by name**, and
  so is any `setQueryData` that writes the answer before the server has given it: the wait is evidence,
  not a defect.
- **Every front's `routes.tsx` carries its own `<Suspense>` and its own error boundary.** Task 21 loads
  each role with `lazy()`, and a lazy element with no Suspense boundary above it throws on the first
  navigation into that role. The boundary is per role for the same reason the chunk is: a crash in the
  registrar may not blank the guardian's screen.
- **Every server error with a `field` lands next to its input.** `applyErrors` calls React Hook Form's
  `setError`, and `setError` on a name that was never `register`ed attaches an error nothing renders —
  it fails silently, which is worse than showing nothing. So each front checks that the field exists in
  the form before placing the message, and sends what it cannot place to the form's top warning. No
  screen replaces the per-field messages with a single combined list.
- **No list is virtualized.** Every list here is paginated by the server at ten rows, so
  `@tanstack/react-virtual` would be a dependency spent on a problem the data model already solved —
  and bytes taken from Task 32's guardian ceiling. Virtualization is for a list that renders an
  unbounded number of rows at once, and there is none.

The shell each front fills in looks like this. Note that it exports a `<Routes>` element and not a bare
`<Outlet />`: the splat route in `app/routes.tsx` declares no children, so an `Outlet` there would
render nothing.

```tsx
/**
 * `Suspense` is what makes the `lazy()` in `app/routes.tsx` legal — without it the first navigation
 * into this role throws. The boundary is what keeps a render-time throw in one role from blanking the
 * whole application.
 */
import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';
import { Loading } from '../../shared/ui/Loading';

export default function RegistrarRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Dashboard />} />
          {/* the front's remaining child routes */}
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
```

`ErrorBoundary` is **not** a file this phase adds: Task 21 already created it at
`apps/web/src/shared/ui/ErrorBoundary.tsx`, a class component with `static getDerivedStateFromError`,
a `componentDidCatch` that logs the `correlationId` (redacted — never the form values) and a fallback
with a "Tentar de novo" button that resets it. Every front imports that one file. It has no other
name: `AreaErrorBoundary` and `FeatureBoundary` are not components in this plan, and inventing either
gives the repository two boundaries where the budget and the tests assume one.

---

### Task 23: Screens — Network

> **Executed on 2026-08-17.** Seven screens, 26 new front tests (183 in total), ten mutations and ten
> red cases, `bun run verify` exit 0. Verified in a browser against the real API: the dashboard's four
> counters, a paginated list opened straight at `?p=2`, and the invitation end to end — the temporary
> password appeared, was gone from the DOM after leaving the screen, and the user count went from 208
> to 209. The test user was then deleted from the development database and the count returned to 208.
>
> Code splitting works as intended: the network area builds as its own 15.3 kB gzipped chunk, so
> whoever signs in as a guardian downloads none of it.
>
> **Two toolchain traps, both of which will hit the remaining five fronts.**
>
> 1. **Mantine's `Select` cannot be tested in jsdom at all.** Its dropdown stays at `display: none`
>    because floating-ui has no layout to position against, so the options are in the DOM and
>    invisible to every accessibility query — `getByRole('option')` finds zero while
>    `getByRole('option', { hidden: true })` finds all of them. No click, `mouseDown`, `ArrowDown` or
>    `Enter` opens it. Replaced with `NativeSelect`, which is a real `<select>`: it is what the SSR
>    pages used, it works with `register()` without `watch`/`setValue`, and on a phone it opens the
>    operating system's own picker. **Use `NativeSelect` in every front.**
> 2. **`withAsterisk` breaks `getByLabelText`.** Mantine appends an `aria-hidden` " *" inside the
>    `<label>`, so the label's text content is "Nome *" while the accessible name stays "Nome".
>    `getByLabelText` reads the text content; `getByRole` reads the accessible name. Use `getByRole` —
>    which is also the more honest assertion, since it is what a screen reader announces. Where there
>    is no role (`input type="date"` has none), `getByLabelText` with a prefix regex.
>
> Both cost real time because the symptom points somewhere else: the first reads as "the query has
> not loaded", the second as "the field does not exist".
>
> **Three additions the task does not list**, each because twenty screens in this phase need it:
> `shared/api/usePage.ts` (the page number read from the URL — the rule that the page lives in the
> address needs one hook, not twenty copies), `shared/ui/PageHeader.tsx` (the `page__header` block
> every SSR screen opened with, including the summary paragraph that is teaching material and would
> quietly stop being written if it were optional), and `features/network/roleLabels.ts` typed as
> `Record<Role, string>` so a fifth role in the contracts turns the file red instead of printing
> `network_admin` on screen.
>
> One decision worth stating: `POST /network/schools` sends `inepCode: null` and never `''`. The
> server's schema takes it as nullish, and an empty string would store a school whose INEP code is
> the empty string — which then prints as an empty cell instead of the "—" that means "not filled
> in". There is a case for it, and it goes red without the conversion.

**Files:**
- Create under `apps/web/src/features/network/`: `queries.ts`, `mutations.ts`, `schemas.ts`, `routes.tsx`, `Dashboard.tsx`, `SchoolList.tsx`, `SchoolForm.tsx`, `UserList.tsx`, `UserForm.tsx`, `AcademicYearList.tsx`, `AcademicYearForm.tsx`, and the matching `.test.tsx`

| Browser route | Screen | Endpoint |
|---|---|---|
| `/network` | `Dashboard` | `GET /network/dashboard` |
| `/network/schools` | `SchoolList` | `GET /network/schools?p=` |
| `/network/schools/new` | `SchoolForm` | `POST /network/schools` |
| `/network/users` | `UserList` | `GET /network/users?p=` |
| `/network/users/new` | `UserForm` | `POST /network/users` + `GET /options/schools` |
| `/network/academic-years` | `AcademicYearList` | `GET /network/academic-years?p=` |
| `/network/academic-years/new` | `AcademicYearForm` | `POST /network/academic-years` |

**The invitation screen is the front's most delicate.** The temporary password comes in the `201` body
and is shown **once**, on the success screen. It does not go to the URL, does not go to Zustand, does
not go to `localStorage` and is not re-shown by `invalidateQueries`. The component that shows it
receives it in local state and loses it on navigation — which is the same lifetime as the 120-second
cookie it used to have.

**And a repeat brings no password.** A second `POST` with the same `Idempotency-Key` — the double tap
on bad 4G that I4 exists for — answers `200 { repeated: true, location }` with no body of its own:
Task 5 stores no response on purpose, because a temporary password may not sit at rest in
`idempotent_request` (I17). So the screen has **two** success paths. The second one says the user was
created, says the password can no longer be shown, and offers the record the `location` points at.
Treating `repeated: true` as a failure would report an invitation that did not happen, and the
registrar would invite the same person twice — the very thing the key exists to prevent.

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
- [x] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/network
git commit -m "feat(web): network administration screens"
```

---

### Task 24: Screens — Registrar A: students, guardians and enrollments

> **Executed on 2026-08-17.** Nine screens, 40 new front tests (223 in total), twelve mutations and
> twelve red cases, `bun run verify` exit 0. Verified in a browser against the real API: the
> dashboard, the search (empty on open, term reaching `?q=` and the request), a record with both
> tables and both paginations, the transfer screen — where the current class group really is absent
> from the destinations — and a registration that navigated to the record it created. The test student
> was deleted from the development database afterwards.
>
> **Two testing traps found here, both of which repeat in the remaining fronts.**
>
> 1. **A screen that reads `useParams` needs a route, not just a `MemoryRouter`.** With
>    `renderWithProviders`, `useParams()` is `{}`, the id is `''`, the request goes to
>    `/registrar/students/` and matches no handler — and the screen then fails on an assertion about
>    something else entirely. Every case for a parameterised screen goes through `renderRoutes` with
>    the real path.
> 2. **Assert on the address, not on the request, when the subject is the URL.** The case for "a new
>    search goes back to page one" first checked that the request carried no `p`, and failed: `usePage`
>    defaults to 1 and the client sends `p=1`, which is harmless and identical to sending nothing. What
>    must not survive is `p=4` in a URL somebody can bookmark. `createMemoryRouter` keeps its location
>    to itself, so the case renders a small component that prints `useLocation().search`.
>
> **`routes.tsx` carries the routes of Tasks 24 and 25**, as the plan asks, and the six screens of
> Task 25 exist as placeholders — the same arrangement Task 21 used for the sign-in screen. Task 25
> replaces them in place and does not touch the routes file.
>
> One decision the plan flagged and that the tests now hold in place: `POST /registrar/guardians` is
> the only write in this front whose out-of-scope answer is a **field error on `schoolId`** rather
> than a 404. The selector itself appears only when the registrar answers for more than one school,
> since a control with exactly one option presents a decision where there is none.

**Files:**
- Create under `apps/web/src/features/registrar/students/` and `.../guardians/`: `queries.ts`, `mutations.ts`, `schemas.ts`, `StudentSearch.tsx`, `StudentForm.tsx`, `StudentRecord.tsx`, `GuardianLinkForm.tsx`, `EnrollmentForm.tsx`, `TransferForm.tsx`, `GuardianList.tsx`, `GuardianForm.tsx`, and the `.test.tsx`
- Create: `apps/web/src/features/registrar/Dashboard.tsx` and `Dashboard.test.tsx` — the `/registrar` screen of the table below, the ninth of the nine this task counts
- Modify: `apps/web/src/features/registrar/routes.tsx` — created empty by Task 21, filled in here with the routes of Tasks 24 **and** 25 (see the note)

| Browser route | Screen | Endpoint |
|---|---|---|
| `/registrar` | `Dashboard` | `GET /registrar/dashboard?p=` |
| `/registrar/students` | `StudentSearch` | `GET /registrar/students?q=&p=` |
| `/registrar/students/new` | `StudentForm` | `POST /registrar/students` |
| `/registrar/students/:id` | `StudentRecord` | `GET /registrar/students/:id` |
| `/registrar/students/:id/guardians/new` | `GuardianLinkForm` | `GET .../available-guardians`, `POST .../guardians` |
| `/registrar/students/:id/enroll` | `EnrollmentForm` | `GET /options/class-groups`, `POST /registrar/enrollments` |
| `/registrar/enrollments/:id/transfer` | `TransferForm` | `GET /registrar/enrollments/:id/transfer`, `POST .../transfer` |
| `/registrar/guardians` | `GuardianList` | `GET /registrar/guardians?p=` |
| `/registrar/guardians/new` | `GuardianForm` | `POST /registrar/guardians` |

**Note on `routes.tsx`:** Tasks 24 and 25 share the same role folder, and the file already exists —
Task 21 created `apps/web/src/features/registrar/routes.tsx` empty, with the `<Suspense>` and boundary
shell and no child route. Neither task creates it. To keep two agents out of one file, **Task 24 fills
it in with both sets of routes**, its own and Task 25's, and Task 25 does not touch it: Task 25 only
writes the components that file already imports. If Task 25 runs first, it stops and reports.

**Screen rules that come from today's behaviour:**

- the student search **opens empty**: no term means no query. It is the `enabled: term !== ''` of P6;
- the term lives in `?q=`, not in component state — a search is a shareable address;
- the two tables on the record have their own `?pGuardians=` and `?pEnrollments=`;
- the transfer button comes from the **active** enrollment, queried separately, and keeps appearing on
  the second page of the history;
- the source class group does not appear in the transfer selector: transferring to where you already
  are is not a transfer;
- **registering a guardian carries a school.** `POST /registrar/guardians` invites a user with
  `roleAssignments: [{ schoolId, role: 'guardian' }]`, so `schoolId` is required in the body and the
  form shows the registrar's schools — pre-selected when they hold exactly one, which is the common
  case and the reason today's screen has no visible selector for most people. A school outside their
  scope comes back as a **field error on `schoolId`**, not as a 404: it is the single write in this
  front whose out-of-scope answer is a field error, and copying the 404 rule from the other four
  (`POST /enrollments`, the transfer, `POST /class-groups`, `POST /announcements`) would be a
  behaviour change nobody asked for, blessed by a test written from this plan.

**Mandatory test cases:**

| Case | Expects |
|---|---|
| the search screen with no `?q=` | no request fired; text inviting a search |
| typing and submitting | `?q=` in the URL and the request carrying the term |
| the record with `?pEnrollments=2` | only the enrollments table advances |
| a registration refused with `field: 'name'` | a message under the field |
| a guardian already linked | does not appear in the selector |
| a `404` from the API on the record | a "not found" screen, not a blank one |

- [ ] **Step 1: `queries.ts` (P6) and the read tests**
- [ ] **Step 2: `mutations.ts` (P7) and the write tests**
- [ ] **Step 3: `schemas.ts`**
- [ ] **Step 4: The nine screens (P8, P9) with the P10 tests**
- [ ] **Step 5: The registrar's `routes.tsx`, with the routes of Tasks 24 and 25**
- [ ] **Step 6: `bun run verify` green**
- [x] **Step 7: Commit**

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

> **Executed on 2026-08-17. The registrar front is closed.** Six screens, 21 new front tests (244 in
> total), ten mutations and ten red cases, `bun run verify` exit 0. Verified in a browser against the
> real API: the list with Portuguese shift labels, the school filter writing itself into the address,
> the class-group record with both cursors, and the assignment screen — whose teacher selector really
> did arrive filled with the teachers of the class group's own school, chosen by no control on the
> page.
>
> **One claim in my own comment turned out to be false, and only the running API caught it.** I had
> written that sending `?school=` empty would make the server answer an empty page. Measured: it
> answers exactly what no parameter answers, because `inScopeOrNull` maps anything outside the
> registrar's scope to "no filter" — empty strings and other units' ids alike. MSW cannot catch this,
> because MSW is whatever the test says it is. The parameter is still omitted rather than sent empty,
> but for the honest reason: the request should say what the person asked for, and they asked for no
> filter. The comment and the test now say that.
>
> A TypeScript note that will repeat: a `let` reassigned inside an MSW handler narrows to `never` at
> the point a later assertion reads it — control-flow analysis cannot see that the callback ran — and
> the error names a real property of `URLSearchParams` as missing, which sends the reader looking in
> the wrong place. Collect into a `const` array and read `.at(-1)`.
>
> The six placeholder screens Task 24 created were replaced in place, and `routes.tsx` was not
> touched, exactly as the plan asks.

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
| `422` with `field: 'name'` on class-group registration | a message under the field |

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

> **Executed on 2026-08-17.** Four screens plus the pure `grade.ts`, 40 new front tests (284 in
> total), twelve mutations and twelve red cases, `bun run verify` exit 0. Verified in a browser
> against the real API: the class-group list, a grade grid holding real grades with commas, typing
> `11` into a cell (it lit the cell, kept what was typed and sent nothing), a roll call opening with
> twenty students ticked on today's date, and a closing refused by the server with the real list —
> *"Faltam 120 notas: Arte (20), Ciências (20), …"*. Nothing was written: `term_closing` still has 0
> rows.
>
> **A regression from Task 22, found by using the application rather than by any test.** Signing in as
> a teacher landed on the registrar's dashboard, because the browser still held the previous session
> and `POST /session` answers with the **current** user when one exists, ignoring the credentials in
> the body. The SSR page redirected `/login` to the dashboard for exactly this reason, and the React
> version had dropped it — so the form was a control that did not do what it said. `SignInScreen` now
> redirects anybody already signed in, and two cases hold it in place.
>
> **The grade field is the one place in this front where a schema's input and output types differ**,
> and the difference is the design rather than an accident. The cell writes `number | null |
> undefined` — `asGrade` runs in `onChange`, so form state never holds a string, and `undefined` means
> "typed and invalid". A valid submission carries `number | null`. Declaring both is what lets
> `setValue` accept the invalid value so the cell can light up, while `handleSubmit` still hands the
> server something it can take. `z.custom` rather than a union, because a union's input type refuses
> `undefined` at the point the cell writes it and the failing line becomes `setValue` — which points
> at the writer instead of at the value.
>
> The distinction `asGrade` draws is the whole reason the module exists: collapsing `undefined` into
> `null` would erase a grade because somebody typed `77` meaning `7`, and nobody would be told. Four
> cases go red on that mutation alone.

**Files:**
- Create under `apps/web/src/features/teacher/`: `queries.ts`, `mutations.ts`, `schemas.ts`, `routes.tsx`, `MyClassGroups.tsx`, `Grades.tsx`, `RollCall.tsx`, `Closing.tsx`, `grade.ts`, `grade.test.ts`, and the `.test.tsx`

| Browser route | Screen | Endpoint |
|---|---|---|
| `/teacher` | `MyClassGroups` | `GET /teacher/class-groups` |
| `/teacher/subjects/:classGroupSubjectId/grades` | `Grades` | `GET`/`PUT /teacher/subjects/:classGroupSubjectId/grades` |
| `/teacher/class-groups/:classGroupId/roll-call` | `RollCall` | `GET`/`PUT /teacher/class-groups/:classGroupId/roll-call` |
| `/teacher/class-groups/:classGroupId/closing` | `Closing` | `GET`/`POST /teacher/class-groups/:classGroupId/closing` |

The two path parameters keep the names Task 14 gave them — `classGroupSubjectId` and `classGroupId`,
never `:id`. They are the URLs Hono serves today, so the browser routes have to spell them the same
way or every bookmark and every screenshot in the material stops matching, and `useParams()` reads
`undefined`.

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

**The grid is one form with N rows, and the server's error has to find its cell.** The API names the
enrollment in `field`; React Hook Form places errors by registered path. `setError` on a path that was
never registered attaches an error nothing renders — it does not throw and does not warn — so the
translation is not optional:

```tsx
/**
 * `useFieldArray` gives every row a stable registered path (`grades.0.value`, `grades.1.value`), and
 * this is what turns the server's `field` — which names the enrollment, not the input — into that
 * path. Without it the 422 arrives, is accepted by `setError`, and disappears.
 */
const { fields } = useFieldArray({ control: form.control, name: 'grades' });

const cellOf = (field: string): `grades.${number}.value` | null => {
  const row = fields.findIndex((item) => item.enrollmentId === field);
  return row < 0 ? null : `grades.${row}.value`;
};
```

Whatever `cellOf` cannot place goes to the form's top warning: an error the person cannot see is the
same as no error at all. `asGrade` runs in the cell's `onChange`, before the value reaches form state,
so the schema receives `number | null | undefined` and never a string — and `undefined` is what lights
the cell error instead of clearing somebody's grade.

**Mandatory test cases:**

| Case | Expects |
|---|---|
| `?term=9` | the screen opens on term 1 |
| changing the term | `?term=` changes and the grid reloads |
| a grade of `11` typed | an error in the cell, and **no** submission |
| a grade cleared | sends `value: null` for that enrollment |
| a `422` from the server with an enrollment `field` | the error in the right cell |
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
- [x] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/teacher
git commit -m "feat(web): the teacher's class journal"
```

---

### Task 27: Screens — Guardian

> **Executed on 2026-08-17.** Five screens, 24 new front tests (308 in total), eleven mutations and
> eleven red cases, `bun run verify` exit 0.
>
> **The rule this task exists for holds, and was proven against the running API**: opening an
> announcement fired one `GET` and no `POST`, and `announcement_recipient` still had 48 reads
> afterwards. Pressing the button took it to 49. The read was then reverted.
>
> **Two defects the browser found and no mocked test could have.** Both have the same root: a fixture
> reproduces what I assumed the server does, so a test written from the assumption passes while the
> screen is wrong.
>
> 1. **`POST /guardian/board/:id/read` was answered 415** — "O corpo precisa chegar como JSON".
>    `secureWriteMiddleware` requires `application/json` on every write except `DELETE`, and **Axios
>    strips `Content-Type` when there is no `data`** — so a write with genuinely nothing to say
>    arrived with no media type, while the interceptor appeared to set the header two lines earlier.
>    Every non-`DELETE` write now carries `{}` when it has no body. This would have hit Task 28 too.
> 2. **The report card printed "9333,0 %"**. `attendanceRate` arrives already multiplied by a hundred
>    — `assessment.attendanceRate` does that, and the SSR page used `formatPercent` — and I had used
>    `formatRate`, which multiplies again. My fixture said `0.9333`; the server says `93.33`.
>
> **A guard that could not be told apart from its absence, and the fix that gave it existence.**
> Removing the board invalidation from `useMarkAsRead` left every test green: TanStack Query treats
> data as stale on arrival, so remounting refetched anyway. Rather than delete a line that documents a
> real intention, the board and the dashboard were given a five-minute `staleTime` — which is the right
> call for the connection this portal is built for, since nothing on those screens changes minute to
> minute and the one thing the guardian can change invalidates them explicitly. The freshness makes
> the invalidation observable, and the invalidation makes the freshness safe.
>
> A second surviving mutation came from a fixture whose subject average happened to equal the mean of
> its own grades, so a front that recomputed printed the same number. The fixture now uses an average
> the server "decided" and the mean does not reproduce.
>
> The guardian chunk is **3.69 kB gzipped**, the smallest of the five areas.

**Files:**
- Create under `apps/web/src/features/guardian/`: `queries.ts`, `mutations.ts`, `routes.tsx`, `MyStudents.tsx`, `ReportCard.tsx`, `Attendance.tsx`, `Board.tsx`, `Announcement.tsx`, and the `.test.tsx`

| Browser route | Screen | Endpoint |
|---|---|---|
| `/guardian` | `MyStudents` | `GET /guardian/dashboard?p=` |
| `/guardian/enrollments/:id/report-card` | `ReportCard` | `GET .../report-card` |
| `/guardian/enrollments/:id/attendance` | `Attendance` | `GET .../attendance?p=` |
| `/guardian/board` | `Board` | `GET /guardian/board?pUnread=&pRead=` |
| `/guardian/board/:announcementId` | `Announcement` | `GET /guardian/board/:announcementId`, `POST .../read` |

**The most important rule in the whole plan is in this task.** Opening an announcement does **not**
mark it read. There is no `useEffect` firing `POST /read`; the only thing that writes is the button
click. The 12 % rate is the measurement that turns "nobody reads the board" from hallway opinion into
a number, and it is what justifies Stage 04. A load effect — the easiest mistake to make in an SPA —
would invent reads nobody performed and destroy the evidence.

Write this as a comment in the component, not only here.

**Screen rules:**

- an account holding the `guardian` role with **no `student_guardian` row** sees the screen with the
  explanation, not an error. It is not a failure: it is an account the registrar has not linked yet.
  There is no `guardianId` anywhere — not on `app_user`, not on the session: a guardian *is* a user,
  reached through `student_guardian.user_id`, so "not linked yet" is an empty page from
  `academics.guardianEnrollmentsPage`, not a null field the front can read off `useSession`;
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

> **Executed on 2026-08-17. Phase 4 is closed.** Two screens, 15 new front tests (326 in total), nine
> mutations and nine red cases, `bun run verify` exit 0.
>
> Sending really is one screen now: choosing the school fires the recipients query and the list
> appears beside it, where the SSR version needed a `GET` and a second page. What did **not** move is
> the checking — `checkRecipients` verifies every id against the school's own guardians, because the
> array that comes back is external input whatever this screen offered.
>
> `rate` was checked against the domain before a single fixture was written — `readRate` returns
> `reads / recipients`, a fraction, and the SSR page used `formatRate`. That check is the direct
> consequence of Task 27, where a fixture that guessed the shape printed "9333,0 %".
>
> **Three mutations survived the first pass, and each one taught something different.** One was a
> test that could not see the bug: two schools with disjoint guardian lists make "the selection is
> cleared" and "the selection is kept" look identical, because the ticked name disappears either way.
> The fixture now offers the same guardian in both schools — a parent with children in two units,
> which is a real case. One was a **redundant guard**: the audience radio clears the selection and the
> mutation forces `[]`, so removing either leaves every case green. Both stay, because they protect
> different things — what the person sees and what the request says — and the comment says plainly
> that no test proves the second alone. And one was a guard that did nothing at all: `formatDate`
> already answers the em dash for a null, so the ternary around it was deleted rather than tested.
>
> **The exit gate for phase 4, honestly.**
>
> - ✅ `bun run verify` green with all six fronts together — 1204 API + 326 front.
> - ❌ **`bun run build:web` still warns**: the entry chunk is 620 kB (194 kB gzipped), over Rollup's
>   500 kB line. Splitting the vendors into three chunks silences it and was **reverted** after
>   measuring: it moved 194 kB of first load to 209 kB, because parts of Mantine that were arriving
>   on demand started arriving always. The warning is a symptom of the size, and the size is Task 32.
>   Quieting it by fragmenting would have made the guardian — the worst connection in the system —
>   pay for a green checkmark.
> - ✅ every route in Task 21's `routes.tsx` resolves to a real screen, and each of the four roles was
>   exercised in a browser against the real API across Tasks 23–28.

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
| the "whole school" audience | sends `recipients: []` — the same key the `422` comes back on, and the same one `publishAnnouncement` takes |
| the "selected" audience with nobody ticked | blocked by the comfort Zod |
| `422` with `field: 'recipients'` | a message next to the list |
| going to `?p=2` | the displayed rate does not change |
| a rate of `0.123` | the screen shows `12,3 %` |

- [ ] **Step 1: `queries.ts` (P6) and the read tests**
- [ ] **Step 2: `mutations.ts` (P7) and the write tests**
- [ ] **Step 3: `schemas.ts`**
- [ ] **Step 4: The two screens (P8, P9) with the P10 tests**
- [ ] **Step 5: The front's `routes.tsx`**
- [ ] **Step 6: `bun run verify` green**
- [x] **Step 7: Commit**

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

## PHASE 5 — Quality

### Task 29: Playwright and the network and registrar journeys

> **Executed on 2026-08-17, and it closed the half of Task 32 that was waiting on it.** 14 E2E cases
> — 5 journeys and 9 accessibility checks — green three runs in a row, `bun run verify` exit 0.
>
> **These journeys write to the development database on purpose**, because proving the write lands is
> most of what they are for. Every name they create carries an `[e2e]` mark, and `bun run e2e` ends
> with `bun run e2e:clean`, which removes exactly those rows. Measured: the database returns to the
> seed's 120 students, 208 users and 2 schools after a full run. Nobody should have to reseed because
> a test ran.
>
> **Four things cost real time, and three of them were the environment rather than the code.**
>
> 1. **A Vite holding an old `vite.config.ts` in memory.** The proxy answered 404 to every `/api`
>    request while the API answered 201 to the same request directly — which reads exactly like the
>    application being broken. Vite does not reliably reload its own config; restarting it fixed
>    everything. The comment in that file already warned about this failure mode looking like
>    something else, which is the second time this session that a warning I wrote caught me anyway.
> 2. **A race the auto-waiting did not cover.** After navigating from the guardian form to the student
>    form, `getByRole('textbox', { name: 'Nome' })` filled the *previous* screen's field — both
>    screens have one, and the old one had not unmounted. The fix is a checkpoint: assert which screen
>    you are on before acting on it.
> 3. **A transition read as a specificity problem.** The skip-link case failed with `:focus-visible`
>    matching, the element focused, and the transform still at its resting value — so it looked like
>    the focus rule was not applying. It was the 150 ms slide, measured at millisecond zero.
>    `expect.poll` instead of a single read.
> 4. Two of my own locators were ambiguous, both because the design is right: the dashboard's counter
>    card is also a link named "Escolas", and half the empty states repeat the header's action. The
>    journeys scope to the navigation and take `.first()` rather than the screens being changed to
>    suit the test.
>
> **The accessibility suite is where the class of defect that beat phase 4 finally has a guard.** Each
> case asserts on a relationship or on a computed value, never on existence: how many landmarks there
> are, whether the skip link is off-screen at rest and on-screen when focused, whether every control
> has an accessible name, and what the browser actually painted. Proven by mutation — removing the
> skip-link rule, the `aria-expanded`, or the landmark nesting turns exactly the right cases red, and
> **sorting the Mantine CSS imports alphabetically is caught by the styling case alone.** That last
> one is the defect no markup query could see.
>
> `e2e/tsconfig.json` exists because `page.evaluate` runs in a browser and needs the DOM lib, which
> the Bun scripts project does not have. `bun run typecheck` now makes four passes.

**Files:**
- Create: `playwright.config.ts`, `e2e/support.ts`, `e2e/network-journey.spec.ts`, `e2e/registrar-journey.spec.ts`
- Modify: `package.json` (root)

**Interfaces:**
- Produces: `signInAs(page, credentials)` — the support helper Tasks 30 and 31 consume.

**Context:** the two journeys are the network admin's — create a school, invite a user — and the
registrar's — register a student, register a guardian, link the two, enrol. They run against the real
server, with the database seeded by `bun run seed` — no MSW here.

- [ ] **Step 1: Install and configure**

```bash
bun add -d @playwright/test@latest
bunx playwright install chromium
```

```ts
/**
 * Two servers, not one: Playwright brings up Hono and Vite, and `reuseExistingServer` is what lets a
 * developer keep `bun run dev` open while running the suite. `retries: 0` on purpose — a test that
 * only passes on the second attempt is not a test.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'bun run dev:api',
      url: 'http://localhost:3000/health/live',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun run dev:web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

`e2e/support.ts` holds `signInAs(page, credentials)`, and the credentials are the seed's, not invented:
network slug `demo`, the CPF the seed prints for the account, and the password `escolaviva`, which is
the same for everybody in the demo network — **not** the suite's `teste-1234`, which belongs to the
factories and never reaches this database. `signInAs` fills the sign-in screen and clicks the button;
it does not `POST` to the API, because half of what these journeys prove is that the first-party cookie
survives Vite's proxy.

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

> **Executed on 2026-08-17.** Four cases, three identical runs. The seed's two planted scenarios both
> hold: term 1 closes, and term 3 is refused with *"Faltam 45 notas para fechar o bimestre: Arte (20),
> Ciências (20), Geografia (5)."* — the exact sentence the plan predicted, checked against the running
> API before a line of the test was written.
>
> **Two assumptions of mine about the seed were wrong, and both produced failures that pointed
> elsewhere.**
>
> 1. **State leaked between runs.** The closing case closes term 1, which makes the grade grid
>    read-only — so the *second* run of the grade cases timed out filling a disabled field, and the
>    message said the field could not be filled. A test that depends on state has to state the
>    dependency: `test.beforeAll(resetToSeed)` returns the database to the seed's starting line.
> 2. **The day I picked for the roll call was not empty.** The seed's register runs 10/03 to
>    14/08/2026, and 10/03 already had twenty rows — so "it opens with everybody present" was
>    asserting the seed's luck. The case now uses 15/09, which the seed never touches, and
>    `e2e:clean` empties September afterwards.

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

> **Executed on 2026-08-17. Phase 5's test half is complete**: 22 E2E cases across five files, three
> identical runs, and the database ends every run exactly as the seed left it — 120 students, 208
> users, 2 schools, 0 closed terms, 48 reads, no September attendance.
>
> **The case that must not be missing now exists against the real database.** Opening an announcement
> and leaving marks nothing; the unread list has the same length and the same item. Pressing the
> button moves exactly one row from one list to the other. Until now that rule was held by a unit test
> answered by MSW — which says whatever the test tells it to — and by one manual check of mine.
>
> The report card case asserts the shape of every number rather than a particular value: one decimal,
> decimal comma, and no four-digit percentage. That last clause is the "9333,0 %" defect written as a
> guard.
>
> `resetToSeed` runs `scripts/e2e-clean.ts` as a **subprocess**, because Playwright runs on Node and
> that script reaches PostgreSQL through `Bun.sql` — importing it fails with "Cannot find package
> 'bun'", which is true about the runtime and confusing to read in a browser test. It also depends on
> `workers: 1`: wiping shared state from a `beforeAll` while another file ran would delete rows that
> file was asserting on, and would look exactly like flakiness.

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

> **Executed on 2026-08-17 — the budget half. The accessibility half waits for Task 29**, which
> creates `playwright.config.ts` and `e2e/support.ts`; `e2e/accessibility.spec.ts` has nowhere to run
> until then. That is a dependency, not a choice.
>
> **The first load went from 235 kB to 181 kB.** Two cuts, both measured:
>
> - **the sign-in and password screens became `lazy()`: −39 kB.** They are the only things in the
>   entry that pull React Hook Form, Zod and the resolvers, and **the guardian portal has no form at
>   all** — it reads a report card, an attendance sheet and a board. Every guardian was downloading a
>   form library to read a number. The cost is one extra round trip on the sign-in screen;
> - **Mantine's stylesheet imported one component at a time: −15 kB.** The full sheet is 32 kB and
>   ships accordions, carousels and spotlights; the twenty-one components this application renders
>   come to 14 kB.
>
> **The ceiling moved from 150 kB to 185 kB, and the decision was the user's.** What remains is the
> stack: react-dom 54 kB, react-router 37 kB, `@mantine/core` 20 kB, axios 16 kB,
> `@tanstack/query-core` 8 kB, CSS 14 kB. The first three alone are 111 kB, leaving 39 kB for
> everything else — so 150 kB is not reachable without removing a library this stage exists to teach.
> The plan said to change component rather than raise the ceiling; measured, the component to change
> would be React Router or TanStack Query, which are the syllabus. The ceiling is now the measured
> floor plus a small margin, and its job changed: it no longer chases a target, it stops the number
> from creeping.
>
> **A regression I created and only a screenshot caught.** Sorting the per-component CSS imports
> alphabetically — which is what a tidy list invites — puts `UnstyledButton.css` *after* `Button.css`.
> The first strips border, background and padding; the second puts them back; same specificity, last
> one wins. **Every button in the application rendered as bare text.** The 326 tests passed, the DOM
> was correct, and the accessibility snapshot showed nothing wrong, because nothing was wrong with the
> markup. The list is now ordered by where each component first appears inside Mantine's own
> `styles.css`, and `budget.test.ts` asserts that order on the built stylesheet.
>
> One test was strengthened after a mutation exposed it: "no role chunk in the initial load" looked
> for the role's name among the entry's imports, and a statically imported role leaves **no chunk at
> all** — Rollup inlines it — so the test found nothing and passed. It now asserts that each area's
> chunk exists and is absent from the initial load.
>
> `bun run budget` builds and weighs, and is the last step of `bun run verify`.

**Files:**
- Create: `apps/web/budget.test.ts`, `e2e/accessibility.spec.ts`
- Modify: `apps/web/vite.config.ts` (the `manifest` and `exclude` lines of Step 1, plus whatever the ceiling forces), `apps/web/tsconfig.json` — which already names `budget.test.ts` in its `include` (Task 17), because the file sits at the workspace root and would otherwise escape `tsc --noEmit`

**Interfaces:**
- Produces: a test that fails when the guardian bundle goes over the ceiling.

**Context:** the guardian portal is the system's worst network case. I4 exists because a guardian on
bad 4G taps "submit" twice — and that same person now downloads React and Mantine before seeing the
report card. **Ceiling: 150 kB compressed on the guardian's first load.** Exceeding it is a reason to
change component, not to raise the ceiling.

- [ ] **Step 1: Turn on the build manifest, keep the test out of the ordinary run, and write it**

The measurement needs a map from chunk to file, and Vite writes one only when asked. The test also
reads `dist/`, which does not exist until `build:web` has run — so it may not join the suite that
`bun run verify` executes, or a green run would start depending on whether somebody built first:

```ts
// apps/web/vite.config.ts — two lines, in the blocks Task 17 created
import { configDefaults } from 'vitest/config';

build: { outDir: 'dist', assetsDir: 'assets', sourcemap: true, manifest: true },
test: { /* … */ exclude: [...configDefaults.exclude, 'budget.test.ts'] },
```

`configDefaults` comes from `vitest/config`, which is also where `defineConfig` has to come from for
the `test` key to typecheck at all — `defineConfig` imported from `vite` has no such key, and
`bun run verify` runs `tsc --noEmit` over this file.

```ts
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const GUARDIAN_CEILING_IN_BYTES = 150 * 1024;
const DIST = new URL('./dist/', import.meta.url);

type Chunk = { file: string; isEntry?: boolean; imports?: string[] };

const manifest = async (): Promise<Record<string, Chunk>> =>
  JSON.parse(await readFile(new URL('.vite/manifest.json', DIST), 'utf8'));

/** What the person on 4G pays for is the compressed byte, so that is what the ceiling counts. */
const compressedSize = async (file: string): Promise<number> =>
  gzipSync(await readFile(new URL(file, DIST))).length;

test('the guardian first load fits the budget', async () => {
  // The guardian chunk plus the shared core: this is what a person on 4G downloads before seeing
  // their child's report card. The ceiling is not aesthetic — it is the same constraint that
  // justifies I4.
  const chunks = Object.entries(await manifest())
    .filter(([key, chunk]) => chunk.isEntry === true || key.includes('guardian'))
    .map(([, chunk]) => chunk.file);

  const bytes = (await Promise.all(chunks.map(compressedSize)))
    .reduce((total, size) => total + size, 0);

  expect(bytes).toBeLessThanOrEqual(GUARDIAN_CEILING_IN_BYTES);
});

test('no role chunk enters the initial load of the others', async () => {
  const entries = await manifest();
  const entry = Object.values(entries).find((chunk) => chunk.isEntry === true);
  const initial = [
    entry?.file ?? '',
    ...(entry?.imports ?? []).map((key) => entries[key]?.file ?? key),
  ].join(' ');

  expect(initial).not.toContain('registrar');
  expect(initial).not.toContain('teacher');
});
```

- [ ] **Step 2: Build, run it, and adjust until it passes**

Run `bun run build:web` first: with no `dist` the test has nothing to weigh, and a test that passes
because the file it reads is missing is worse than no test at all. If it goes over, in this order:
import Mantine components by path instead of from the barrel; defer `@mantine/dates` to the screens
that use dates; strip `dayjs` locales other than `pt-br`. Raising the ceiling is not on the list.

- [ ] **Step 3: Write `e2e/accessibility.spec.ts`**

An automated scan per role, plus four by-hand checks the tool does not catch:

| Check | Where |
|---|---|
| full keyboard navigation, with no focus trap | the invitation form and the grade grid |
| every field has an associated `label` and the error is announced | the twelve `*Form` screens, plus `SignInScreen` and `PasswordChange`, plus the three teacher grids |
| theme contrast in text and in the error state | the theme from Task 19 |
| `prefers-reduced-motion` respected | Mantine transitions |

- [ ] **Step 4: Run**

Run: `bun run e2e && cd apps/web && bun run test budget`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git status --short
git add apps/web/budget.test.ts e2e/accessibility.spec.ts apps/web/vite.config.ts \
        apps/web/tsconfig.json
git commit -m "test: the guardian bundle budget and accessibility"
```

---

## PHASE 6 — Removal and documentation

### Task 33: Removing SSR

> **Executed on 2026-08-17. The SSR is gone and the repository serves one thing from one process.**
> `bun run verify` passes with 1016 API cases, 331 front cases and 3 budget cases; `bun run e2e`
> passes with 22. Measured against the assembled server on port 3399, not only through Vite's proxy:
> a screen path answers the document with `no-store`, `/assets/index-*.js` answers `immutable`, an
> API path with no session answers 401 JSON, and the teacher's screen renders styled.
>
> **`mountStatic` was written in Task 7 and never mounted, and I nearly shipped a second copy of it.**
> The plan says so in Task 7 in bold — *Task 33 mounts it* — and I wrote the fallback inline in
> `app.ts` instead: a `startsWith` path check where `static.ts` has a name regex, no `Content-Type`
> per extension, and no `applicationDocument` flag for the cache middleware. Two implementations, and
> the tested one was the one the application did not use. `static.test.ts` was green the whole time,
> because it imports `mountStatic` directly. **A test that imports the unit rather than the assembled
> application cannot tell you the application uses it.** `app.ts` now calls `mountStatic(app)` and the
> inline copy is gone.
>
> **`/public/` was still on the immutable list, and the fallback answered under it.**
> `cacheControlMiddleware` decides `immutable` by URL prefix, before the body exists.
> `ASSETS.urlPrefix` — the SSR's `/public/` — stayed on that list after `public/` stopped being
> served, so `/public/app.0b878f01.css` fell through to the SPA fallback and left with the *document*
> and `max-age=31536000, immutable`. A browser that loaded it once would hold this build's
> `index.html` until its cache was cleared by hand: I10 inverted, by a constant nobody had a reason to
> reread. Found by asking the running server for a path that no longer exists, not by any test.
> `ASSETS` is down to the three fields something still reads, and a case in `static.test.ts` fails if
> the prefix comes back — checked by putting it back.
>
> **The eleven failing cases were not deleted.** Three asserted the HTML branch of `errorResponse`
> (*"outside /api an error is still a page"*), two the form idempotency path, three the SSR flow
> inside `captureLogOfAFlow`, and three the removed screens. Deleting them would have removed the
> question along with the answer. Each was rewritten to ask what it can still ask: *outside `/api`*
> has stopped existing, so those three now prove the opposite invariant — a path the server owns
> answers JSON, a path it does not own is the document, and nothing renders an error page anywhere.
> `captureLogOfAFlow` walks the same three steps through `POST /api/v1/session` and
> `PUT /api/v1/teacher/subjects/:id/grades`, so I17 still measures a real flow.
>
> **A defect the removal exposed, in the front rather than the server.** Navigating by hand to
> `/teacher/class-groups` on the assembled server — a URL that no longer exists — gave a shell with an
> empty `main`. `/teacher/*` matches at the application level, so the application's `*` route never
> runs, and each area's own `<Routes>` ended without a catch-all: every typo inside an area rendered
> null, silently, in all five areas. `NotFound` moved to `shared/ui/` and each area ends with
> `<Route path="*" element={<NotFound />} />`; five cases in `routes.test.tsx` fail without it.
>
> **Removed:** the 8 Eta routers, 45 templates, `render.ts`, `routeMap.ts`, `invite.ts`,
> `scripts/build-assets.ts`, `scripts/golden.ts`, `public/`, `apps/api/tests/web/` with its 76 frozen
> screens, the `eta` dependency, the form half of `idempotency.ts`, and the HTML half of `errors.ts`
> (113 → 81 lines). `src/web/` is `src/http/`. The magic-values sweep reads 145 files, which is the
> count it must be — the failsafe only trips on an empty glob list, so the number is the check.

**Files:**
- Delete: `apps/api/src/web/templates/` (45 files), `apps/api/src/web/render.ts`, `apps/api/src/web/public/app.css`, `apps/api/src/web/routes/routeMap.ts`, `apps/api/src/web/routes/invite.ts`, `scripts/build-assets.ts`, `scripts/golden.ts`, `public/`, `apps/api/tests/web/` (with the 76 frozen screens under `tests/web/golden/`)
- Rename: `apps/api/src/web/` → `apps/api/src/http/`. `app.ts`, `health.ts` and `pagination.ts` — the last one **trimmed to `pageFromQuery`**, which every `/api/v1` list route has been importing since phase 2 (P1); the window and URL-building helpers go with the templates — are all that survives, and they join the `routes/`, `contracts/`, `presenters/` and `schemas/` folders phases 1 and 2 already created there. The "File Structure" table promised this rename from the first page; it could not happen earlier because `app.ts` still mounted Eta, and it may not be skipped now, or the repository keeps a folder called `web` with no web in it.
- Modify: `apps/api/src/web/constants.ts` — **merged into** the `apps/api/src/http/constants.ts` Task 4 created, not renamed onto it: that file has owned the JSON edge's vocabulary since phase 1 and already holds the `/api` prefix, the `v1` segment and the API's route prefixes, so a rename here would overwrite it. Carry over only what the JSON edge still reads — the health body and its no-cache header, and the asset name and type maps Task 7's static handler uses — and dropping the presentation half: `TEMPLATES`, `TITLES`, `LABELS`, `AREAS`, `ACTIONS`, `NOUNS`, `NOTICES`, `ERROR_DETAILS`, `ERROR_PAGES`, `TAG_CLASS`, `PRESENTATION`, `PAGINATION`, `ID_SUFFIXES`, `ID_PREFIXES`, `INVITE_COOKIE`, `DASHBOARD_BY_ROLE` (role precedence is the front's since Task 21)
- Modify: `apps/api/src/web/routes/*.ts` (the eight Eta routers, removed), `apps/api/src/web/pagination.ts` (trimmed to `pageFromQuery`), `apps/api/src/shared/http/errors.ts`, `apps/api/src/shared/http/authorization.ts` (it imports `errorPage` **directly** from `./errors`, not through the barrel, so deleting `errorPage` breaks it), `apps/api/src/shared/http/idempotency.ts`, `apps/api/src/shared/http/index.ts`, `apps/api/src/web/app.ts`, `scripts/magic-values.ts`, `apps/api/package.json`, `package.json`, `README.md`

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

- [ ] **Step 4: Remove `eta`, the two SSR scripts, and re-aim the guards that point at them**

```bash
cd apps/api && bun remove eta
```

`build:assets` and `golden` leave the root `package.json`, and `scripts/build-assets.ts` and
`scripts/golden.ts` leave the repository with them: the first published `app.<hash>.css`, the second
rewrote the frozen screens under `tests/web/golden/`, and neither has anything left to point at.
`public/` stops existing — I10 now belongs to Vite.

Two guards still name those paths, and one of them fails **open**:

```ts
const TARGETS: readonly string[] = [
  'apps/api/src/**/*.ts',
  'scripts/migrate.ts',
  'scripts/seed.ts',
  'scripts/seed-volume.ts',
];
```

`scripts/magic-values.ts` only trips its failsafe when the glob list matches **nothing at all**. Leave
`src/web/templates/**/*.eta` and `scripts/build-assets.ts` in `TARGETS` and the three surviving
scripts keep the list non-empty: the command prints ✔ over a sweep that has stopped reading the
codebase. So read the count it prints, not the tick — it must still be the number of `.ts` files under
`apps/api/src` plus three, and it must not collapse to a handful.

The second is `apps/api/tests/shared/no_comments.test.ts`, which scans
`CODE_DIRECTORIES = ['src', 'scripts']` relative to the root it computes: it has to reach
`apps/api/src` and the root `scripts/`, and on Bun 1.3 a missing directory makes `Bun.Glob(...).scan`
**throw**, so a wrong path is a red suite rather than a silent pass. Note what it does **not** cover:
`apps/web` is outside it on purpose, which is what lets the React files carry the header comments this
plan asks for while `apps/api` stays comment-free.

- [ ] **Step 5: Delete `apps/api/tests/web/`, migrating what is left**

Two files are **not** deleted. `checklist.test.ts` moves to `apps/api/tests/api/checklist.test.ts`
with the paths and submissions updated, and `support.ts` moves to `apps/api/tests/api/support.ts`
beside it — which is what turns every phase-2 suite's `import { read, signIn, write } from
'../web/support'` into `'./support'`, as P5 said it would. The four groups the checklist proves still
hold: the module boundary, no file written to disk, `network_id` in every business table, idempotency,
cache and health. Its hardcoded `'/public/app.0b878f01.css'` assertion goes with `public/`, replaced
by the new case:

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

- [x] **Step 7: Commit**

```bash
git status --short
git add -- apps/api/src/web apps/api/src/http apps/api/src/shared/http apps/api/tests \
        apps/api/package.json package.json scripts public bun.lock
git commit -m "refactor: remove the Eta SSR"
```

---

### Task 34: Dockerfile, README and environment

> **Executed on 2026-08-17.** The image builds, runs, and serves both halves: `/health/live` 200,
> `/registrar/students` the document with `no-store`, `/assets/index-*.js` with `immutable`,
> `POST /api/v1/session` returning a cookie that the next request uses to read the teacher's class
> groups out of the real database. 254 MB. Checked through `docker run` and again through
> `docker compose up -d --build app`, and in a browser against the container.
>
> **The plan's `front` stage does not build.** It copies `apps/web` and nothing else, and the front
> imports the API's types by relative path — `../../../../../api/src/http/contracts/enumerations`,
> which is the one import the `web-sees-only-contracts` rule allows. Vite stops with *Could not
> resolve*, and the message names the front's file rather than the copy that is missing.
> `COPY apps/api/src/http/contracts` fixes it, and nothing of it reaches the bundle: they are types.
>
> **The plan also drops a `COPY` the previous Dockerfile had for a measured reason.** Bun's isolated
> install leaves the store at the top and symlinks in `apps/api/node_modules`; copying only
> `/app/node_modules` produces an image that builds and dies on the first import with *Cannot find
> package 'hono'*. Both copies stay.
>
> **And the compose file inverted the whole task.** `env_file: ../.env` carries `FRONT_PATH=`, and an
> empty value is not an absent one: it overrides the image's `ENV FRONT_PATH=/app/front`, the server
> looks for the front at `apps/web/dist`, and inside the container that path does not exist. Measured:
> `/health/live` answers **200** while every screen answers **404** — the application looks alive to
> whoever reads status lines and blank to whoever opens it, which is the exact failure the healthcheck
> exists to catch and cannot. `environment:` beats `env_file:`, so `FRONT_PATH: /app/front` goes
> there. This was not on the plan's list of files to modify.
>
> `.env.example` had the `FRONT_PATH` block wedged inside `COOKIE_DOMAIN`'s comment, so each variable
> sat under the other's explanation — and the text still promised that "the old screens keep
> answering" when the folder is missing. Both fixed. The README's checklist had four commands
> describing the SSR world: the disk-write sweep pointed at `src/`, item 5 spoke of submitting a form
> twice, item 6 sent the reader to `/dashboard` to read a header that now belongs to the API calls,
> and item 10 piped `bun run dev`, which since phase 1 starts Vite too and mixes two streams.

**Files:**
- Modify: `infra/Dockerfile`, `.dockerignore`, `README.md`, `.env.example`

- [ ] **Step 1: `infra/Dockerfile` — three stages, and the workspace manifests first**

The file already has three stages, and the one that breaks is the first: it copies only
`package.json bun.lock` before `bun install --frozen-lockfile`, and a workspace install cannot resolve
members whose manifests were never copied. So the manifests of both workspaces come first, `assets`
stops running `build-assets.ts` and starts running Vite, and the entrypoint moves with `main.ts`. One
image, tag = commit hash — I19 intact.

```dockerfile
FROM oven/bun:1.3-alpine AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

FROM manifests AS dependencies
RUN bun install --frozen-lockfile --production

FROM manifests AS front
RUN bun install --frozen-lockfile
COPY apps/web ./apps/web
RUN cd apps/web && bun run build

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV FRONT_PATH=/app/front

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=front /app/apps/web/dist ./front
COPY package.json ./
COPY apps/api ./apps/api
COPY migrations ./migrations
COPY scripts ./scripts

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --output-document=/dev/null http://127.0.0.1:3000/health/live || exit 1

ENTRYPOINT ["bun", "apps/api/src/main.ts"]
```

The `front` stage installs **without** `--production` because Vite and the React toolchain are dev
dependencies; none of that reaches `runtime`, which takes the production `node_modules` from
`dependencies` and the built `dist` from `front`. `FRONT_PATH` is what Task 7's static handler reads,
and inside the image the `dist` is at `/app/front`, not at `apps/web/dist`.

`.dockerignore` needs the same pass in the same commit: its `tests` line matched the root-level folder
and stops matching once the suite lives at `apps/api/tests`, and `apps/web/dist`,
`apps/web/node_modules`, `e2e` and `playwright-report` all have to join the list — otherwise the build
context starts carrying them.

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

Run: `docker build -f infra/Dockerfile -t escolaviva:test . && docker run --rm --entrypoint bun escolaviva:test --version`
Expected: the build completes with no error and the second command prints a version. `--entrypoint bun`
is not decoration: the image declares `ENTRYPOINT ["bun", "apps/api/src/main.ts"]` and no `CMD`, so
`docker run <image> bun --version` **appends** those two words to the entrypoint and boots the server
with junk arguments instead of answering. The trailing `.` is the context and has to be the root — it
is where `apps/`, `migrations/` and `scripts/` come from, and where the `.dockerignore` the build reads
lives.

- [ ] **Step 5: Commit**

```bash
git status --short
git add infra/Dockerfile .dockerignore README.md .env.example
git commit -m "docs: commands, the multi-stage image and the publication variables"
```

---

### Task 35: Teaching material

> **Executed on 2026-08-17.** The SPA decision is recorded in Section 3 of the stage document with the
> bill attached — two artefacts, a contract with a version number, validation written twice, one more
> rule every client must know, and a guardian downloading JavaScript before the report card — plus
> what was rejected alongside it: React SSR, a token in the browser, a response envelope. I23 sits
> beside it and in the invariants table, which is now 23 rows. I2, I4, I10, I11 and I22 each say how
> their mechanism changed.
>
> **One sentence I wrote was false, and the repository's own history disproved it.** The consequences
> list said CSRF was a cost the form did not have, and that the old form "carried a per-render token".
> It did not: `git grep -i csrf ssr-eta-baseline` returns nothing, and the `_key` field was
> idempotency, never CSRF. The SSR version was protected by `SameSite=Lax` alone. So the SPA did not
> take on a defence it lacked — it **added** one (`X-Requested-By`). The real cost is different and is
> what the text says now: a write went from a form submission to three required headers, and every
> example, every `curl` and every future client carries all three.
>
> **The stage document's folder tree still described the pre-workspace repository** — `escolaviva/src/`
> with `web/templates/`, `scripts/golden.ts` and `scripts/build-assets.ts`. That has been wrong since
> phase 1 and is not on this task's list, but a teaching document whose map does not match the
> territory is a trap for the reader it is written for. The tree now shows both workspaces, `e2e/`,
> and the one import that crosses between them.
>
> `SAAS_EVOLUTION.md` keeps its costs line untouched, because it was right and this stage paid exactly
> that price. What it gains is the distinction: the trap is the *by default*, and what separates a
> decision from a trap is reading the bill before signing it.
>
> `stage_document.test.ts` stays green — no `CREATE TABLE` block was touched, which is what it guards.

**Files:**
- Modify: `docs/ESCOLAVIVA_STAGE_01.md`, `docs/SAAS_EVOLUTION.md`

**Context:** this is the task the user explicitly approved when they chose "total replacement + updated
docs". Without it the repository contradicts its own material.

The repository holds no separate decision record: documents of that kind wait until the Stage 01 MVP
is complete, and what format they take is a decision of that moment, not of this plan. So the two
decisions below are recorded **inside the material itself**, where the rest of the reasoning already
lives.

- [ ] **Step 1: Record the SPA decision in `docs/ESCOLAVIVA_STAGE_01.md`**

The sentence in Section 3 ("Server-rendered HTML, no SPA and no public API to version") becomes the
decision with its cost stated. Context: the request for an SPA. Decision: total replacement.
**Consequences, unvarnished** — two build artefacts, an API to version, validation in two layers, CSRF
the form did not require, and the guardian portal starting to download JavaScript before the report
card. What was rejected alongside and why: React SSR (rent without pain), a token on the client (would
break I2), a response envelope (`Result<T>` already solves it).

- [ ] **Step 2: Record I23 alongside it**

I23, the three variables, and the explicit premise: the front and the API on **subdomains of the same
registrable domain**. Leaving that premise is a new decision, not a variable tweak — with a different
domain, `SameSite=Lax` stops serving and the design changes.

- [ ] **Step 3: Finish `docs/ESCOLAVIVA_STAGE_01.md`**

- the invariants table gains the **I23** row;
- the **I2, I4, I10, I11 and I22** rows gain a note on how the mechanism changed;
- the opening numbers (55 schools, 18 thousand students, two people, one server) **do not change**: the
  scale is the same, and it is what holds up the rest of the argument;
- `tests/shared/stage_document.test.ts` compares the document's `CREATE TABLE` blocks against the
  migration — no schema changes in this stage, so it has to stay green untouched.

- [ ] **Step 4: Fix `docs/SAAS_EVOLUTION.md`**

The Web Client catalogue lists "adopting an SPA by default" as a trap. The trap is still real — what
changes is the distinction: adopting **by default** is a trap; adopting **with the cost measured and
recorded** is a decision. The line "a separate SPA doubles deploys and forces you to create a versioned
public API" stays as it is: it was right, and this stage paid exactly that price.

- [ ] **Step 5: Commit**

```bash
git status --short
git add docs/ESCOLAVIVA_STAGE_01.md docs/SAAS_EVOLUTION.md
git commit -m "docs: record the SPA decision and invariant I23"
```

---

### Task 36: Diagrams

> **Executed on 2026-08-17.** `docs/diagrams/2026-08-17/` holds the two that describe the delivery
> mechanism, in the three formats the others use — the hand-written SVG, the zoom-and-export viewer,
> and a PNG rendered from the SVG with `rsvg-convert`. `git status --short docs/diagrams` shows one
> untracked folder and nothing else: **not a byte of 2026-08-16 moved**, which is the visual proof
> that the migration did not touch a business rule.
>
> `state/submission-lifecycle` is now *lifecycle of a write*. The three states and the reason the row
> goes in **before** the handler survive word for word; every trigger on the arrows changed. The key
> comes from the `Idempotency-Key` header, `completed` is reached by **any response under 400**
> (carrying a `Location` or not — the column takes `''`), and the repeat answers `200 { repeated,
> location }`. Two things the plan did not mention and the code does: only `POST` reserves — `PUT` and
> `PATCH` have their body parsed and stop there, because they say what the state should *be* — and a
> caller with no session never reaches the table at all.
>
> `architecture/architecture` gained a layer it did not have: `apps/web` at the top, the `/api/v1`
> boundary as an arrow with a caption, and I23 beside it. Rather than shifting 300 coordinates by
> hand, the whole existing drawing went inside one `<g transform="translate(0,190)">` — the new layer
> lives in the space that opened up.
>
> **The PNG caught two defects the SVG source did not show.** The first pass had the green arrow's
> caption running underneath the `completed` box, because my replacement text was longer than the gap
> between the two states; and the numbers panel still counted **45 .eta templates**, which is a count
> of files that no longer exist. Neither is visible reading the SVG — a diagram has to be looked at,
> the same way a screen does.

**Files:**
- Create: `docs/diagrams/<date>/architecture/architecture.{html,svg,png}`, `docs/diagrams/<date>/state/submission-lifecycle.{html,svg,png}`

The surviving diagrams live under `docs/diagrams/<date>/<type>/`, one folder per generation date. **Two**
of them describe the delivery mechanism rather than the domain, and those two become wrong.

| Diagram | What changes |
|---|---|
| `architecture/architecture` | two artefacts: `apps/web` static and `apps/api`; the `/api/v1` boundary |
| `state/submission-lifecycle` | the key is no longer born at render time in a hidden `_key` field but minted by the client and sent as `Idempotency-Key`; the transition into `completed` stops being "3xx response with `Location`" and becomes "any response under 400 carrying a `Location`"; and a repeat stops answering `303` to `/dashboard` and answers `200 { repeated, location }` |

The second one is not cosmetic. Its own text today reads "the key is born at render time and comes back
in the hidden field `_key`" and "reserved → 303 to /dashboard", and both sentences stop being true in
Task 5. The states themselves — `reserved`, `completed`, `released` — and the reason the row goes in
**before** the handler survive word for word; what changes is every trigger on the arrows.

The others (`er/data-model`, `domain/domain-blocks`, `domain/where-the-invariant-lives`,
`state/enrollment-lifecycle`, `state/session-lifecycle`, `state/term-lifecycle`, `usecases/use-cases`)
describe the domain and **do not change** — which is the visual proof that the migration did not touch
a business rule.

- [ ] **Step 1: Regenerate the architecture and submission-lifecycle diagrams into a new dated folder**
- [ ] **Step 2: Confirm the domain ones stay identical**

```bash
git status --short docs/diagrams
```
Expected: only the new dated folder shows up, and nothing under the previous one is modified.

- [ ] **Step 3: Commit**

```bash
git status --short
git add docs/diagrams
git commit -m "docs: the architecture and submission diagrams follow the two artefacts"
```

---

## Final check

> **Run on 2026-08-17, after Task 36. Everything below was executed, not read.**
>
> | Item | Result |
> |---|---|
> | `bun run verify` | **EXIT 0** — typecheck ×4 (root, api, web, e2e), two cruises, 145 files swept, 1016 API + 331 front + 3 budget |
> | `bun run e2e` | **22 passed**, and the database ends as the seed left it |
> | `docker build` + `docker compose up --build app` | image builds at 254 MB, serves document, asset and API against the real database |
> | `web-sees-only-contracts` seen failing | planted `import { identity }` in `app/routes.tsx` → **error**, restored |
> | `no-cross-module-shortcut` seen failing | planted `import gradeRepository` in `http/routes/teacher.ts` → **error**, restored |
> | The front imports only `contracts/` | 12 modules, all under `http/contracts/`. The other `academics`/`identity` hits are comments explaining who owns the rule |
> | `eta`, `console.log`, files over 800 lines, `zustand` in code | none of the four |
>
> **I23 was measured rather than assumed**, and it is the one nothing else covers. Built the front with
> `VITE_API_URL=http://127.0.0.1:3405`, served `dist` from `:4173`, ran the API on `:3405` with
> `ALLOWED_ORIGINS=http://127.0.0.1:4173`, and drove it in a browser: preflight answered 204 with the
> three headers echoed, and **signing in — a write — went through cross-origin**, landing the guardian
> on their own screen. Three variables, no code. Cleaned up afterwards: `.env.local` deleted and the
> bundle rebuilt with no API URL baked in.
>
> **What this final check cannot cover, stated rather than ticked:** the restore drill (I7) is a Friday
> exercise with a number written by hand, and the four measurements of Section 5 are observations, not
> assertions. Both were out of scope before this plan and remain so.


Before considering the plan complete:

**Behaviour**

- [ ] `bun run verify` green end to end: `typecheck` in **three** passes (root for `scripts/`, then each workspace), `check` as **two** cruises with their rules re-anchored — `apps/api/src` against `apps/api/.dependency-cruiser.js` and `apps/web/src` against `apps/web/.dependency-cruiser.js` (a rule that matches nothing still exits 0, so confirm each config is actually reached), `magic` with the count it prints unchanged in order of magnitude, and both suites. The two coverage gates are not the same and neither is visible from the `verify` line: Bun's is `line` and `function` at 0.8 in `bunfig.toml`, project-wide and with no branch threshold; the front's is `lines`, `functions` and `branches` at 80 inside `vite.config.ts`
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
- [ ] `grep -rln "from 'eta'" apps/api/src` finds nothing, and `eta` is gone from `apps/api/package.json` and from `bun.lock` — the bare three letters match `Secretaria` and every `detail`, so the quoted import is the only honest pattern
- [ ] `bunx depcruise` passes on both trees, with `contracts-without-dependencies` active on the API and `web-sees-only-contracts` active on the front — and each one has been seen failing at least once on a planted import, or neither is known to be wired
- [ ] `grep -rn "academics\|identity\|shared/db" apps/web/src` finds nothing. It is a second reading of what `web-sees-only-contracts` already enforces, kept because the grep also catches a name written into a string or a comment, which the cruise does not read
- [ ] `grep -rn "zustand" apps/web/src` finds nothing, and that is the expected result: the dependency is declared for the teaching arc and Stage 01 leaves it no state to hold (Task 21)

---

## After the plan — the e2e folder, and one defect the question uncovered

> **2026-08-17, asked after Task 36: is `e2e/` in the right place, and does it test the web interface?**
>
> **It tests *through* the interface, not the interface.** What is under test is the whole system:
> browser → Vite's proxy → Hono → PostgreSQL with the seed. Proven by mutation rather than by reading:
> removing the subject list from the closing message in `apps/api/src/assessment/constants.ts` — one
> server file, not a line of the front — turned `teacher-journey.spec.ts:117` red. A case that fails
> because an `assessment` rule changed does not belong to the front.
>
> **So the folder stays at the root**, and for four reasons that are checkable: `playwright.config.ts`
> starts *both* workspaces (`dev:api` and `dev:web`); a server-only mutation fails it; it depends on
> `scripts/e2e-clean.ts` and on the root `.env` for `PORT`; and it runs on Node while `apps/*` run on
> Bun. It is a third unit, sibling to the two workspaces — which is why `typecheck` makes four passes.
> Moving it under `apps/web/` would place a test that breaks on server rules inside the workspace
> whose whole dependency rule is that it may not see the server.
>
> **The defect the question uncovered.** `e2e/tsconfig.json` declared `"types": ["bun"]` while
> Playwright runs on Node, so the compiler promised an API the runtime does not have:
>
> ```
> typecheck  →  EXIT 0                              on a spec calling Bun.file
> running    →  ReferenceError: Bun is not defined
> ```
>
> `support.ts` already explains this rule in prose — it is why it spawns `scripts/e2e-clean.ts` as a
> subprocess instead of importing it. The rule was documented and unenforced: the one tool that could
> have caught it was configured to allow it. Now `"types": ["node"]`, with `@types/node` as a root dev
> dependency (type declarations only, nothing at runtime). Checked in both directions — the real
> `support.ts` still compiles with `node:child_process`, and a spec touching `Bun.*` now fails with
> TS2868. `bun run verify` EXIT 0 across four typecheck passes; `bun run e2e` 22 passed.
>
> **What is still not enforced:** nothing fails if someone puts `"types": ["bun"]` back. The guard is a
> configuration line, not a case.

---

## The three configuration guards, and what a comment is worth

> **2026-08-18.** Three of the five open items shared one shape: a rule that was known, documented in
> prose next to the code, and enforced by nothing. `bun run verify` never built an image, never opened
> `docker-compose.yml`, and never looked at a diagram — so each of them was caught exactly once, by
> hand, and could come back silently the next day.
>
> Two files close them. **`tests/shared/deployment_contract.test.ts`** reads what the build will do and
> compares it against what the repository holds, deriving rather than listing: the set of server
> directories the front imports is computed from `apps/web/src` and each one must appear in a `COPY` of
> the Dockerfile's `front` stage — so the rule survives the code moving. The compose case is derived
> the same way: because `.env.example` ships `FRONT_PATH=` empty, `environment:` must repeat the value
> the Dockerfile's own `ENV` declares. **`tests/shared/diagrams.test.ts`** treats the architecture
> drawing's numbers panel as an assertion, cell by cell, and refuses any path a diagram names that does
> not resolve on disk.
>
> **Seven mutations, seven failures.** Removing the `COPY contracts`; removing the second
> `node_modules`; removing `FRONT_PATH` from the compose; putting `"types": ["bun"]` back into
> `e2e/tsconfig.json`; restoring the historical defect verbatim — the cell reading **45 · .eta
> templates**; pointing a diagram at `apps/api/src/web/templates/`; and adding one file under
> `communication/application/`, which the *use cases* cell caught. Each was restored immediately.
>
> **The guard found a stale number while being written.** The panel said 78 test files; adding these
> two made it 80, and the case failed on its first run. That is the intended cost, stated so nobody
> mistakes it for friction to be optimised away: a diagram claiming a count now has to be regenerated
> when the count changes, or the suite says so.
>
> **What is still not covered:** the shape of a drawing. Boxes, arrows and the sentences inside them
> are checked by nothing, and a wrong arrow will go on being wrong — only the part that pretends to be
> a fact is verified. And these cases read the Dockerfile rather than building it: a syntactically
> broken `COPY` still passes here and fails in `docker build`.
>
> `bun run verify` EXIT 0 — 1035 API cases (was 1016), 331 front, 3 budget. `bun run e2e` 22 passed.
