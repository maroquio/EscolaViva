# React frontend and the backend as an API

> Project spec. The matching implementation plan is
> [`docs/REACT_MIGRATION.md`](../../REACT_MIGRATION.md).

EscolaViva trades server-rendered HTML for a React application served as a static file, and Hono
stops returning pages and starts returning JSON. No business rule changes: the four domain modules,
the queries, `Result<T>` and the 22 invariants stay where they are. What changes is the delivery
layer — and the bill it starts charging.

## Problem

Today's web layer has 3,423 lines of TypeScript under `src/web/`, plus 45 Eta templates, serving
59 handlers — 54 in the role routers, 3 entry points in `app.ts` and 2 health checks. It works, it is
fast, and it is the decision Stage 01 defends in the teaching material.

The request is different: the product becomes a React 19 SPA, with the front published on Cloudflare
at some future point. That implies three things that do not exist today — a versioned API, a second
build artefact and a separate origin for the front.

Accepting that means accepting the cost `docs/SAAS_EVOLUTION.md` already described in the Web Client
entry: *"a separate SPA doubles deploys and forces you to create a versioned public API"*. This
document is the record that the cost was read before it was paid, and of how it was kept as low as
possible.

## Decision

**Total replacement.** Eta, `src/web/templates/`, `src/web/render.ts` and `scripts/build-assets.ts`
leave the repository. Hono starts serving `/api/v1/*` in JSON and delivering Vite's `dist/` as static
files. The teaching material is updated to describe the SPA as a deliberate decision, with the cost
stated.

Three smaller decisions govern the rest of the document:

1. **Browser URLs do not change.** `/registrar/students/:id` stays `/registrar/students/:id` — now
   resolved by React Router instead of Hono. Bookmarks survive, the screenshots in the material stay
   valid and the address bar keeps telling the same story. The API lives under `/api/v1`, which has
   never collided with anything.
2. **The session stays a signed cookie resolved in the database.** No token travels to
   `localStorage`. I2 stays intact and the front does not inherit the problem of storing a credential.
3. **The front's origin is configuration, not code.** The front is pure static from the first commit
   and never imports anything from the server at runtime. Publishing on Cloudflare Pages will be a
   matter of changing three environment variables.

## Scope

**In**

- Reorganisation into workspaces: `apps/api` and `apps/web`.
- A JSON API `/api/v1` covering every screen of the four roles.
- A React 19 SPA with the same screens and the same URLs.
- Migration from Zod 3 to Zod 4 on the backend.
- Rewriting the `tests/web/` suite for JSON, unit tests on the front and E2E with Playwright.
- Updating `ESCOLAVIVA_STAGE_01.md`, `SAAS_EVOLUTION.md`, the README, two new ADRs and the affected
  `docs/archify/` diagrams.

**Out**

- Any component from a later stage: queue, cache, a contracted CDN, replica, observability, pipeline,
  e-mail delivery. The Cloudflare groundwork is an empty variable, not a contract.
- React server-side rendering (SSR/SSG). The front is static.
- Changes to business rules, to the database schema or to migrations.
- A visual redesign. The Mantine theme mirrors the current `app.css`.
- A mobile app and a third-party API. `/api/v1` is internal: it exists for this SPA and is versioned
  because the SPA and the server come to have separate lifecycles, not because someone outside will
  consume it.

---

## 1. Repository structure

```
escolaviva/
├─ package.json                 workspaces: ["apps/*"]; aggregate scripts
├─ bunfig.toml                  test preload, pointing at apps/api
├─ docker-compose.yml           unchanged
├─ Dockerfile                   now builds the front and copies the dist
├─ migrations/                  unchanged
├─ scripts/                     migrate, seed, backup, restore-test (build-assets goes away)
├─ docs/
├─ e2e/                         Playwright: the 4 journeys
├─ apps/
│  ├─ api/
│  │  ├─ package.json
│  │  ├─ .dependency-cruiser.js
│  │  ├─ src/
│  │  │  ├─ identity/  academics/  assessment/  communication/   unchanged
│  │  │  ├─ shared/                                              almost unchanged
│  │  │  ├─ http/            ← what used to be src/web/
│  │  │  │  ├─ app.ts
│  │  │  │  ├─ health.ts
│  │  │  │  ├─ pagination.ts
│  │  │  │  ├─ static.ts      serves the Vite dist + SPA fallback
│  │  │  │  ├─ contracts/     response types and enumerations (no dependencies)
│  │  │  │  ├─ schemas/       request-body Zod, per resource
│  │  │  │  ├─ presenters/    domain → response JSON
│  │  │  │  └─ routes/        session, account, network, registrar, teacher,
│  │  │  │                    guardian, announcements, options
│  │  │  └─ main.ts
│  │  └─ tests/
│  └─ web/
│     ├─ package.json
│     ├─ vite.config.ts
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx
│        ├─ app/         routes, providers, layout, error boundaries
│        ├─ features/    session network registrar teacher guardian announcements account
│        └─ shared/      api/ ui/ format/ theme/
```

### 1.1 Why workspaces

The front needs a `package.json` of its own — its dependencies (React, Mantine, Vite) must not enter
the server image. Bun workspaces give that without a second repository: one `bun install` at the root,
a single `bun.lock`, and `bun run verify` stays one command at the root that runs both sets of checks.

### 1.2 The Cloudflare groundwork

Three variables, all **empty by default**, in the same spirit as `TRUSTED_PROXIES` (I12), which was
already born empty waiting for the load balancer:

| Variable | Where | Empty (today) | Filled in (Cloudflare Pages) |
|---|---|---|---|
| `VITE_API_URL` | front build | `''` → same origin, relative path | `https://api.escolaviva.com.br` |
| `ALLOWED_ORIGINS` | API boot | no CORS, no header emitted | `https://app.escolaviva.com.br` |
| `COOKIE_DOMAIN` | API boot | no `Domain` attribute → host-only cookie | `.escolaviva.com.br` |

`app.escolaviva.com.br` and `api.escolaviva.com.br` are **different origins, the same site**: the
browser requires CORS, but `SameSite=Lax` still holds and the cookie still travels. That is why the
decision to keep the signed cookie does not become debt on CDN day — if the session were a token, the
problem would be a different one (storing a credential on the client) and it would not go away with
configuration.

**The rule the front has to obey for this to work:** no React route may depend on server behaviour.
No absolute path assembled on the server, no injected HTML, no header read on first load. The
`index.html` Vite produces has to work when served by anything that returns a file.

That becomes **I23 — the front's origin and the API's origin are configuration, not code**, recorded
as a new invariant in the stage's table.

### 1.3 How the server delivers the front today

`apps/api/src/http/static.ts` replaces the `/public/*` handler:

- `GET /assets/*` → a file from `dist/assets/`, with `Cache-Control: public, max-age=31536000,
  immutable`. Vite already puts the content hash in the name, which **preserves I10** — the invariant
  changes owner, it does not disappear.
- `GET` of any path not starting with `/api`, `/health` or `/assets` → `dist/index.html` with
  `Cache-Control: no-store`. That is the fallback that makes `/registrar/students/xyz` work when
  somebody presses F5. `index.html` **never** goes to cache: it is what points at the new bundle after
  a deploy.
- File names keep being validated against the same expression as today; nothing outside `dist/` is
  served.

---

## 2. HTTP contract

### 2.1 Format

Prefix `/api/v1`. Every request and response body is `application/json; charset=utf-8`.

**Success** returns the resource, with no envelope:

```json
{ "id": "01H...", "name": "Ana Souza", "birthDate": "2015-03-11" }
```

**A paginated list** returns the `Page<T>` that `src/shared/pagination/` already produces — no new
type:

```json
{ "items": [], "page": 2, "pages": 7, "total": 134, "size": 20 }
```

**An error** returns the application errors and the correlation code:

```json
{ "erros": [ { "campo": "cpf", "codigo": "cpf_invalido", "mensagem": "CPF inválido." } ],
  "correlationId": "01H..." }
```

`ApplicationError` is already `{ campo?, codigo, mensagem }` in `src/shared/result.ts`. That is
deliberate and is the project's biggest reuse win: the array drops straight into React Hook Form's
`setError`, field by field, **with no translator between the two ends**. An error without `campo`
becomes a general form warning, exactly as `partials/_messages.eta` does today.

The statuses keep coming from the map in `shared/http/errors.ts` — 400, 401, 403, 404, 422, 500 — with
the same meanings. Only the body changes: `errorsMiddleware` stops calling `errorPage()` and starts
serialising JSON. `registerErrorRenderer` and the whole HTML-injection mechanism in `shared/` **are
removed**; `shared/http/` ends up smaller than it was.

### 2.2 Input validation — where each one lives

Two layers, with responsibilities that do not overlap:

| Layer | Where | Validates | Does not validate |
|---|---|---|---|
| HTTP edge | `apps/api/src/http/schemas/` | **shape**: field present, right type, id in identifier format | business rules |
| Application | `*/application/` | **rules**: uniqueness, range, coherence, state | — |

The edge exists because JSON can arrive with anything; it answers 400 and uses the existing
`schemaErrors()` to produce `ApplicationError[]`. The truth stays in the application, which answers
422 — **I22 survives intact**. React's Zod is a third layer, and it is the only one of the three that
exists purely for comfort: it decides nothing.

One good side effect: conversions that live in the routes today disappear. `network.ts` has a
four-digit regular expression and a manual conversion of `year` to a number because a form can only
send text; with JSON, `year` arrives as a number and the check becomes one line of schema.

### 2.3 Idempotency (I4)

The key leaves the form body and moves to a header:

```
Idempotency-Key: 3f2a91c0-...
```

- Required on **POST**. `PUT` and `DELETE` are idempotent by method and do not pay that toll —
  requiring a key from them would be rent without pain.
- The `idempotent_request` table **does not change**. `response_location` now stores the canonical
  path of the created resource (what is the `Location` of the 303 today) and `response_hash` is still
  its SHA-256.
- **A repeat** answers `200` with `{ "repeated": true, "location": "/api/v1/registrar/students/01H..." }`.
  The client follows on to the resource. No response body is stored in the database — which would
  prevent, for instance, an invitation's temporary password from sitting at rest in a table (I17).
- A failure or a validation refusal keeps **releasing the key**, as today.
- The body is still read exactly once by the middleware and left in `c.get('body')` — now as a JSON
  object, not a `FormBody`. The `FormBody` type disappears.

### 2.4 CSRF — the problem the SPA creates

An automatic cookie plus writes in JSON opens cross-site request forgery, which the form with PRG did
not have. The defence is the cheapest one that solves it, with no table and no token:

- Every write requires `Content-Type: application/json`. An HTML form cannot emit that type.
- Every write requires the `X-Requested-By: escolaviva` header. A header outside the safe list forces
  the browser into a preflight, and the preflight only passes for an allowed origin.
- With `ALLOWED_ORIGINS` empty (today, same origin) there is no preflight and no CORS: requiring the
  header alone already blocks the cross-site submission, because no external site can add it.

This is recorded as the **first concrete cost of the SPA decision**: a defence the previous design did
not need.

### 2.5 Cache (I11)

`cacheControlMiddleware` stays, with the prefix swapped:

| Path | Header |
|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` |
| `/api/*` with a session | `private, no-store` + `Vary: Cookie` |
| `/api/*` without a session | `no-store` |
| `index.html` (fallback) | `no-store` |

With CORS active, `Vary: Origin` is appended. A student's report card served from a proxy cache to
another student's guardian is still the mistake these lines prevent.

### 2.6 CORS

A new middleware, `apps/api/src/http/cors.ts`, active **only** when `ALLOWED_ORIGINS` is not empty. It
echoes the origin when it is on the list (never `*`, which is incompatible with credentials), answers
the preflight, and declares `Access-Control-Allow-Credentials: true` and
`Access-Control-Allow-Headers: Content-Type, Idempotency-Key, X-Requested-By`.

---

## 3. Endpoint map

The 54 router handlers become 50 endpoints, and the arithmetic is not what one expects: 12 `GET`s of
form screens (`/new`, `/enroll`, `/transfer`) **disappear** — React already has the form — but 8 are
born to serve the choice lists that today travel inside those screens. The 3 entry handlers of
`app.ts` become client-side routing; the 2 health checks stay where they are.

Distribution by family: 4 for session and account, 6 for options, 7 for network, 17 for registrar,
7 for teacher, 6 for guardian, 3 for announcements.

### 3.1 Session and account

| Method | Path | Replaces | Body → Response |
|---|---|---|---|
| `POST` | `/api/v1/session` | `POST /login` | `{networkSlug, cpf, password}` → `201 {user}` + `Set-Cookie` |
| `GET` | `/api/v1/session` | *new* | → `200 {user}` \| `401` |
| `DELETE` | `/api/v1/session` | `POST /logout` | → `204` |
| `PUT` | `/api/v1/account/password` | `POST /account/password` | `{currentPassword, newPassword, passwordConfirmation}` → `204` |

`GET /api/v1/session` is what hydrates the application on every load and detects expiry without a page
reload. It returns the whole `SessionUser`, `roles` included.

`GET /dashboard`, which today redirects by role precedence, **stops existing on the server**: the
precedence list (`network_admin` > `registrar` > `teacher` > `guardian`) belongs to the front, which
decides where to take whoever signed in. It is presentation, and it always was.

### 3.2 Options — the choices in the forms

A family of its own, `/api/v1/options/*`, for the **unpaginated** lists that feed choice fields. They
exist today scattered inside the `GET /new` screens; concentrating them stops each form inventing its
own way of asking for the same thing, and lets TanStack Query cache them with a long lifetime — they
change rarely.

| Method | Path | Returns | Scope |
|---|---|---|---|
| `GET` | `/api/v1/options/schools` | schools within the asker's scope | any role with a scope |
| `GET` | `/api/v1/options/academic-years` | the network's academic years | network, registrar |
| `GET` | `/api/v1/options/guardians` | the network's guardians | network, registrar |
| `GET` | `/api/v1/options/class-groups` | class groups in scope, with year and school | registrar |
| `GET` | `/api/v1/options/subjects` | the network's subjects | registrar |
| `GET` | `/api/v1/options/teachers?schoolId=` | who holds the teacher role at that school | registrar |

Shifts and roles do **not** become endpoints: they are closed sets from the domain and live in
`apps/api/src/http/contracts/enumerations.ts`, imported by the front. The screen labels ("Matutino",
"Administração da rede") belong to the front — today they live in the routes, and that is presentation
that should never have been there.

### 3.3 Network — `network_admin`

| Method | Path | Replaces | Notes |
|---|---|---|---|
| `GET` | `/api/v1/network/dashboard` | `GET /network` | counts + the year in force |
| `GET` | `/api/v1/network/schools?p=` | `GET /network/schools` | `Page<School>` |
| `POST` | `/api/v1/network/schools` | `POST /network/schools` | `{name, inepCode}` → `201 {id}` |
| `GET` | `/api/v1/network/users?p=` | `GET /network/users` | `Page<User>` |
| `POST` | `/api/v1/network/users` | `POST /network/users` | → `201 {userId, temporaryPassword}` |
| `GET` | `/api/v1/network/academic-years?p=` | `GET /network/academic-years` | |
| `POST` | `/api/v1/network/academic-years` | `POST /network/academic-years` | `{year: number, startDate, endDate}` |

**The `ev_invite` cookie disappears.** It exists today only because the temporary password had to cross
a redirect without entering the URL or the idempotency table. With JSON it comes back in the `201`
body, is shown once and is stored nowhere — not in a cookie, not in the database, not in the log.
`storeInvite`, `takeInvite` and the `INVITE_COOKIE` constant go with it. It is the second real
simplification the change brings.

**What also disappears:** `FOUR_DIGIT_YEAR` and the manual conversion of `year` to a number. With JSON
the field arrives as a number and the check becomes `z.number().int()` in the edge schema.

**What stays exactly the same:** comparing the typed CPF against the guardian record's. Only the HTTP
layer sees `identity` and `academics` at the same time (I1), and it is here — and only here — that this
check can happen.

### 3.4 Registrar

| Method | Path | Replaces | Notes |
|---|---|---|---|
| `GET` | `/api/v1/registrar/dashboard?p=` | `GET /registrar` | the role's schools + counts |
| `GET` | `/api/v1/registrar/students?q=&p=` | `GET /registrar/students` | without `q`, an empty page |
| `POST` | `/api/v1/registrar/students` | `POST /registrar/students` | `{name, birthDate}` |
| `GET` | `/api/v1/registrar/students/:id?pGuardians=&pEnrollments=` | `GET /registrar/students/:id` | the record |
| `GET` | `/api/v1/registrar/students/:id/available-guardians` | inside `/guardians/new` | guardians minus the ones already linked |
| `POST` | `/api/v1/registrar/students/:id/guardians` | same | `{guardianId, relationship, financiallyResponsible}` |
| `POST` | `/api/v1/registrar/enrollments` | `POST /registrar/enrollments` | `{studentId, classGroupId, academicYearId, enrollmentDate}` |
| `GET` | `/api/v1/registrar/enrollments/:id` | inside `/transfer` | the active enrollment + the student |
| `POST` | `/api/v1/registrar/enrollments/:id/transfer` | `POST .../transfer` | `{targetClassGroupId, date}` |
| `GET` | `/api/v1/registrar/guardians?p=` | `GET /registrar/guardians` | |
| `POST` | `/api/v1/registrar/guardians` | same | `{name, email, phone, cpf}` |
| `GET` | `/api/v1/registrar/class-groups?school=&year=&p=` | `GET /registrar/class-groups` | filters stay in the query |
| `POST` | `/api/v1/registrar/class-groups` | same | `{name, gradeLevel, shift, schoolId, academicYearId}` |
| `GET` | `/api/v1/registrar/class-groups/:id?pSubjects=&pEnrollments=` | `GET /registrar/class-groups/:id` | |
| `POST` | `/api/v1/registrar/class-groups/:id/subjects` | same | `{subjectId, teacherUserId}` |
| `GET` | `/api/v1/registrar/subjects?p=` | `GET /registrar/subjects` | |
| `POST` | `/api/v1/registrar/subjects` | same | `{name}` |

The scope rules do not change and do not loosen. A student, class group or enrollment outside the
schools where the person holds the role keeps answering **404**, never 403 — the existence of a student
is already information, and that holds just the same in JSON.

### 3.5 Teacher

| Method | Path | Replaces | Notes |
|---|---|---|---|
| `GET` | `/api/v1/teacher/class-groups` | `GET /teacher` | class groups grouped, with subjects |
| `GET` | `/api/v1/teacher/subjects/:id/grades?term=` | same | rows + closing state |
| `PUT` | `/api/v1/teacher/subjects/:id/grades` | `POST` | `{term, grades:[{enrollmentId, value}]}` → `{saved}` |
| `GET` | `/api/v1/teacher/class-groups/:id/roll-call?date=` | same | the day's rows |
| `PUT` | `/api/v1/teacher/class-groups/:id/roll-call` | `POST` | `{date, rows:[{enrollmentId, present, excuse}]}` |
| `GET` | `/api/v1/teacher/class-groups/:id/closing` | same | the state of the 4 terms |
| `POST` | `/api/v1/teacher/class-groups/:id/closing` | same | `{term}` |

Grades and roll call become `PUT` because that is what they actually are: replacing the state of a term
or a day, not creating a resource. Two identical submissions produce the same state — the method
already carries the guarantee an idempotency key would give.

`grade_<uuid>` and `present_<uuid>` stop existing. The body becomes an array of objects, which removes
the assembling and parsing of field names by concatenation — three functions in `teacher.ts` disappear.

Closing stays **synchronous**, with the client waiting. That is the planted pain that justifies Stage
05, and swapping it for a progress indicator would hide it. The front shows a disabled button with the
clock running, and nothing else.

### 3.6 Guardian

| Method | Path | Replaces | Notes |
|---|---|---|---|
| `GET` | `/api/v1/guardian/dashboard?p=` | `GET /guardian` | enrollments + unread + counts |
| `GET` | `/api/v1/guardian/enrollments/:id/report-card` | same | |
| `GET` | `/api/v1/guardian/enrollments/:id/attendance?p=` | same | days + tally |
| `GET` | `/api/v1/guardian/board?pUnread=&pRead=` | same | two independent pages |
| `GET` | `/api/v1/guardian/board/:announcementId` | same | **does not mark a read** |
| `POST` | `/api/v1/guardian/board/:announcementId/read` | `POST .../read` | → `204` |

Opening an announcement still does not mark it read. With an SPA the temptation is greater — a
`useEffect` on load would "solve" it on its own — and that is exactly what must not happen: the 12 %
rate is the measurement that justifies Stage 04, and reads invented by navigation destroy it. It is
recorded here and becomes an explicit E2E test.

### 3.7 Announcements — `registrar` and `network_admin`

| Method | Path | Replaces | Notes |
|---|---|---|---|
| `GET` | `/api/v1/announcements?schoolId=&p=` | `GET /announcements` | list + summary with the rate |
| `GET` | `/api/v1/announcements/recipients?schoolId=` | inside `GET /announcements/new` | the school's guardians |
| `POST` | `/api/v1/announcements` | `POST /announcements/new` | `{schoolId, title, body, audience, guardians[]}` |

The summary keeps measuring the whole slice, not the page's rows — a rate that recalculated itself on
every click of "next" would answer a different question.

Checking the ticked recipients against the school's guardians stays on the server. The fact that React
only offers the right ones guarantees nothing: the list that comes back is external input.

### 3.8 Health

`/health` and `/health/live` stay as they are, outside `/api/v1`. They answer a load balancer, not the
SPA, and versioning them would give them a client they do not have.

---

## 4. The frontend

### 4.1 Stack and versions

React 19 · TypeScript 5 · Vite 7 · React Router 7 · Zod 4 · Zustand 5 · Mantine 8 ·
React Hook Form 7 · TanStack Query 5 · Axios 1.

The major versions above are the target; the exact version is whatever `bun add <package>@latest`
resolves on installation day, and it is recorded in `bun.lock`. The plan does not pin patch numbers.

### 4.2 Who owns what

This is the point where a stack like this usually turns to soup: three libraries know how to hold
state, and without a declared boundary each screen picks a different one. The boundary is:

| Layer | Owns | Forbidden to hold |
|---|---|---|
| **TanStack Query** | all state that came from the server: lists, records, report cards, options | — |
| **Zustand** | client state that survives navigation: selected school and year, notices, preferences | anything the API returned |
| **URL / React Router** | page, search, school and year filters | credentials, transient form state |
| **React Hook Form + Zod** | the values and errors of the open form | data from another screen |

The middle rule is the one that matters: **no list, record or report card enters Zustand**. Duplicating
a server response into a client store is how you produce a stale screen nobody knows how to invalidate.

The fourth row preserves an achievement of the current design, described in `src/web/pagination.ts`:
the page state lives in the query string, not in a session and not in a cookie. The third page of the
guardian list stays a copyable address, and the back button keeps working without anyone programming it.

### 4.3 HTTP client

`shared/api/client.ts` — one Axios instance, and only one:

- `baseURL` from `import.meta.env.VITE_API_URL` + `/api/v1`; empty means the same origin.
- `withCredentials: true`.
- Request interceptor: adds `X-Requested-By` to every write and
  `Idempotency-Key: crypto.randomUUID()` to every `POST`.
- Response interceptor: converts `{erros, correlationId}` into a typed `ApiError`, with
  `byField(): Record<string,string>` ready for `setError`. A `401` clears the Query cache and goes to
  `/login`.
- No other file in the front calls `fetch` or assembles an API URL by hand.

### 4.4 Structure by feature

Each folder under `features/` is self-contained — queries, mutations, schemas, screens and components
for that subject:

```
features/registrar/students/
├─ queries.ts      useStudents, useStudentRecord            (TanStack Query)
├─ mutations.ts    useRegisterStudent, useLinkGuardian
├─ schemas.ts      form Zod                                 (comfort, not truth)
├─ StudentList.tsx
├─ StudentRecord.tsx
└─ StudentForm.tsx
```

A file over 400 lines is a sign the feature needs a subfolder. The hard limit is 800, the same as the
rest of the repository.

### 4.5 Routes and guards

React Router receives **the same URLs as today**, `/login` included. Each role group is its own
`lazy()`, which gives one bundle chunk per role: whoever signs in as a guardian does not download the
registrar.

The route guard reads the user from `GET /api/v1/session` and applies the same rule as the server's
`requireRole`. It is **navigation convenience, not security** — anyone forcing the URL gets a 404 or a
403 from the API all the same. That is written in the code, so that nobody confuses the client guard
with access control.

### 4.6 Formatting

`formatDate`, `formatDateTime`, `formatGrade`, `formatPercent`, `formatRate` and `formatCpf` are ported
from `src/web/render.ts` to `shared/format/`, with the same tests. Two rules come with them and must
not be lost in translation:

- Grades and averages are **truncated**, never rounded — rounding 5.99 to 6.0 would show "aprovado"
  next to a "reprovado" status.
- A rate leaves the domain as a fraction from 0 to 1 and becomes a percentage **in exactly one place**.
  Spreading the multiplication by 100 has already cost one screen showing "0,1 %" where it was 12,3 %.

`formatCpf` still comes from `shared/document/` on the server; on the front it is a copy with the same
test, because the front does not import domain code.

---

## 5. Theme

`src/web/public/app.css` has 1,004 lines and 44 custom properties. They become
`shared/theme/theme.ts`, a `MantineThemeOverride`:

| Origin in `app.css` | Destination in the theme |
|---|---|
| palette | `theme.colors`, with the 10-shade scales Mantine requires |
| typography | `theme.fontFamily`, `theme.fontSizes`, `theme.headings` |
| spacing | `theme.spacing` |
| radius and shadow | `theme.radius`, `theme.shadows` |
| whatever is left | a CSS Module in the component that uses it |

The goal is for the screens to stay recognisable: the screenshots in the teaching material must not
turn into a different product. This is not a redesign.

`app.css`, `scripts/build-assets.ts` and `public/manifest.json` are removed at the end.

---

## 6. Invariants

### Intact, with no code change

I1 (module boundary), I3, I5, I6, I7, I8, I9, I13, I14, I15, I18, I20, I21.

### Preserved with a change of mechanism

| # | How it survives |
|---|---|
| **I2** | The session stays in a table, signed `HttpOnly` cookie. No token on the client. It gains an optional `COOKIE_DOMAIN`. |
| **I4** | The key moves from the form body to `Idempotency-Key`. Same table, same behaviour. A repeat answers 200 with the resource's location. |
| **I10** | The hash in the asset name is now produced by Vite. `build-assets.ts` goes away; the guarantee stays. |
| **I11** | Same middleware, prefix `/public/` → `/assets/`. `index.html` explicitly `no-store`. |
| **I12** | `clientIp` unchanged. It gains relevance: with a CDN in front, it is what resolves the real address. |
| **I16** | Correlation unchanged at generation. It now **also leaves in the error response**, in the `correlationId` field — today it shows on the error page, and support cannot afford to lose it. |
| **I17** | No new personal data enters the log. The temporary password, which travels in a cookie today, comes to travel in the 201 body and stays out of the log and out of the database. |
| **I19** | One `Dockerfile`, one image. The front build happens inside it, in its own stage. |
| **I22** | Real validation stays in `*/application/`. The HTTP edge validates shape; React's Zod validates comfort. |

### New

**I23 — the front's origin and the API's origin are configuration, not code.**
The front is pure static and never depends on server behaviour on first load. `VITE_API_URL`,
`ALLOWED_ORIGINS` and `COOKIE_DOMAIN` are born empty. Cost: three variables and a CORS middleware that
does nothing while the list is empty.

---

## 7. Tests

| Suite | Where | Tool | Covers |
|---|---|---|---|
| Domain and application | `apps/api/tests/{identity,academics,assessment,communication,shared}/` | `bun test` | **unchanged** |
| HTTP API | `apps/api/tests/api/` | `bun test` + `app.request` | status, JSON, scope, idempotency, cache, CORS, CSRF |
| Front unit | `apps/web/src/**/*.test.ts(x)` | Vitest + Testing Library + MSW | query hooks, resolvers, stores, formatting |
| End to end | `e2e/` | Playwright | the 4 journeys from `docs/archify/06..09` |

Rewriting `tests/web/` is cheaper than it looks: the strategy in `support.ts` — really sign in and
return the `Set-Cookie` the application emitted, with no open port and no HTTP client in between —
holds word for word. Two functions change: `send` starts posting JSON with an `Idempotency-Key`, and
`signIn` starts calling `POST /api/v1/session`.

The three tests that run in a separate process (I13 database down, I17 log of a flow, I18 boot with an
incomplete config) change only the URLs and the body format.

`checklist.test.ts` is the most delicate: it checks structural invariants — that no module writes a
file, that every business table has `network_id`, that two submissions with the same key produce one
row, that an authenticated route refuses caching. All of them stay valid; what changes are the paths
and the submission format. **It gains a new case:** that `index.html` answers `no-store` and a hashed
asset answers `immutable`.

The 80 % coverage gate applies to both applications.

Cases that need to exist and did not:

- A write without `Idempotency-Key` answers 400.
- A write without `X-Requested-By` answers 403.
- A write with a form `Content-Type` answers 415.
- With `ALLOWED_ORIGINS` empty, no CORS header is emitted.
- With `ALLOWED_ORIGINS` filled in, an outside origin gets no echo.
- A `GET` of an announcement does **not** write `read_at` (E2E).
- Reloading `/registrar/students/:id` in the browser returns `index.html`, not a 404 (E2E).

---

## 8. Documentation

| File | What changes |
|---|---|
| `docs/ESCOLAVIVA_STAGE_01.md` | the sentence "no SPA and no public API to version" is replaced by the decision and its cost; the invariants table gains I23 and notes on I2, I4, I10, I11, I22 |
| `docs/SAAS_EVOLUTION.md` | the channel catalogue stops listing "adopting an SPA by default" as a pure trap and starts distinguishing adopting by default from adopting with the cost measured |
| `docs/ADR/0007-spa-and-versioned-api.md` | **new** — why the SPA came in, what it charges, what was rejected alongside (SSR, a token, a response envelope) |
| `docs/ADR/0008-front-origin-as-configuration.md` | **new** — I23, the three variables, why the cookie survives the origin split |
| `README.md` | new commands, two processes in development, new variables |
| `.env.example` | `ALLOWED_ORIGINS`, `COOKIE_DOMAIN`, `VITE_API_URL` |
| `docs/archify/01-architecture.*` | now has two artefacts |
| `docs/archify/03-write-request.*` | PRG becomes a JSON request with header idempotency |
| `docs/archify/06..09-*-journey.*` | the four journeys, with the React screens |

---

## 9. Delivery sequence

Seven phases. Each ends with `bun run verify` green and is a safe stopping point.

| # | Phase | Delivers | Parallelisable |
|---|---|---|---|
| 0 | **Foundation** | workspaces, moving `src/` to `apps/api/src/`, Zod 3 → 4, dependency-cruiser repointed | no — it is a prerequisite for everything |
| 1 | **Edge** | errors in JSON, header idempotency, CORS, CSRF, cache, static + fallback, `/api/v1/session`, `/account/password` | no — it defines the contract |
| 2 | **API per role** | options, network, registrar, teacher, guardian, announcements | **yes** — six fronts, disjoint files |
| 3 | **Front shell** | Vite, theme, providers, Axios client, router, guards, layout, sign-in screen | no — it is a prerequisite for the screens |
| 4 | **Screens per role** | the same six fronts as phase 2 | **yes** — six fronts, disjoint files |
| 5 | **Quality** | E2E of the 4 journeys, accessibility, bundle budget | **yes** — four independent journeys |
| 6 | **Removal and documentation** | delete Eta and whatever is left; ADRs, diagrams, README, teaching material | **yes** after the removal |

Phases 2 and 4 are the ones that justify execution by multiple agents: six sets of files that do not
touch each other, each with its own suite.

---

## 10. Risks

**1. Zod 3 → 4.** Smaller than it looks: 21 files import `zod`, but only **two** use API that changed
shape — `src/shared/config/schema.ts` (9 occurrences of `errorMap`, `invalid_type_error` and
`required_error`) and `src/identity/application/inviteUser.ts` (1 `errorMap`). The other 19 use only
`z.object`, `z.string`, `.min`, `.safeParse` and `.issues`, which have not changed. The installed
version is already `3.25.76`, which exposes Zod 4 through the `zod/v4` subpath — the migration can be
verified file by file before the package is swapped.

The real point of attention is `schemaErrors()` in `src/shared/result.ts`: it types
`path: (string | number)[]`, and in Zod 4 `issue.path` is `PropertyKey[]`. The signature has to follow.
It is still the first thing to do, with the whole suite green before any other change — doing it with
the front already written would mean debugging two things at once.

**2. Bundle budget on the guardian portal.** It is the system's worst case: I4 exists because a
guardian on bad 4G taps "submit" twice. That same person now downloads React and Mantine before seeing
the report card. Mitigation: a chunk per role via `lazy()`, `@mantine/core` imported per component, and
a declared ceiling — **150 kB compressed for the guardian's first load**, checked in phase 5. Blowing
the ceiling is a reason to change component, not to raise the ceiling.

**3. Two truths about the shape of the data.** Front and API can drift apart silently. Mitigation:
`apps/api/src/http/contracts/` exports the response types, the front imports them as `import type`, and
a dependency-cruiser rule stops `contracts/` from importing anything — it has to stay loadable by a
browser bundler.

**4. Losing the Stage 04 measurement.** Marking a read as a side effect of loading is the easiest
mistake to make in an SPA and destroys the 12 % rate that justifies the next stage. Mitigation: an
explicit E2E test that opening an announcement does not write `read_at`.

**5. Hiding the slowness of term closing.** It is pain planted on purpose to justify Stage 05.
Mitigation: nothing optimistic, no fake queue on the client. The button disables and the person waits,
as today.

**6. Mistaking the route guard for authorisation.** Mitigation: a comment in the code, and API tests
proving 403/404 without going through the front.

**7. The cookie and Cloudflare.** If one day the front moves to a **different** domain (not a
subdomain), `SameSite=Lax` stops serving and the design has to change. Mitigation: ADR 0008 records
that the premise is a subdomain of the same registrable domain, and that leaving that premise is a new
decision, not a variable tweak.
