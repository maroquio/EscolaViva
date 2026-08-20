# EscolaViva — Stage 01

> Detailing of idea #16 from the course's SaaS idea catalogue, in the format of Section 8 of
> [`SAAS_EVOLUTION.md`](./SAAS_EVOLUTION.md).
>
> **Example stack:** TypeScript/Bun, a React SPA over a JSON API, and PostgreSQL.
> The module structure, the data model and the 23 invariants **do not change** with the language —
> Section 7 has the equivalence table for Django, Rails, Spring Boot and .NET.

---

## Positioning decided on day 1

**EscolaViva is a SaaS for school networks.** The paying account is the **network**, which owns one or
more **schools**. A standalone school is just a network with a single school.

That decision costs **one table and one column** today. Deferred, Stage 10 (replica) and Stage 13
(search) lose their volume justification, and adding `school` later becomes a migration across every
table in the system. It is the same logic as the invariants: cheap now, a project later.

---

## Stage 01 — The registrar's office that fits in one repository

**Enters:** Web Client · Monolithic Application · Relational Database
**Reference scale:** 40 paying networks (≈ 55 schools, 18 thousand students) · 2 people · Pre-seed · 1 server

**What hurt:** Nothing hurt yet. Two people, forty paying networks and three support questions a week.
The whole system fits in one repository, starts with one command and is debugged with one breakpoint.
The registrar's office traded a shared spreadsheet and a paper roll-call book for a single place.

**Measurement signal:** p95 of the grade-posting route under 300 ms · database CPU under 20 % ·
largest table (`attendance`) with ~3.6 million rows per academic year. The three numbers are written
down by hand once a week, with `pg_stat_statements` and `pg_stat_activity` — **this is not
observability** (Stage 11), it is the baseline without which no future pain is demonstrable.

**Why now:** Simplicity here is not a shortcut, it is the right decision. The product is still CRUD
with business rules: enrol, post grades, record attendance, close the term, publish an announcement.
All of that is one transaction in a relational database. Any additional component would charge
permanent rent — deploy, monitoring, on-call — without solving a problem that exists today.

**What changes:**

- **Code:** a modular monolith with four domains (`identity`, `academics`, `assessment`,
  `communication`), a JSON API those domains answer through, a React front that consumes it, a
  session in a table with the cookie carrying only its id, versioned migrations.
- **Infrastructure:** one containerised application server, one managed PostgreSQL with point-in-time
  recovery, one domain with TLS.
- **Operations:** manual deploy by command (tolerates 2 min of downtime — nobody is complaining yet);
  automatic daily backup **with a weekly restore drill**; the three metrics written by hand.

**Permanent rent:** one server, one database, one migration pipeline and the discipline of keeping the
boundary between the four modules. It is the smallest possible rent for a product that charges money.

**Deliberately left out:** Payment Gateway · Object Storage · Messaging · Queue · Worker · CDN ·
Cache · Load Balancer · WAF · Replica · Observability · CI/CD · Dedicated Search · Microservices —
**and also**: PDF report cards, timetable building, make-up exams and class councils, per-lesson
attendance, a mobile app.

- *Why:* none of them solves a problem this system has today. The networks pay by bank transfer, the
  enrollment paperwork stays on paper at the office, the announcement lives on the portal board and
  the report card is a screen.
- *Enters when:* one at a time, with the pain described in the thirteen stages that follow.
  Specifically: the gateway when the first network asks to pay by card (S02); storage when the
  registrar asks for an enrollment attachment (S03); e-mail when it is proven nobody opens the board
  (S04); the queue at the first term closing that blocks the registrar (S05).

**Invariants exercised:** I1, I2, I4, I5, I6, I7, I8, I10, I11, I12, I13, I14, I15, I16, I17, I18,
I19, I20, I22, I23 — plus the cheap groundwork for I3, I9 and I21 (detailed in Section 4).

---

## 1. Modules by domain (I1)

```
escolaviva/
├─ apps/api/src/
│  ├─ identity/            # who signs in and what they may do
│  │  ├─ domain/           #   Network, School, User, Role, Session
│  │  ├─ application/      #   authenticate, invite a user, change password
│  │  ├─ infra/            #   repositories (SQL)
│  │  └─ index.ts          #   ⟵ the module's ONLY way in
│  │
│  ├─ academics/           # who studies, where and with whom
│  │  ├─ domain/           #   Student, GuardianLink, ClassGroup, Subject, Enrollment, AcademicYear
│  │  ├─ application/      #   enrol, transfer, assign a teacher
│  │  ├─ infra/
│  │  └─ index.ts
│  │
│  ├─ assessment/          # grade, attendance and closing
│  │  ├─ domain/           #   Grade, Attendance, TermClosing, ReportCard
│  │  ├─ application/      #   post grades, record roll call, close the term
│  │  ├─ infra/
│  │  └─ index.ts
│  │
│  ├─ communication/       # what the school tells the guardian
│  │  ├─ domain/           #   Announcement, Recipient, BoardItem, ReadStatistic
│  │  ├─ application/      #   publish an announcement, mark as read
│  │  ├─ infra/
│  │  └─ index.ts
│  │
│  ├─ shared/              # infrastructure with no business rule
│  │  ├─ ports/            #   Clock, IdGenerator  (Mailer→S04, FileStorage→S03, Payment→S02)
│  │  ├─ db/               #   connection, unit of work, reader()/writer()  (I15)
│  │  ├─ document/         #   CPF arithmetic — a pure value, shared by identity and academics
│  │  ├─ pagination/       #   page, range and slicing, in SQL and in memory
│  │  ├─ http/             #   correlation (I16), tenant, ip (I12), session (I2), cache control (I11)
│  │  ├─ log/              #   structured logger + field redaction (I17)
│  │  ├─ jobs/             #   scheduler + advisory-lock locking (I20)
│  │  └─ config/           #   env reading and validation at boot (I18)
│  │
│  └─ http/                # the HTTP edge: the JSON API, and the front's build served beside it
│     ├─ routes/           #   one router per area, under /api/v1
│     ├─ contracts/        #   the types the front imports — the only thing it may import from here
│     ├─ schemas/          #   the Zod schema of every request body
│     ├─ presenters/       #   domain object → the shape the contract promises
│     ├─ static.ts         #   the hashed assets and the application document  (I10)
│     └─ health.ts         #   /health and /health/live  (I13)
│
├─ apps/api/tests/                # one folder per module, plus http/, shared/ and support/
├─ packages/contracts/src/        # the response shapes both halves import
├─ tests/                         # tests whose subject is the project, not a package
├─ apps/web/                      # the React front: Vite, React Router, Mantine, TanStack Query
│  └─ src/
│     ├─ app/                     #   routes, guards, the shell every area renders inside
│     ├─ features/                #   one folder per area, lazily loaded — network, registrar,
│     │                           #   teacher, guardian, announcements, session, account
│     └─ shared/                  #   the HTTP client, the form pieces, the UI nobody owns alone
│
├─ e2e/                           # the five journeys, in a real browser against a real database
├─ migrations/                    # 0001_initial_schema.sql  (I6)
├─ scripts/
│  ├─ migrate.ts                 # applies what is pending, one transaction per file  (I6)
│  ├─ seed.ts · seed-volume.ts   # the demo network, and the synthetic load of S10/S13
│  ├─ magic-values.ts            # refuses a loose literal in apps/api/src/
│  ├─ e2e-clean.ts               # returns the database to the seed's starting line
│  ├─ backup.sh
│  └─ restore-test.sh            # restores into a throwaway database and validates  (I7)
├─ apps/api/.dependency-cruiser.js  # the I1 rule, checked by the build tooling
├─ apps/web/.dependency-cruiser.js  # the front sees contracts/ and nothing else of the repo
├─ infra/Dockerfile               # immutable artefact from day 1  (I19)
└─ .env.example                   # secrets outside the repository  (I18)
```

The two workspaces are `apps/api` and `apps/web`. **The boundary between them is one import**: the
front reads `@escolaviva/contracts`, which is shape and vocabulary and nothing else, and
`apps/web/.dependency-cruiser.js` refuses everything else in the repository — it is written as a
permission rather than as a ban on `apps/api/src/`, because `apps/api/tests/`, `scripts/`,
`migrations/` and `infra/` are just as unimportable from a browser bundle. That is what keeps a
JSON API from becoming a shared codebase by accident.

### The rule the tooling checks

Five constraints, checked by `bun run check` (and, from Stage 12 on, in the pipeline) — four over
the server graph, one over the front's:

1. No module imports another module's internal file — only its `index.ts`.
   `academics/application/*` **may not** import `assessment/domain/grade`.
2. `*/domain/**` reaches its own module and four places in `shared/` — `ports/`, `document/`,
   `result.ts` and `constants.ts` — and **nothing else**, not `shared/db`, not a third-party SDK,
   not a Node builtin. The domain does not know a database, HTTP or a vendor exists. The rule names
   what is allowed rather than what is not: a denylist only forbids what somebody remembered to
   name, and `shared/pagination` was never on it.
3. `*/application/**` imports no third-party package either, with **one** allowance: `zod`, which
   I22 puts there. This is the rule that makes the I3 sentence true — without it the domain stays
   clean while `resend` sits in the middle of a use case, which is exactly where a send site would
   be written.
4. `shared/**` imports no domain module. Dependency always points inward.
5. `apps/web` imports `packages/contracts/` and nothing else from this repository.

Each of the five is planted with a real violation by `apps/api/tests/http/checklist.test.ts`, in
every module: a rule nobody has watched fail is a rule nobody knows is running.

**Why this matters at Stage 14:** when `billing/` is extracted, the question "what else touches this?"
already has an answer — only whoever imports `billing/index.ts`. Without that rule the answer is "no
idea" and the extraction turns into a rewrite.

### The dependency graph permitted at S01

```
communication ──┐
assessment ─────┼──▶ academics ──▶ identity
                └──▶ identity
```

`identity` knows nobody. `academics` knows `identity` (a teacher is a user).
`assessment` knows `academics` (a grade belongs to an enrollment). `communication` knows both.
No arrow comes back.

---

## 2. Data model

Conventions applied to **every** business table:

- `network_id` present in every business table — tenant isolation verifiable in the database, not
  only in the application. Two tables sit outside it and say why: `network` **is** the tenant, and
  `idempotent_request` is a platform table belonging to no network.
- Every index serving a tenant-scoped query starts with `network_id`. Three do not, on purpose:
  `session_by_expiration` sweeps by expiry across every tenant (I20), `active_enrollment_unique_per_year`
  states a uniqueness rule per student, and `idempotent_request_by_creation` belongs to the platform
  table.
- `created_at` and `updated_at` as `timestamptz`, always UTC, with a `set_updated_at` trigger on each
  table. `session` and `idempotent_request` carry only `created_at`: nothing updates a row of either.
- `uuid` primary key generated by the application (lets parent and child be written in one transaction
  with no round trip).

> The blocks below omit `created_at`, `updated_at` and the triggers, which follow the rule above
> without exception. Everything else — every column, FK, UNIQUE and CHECK — is what
> `migrations/0001_initial_schema.sql` creates.

### Identity

```sql
CREATE TABLE network (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  CONSTRAINT network_slug_unique UNIQUE (slug),
  CONSTRAINT network_status_valid CHECK (status IN ('active','suspended','cancelled'))
);

CREATE TABLE school (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  inep_code   text,
  active      boolean NOT NULL DEFAULT true,
  CONSTRAINT school_name_unique_in_network UNIQUE (network_id, name)
);

-- The table is `app_user`, not `user`: `user` is a reserved word in PostgreSQL, `CREATE TABLE user`
-- is a syntax error, and `SELECT * FROM user` does not fail — it returns the current role, which is
-- the quietest way to be wrong.
--
-- `app_user` is the person, not merely the credential. Whoever answers for a student is a row
-- here, reached from `student_guardian` — there is no separate record of a guardian. The CPF is
-- what a person types to sign in; the e-mail is contact only and is **not** unique, because a
-- mother and a father may share a family address.
CREATE TABLE app_user (
  id             uuid PRIMARY KEY,
  network_id     uuid NOT NULL REFERENCES network(id),
  email          text NOT NULL,
  cpf            text NOT NULL,
  phone          text,
  password_hash  text NOT NULL,
  name           text NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  CONSTRAINT user_cpf_format CHECK (cpf ~ '^[0-9]{11}$'),
  CONSTRAINT user_cpf_unique_in_network UNIQUE (network_id, cpf)
);

CREATE TABLE user_role (
  network_id  uuid NOT NULL REFERENCES network(id),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  school_id   uuid NOT NULL REFERENCES school(id),
  role        text NOT NULL,
  PRIMARY KEY (user_id, school_id, role),
  CONSTRAINT role_valid CHECK (role IN ('network_admin','registrar','teacher','guardian'))
);

-- The session lives in a table, and the cookie carries only its id: that is what keeps the
-- process stateless (I2). Killing the container and starting another loses nothing.
CREATE TABLE session (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  expires_at  timestamptz NOT NULL,
  ip          text
);
```

> **Note on billing:** `network.status` is set **by hand** by the administrator at Stage 01. There is
> no `plan` column and no `subscriber` boolean. At Stage 02 the `billing/` module is born with its own
> subscription and billing history, and `network.status` becomes derived from it. Modelling a
> subscription as a field of the tenant now is exactly the trap the course catalogue describes under
> Payment Gateway: "not being able to explain the billing history".

### Academics

```sql
CREATE TABLE academic_year (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  year        integer NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  CONSTRAINT year_unique_in_network UNIQUE (network_id, year),
  CONSTRAINT period_consistent CHECK (end_date > start_date)
);

CREATE TABLE class_group (
  id                uuid PRIMARY KEY,
  network_id        uuid NOT NULL REFERENCES network(id),
  school_id         uuid NOT NULL REFERENCES school(id),
  academic_year_id  uuid NOT NULL REFERENCES academic_year(id),
  name              text NOT NULL,
  grade_level       text NOT NULL,
  shift             text NOT NULL,
  CONSTRAINT class_group_unique UNIQUE (school_id, academic_year_id, name),
  CONSTRAINT shift_valid CHECK (shift IN ('morning','afternoon','evening','full_time'))
);

CREATE TABLE subject (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  CONSTRAINT subject_unique_in_network UNIQUE (network_id, name)
);

CREATE TABLE class_group_subject (
  id               uuid PRIMARY KEY,
  network_id       uuid NOT NULL REFERENCES network(id),
  class_group_id   uuid NOT NULL REFERENCES class_group(id),
  subject_id       uuid NOT NULL REFERENCES subject(id),
  teacher_user_id  uuid NOT NULL REFERENCES app_user(id),
  CONSTRAINT subject_unique_in_class_group UNIQUE (class_group_id, subject_id)
);

CREATE TABLE student (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  birth_date  date NOT NULL
);

-- Who answers for a student, and under what relationship. There is no `guardian` table: the
-- guardian is an `app_user`, and academics keeps the academic relationship alone. It is the same
-- direction as the teacher's `class_group_subject.teacher_user_id` — academics points at identity,
-- never the other way round.
CREATE TABLE student_guardian (
  network_id              uuid NOT NULL REFERENCES network(id),
  student_id              uuid NOT NULL REFERENCES student(id),
  user_id                 uuid NOT NULL REFERENCES app_user(id),
  relationship            text NOT NULL,
  financially_responsible boolean NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, user_id)
);

CREATE TABLE enrollment (
  id                uuid PRIMARY KEY,
  network_id        uuid NOT NULL REFERENCES network(id),
  student_id        uuid NOT NULL REFERENCES student(id),
  class_group_id    uuid NOT NULL REFERENCES class_group(id),
  academic_year_id  uuid NOT NULL REFERENCES academic_year(id),
  enrollment_date   date NOT NULL,
  status            text NOT NULL DEFAULT 'active',
  CONSTRAINT status_valid CHECK (status IN ('active','transferred','cancelled','completed'))
);
```

> A student may not hold two ACTIVE enrollments in the same academic year. That is not a check in
> the application: it is the partial unique index `active_enrollment_unique_per_year`, listed with
> the others below (I8).


### Assessment

```sql
CREATE TABLE grade (
  id                      uuid PRIMARY KEY,
  network_id              uuid NOT NULL REFERENCES network(id),
  enrollment_id           uuid NOT NULL REFERENCES enrollment(id),
  class_group_subject_id  uuid NOT NULL REFERENCES class_group_subject(id),
  term                    smallint NOT NULL,
  value                   numeric(4,2) NOT NULL,
  posted_by               uuid NOT NULL REFERENCES app_user(id),
  posted_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT term_valid   CHECK (term BETWEEN 1 AND 4),
  CONSTRAINT value_valid  CHECK (value >= 0 AND value <= 10),
  CONSTRAINT grade_unique UNIQUE (enrollment_id, class_group_subject_id, term)
);

CREATE TABLE attendance (
  id               uuid PRIMARY KEY,
  network_id       uuid NOT NULL REFERENCES network(id),
  enrollment_id    uuid NOT NULL REFERENCES enrollment(id),
  attendance_date  date NOT NULL,
  present          boolean NOT NULL,
  excuse           text,
  CONSTRAINT attendance_unique_per_day UNIQUE (enrollment_id, attendance_date)
);

CREATE TABLE term_closing (
  id              uuid PRIMARY KEY,
  network_id      uuid NOT NULL REFERENCES network(id),
  class_group_id  uuid NOT NULL REFERENCES class_group(id),
  term            smallint NOT NULL,
  closed_at       timestamptz NOT NULL DEFAULT now(),
  closed_by       uuid NOT NULL REFERENCES app_user(id),
  CONSTRAINT term_closing_unique UNIQUE (class_group_id, term)
);
```

**Two writes that may not interleave.** Closing a term counts the grades and writes the closing, and
the two touch different tables — so under the default isolation a concurrent posting that *deletes* a
grade commits between the count and the insert without ever conflicting, and the term closes with a
grade missing that can no longer be posted. `closeTerm` and `postGrades` take a
`pg_advisory_xact_lock` on (class group, term), released by the transaction itself. It is the only
place at this stage where two use cases have to be serialised, and it is worth naming: a transaction
is not the same as isolation, and the difference costs a student a grade.

**Attendance follows the same logic from the other side.** A roll call is refused once all four terms
are closed, because `finalStatus` only leaves `in_progress` then — and a report card the guardian has
already read may not change afterwards. The term of a given date is not a question this schema can
answer, since attendance is kept by date and no column maps a date to a term; the year being over is.

**Rule fixed by scope decision:** the final average is the arithmetic mean of the 4 terms; a student
passes with an average ≥ 6.0 and attendance ≥ 75 %. **No** make-up exams, **no** class council, **no**
weighting per assessment, **no** configurable rounding. That rule is code, not configuration. Making
the pedagogical rule parameterisable is the hole that eats the semester and teaches nothing about
architecture.

### Communication

```sql
CREATE TABLE announcement (
  id              uuid PRIMARY KEY,
  network_id      uuid NOT NULL REFERENCES network(id),
  school_id       uuid NOT NULL REFERENCES school(id),
  title           text NOT NULL,
  body            text NOT NULL,
  author_user_id  uuid NOT NULL REFERENCES app_user(id),
  published_at    timestamptz
);

CREATE TABLE announcement_recipient (
  network_id       uuid NOT NULL REFERENCES network(id),
  announcement_id  uuid NOT NULL REFERENCES announcement(id),
  user_id          uuid NOT NULL REFERENCES app_user(id),
  read_at          timestamptz,
  PRIMARY KEY (announcement_id, user_id)
);
```

> `read_at` is the instrumentation that **proves the Stage 04 pain**. When the board's read rate sits
> at 12 %, e-mail stops being an opinion and becomes a measurement.

### Platform

```sql
-- The browser is external input: a guardian on bad 4G sends the same form twice. The key comes
-- from the form and the INSERT happens inside the write transaction, so the second submission
-- reprocesses nothing and goes back to `response_location` (I4).
--
-- The only table with no `network_id`: it belongs to the platform, not to a tenant. And the column
-- is `idempotency_key`, not `key` — `key` is a reserved word in PostgreSQL and would start
-- demanding double quotes in every hand-written query from here on.
CREATE TABLE idempotent_request (
  idempotency_key    uuid PRIMARY KEY,
  route              text NOT NULL,
  user_id            uuid NOT NULL REFERENCES app_user(id),
  response_hash      text NOT NULL,
  response_location  text NOT NULL
);
```

### Indexes that exist from day 1

Fourteen in all. Each one exists because a screen opens through it — the name says which.

```sql
-- Identity: the menu of every request, and the sweep of the session purge.
CREATE INDEX user_role_by_user            ON user_role  (network_id, user_id);
CREATE INDEX session_by_expiration        ON session    (expires_at);

-- Academics: the registrar listing, filtering, and reaching the children of a guardian.
-- `student_by_name` orders and pages the list. It does NOT serve the search box, which asks
-- `name ILIKE '%termo%'` — a leading wildcard no btree can seek on. At 450 students per network
-- that scan is invisible, and it is the fifth pain in Section 5 rather than a defect to optimise:
-- Stage 13 has to arrive because a number moved, not because the syllabus says so.
CREATE INDEX student_by_name              ON student    (network_id, name);
CREATE INDEX class_group_by_school_and_year
  ON class_group (network_id, school_id, academic_year_id);
CREATE INDEX class_group_subject_by_teacher
  ON class_group_subject (network_id, teacher_user_id);
CREATE INDEX class_group_subject_by_class_group
  ON class_group_subject (network_id, class_group_id);
CREATE INDEX student_guardian_by_user     ON student_guardian (network_id, user_id);
CREATE UNIQUE INDEX active_enrollment_unique_per_year
  ON enrollment (student_id, academic_year_id) WHERE status = 'active';
CREATE INDEX active_enrollment_by_class_group
  ON enrollment (network_id, class_group_id)   WHERE status = 'active';

-- Assessment: the posting screen, and the largest table in the system.
CREATE INDEX grade_by_class_group_subject ON grade      (network_id, class_group_subject_id, term);
CREATE INDEX attendance_by_enrollment     ON attendance (network_id, enrollment_id, attendance_date);

-- Communication: the school's list, newest first, and the guardian's board.
CREATE INDEX announcement_by_school       ON announcement (network_id, school_id, published_at DESC);
CREATE INDEX announcement_recipient_by_user
  ON announcement_recipient (network_id, user_id);

-- Platform.
CREATE INDEX idempotent_request_by_creation ON idempotent_request (created_at);
```

**Why this is an architecture decision and not a database one:** Stage 07 (cache) is only honest once
the indexes have been reviewed. A cache placed over an unindexed query hides the problem instead of
solving it — it is antipattern #2 of the course, "cache before index".

---

## 3. Stage 01 surfaces

| Actor | What they do | Authentication |
|------|-----------|--------------|
| Registrar | registers students and guardians, links guardian to student — who must already hold the `guardian` role, since that link is the only authority behind everything a guardian reads — enrols, transfers, registers class groups and subjects | session |
| Teacher | posts grades, records roll call, closes their class group's term | session |
| Guardian | sees the report card (on screen), attendance and the announcement board | session |
| Network admin | creates schools, invites users, defines the academic year | session |

No public surface without a login. No third-party API. No mobile app.

### The decision: a React SPA over a JSON API

This stage began server-rendered — HTML from Eta, no SPA and no API to version, which is what the
component catalogue recommends for the Web Client channel on day 1. It ends as a React SPA speaking to
a JSON API under `/api/v1`. The replacement was total: the templates are gone, not kept beside it.

**The context.** The screens were asked to become a single-page application. The catalogue's warning
was not wrong, and the price it names is exactly the price that was paid — which is why the decision is
written here with the bill attached rather than as a preference.

**The consequences, unvarnished:**

- **Two build artefacts instead of one.** `apps/web/dist` and the server image. They are built
  together and shipped together today, but they are two things now, and a deploy that ships one
  without the other has a failure mode that did not exist before.
- **An API to version.** `/api/v1` is a contract. Changing a field name is no longer a refactor, it is
  a breaking change with a version number attached.
- **Validation in two layers.** Zod on the server and on the client, from schemas that have to agree.
  The server's is the real one (I22); the client's exists so the user is told before the round trip.
- **One more rule every client has to know.** The session cookie is `SameSite=Lax`, which is what
  actually stops a cross-site write, and on top of it every write requires the `X-Requested-By`
  header — a header no cross-site form can set, and defence in depth the server-rendered version
  never had. It is not a cost in security, it is a cost in surface: a request that used to be a form
  submission is now three headers (`Content-Type`, `Idempotency-Key`, `X-Requested-By`), and every
  example, every `curl` in the material and every future client has to carry all three.
- **The guardian downloads JavaScript before the report card.** This is the cost that lands on the
  person the whole system is arranged around, and it is measured, not hoped for: the guardian's first
  load is held under a ceiling by `apps/web/tests/budget.test.ts`, and the areas are split so nobody
  downloads the registrar's screens to read a report card.

**What was rejected alongside it, and why:**

- **React with server-side rendering.** It would pay the rent of an SSR runtime — a second Node-shaped
  process, hydration mismatches, a cache to reason about — for a pain this system does not have. The
  screens are behind a login; there is nothing to index and nobody waiting on first paint.
- **A token in the browser (JWT in `localStorage`).** It would break I2 in the direction that matters:
  the session would stop being a row that can be deleted. Revoking access would go from `DELETE FROM
  session` to waiting for an expiry, and the "erase the row, lose the access" case in the checklist
  would have no meaning left.
- **A response envelope (`{data, error}`).** The result type in `shared/result.ts` already carries that
  distinction on the server, and HTTP already has a status line. An envelope would add a third place
  where success and failure are spelled, and the front would unwrap every response to reach the object
  it wanted.

### I23 — the front publishable separately

The three variables `VITE_API_URL`, `ALLOWED_ORIGINS` and `COOKIE_DOMAIN` are the whole path from one
process serving both halves to a front on a CDN and an API behind it. No code changes; the README's
"Publishing the front separately" section states them one by one.

**The premise is explicit: the front and the API on subdomains of the same registrable domain** —
`app.seudominio.com.br` and `api.seudominio.com.br`. That is what keeps the session cookie working:
same site, so `SameSite=Lax` sends it, and `COOKIE_DOMAIN=.seudominio.com.br` makes both subdomains
see it.

Leaving that premise is a **new decision, not a variable tweak**. A front on `pages.dev` with an API on
`seudominio.com.br` is cross-site, and `SameSite=Lax` sends no cookie at all on XHR — the API would see
every request as anonymous however permissive CORS is. That arrangement needs `SameSite=None` with
`Secure`, which means the cookie travels on any third-party request, and that belongs to a stage that
discusses it.

---

## 4. The 23 invariants, mapped

| # | Invariant | Where it lives at Stage 01 | Cost today |
|---|-----------|-------------------------|------------|
| **I1** | Modular monolith | 4 domain folders + `apps/api/.dependency-cruiser.js` with 4 of the 5 rules from Section 1, and `apps/web/.dependency-cruiser.js` with the fifth | 2 config files |
| **I2** | Stateless application | The `session` table holds the session; the signed cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) carries only its id, read by `apps/api/src/shared/http/session.ts`. Zero module variables holding state, zero writes to disk. **Unchanged by the SPA**, and deliberately so: the front holds no token, so signing somebody out is still deleting a row | 1 table |
| **I3** | Side effects behind an interface | `apps/api/src/shared/ports/` holds `Clock` and `IdGenerator`. **There is no external effect at S01** — what is established are rules 2 and 3 of dependency-cruiser: neither the domain nor the use case imports an SDK. Rule 2 alone would not be enough, because the send site of S04 would be written in `*/application/`, and that is the layer rule 3 closes. With both, `ports/` is the only place `Mailer` fits — not by convention, by the check failing | free |
| **I4** | Idempotency on external input | The browser **is** external input: a guardian on bad 4G submits twice. Table `idempotent_request(idempotency_key, route, user_id, response_hash, response_location, created_at)` + middleware on the write routes. **The key moved from a hidden form field to the `Idempotency-Key` header** — and it is drawn by the **form**, not by the request: `apps/web/src/shared/api/submission.ts` gives each screen one key per submission and keeps it across attempts, so the second tap arrives under the first tap's key. Minting it inside the HTTP client, which is where it used to happen, meant two taps were two keys and the table never saw a repeat — the invariant was installed and idle. On the server the middleware does not claim the key either: it hands it to `unitOfWork`, which claims it with `INSERT … ON CONFLICT DO NOTHING` as the **first statement of the write transaction**. Key and write commit together, so there is nothing to compensate — a rollback, from an exception or from a 422, leaves the key free for the retry. The mechanism is the one a payment gateway needs at S02; the **shape** is not yet: the key is a `uuid` and `user_id` is `NOT NULL`, and a webhook has an opaque string and no user. Both are widened by `ALTER` inside the I6 window, which is why they are not widened now. Two answers exist besides `repeated`: a key that belongs to **another user or another route** is a 409, not a replay — the platform table has no `network_id`, so scoping the replay by owner is what keeps one network from being handed another's `location`; and a key whose write is **still finishing** is also a 409, told apart by `response_hash` rather than by the location, because a 204 legitimately has no destination and its replay must keep working | 1 table + 1 middleware |
| **I5** | The database is the single source of truth | Trivial today (there is no copy). The rule being established: no use case decides from a value that was computed and stored — enrollment status, average and attendance are **queried**, never kept in a denormalised column | free |
| **I6** | Versioned migrations | `migrations/*.sql` numbered, applied by command in a single order, recorded in `schema_migrations`. The compatibility window — **never drop or rename a column the previous version still reads**: add, migrate, stop writing, then drop — is stated in the README, enforced over every migration by `tests/migration_window.test.ts` and demonstrated running against a real database by `apps/api/tests/shared/migration_window_in_motion.test.ts` | 2 test files |
| **I7** | Backup with a tested restore | `scripts/restore-test.sh` restores the dump into a throwaway database and runs `SELECT count(*) FROM enrollment WHERE status='active'`, comparing against the expected value. Run **every Friday**, by hand, with the result written down | 1 script + 10 min/week |
| **I8** | Integrity in the database | Every FK, UNIQUE and CHECK from Section 2, including the partial unique index `active_enrollment_unique_per_year` | free |
| **I9** | Object key, not URL | There is no file at S01. The decision is taken anyway and recorded here: when storage arrives (S03), the column is called `document.object_key`, never `document.url`. A URL nails the bucket, the region and the provider into every row; a key survives the move | free |
| **I10** | Assets versioned in the filename | **Vite hashes the bundles**; `index.html` names them and is itself never cached. The two halves are one rule: an asset under `/assets/` is `immutable`, the document is `no-store` — a kept document points at the previous build's bundles and the browser has no way to notice. No CDN yet, but when one arrives at S06 there will be no manual purge | free, it is the bundler |
| **I11** | Never cache an authenticated response without separating by user | There is no cache — but there is a header. Global middleware: every authenticated response answers `Cache-Control: private, no-store` with `Vary: Cookie`. **What is authenticated is now the JSON, not the page**, which is where the guardian's report card actually travels. The middleware decides after the handler has run, so the request is **marked on arrival**: signing out ends the session and would otherwise make its own response look anonymous. **The cheapest invariant, and the one that prevents the gravest mistake on the list** | 3 lines |
| **I12** | `X-Forwarded-For` read correctly | A single function `clientIp(...)` in `apps/api/src/shared/http/ip.ts`, with the trusted-proxy list coming from the environment (**empty** at S01). When a CDN and a load balancer arrive, the variable changes, not the code | 1 function |
| **I13** | A `/health` that checks dependencies | `/health` runs `SELECT 1` with a 2 s timeout and answers 503 on failure. `/health/live` only confirms the process. `SIGTERM` stops accepting connections, finishes the ones in flight and only then exits | 1 file |
| **I14** | Application timeout smaller than the layer in front | `HTTP_TIMEOUT_MS=25000` via the environment, documented: "always smaller than the timeout of whoever sits in front". No load balancer yet, but the number is already explicit | 1 variable |
| **I15** | Explicit read/write routing | `reader()`, `readerFresh()` and `writer()` in `apps/api/src/shared/db/`. All three return the primary at S01. Every query chooses deliberately — and the choice that matters is not read-versus-write, it is **describe versus decide**: `reader()` for the 52 reads that feed a screen and tolerate a second of lag, `readerFresh()` for the 3 whose answer authorises something (validating a session, checking a password). Without that split, the "one line inside `reader()`" of S10 would send session validation to the replica and log people out with their own successful login | 1 extra function |
| **I16** | Correlation ID generated at the edge | `apps/api/src/shared/http/correlation.ts` generates it on entry, keeps it in the request context and injects it into every log line. No observability yet — but when it arrives at S11, the trail format already exists | 1 middleware |
| **I17** | Structured logs, with no personal data and no secrets | A JSON logger redacting in two passes. By **key**, from a denylist: it records `student_id`, never `student_name`; never a guardian's e-mail; never a grade. And by **value**, with patterns for CPF and e-mail run over every string — because the key list only catches what somebody thought to name, and a CPF quoted back inside a driver's error message arrives under `message`, which nobody put on a list. A name has no shape to match, so that half stays with the denylist, and saying so is worth more than pretending otherwise. The third pattern is the connection string: `database_url` is on the denylist, but a driver puts the whole URL inside `message`, and the two hosts this repository documents — `localhost` and `database` — have no dot, so the e-mail pattern was covering neither. `unhandledRejection` and `uncaughtException` are registered for the same reason: a failure on either used to leave through stderr, outside pino and outside redaction. Data about minors gets stricter treatment — the observability of S11 must not create the compliance problem | 1 module |
| **I18** | Config from the environment, secrets outside the repository | `apps/api/src/shared/config` validates the schema at boot and **fails fast** if a variable is missing. `.env.example` is versioned, `.env` is in `.gitignore` | 1 module |
| **I19** | Immutable, versioned artefact | `infra/Dockerfile` from day 1; the same image runs in dev and production; tag = commit hash. No pipeline yet (S12), but there will never be a "works on my machine" | 1 file |
| **I20** | Distributed lock on periodic jobs | The only job at S01 is purging expired sessions. It already uses `pg_try_advisory_lock` in `apps/api/src/shared/jobs/lock.ts`. With one instance it is redundant; with six (S08) it is what keeps the job from running six times. Shutting down waits for a job in flight before closing the pool — the purge holds a reserved connection and an open transaction, and a deploy used to be able to cut it in half | 1 function |
| **I21** | Domain events via an outbox | **Not part of S01** — the course places the outbox at S05, alongside the queue. What is guaranteed today is that every state-changing use case has **a single commit point** (`apps/api/src/shared/db/unitOfWork.ts`). Adding the outbox `INSERT` at S05 will be one line at that point, not a refactor in 40 places | free |
| **I22** | Real validation always on the server | Every use case in `*/application/` validates its input with a schema before touching the domain. **The front validates too, with its own Zod schemas — and that changes nothing about who decides.** The client's copy exists so the user is told without a round trip; the server refuses regardless, and the API suite proves it by posting bodies the front would never send | free |
| **I23** | The front publishable separately | `VITE_API_URL`, `ALLOWED_ORIGINS` and `COOKIE_DOMAIN` — three variables, no code. Today one process serves both halves; at S06, with a CDN, the front moves and the API stays. **The premise is subdomains of the same registrable domain**; leaving it is a new decision, not a variable tweak (Section 3) | 3 variables |

---

## 5. The pains Stage 01 plants on purpose

A good Stage 01 is not only what works — it is what **prepares the next pain to be measurable**.
These five decisions exist so that the stages that follow happen because of evidence rather than
because of the course calendar:

| S01 decision | Pain it makes measurable | Stage |
|----------------|------------------------------|---------|
| Billing by bank transfer, `network.status` set by hand | Admin spends 3 h/month reconciling a spreadsheet; 4 delinquent networks stayed active by mistake | 02 |
| Enrollment paperwork stays on paper | The registrar asks for a digital attachment; the first attempt writes to the local disk and disappears on deploy | 03 |
| `announcement_recipient.read_at` | The board's read rate sits at 12 % — e-mail stops being an opinion | 04 |
| Synchronous term closing | Closing one class group of 35 students takes 6 s; closing the network's 40 class groups takes 4 min and the browser gives up | 05 |
| Search is `ILIKE '%term%'` over a btree that cannot seek it | Every keystroke scans the network's students, twice per page — once for the rows, once for the count. Invisible at 450 students, and the slowest endpoint in the system long before 400 thousand accounts | 13 |

Ask the students to **write the five numbers down** over the semester. It is the difference between
following a script and reproducing the method.

The fifth is the one that teaches the method best, because the temptation is to fix it today: add
`pg_trgm`, add a GIN index, and the measurement that would have justified Stage 13 is gone. The
course's first principle is that a component enters **after** the pain — and an optimisation that
erases the evidence is the same mistake wearing better clothes.

---

## 6. The first backlog (suggested order)

1. `identity`: network, school, user, role, login with the session in a table and the cookie
   carrying only its id
2. `shared`: config validated at boot, structured logger, correlation ID, `/health`, `Cache-Control`
3. The migration with every FK, UNIQUE and CHECK
4. `academics`: student, the guardian link, class group, subject, enrollment
5. `assessment`: grade posting and roll call, with idempotency on form submission
6. `assessment`: term closing and the on-screen report card
7. `communication`: publish an announcement, the guardian's board, mark as read
8. `scripts/restore-test.sh` + the first restore drill **before** there is a real customer
9. `apps/api/.dependency-cruiser.js` and `apps/web/.dependency-cruiser.js` with the 5 rules,
   running under `bun run check`

Item 8 tends to get pushed to the end and never happen. "An unverified backup is not a backup" is the
only invariant in the course written as a slogan — probably for that reason.

---

## 7. Equivalence across stacks

The structure above does not depend on the language. The tools change, the decisions do not.

| Concept | TypeScript/Node | Django | Rails | Spring Boot | .NET |
|----------|-----------------|--------|-------|-------------|------|
| Domain module | folder + `index.ts` | Django app | engine / namespace | package | project / namespace |
| I1 rule checked by | dependency-cruiser | import-linter | packwerk | ArchUnit | NetArchTest |
| Migrations (I6) | own runner over numbered `.sql` (`scripts/migrate.ts`) | migrations | Active Record migrations | Flyway / Liquibase | EF Core Migrations |
| Session (I2) | table + signed cookie holding the id | signed cookie session | `cookie_store` | Spring Session | Cookie Authentication |
| Validated config (I18) | zod at boot | django-environ | dotenv + validation | `@ConfigurationProperties` | `IOptions` + validation |
| Structured logs (I17) | pino | structlog | Semantic Logger | Logback JSON | Serilog |
| Advisory lock (I20) | `pg_try_advisory_lock` | same | same | ShedLock | same |
| Health (I13) | own route | django-health-check | own route | Actuator | Health Checks |

---

## 8. What to check before declaring Stage 01 done

- [ ] `bun run check` fails if a module imports another one's internal file
- [ ] The application writes no file to disk
- [ ] Killing the container and starting another loses nothing — the session lives in the database
- [ ] Every business table has `network_id` and a declared FK
- [ ] Submitting the same form twice creates **one** record
- [ ] An authenticated route answers `Cache-Control: private, no-store`
- [ ] `/health` answers 503 with the database stopped
- [ ] A missing environment variable → the process **does not start**
- [ ] The dump was restored into another database and the counts matched
- [ ] No log line contains a name, e-mail, CPF or grade
- [ ] The four numbers from Section 5 are written down

Eleven items. None of them adds a component — all of them turn the thirteen stages that follow into
an addition.
