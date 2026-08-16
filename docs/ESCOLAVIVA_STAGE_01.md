# EscolaViva — Stage 01

> Detailing of idea #16 from the course's SaaS idea catalogue, in the format of Section 8 of
> [`SAAS_EVOLUTION.md`](./SAAS_EVOLUTION.md).
>
> **Example stack:** TypeScript/Node with server-rendered HTML and PostgreSQL.
> The module structure, the data model and the 22 invariants **do not change** with the language —
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
  `communication`), server-rendered HTML, a session in a signed cookie, versioned migrations.
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

**Invariants exercised:** I1, I2, I5, I6, I7, I8, I10, I11, I12, I13, I14, I15, I16, I17, I18, I19,
I20, I22 — plus the cheap groundwork for I3, I4, I9 and I21 (detailed in Section 4).

---

## 1. Modules by domain (I1)

```
escolaviva/
├─ src/
│  ├─ identity/            # who signs in and what they may do
│  │  ├─ domain/           #   Network, School, User, Role
│  │  ├─ application/      #   authenticate, invite a user, change password
│  │  ├─ infra/            #   repositories (SQL)
│  │  └─ index.ts          #   ⟵ the module's ONLY way in
│  │
│  ├─ academics/           # who studies, where and with whom
│  │  ├─ domain/           #   Student, Guardian, ClassGroup, Subject, Enrollment
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
│  │  ├─ domain/           #   Announcement, Recipient, ReadReceipt
│  │  ├─ application/      #   publish an announcement, mark as read
│  │  ├─ infra/
│  │  └─ index.ts
│  │
│  ├─ shared/              # infrastructure with no business rule
│  │  ├─ ports/            #   Clock, IdGenerator  (Mailer→S04, FileStorage→S03, Payment→S02)
│  │  ├─ db/               #   connection, unit of work, reader()/writer()  (I15)
│  │  ├─ http/             #   correlation (I16), tenant, ip (I12), session (I2), cache control (I11)
│  │  ├─ log/              #   structured logger + field redaction (I17)
│  │  ├─ jobs/             #   scheduler + advisory-lock locking (I20)
│  │  └─ config/           #   env reading and validation at boot (I18)
│  │
│  └─ web/                 # HTTP controllers + templates
│     ├─ routes/
│     ├─ templates/
│     └─ health.ts         #   /health and /health/live  (I13)
│
├─ migrations/                    # 0001_..., 0002_...  (I6)
├─ scripts/
│  ├─ backup.sh
│  └─ restore-test.sh            # restores into a throwaway database and validates  (I7)
├─ config/.dependency-cruiser.js  # the I1 rule, checked by the build tooling
├─ infra/Dockerfile               # immutable artefact from day 1  (I19)
└─ .env.example                   # secrets outside the repository  (I18)
```

### The rule the tooling checks

Three constraints, checked by `bun run check` (and, from Stage 12 on, in the pipeline):

1. No module imports another module's internal file — only its `index.ts`.
   `academics/application/*` **may not** import `assessment/domain/grade`.
2. `*/domain/**` imports nothing from `shared/db`, `shared/http` or a third-party SDK.
   The domain does not know a database, HTTP or a vendor exists.
3. `shared/**` imports no domain module. Dependency always points inward.

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

- `network_id` present in every table — tenant isolation verifiable in the database, not only in the
  application.
- Every query index starts with `network_id`.
- `created_at` and `updated_at` as `timestamptz`, always UTC.
- `uuid` primary key generated by the application (lets parent and child be written in one transaction
  with no round trip).

### Identity

```sql
CREATE TABLE network (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
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
CREATE TABLE app_user (
  id             uuid PRIMARY KEY,
  network_id     uuid NOT NULL REFERENCES network(id),
  email          text NOT NULL,
  password_hash  text NOT NULL,
  name           text NOT NULL,
  active         boolean NOT NULL DEFAULT true
);

CREATE TABLE user_role (
  user_id     uuid NOT NULL REFERENCES app_user(id),
  school_id   uuid NOT NULL REFERENCES school(id),
  role        text NOT NULL,
  PRIMARY KEY (user_id, school_id, role),
  CONSTRAINT role_valid CHECK (role IN ('network_admin','registrar','teacher','guardian'))
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
  birth_date  date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE guardian (
  id          uuid PRIMARY KEY,
  network_id  uuid NOT NULL REFERENCES network(id),
  name        text NOT NULL,
  email       text NOT NULL,
  phone       text,
  CONSTRAINT guardian_email_unique_in_network UNIQUE (network_id, email)
);

CREATE TABLE student_guardian (
  student_id              uuid NOT NULL REFERENCES student(id),
  guardian_id             uuid NOT NULL REFERENCES guardian(id),
  relationship            text NOT NULL,
  financially_responsible boolean NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, guardian_id)
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

-- A student may not hold two ACTIVE enrollments in the same academic year.
CREATE UNIQUE INDEX active_enrollment_unique_per_year
  ON enrollment (student_id, academic_year_id)
  WHERE status = 'active';
```

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
  announcement_id  uuid NOT NULL REFERENCES announcement(id),
  guardian_id      uuid NOT NULL REFERENCES guardian(id),
  read_at          timestamptz,
  PRIMARY KEY (announcement_id, guardian_id)
);
```

> `read_at` is the instrumentation that **proves the Stage 04 pain**. When the board's read rate sits
> at 12 %, e-mail stops being an opinion and becomes a measurement.

### Indexes that exist from day 1

```sql
CREATE INDEX ON enrollment    (network_id, class_group_id) WHERE status = 'active';
CREATE INDEX ON grade         (network_id, class_group_subject_id, term);
CREATE INDEX ON attendance    (network_id, enrollment_id, attendance_date);
CREATE INDEX ON announcement  (network_id, school_id, published_at DESC);
```

**Why this is an architecture decision and not a database one:** Stage 07 (cache) is only honest once
the indexes have been reviewed. A cache placed over an unindexed query hides the problem instead of
solving it — it is antipattern #2 of the course, "cache before index".

---

## 3. Stage 01 surfaces

| Actor | What they do | Authentication |
|------|-----------|--------------|
| Registrar | enrols, transfers, registers class groups and subjects | session |
| Teacher | posts grades, records roll call, closes their class group's term | session |
| Guardian | sees the report card (on screen), attendance and the announcement board | session |
| Network admin | creates schools, invites users, defines the academic year | session |

No public surface without a login. No third-party API. No mobile app.
Server-rendered HTML, no SPA and no public API to version — exactly what the component catalogue
recommends for the Web Client channel on day 1.

---

## 4. The 22 invariants, mapped

| # | Invariant | Where it lives at Stage 01 | Cost today |
|---|-----------|-------------------------|------------|
| **I1** | Modular monolith | 4 domain folders + `config/.dependency-cruiser.js` with the 3 rules from Section 1 | 1 config file |
| **I2** | Stateless application | `src/shared/http/session.ts`: signed cookie (`HttpOnly`, `Secure`, `SameSite=Lax`). Zero module variables holding state, zero writes to disk | free |
| **I3** | Side effects behind an interface | `src/shared/ports/` holds `Clock` and `IdGenerator`. **There is no external effect at S01** — what is established is rule 2 of dependency-cruiser: the domain does not import an SDK. When `Mailer` arrives at S04, it is born in `ports/` because that is the only place it fits | free |
| **I4** | Idempotency on external input | The browser **is** external input: a guardian on bad 4G submits the form twice. Table `idempotent_request(idempotency_key, route, user_id, response_hash, response_location, created_at)` + middleware on the write routes. At S02 the gateway webhook uses the same table unchanged | 1 table + 1 middleware |
| **I5** | The database is the single source of truth | Trivial today (there is no copy). The rule being established: no use case decides from a value that was computed and stored — enrollment status, average and attendance are **queried**, never kept in a denormalised column | free |
| **I6** | Versioned migrations | `migrations/0001_*.sql` numbered, applied by command in a single order. The README pins the compatibility window: **never drop a column the previous version still reads** — add, migrate, stop writing, then drop | free |
| **I7** | Backup with a tested restore | `scripts/restore-test.sh` restores the dump into a throwaway database and runs `SELECT count(*) FROM enrollment WHERE status='active'`, comparing against the expected value. Run **every Friday**, by hand, with the result written down | 1 script + 10 min/week |
| **I8** | Integrity in the database | Every FK, UNIQUE and CHECK from Section 2, including the partial unique index `active_enrollment_unique_per_year` | free |
| **I9** | Object key, not URL | There is no file at S01. Decision recorded in an ADR: when storage arrives (S03), the column is called `document.object_key`, never `document.url` | 1 ADR |
| **I10** | Assets versioned in the filename | The front-end build produces `app.<hash>.css`; templates use the `asset('app.css')` helper. No CDN yet, but when one arrives at S06 there will be no manual purge | 1 build plugin |
| **I11** | Never cache an authenticated response without separating by user | There is no cache — but there is a header. Global middleware: every authenticated route answers `Cache-Control: private, no-store`. **The cheapest invariant, and the one that prevents the gravest mistake on the list** | 3 lines |
| **I12** | `X-Forwarded-For` read correctly | A single function `clientIp(...)` in `src/shared/http/ip.ts`, with the trusted-proxy list coming from the environment (**empty** at S01). When a CDN and a load balancer arrive, the variable changes, not the code | 1 function |
| **I13** | A `/health` that checks dependencies | `/health` runs `SELECT 1` with a 2 s timeout and answers 503 on failure. `/health/live` only confirms the process. `SIGTERM` stops accepting connections, finishes the ones in flight and only then exits | 1 file |
| **I14** | Application timeout smaller than the layer in front | `HTTP_TIMEOUT_MS=25000` via the environment, documented: "always smaller than the timeout of whoever sits in front". No load balancer yet, but the number is already explicit | 1 variable |
| **I15** | Explicit read/write routing | `reader()` and `writer()` in `src/shared/db/`. Both return the primary at S01. Every query chooses deliberately. At S10, one line changes inside `reader()` | 1 extra function |
| **I16** | Correlation ID generated at the edge | `src/shared/http/correlation.ts` generates it on entry, keeps it in the request context and injects it into every log line. No observability yet — but when it arrives at S11, the trail format already exists | 1 middleware |
| **I17** | Structured logs, with no personal data and no secrets | A JSON logger with a list of redacted fields. **It records `student_id`, never `student_name`; never a guardian's e-mail; never a grade.** Data about minors gets stricter treatment — the observability of S11 must not create the compliance problem | 1 module |
| **I18** | Config from the environment, secrets outside the repository | `src/shared/config` validates the schema at boot and **fails fast** if a variable is missing. `.env.example` is versioned, `.env` is in `.gitignore` | 1 module |
| **I19** | Immutable, versioned artefact | `infra/Dockerfile` from day 1; the same image runs in dev and production; tag = commit hash. No pipeline yet (S12), but there will never be a "works on my machine" | 1 file |
| **I20** | Distributed lock on periodic jobs | The only job at S01 is purging expired sessions. It already uses `pg_try_advisory_lock` in `src/shared/jobs/lock.ts`. With one instance it is redundant; with six (S08) it is what keeps the job from running six times | 1 function |
| **I21** | Domain events via an outbox | **Not part of S01** — the course places the outbox at S05, alongside the queue. What is guaranteed today is that every state-changing use case has **a single commit point** (`src/shared/db/unitOfWork.ts`). Adding the outbox `INSERT` at S05 will be one line at that point, not a refactor in 40 places | free |
| **I22** | Real validation always on the server | Every use case in `*/application/` validates its input with a schema before touching the domain. The HTML uses `required` and `type=number` **only** for quick feedback to the user | free |

---

## 5. The pains Stage 01 plants on purpose

A good Stage 01 is not only what works — it is what **prepares the next pain to be measurable**.
These four decisions exist so that stages 02 to 05 happen because of evidence rather than because of
the course calendar:

| S01 decision | Pain it makes measurable | Stage |
|----------------|------------------------------|---------|
| Billing by bank transfer, `network.status` set by hand | Admin spends 3 h/month reconciling a spreadsheet; 4 delinquent networks stayed active by mistake | 02 |
| Enrollment paperwork stays on paper | The registrar asks for a digital attachment; the first attempt writes to the local disk and disappears on deploy | 03 |
| `announcement_recipient.read_at` | The board's read rate sits at 12 % — e-mail stops being an opinion | 04 |
| Synchronous term closing | Closing one class group of 35 students takes 6 s; closing the network's 40 class groups takes 4 min and the browser gives up | 05 |

Ask the students to **write the four numbers down** over the semester. It is the difference between
following a script and reproducing the method.

---

## 6. The first backlog (suggested order)

1. `identity`: network, school, user, role, login with a session in a signed cookie
2. `shared`: config validated at boot, structured logger, correlation ID, `/health`, `Cache-Control`
3. Migrations 0001–0003 with every FK, UNIQUE and CHECK
4. `academics`: student, guardian, class group, subject, enrollment
5. `assessment`: grade posting and roll call, with idempotency on form submission
6. `assessment`: term closing and the on-screen report card
7. `communication`: publish an announcement, the guardian's board, mark as read
8. `scripts/restore-test.sh` + the first restore drill **before** there is a real customer
9. `config/.dependency-cruiser.js` with the 3 rules, running under `bun run check`

Item 8 tends to get pushed to the end and never happen. "An unverified backup is not a backup" is the
only invariant in the course written as a slogan — probably for that reason.

---

## 7. Equivalence across stacks

The structure above does not depend on the language. The tools change, the decisions do not.

| Concept | TypeScript/Node | Django | Rails | Spring Boot | .NET |
|----------|-----------------|--------|-------|-------------|------|
| Domain module | folder + `index.ts` | Django app | engine / namespace | package | project / namespace |
| I1 rule checked by | dependency-cruiser | import-linter | packwerk | ArchUnit | NetArchTest |
| Migrations (I6) | node-pg-migrate / Prisma Migrate | migrations | Active Record migrations | Flyway / Liquibase | EF Core Migrations |
| Cookie session (I2) | signed cookie | signed cookie session | `cookie_store` | Spring Session | Cookie Authentication |
| Validated config (I18) | zod at boot | django-environ | dotenv + validation | `@ConfigurationProperties` | `IOptions` + validation |
| Structured logs (I17) | pino | structlog | Semantic Logger | Logback JSON | Serilog |
| Advisory lock (I20) | `pg_try_advisory_lock` | same | same | ShedLock | same |
| Health (I13) | own route | django-health-check | own route | Actuator | Health Checks |

---

## 8. What to check before declaring Stage 01 done

- [ ] `bun run check` fails if a module imports another one's internal file
- [ ] The application writes no file to disk
- [ ] Killing the container and starting another loses nothing beyond sessions
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
