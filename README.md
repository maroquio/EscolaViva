# EscolaViva — Stage 01

**EscolaViva is a SaaS for school networks.** The paying account is the **network**, which owns one
or more **schools** — a standalone school is just a network with a single school. The system does
what the registrar's office used to do with a shared spreadsheet and a paper roll-call book: enrol,
transfer, build class groups, post grades, record attendance, close the term, show the report card
and publish announcements to guardians. Four actors sign in: network admin, registrar, teacher and
guardian. There is no public surface without a login, no third-party API and no mobile app.

**Stage 01** is the version that fits in one repository: a modular monolith with four domains,
server-rendered HTML and one PostgreSQL. It was written for a concrete scale — 40 paying networks,
≈ 55 schools, 18 thousand students, a two-person team, one server — and to **deliberately plant four
measurable pains**, so that the stages that follow happen because of evidence and not because of the
calendar. That is why there is no payment gateway, queue, cache, CDN, replica, observability or
delivery pipeline here: each of them would charge permanent rent without solving a problem this
system has today. What there is are the **23 invariants** — the decisions that are cheap now and
would be a project later. The full write-up is in
[`docs/ESCOLAVIVA_STAGE_01.md`](docs/ESCOLAVIVA_STAGE_01.md).

---

## Getting it running

Requirements: [Bun](https://bun.sh) 1.3+ and Docker. That is all.

The backup scripts use `pg_dump`/`pg_restore`, which refuse to talk to a server newer than
themselves — and the PostgreSQL that ships with the operating system is usually older than the 16 in
`docker compose`. So both scripts resolve the client on their own: they use the one on `PATH` when it
works and, when it does not, the one already inside the database container, printing which one they
picked. The weekly restore drill of I7 cannot depend on installing software — it is precisely the
item the stage document says gets pushed to the end and never happens.

The `.env` comes before `docker compose`, and the order is not decorative: the compose file lives in
`infra/docker-compose.yml`, and it is the `COMPOSE_FILE` declared in `.env` that lets Docker find the
file from the repository root. Without that step first, `up` answers `no configuration file
provided: not found` — and `.env` is also where `DB_PORT` comes from, the port the database will
listen on.

```bash
cp .env.example .env             # adjust DB_PORT if 5432 is already taken on your machine
docker compose up -d database    # PostgreSQL 16 with pg_stat_statements enabled
bun install
bun run migrate                  # applies migrations/*.sql in order, one transaction per file
bun run seed                     # demo network: 2 schools, 6 class groups, 120 students
bun run dev                      # API on http://localhost:3000, front on http://localhost:5173
```

To run the tests, bring up the throwaway database as well: `docker compose up -d test_database`.
The E2E journeys of `bun run e2e` use that same development database — they mark every row they
create with `[e2e]` and clean up after themselves, but they do write.

`bun run dev` starts two processes: the API on `:3000` and Vite on `:5173`. **Open `:5173`** — that
is where the screens are, and Vite proxies `/api` to the other one. There is one command that serves
both from a single process, and it is the one the image runs:

```bash
bun run build:web                # publishes apps/web/dist
bun run start                    # API and screens together on http://localhost:3000
```

That order matters: `start` serves the screens out of `apps/web/dist`, so with no build every screen
path answers 404 while `/api/v1/...` and `/health` keep working. An application that looks alive to
whoever reads status lines and blank to whoever opens it.

> **If you already had a `.env` from before this version**, the `cp` above does not run and the new
> line does not arrive on its own. The symptom is `docker compose` failing with `no configuration
> file provided: not found` — a message that does not suggest the cause, because the problem is not
> Docker, it is the file living in `infra/`. Add the line to your `.env`:
>
> ```bash
> echo 'COMPOSE_FILE=infra/docker-compose.yml' >> .env
> ```

---

## Where everything lives

The root holds what the tooling requires to be at the root. Everything else goes one level down.

The repository is three Bun workspaces — `apps/api`, `apps/web` and `packages/contracts` — plus the
folders that belong to none of them because more than one thing uses them.

| Folder | What is in it |
|---|---|
| `apps/api/src/` | The four modules, `shared/`, and the HTTP edge in `http/` — the JSON API and the handler that serves the front's build. |
| `apps/api/tests/` | The API suite. Mirrors `apps/api/src/`, except `http/`, which exercises the HTTP edge end to end. |
| `apps/api/.dependency-cruiser.js` | The module-boundary rules for the server. |
| `apps/web/` | The React front: Vite, its own `tsconfig.json`, its own suite under `tests/`. |
| `apps/web/.dependency-cruiser.js` | The one rule that keeps the front from importing anything but `@escolaviva/contracts`. |
| `packages/contracts/` | The response shapes, and the vocabulary that travels with them. The only thing both halves import; declared as a dependency by each, so the coupling is in the manifest rather than in a relative path. |
| `tests/` | Tests whose subject is the project itself: conventions, documentation, packaging, migrations. `tests/test_layout.test.ts` states where a test may live and why, and fails when a fifth home appears. |
| `e2e/` | Five browser journeys, on Playwright and Node — the one suite that does not run on Bun. |
| `migrations/` | Numbered SQL, applied in order by `bun run migrate`. |
| `scripts/` | Command-line tools: migration, seed, synthetic load, magic-value sweep, E2E cleanup. Stays at the root because it reaches into both workspaces. |
| `infra/` | `Dockerfile` and `docker-compose.yml`. |
| `docs/` | The stage document and the plans. |

**`.dockerignore` sits at the root and that is not an oversight.** Docker looks for that file at the
root of the *build context*, never next to the Dockerfile — and the context here is the repository
root, because that is where `apps/`, `migrations/` and `scripts/` come from. Moving it into `infra/`
would produce no error at all: it would simply stop being read, and the image would start carrying
`node_modules`, `.git` and the `.env` with a real secret inside a layer. It is the kind of failure
that only shows up when someone opens the published image — the cheapest example, in this repository,
of why "tidy up the root" is not a criterion that overrides what the tooling imposes.

Two lines pay the rent for that move, and it is worth knowing which:
`COMPOSE_FILE=infra/docker-compose.yml` in `.env`, which keeps `docker compose up -d database`
working from the root without `-f`; and `name: exemplo_saas` in the compose file, which pins the
project name. Without the second, the name would start coming from the `infra/` folder, and anyone
who already had a development database would see no error at all — they would see an empty database,
with the old data sitting in an orphaned volume.

---

## Demo credentials

All created by `bun run seed`. **Network: `demo` · password: `escolaviva` for everyone.**
The `escolaviva.test` domain is reserved by RFC 2606 — none of these addresses exists for real.

| E-mail | Role | Where |
|---|---|---|
| `admin@escolaviva.test` | network_admin | Escola Central + Escola Bairro Novo |
| `secretaria1@escolaviva.test` | registrar | Escola Central |
| `secretaria2@escolaviva.test` | registrar | Escola Bairro Novo |
| `professor1@escolaviva.test` … `professor3@escolaviva.test` | teacher | Escola Central |
| `professor4@escolaviva.test` … `professor6@escolaviva.test` | teacher | Escola Bairro Novo |
| ~200 guardians | guardian | guardian portal |

Sign-in is by **CPF**, not by e-mail. The seed prints the CPF next to each credential; the
e-mails above identify who is who in the demo data. The seed also prints three guardian records at
the end of its run — the names are drawn from a fixed seed, so they are always the same on any
machine.

Two details deliberately planted in the demo database:

- **Terms 1 and 2 have grades everywhere; term 3 is incomplete.** Closing term 1 of a class group
  works; closing term 3 is refused with the list of what is missing ("Faltam 45 notas para fechar o
  bimestre: Arte (20), Ciências (20), Geografia (5)."). It is the demonstration of the rule, not
  forgotten data.
- **The board's read rate is 12 %.** It is the number from Section 5 of the document, the one that
  turns "nobody reads the board" from hallway opinion into measurement — and it is what justifies
  Stage 04.

---

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Starts the API and the front together. API on `http://localhost:3000`, front on `http://localhost:5173`. |
| `bun run dev:api` | Only the API, with auto-reload. |
| `bun run dev:web` | Only the front, with Vite's dev server proxying `/api` to the API. |
| `bun run build:web` | Builds the front into `apps/web/dist`. |
| `bun run start` | Starts the server without reload — the command `infra/Dockerfile` runs. Serves the API **and** the front's build, so `build:web` has to have run: with no `apps/web/dist` every screen path is a 404. |
| `bun run migrate` | Applies pending migrations, one transaction per file, under an advisory lock. |
| `bun run migrate:status` | Lists what has been applied and what is pending, writing nothing. |
| `bun run seed` | Wipes and recreates the `demo` network. Idempotent, and blocked when `APP_ENV=production`. |
| `bun run seed:volume` | Synthetic load of up to 3.6 million rows in `attendance`. Requires `--sim`. |
| `bun run check` | dependency-cruiser, three times: the server's rules (I1), the front's import boundary, and the contracts package. |
| `bun run magic` | Fails on literals that already have an owner in a `constants.ts`. |
| `bun run typecheck` | `tsc --noEmit` five times: `scripts/` and `tests/` from the root config, then each workspace. |
| `bun run test` | The three suites: the API on `bun test`, the project on `test:project`, the front on Vitest. The 80 % coverage floor is a gate over the API suite, which is the one that exercises production code. |
| `bun run test:project` | Only the tests whose subject is the project — layout, conventions, packaging, documentation. **The one command that needs no database**: 67 cases in under a second, on a machine that has never run `docker compose up`. |
| `bun run test:coverage` | The same, printing the per-file coverage report. |
| `bun run verify` | `typecheck` + `check` + `magic` + `test` + `budget`. This is what to run before any commit. |
| `bun run e2e` | Playwright, five journeys in a real browser against the real database, then `e2e:clean`. |
| `bash scripts/backup.sh` | `pg_dump -Fc` into `backups/`, keeping the 7 most recent. |
| `bash scripts/restore-test.sh` | Restores the dump into a throwaway database and checks the counts (I7). |

`bun run seed:volume` accepts `--ano <n>`, `--alunos <n>`, `--sim` (confirms the write) and
`--apagar --sim` (removes the whole load network to start a measurement over).

---

## The four modules and the boundary between them

```
src/
├─ identity/       who signs in and what they may do  → network, school, user, role, session
├─ academics/      who studies, where and with whom   → student, guardian, class group, subject, enrollment
├─ assessment/     grade, attendance and closing      → grade, attendance, closing, report card
├─ communication/  what the school tells the guardian → announcement, recipient, read receipt
├─ shared/         infrastructure with no business rule
└─ http/           the JSON API under /api/v1, and the front's build served beside it
```

Each module has `domain/`, `application/`, `infra/` and an **`index.ts` that is the only way in**.
Anything not in `index.ts` is private to the module: no file from outside imports
`academics/domain/enrollment` or `assessment/infra/gradeRepository`.

The permitted graph has every arrow pointing the same way, and no arrow comes back:

```
communication ──┐
assessment ─────┼──▶ academics ──▶ identity
                └──▶ identity
```

`identity` knows nobody. `academics` knows `identity` (a teacher is a user).
`assessment` knows `academics` (a grade belongs to an enrollment). `communication` knows both.

**What checks this is `bun run check`**, not a verbal agreement. The
[`apps/api/.dependency-cruiser.js`](apps/api/.dependency-cruiser.js) declares four rules, all at error
severity:

1. `no-cross-module-shortcut` — a module only sees another through its `index.ts`.
2. `pure-domain` — `*/domain/` does not reach `shared/db`, `shared/http`, `shared/log`,
   `shared/jobs` or `node_modules`. The domain does not know a database, HTTP or a vendor exists.
3. `shared-knows-no-domain` — `shared/` imports no domain module. Dependency always points inward.

The reason is Stage 14: when `billing/` is extracted, the question "what else touches this?" already
has an answer — it is exactly whoever imports `billing/index.ts`. Without the rule the answer is "no
idea" and the extraction turns into a rewrite.

---

## The migration compatibility window (I6)

Migrations are numbered `.sql` files under `migrations/`, applied by `bun run migrate` in one
transaction per file, recorded in `schema_migrations`. Today there is exactly one: Stage 01 built the
schema across nine migrations, and once every compatibility window they opened had been closed, they
were folded into `0001_initial_schema.sql`. A migration directory records what still has to happen to
a database, not how the schema came to be — that is what the git history is for.

The rule below governs every migration from the second one onward. There is always an interval —
between applying the migration and the new process being up, or between the new one starting and the
old one finishing what was in flight — in which **two versions of the code talk to the same
database**.

**The rule: never drop or rename a column the previous version still reads.** Every schema change
respects this order, in separate migrations and separate deploys:

1. **Add** the new structure. Never `NOT NULL` without a default in the same migration — the old
   version does not know how to fill the field.
2. **Migrate** the data. The new code writes to both places; the old one keeps reading the old one.
3. **Stop writing** to the old one, once no instance of the previous version is still up.
4. **Drop** the old structure, only after step 3 has been in production long enough that no rollback
   is plausible.

Renaming a column is always that sequence — never `ALTER TABLE ... RENAME COLUMN`, which compresses
steps 1 and 4 into a single instant.

The rule is not honoured by memory. `tests/migration_window.test.ts` reads every file under
`migrations/` and refuses the three shapes that compress the window: a `RENAME`, an `ADD COLUMN`
sharing a file with a `DROP COLUMN`, a `DROP TABLE` or a `SET NOT NULL`, and an
`ADD COLUMN ... NOT NULL` with no `DEFAULT` — and the second half of that file feeds the check
sources that do break the rule, demanding it accuse each one.
`apps/api/tests/shared/migration_window_in_motion.test.ts` runs the four steps against a real database and
states what each one buys, ending with the one-step rename taking the previous version down at that
very instant.

---

## Checklist before declaring Stage 01 done

Eleven items from Section 8 of the document. None of them adds a component.

| # | Item | Command that proves it |
|---|---|---|
| 1 | `check` fails if a module imports another one's internal file | `bun run check` |
| 2 | The application writes no file to disk | `grep -rnE 'writeFile\|createWriteStream\|appendFile' apps/api/src/` (empty output) |
| 3 | Killing the container and starting another loses nothing | `docker compose restart app` and reload the page: you are still signed in, because the session lives in the `session` table |
| 4 | Every business table has `network_id` and a declared FK | the query below, which must return **zero rows** |
| 5 | Sending the same write twice creates **one** record | `bun run test` (the idempotency case), or repeat a `POST` with the same `Idempotency-Key` |
| 6 | An authenticated route answers `Cache-Control: private, no-store` | `bun run test`, or open any screen while signed in and read the header on the `/api/v1/...` request in the browser's Network tab — the document itself answers `no-store`, which is a different rule |
| 7 | `/health` answers 503 with the database stopped | `docker compose stop database && curl -si localhost:3000/health && docker compose start database` |
| 8 | A missing environment variable → the process **does not start** | `SESSION_SECRET=short bun run start` (dies at boot, listing what is wrong) |
| 9 | The dump was restored into another database and the counts matched | `bash scripts/backup.sh && bash scripts/restore-test.sh` |
| 10 | No log line contains a name, e-mail, CPF or grade | `bun run dev:api \| grep -iE '"(name\|nome\|email\|cpf\|grade\|nota)"'` (empty output) — `dev:api` and not `dev`, which also starts Vite and mixes two streams |
| 11 | The four numbers from Section 5 are written down | the table in the next section, filled in |

Query for item 4 — lists the business tables **without** a foreign key on `network_id`
(`network` is the tenant itself and `idempotent_request` is a platform table):

```sql
SELECT t.table_name AS table_without_network_fk
  FROM information_schema.tables t
 WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
   AND t.table_name NOT IN ('network', 'schema_migrations', 'idempotent_request')
   AND NOT EXISTS (
     SELECT 1
       FROM information_schema.key_column_usage k
       JOIN information_schema.table_constraints tc
         ON tc.constraint_name = k.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
      WHERE k.table_schema = t.table_schema AND k.table_name = t.table_name
        AND k.column_name = 'network_id');
```

---

## Weekly measurement

Three numbers written down **by hand, once a week**. This **is not observability** — that arrives at
Stage 11. It is the baseline without which no future pain is demonstrable: without today's number,
any degradation turns into a matter of opinion.

Stage 01 targets: **p95 of grade posting under 300 ms**, **database CPU under 20 %**, **`attendance`
with ~3.6 million rows per academic year**. To see all three under real load, run
`bun run seed:volume --sim` and then `ANALYZE attendance;`.

Once, on the first day: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` (the
`infra/docker-compose.yml` already brings the database up with the library preloaded). Before each
measurement, reset the window with `SELECT pg_stat_statements_reset();` and use the system for a few
minutes.

```sql
-- 1. Largest table.
SELECT count(*) AS attendance_rows FROM attendance;

-- 2. Approximate p95 per query. pg_stat_statements does NOT keep percentiles: "mean + 2 standard
--    deviations" is the approximation, and max_exec_time is the worst case actually observed.
SELECT substring(query, 1, 70)                                     AS statement,
       calls,
       round(mean_exec_time::numeric, 1)                           AS mean_ms,
       round((mean_exec_time + 2 * stddev_exec_time)::numeric, 1)  AS p95_approx_ms,
       round(max_exec_time::numeric, 1)                            AS worst_ms
  FROM pg_stat_statements
 WHERE query ILIKE '%grade%' OR query ILIKE '%attendance%'
 ORDER BY mean_exec_time DESC
 LIMIT 10;

-- 3. What the database is doing right now: connections by state and the oldest running query.
SELECT state, count(*) AS connections, max(now() - query_start) AS oldest
  FROM pg_stat_activity
 WHERE datname = current_database()
 GROUP BY state
 ORDER BY connections DESC;
```

Database CPU comes from the container, not from SQL:
`docker stats --no-stream $(docker compose ps -q database)`.

| Week | p95 of grade posting (ms) | Database CPU (%) | Rows in `attendance` | Restore tested (PASS/FAIL) |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

### The four numbers from Section 5

These four decisions exist to make the next pain **measurable**. Write the numbers down over the
semester: it is the difference between following a script and reproducing the method.

| # | Number to record | Where it shows up | Pain it measures | Stage |
|---|---|---|---|---|
| 1 | Hours per month reconciling the payment spreadsheet, and how many delinquent networks stayed active by mistake | `network.status` is changed by hand; billing is by bank transfer | Admin spends 3 h/month; 4 networks stayed active by mistake | 02 |
| 2 | How many times a month the registrar asks for a digital enrollment attachment | The enrollment paperwork stays on paper at the office | The first attempt writes to the local disk and disappears on deploy | 03 |
| 3 | The board's read rate | The `/announcements` screen, rate column (comes from `announcement_recipient.read_at`) | Sits at 12 % — e-mail stops being an opinion | 04 |
| 4 | Seconds to close a class group's term, and minutes to close the whole network's | The stopwatch on the teacher's closing screen | 35 students take 6 s; 40 class groups take 4 min and the browser gives up | 05 |

Also record the result of each `restore-test.sh`, every Friday. **An unverified backup is not a
backup** — it is the only invariant in the course written as a slogan, probably because it is the
item most often pushed to the end of the backlog and never done.

---

## Publishing the front separately

Today one process answers everything: `/api/v1/...` is the API, `/health` is the probe, and every
other path is the application document. Nothing forces it to stay that way — the front is a folder of
static files, and putting it on a CDN is three variables, no code.

| Variable | Where | What it does |
|---|---|---|
| `VITE_API_URL` | `apps/web/.env`, **read at build time** | The API's origin. Empty means same origin, which is today's arrangement. |
| `ALLOWED_ORIGINS` | `.env`, read by the API | The origins allowed to speak to it. Empty means same origin: no CORS header is emitted at all. |
| `COOKIE_DOMAIN` | `.env`, read by the API | The session cookie's domain. Empty means host-only. Fill it with `.seudominio.com.br` so both subdomains get the cookie. |

`VITE_API_URL` is baked into the bundle by Vite, not read at runtime: changing it means building
again. And it lives in `apps/web/.env`, not in the root `.env` — Vite reads the folder of the project
it is building, and only variables prefixed with `VITE_` reach the browser, which is what keeps
`SESSION_SECRET` out of a public bundle.

**The premise is a subdomain of the same registrable domain** — `app.seudominio.com.br` and
`api.seudominio.com.br`. That is what makes the cookie work: same site, so `SameSite=Lax` sends it,
and `COOKIE_DOMAIN=.seudominio.com.br` makes both subdomains see it.

What this does **not** cover is a front on `pages.dev` with an API on `seudominio.com.br`. Those are
different registrable domains, so every request is cross-site, and with `SameSite=Lax` the browser
sends no cookie at all in XHR — the API would see every call as anonymous no matter how permissive
`ALLOWED_ORIGINS` is. That arrangement needs `SameSite=None` with `Secure`, which is a constant in the
code here and not an environment variable. It is a deliberate limit, not an oversight: `None` means
the cookie travels on any third-party request, and that is a decision that belongs in a stage that
discusses it.

---

## What is deliberately left out

Nothing here was forgotten: every line solves a problem this system **does not have today** and would
charge permanent rent — deploy, monitoring, on-call — from day one. Each of them enters at a stage,
one at a time, with the pain described.

| Out of Stage 01 | Enters when | Stage |
|---|---|---|
| Payment gateway | the first network asks to pay by card | 02 |
| Object storage (enrollment attachment) | the registrar asks for a digital attachment | 03 |
| Mailer / e-mail delivery | it is proven that nobody opens the board | 04 |
| Queue, worker and event outbox | the first term closing blocks the registrar | 05 |
| CDN | bandwidth cost and CSS latency become visible | 06 |
| Cache | the indexes have already been reviewed — cache before index hides the problem | 07 |
| Load balancer and multiple instances | one instance is not enough and the deploy has to be zero-downtime | 08 |
| Read replica | the heavy report gets in the way of writes | 10 |
| Observability (metrics, tracing, APM) | the three hand-written numbers stop being enough | 11 |
| CI/CD pipeline | the manual deploy becomes the bottleneck | 12 |
| Dedicated search | `ILIKE` over names cannot cope with the volume | 13 |
| Service extraction (`billing/`) | a module needs a lifecycle of its own | 14 |

Also out, by product decision rather than architectural one: PDF report cards, timetable building,
make-up exams and class councils, per-lesson attendance (here attendance is **per day**), a mobile
app, a public third-party API, an SPA, WebSockets, spreadsheet export, i18n and a dark theme.

The pedagogical rule is code too, not configuration: **the final average is the plain arithmetic mean
of the four terms; a student passes with an average ≥ 6.0 and attendance ≥ 75 %.** No weighting per
assessment, no configurable rounding, no make-up exams. Parameterising that would trade four pure
functions for a formula engine with a configuration screen and a version per academic year — and it is
the part of the product that teaches the least about architecture.
