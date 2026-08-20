---
name: backend-patterns
description: 'Use for any server-side concern in this Bun + Hono + PostgreSQL API: routes, handlers, use cases, repositories, raw SQL, transactions, middleware, jobs, config. Covers both "build/change/review X" requests and symptom reports where the cause lives behind the HTTP boundary — data from the wrong tenant showing up in a response, a role or scope check that lets too much through, wrong status code, slow or N+1 query, duplicate writes, a job that ran twice, a pool or shutdown problem. Also covers what the server emits: log lines, redaction of secrets and PII in payloads, correlation ids, error bodies, cache headers. When a user reports leaking, wrong, or missing output from an endpoint, a query, a log, or a background task — even framed as urgent bug hunting rather than as coding — start here. Not for React/browser components, templates, CSS, build tooling, or standalone scripts.'
---

# Backend Development Patterns

Server-side architecture for a modular monolith on **Bun + Hono + PostgreSQL**, written so the
seams that will be cut later are already cut today.

## When to Activate

- Designing or changing REST endpoints (routes, status codes, payload shape)
- Implementing repository, use-case, or presenter layers
- Optimizing queries (N+1, indexes, pagination, pool sizing)
- Adding caching (HTTP cache headers, in-process memoization, a shared cache)
- Setting up background jobs, schedulers, or async processing
- Structuring validation and error handling for an API
- Building middleware (auth, correlation, logging, idempotency, rate limiting)

## The stack, in one screen

| Concern | What this codebase uses | Do not reach for |
| --- | --- | --- |
| Runtime / HTTP | Bun + Hono | Express, Next.js route handlers |
| Database | PostgreSQL via `bun:sql` tagged templates | an ORM, a query builder, Supabase client |
| Validation | Zod, at the boundary only | ad-hoc `if (!x)` chains |
| Logging | pino + `redact()` + correlation id | `console.log` |
| Sessions | opaque cookie + row in `session` | JWT in `localStorage` |
| Passwords | `Bun.password` (argon2id) | SHA-256, hand-rolled salting |
| Jobs | in-process scheduler + Postgres advisory lock | Redis, BullMQ, a broker |
| Cache | HTTP `Cache-Control` + per-request batching | Redis (see *Caching*) |

Everything below is written in that dialect. When a pattern from the wider industry has no
component here yet, the section says what plays its role today and what has to be true before the
component earns its rent.

## Layering

```
src/<module>/domain/       pure rules, no I/O, no imports of db/http/log/jobs, no libraries
src/<module>/application/  use cases: validate, decide, persist inside one transaction
src/<module>/infra/        SQL only — every statement in the system lives here
src/<module>/index.ts      the module's whole public surface
src/http/                  routes, request schemas, presenters, response contracts
src/shared/                infrastructure that knows no domain
```

Four rules, machine-checked by `bun run check` (dependency-cruiser):

1. **A module sees another module only through its `index.ts`.** Reaching into
   `other/infra/thing.ts` is what makes "who else touches this?" unanswerable, and extraction later
   becomes a rewrite instead of a move.
2. **The domain is pure.** It may import `shared/ports`, `shared/result`, and pure value helpers —
   nothing else. That is what keeps rule tests fast and lets a `Mailer` arrive as a port instead of
   as an import in the middle of a rule.
3. **Response contracts have no dependencies.** They are shape, and shape imports nothing — the
   browser bundle imports that folder.
4. **`shared/` knows no domain.** Dependencies run outside-in. `shared/http/session.ts` declares the
   *structural shape* of a user instead of importing the user type.

If a change needs to break one of these, the rule is wrong or the design is — say so instead of
routing around it.

## API design

### Resource URLs and methods

```
GET    /api/v1/invoices              # list (paginated, filtered)
GET    /api/v1/invoices/:id          # one
POST   /api/v1/invoices              # create   -> 201 + Location
PATCH  /api/v1/invoices/:id          # partial update
PUT    /api/v1/invoices/:id          # full replacement
DELETE /api/v1/invoices/:id          # delete   -> 204

GET /api/v1/invoices?status=open&sort=issuedAt&limit=20&cursor=eyJ...
```

Nest only one level (`/invoices/:id/payments`) and only when the child cannot be addressed without
the parent. Deeper nesting encodes a navigation path into the URL and freezes it.

### Status codes that carry meaning

| Code | Means | Typical cause here |
| --- | --- | --- |
| 200 / 201 / 204 | done / created / done with no body | — |
| 400 | the request is not the right *shape* | Zod rejected the body |
| 401 | no identity | absent or expired session |
| 403 | identity, but not allowed | wrong role, missing write mark |
| 404 | no such resource *for you* | absent, or outside the caller's tenant/scope |
| 409 | a conflicting concurrent state | version mismatch, duplicate unique key |
| 415 | unsupported media type | write without `application/json` |
| 422 | right shape, refused by a rule | business rule violated |
| 429 | too fast | rate limit — always with `Retry-After` |

The 400/422 split is not cosmetic: 400 says *fix the JSON*, 422 says *the JSON was fine, the world
says no*. Clients branch on it — a form highlights fields for 422 and shows a bug report for 400.

The 403/404 choice is a privacy decision. When a caller asks for a resource in another tenant,
answering 403 confirms the resource exists. Answer **404** for anything outside the caller's tenant
or scope, and reserve 403 for "this resource is yours, this action is not".

### Error bodies

One envelope for the whole API, so a client writes one error path:

```ts
type ApplicationError = { field?: string; code: string; message: string };
type ErrorBody = { errors: readonly ApplicationError[]; correlationId: string };
```

`code` is for machines and is stable forever; `message` is for humans and may be rewritten;
`field` turns the error into a highlighted input. `correlationId` is what the user reads back over
the phone and what finds the request in the logs.

The industry-standard alternative is **RFC 9457 `application/problem+json`** (`type`, `title`,
`status`, `detail`, `instance`, plus extensions). Prefer it when the API is public or crosses an
organization — off-the-shelf clients understand it. For a first-party API, one envelope used
everywhere beats a standard used inconsistently. Do not run both.

### Pagination

Offset pagination is fine for pages a human clicks through, and it is what this codebase uses:

```ts
export async function queryPage<T>(
  page: number,
  size: number,
  count: () => Promise<number>,
  search: (range: Range) => Promise<T[]>,
): Promise<Page<T>> {
  const requested = Math.max(1, Math.trunc(page) || 1);
  const [total, items] = await Promise.all([count(), search(rangeFor(requested, size))]);
  const pages = pageCount(total, size);
  if (requested <= pages) return { items, total, page: requested, size, pages };
  return { items: await search(rangeFor(pages, size)), total, page: pages, size, pages };
}
```

Two costs to know before defending it: `OFFSET n` makes the database walk and discard `n` rows, so
page 5000 is slow no matter the index; and a row inserted between two requests shifts every later
page, so an exporter that walks pages silently skips records.

**Keyset (seek) pagination** has neither problem and is the answer for feeds, exports, and anything
machine-driven:

```ts
export async function pageAfter(
  sql: Connection,
  tenantId: string,
  after: { issuedAt: string; id: string } | null,
  limit: number,
): Promise<InvoiceRow[]> {
  return await sql`
    SELECT id, tenant_id, status, to_char(issued_at, 'YYYY-MM-DD') AS issued_at
      FROM invoice
     WHERE tenant_id = ${tenantId}
       AND (${after === null}::boolean
            OR (issued_at, id) < (${after?.issuedAt ?? null}, ${after?.id ?? null}))
     ORDER BY issued_at DESC, id DESC
     LIMIT ${limit}`;
}
```

The tuple comparison `(issued_at, id) < (...)` is what makes the sort key unique and the cursor
stable; it needs the matching composite index `(tenant_id, issued_at DESC, id DESC)`. Encode the
cursor opaquely (base64url of the tuple) so clients cannot invent one, and never return a total —
counting defeats the point.

Two details decide whether the walk is actually correct:

**The cursor must carry the key exactly as the database has it.** A `timestamptz` has microsecond
precision and arrives in JavaScript as a `Date`, which has milliseconds. Round-tripping the key
through `Date.toISOString()` truncates it, the cursor lands *before* the last row you served, and
that row comes back in the next batch — a silent duplicate in an export that is supposed to visit
each row once. Select the sort column as text (`to_char(...)`, or `::text` for a timestamp) and pass
that string straight back into the comparison, or compare on a column whose precision survives the
round trip.

**Decide what a concurrent write means for the walk, and say so.** A long export runs against a
moving table. Keyset guarantees you never skip or repeat a row *that already existed* when you
started — it says nothing about rows inserted mid-walk, which appear or not depending on where they
land in the sort. When the export has to reconcile against a fixed number (a census, a closing
balance), take a snapshot: capture `asOf = now()` on the first call, carry it inside the cursor, and
add `AND created_at <= asOf` to every batch. Then the walk is a photograph instead of a film, and
the total counted once at the start still matches the rows delivered at the end.

That last sentence is the invariant worth stating out loud and testing: **the number the export
announces must equal the number of distinct rows it hands over.** It is what the caller reconciles
against, and every defect in this section breaks it in a way no batch looks wrong on its own — a
truncated cursor delivers a row twice, an unsnapshotted walk delivers rows the count never saw, a
`count(*)` taken with different predicates than the batches counts a different population. Write the
test that walks a seeded table to exhaustion, collects the ids, and asserts `ids.size === total`,
with a row inserted mid-walk to prove the semantics you chose are the semantics you get.

Whichever you pick: clamp `limit` to a maximum, and never interpolate `sort` into SQL. Map it
through an allowlist:

```ts
const SORTABLE = { issuedAt: 'issued_at', amount: 'amount_cents' } as const;
const column = SORTABLE[requested] ?? SORTABLE.issuedAt;
```

### Writes are idempotent

Every `POST` carries an `Idempotency-Key` (a uuid) and the middleware claims it with an insert that
wins or loses a race:

```ts
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
```

`ON CONFLICT DO NOTHING ... RETURNING` is the whole trick: the database decides the winner, so two
concurrent identical requests cannot both proceed. Release the key when the handler throws or
answers 4xx, or a failed attempt would block the retry the user is about to make. This mirrors the
`Idempotency-Key` header as deployed by payment APIs and specified in the IETF HTTPAPI draft.

### Conditional requests

For a resource that is read far more than written, an `ETag` turns most reads into 26 bytes:

```ts
const etag = `"${hashOf(body)}"`;
if (c.req.header('if-none-match') === etag) return c.body(null, 304);
c.header('etag', etag);
```

The same header, sent as `If-Match` on a `PUT`, gives optimistic concurrency: mismatched version,
409, no lost update.

## Validation at the boundary

Parse once, at the edge, into a type the rest of the code can trust — do not re-check the same
value in three layers.

```ts
export function parse<T>(schema: ZodType<T>, body: unknown): Result<T> {
  const analysis = schema.safeParse(body);
  if (analysis.success) return success(analysis.data);
  return failure<T>(...schemaErrors(analysis.error.issues));
}
```

The route schema checks *shape* (a string is present, it is trimmed). The use case schema checks
*meaning* (the name is non-empty and under the limit, the date is a real date). Two schemas is not
duplication: the route protects against malformed JSON, and the use case protects against every
caller — including a seed script and a future job that never passes through HTTP.

## Business failure is a value, not an exception

```ts
export type Result<T> = { ok: true; value: T } | { ok: false; errors: ApplicationError[] };
```

Use `Result<T>` for anything a well-behaved caller can trigger: a rule refused, a field is wrong, a
duplicate. Use exceptions (`NotFound`, `Forbidden`, `Unauthorized`, `BusinessRuleViolation`) for
conditions that are the same at every call site and that the middleware can turn into a status
without the handler doing anything.

The reason is exhaustiveness: `if (!result.ok)` is a branch the compiler forces you to take, while
a `throw` is invisible in the signature and gets forgotten by exactly the caller who needed it. A
rule refusal that reaches the client as an unhandled 500 is the failure mode this prevents.

```ts
export async function issueInvoice(input: IssueInvoice): Promise<Result<Invoice>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(...schemaErrors(parsed.error.issues));

  if (parsed.data.amountCents <= 0) {
    return fieldFailure(FIELDS.invoice.amount, CODES.invoice.notPositive, MESSAGES.invoice.notPositive);
  }

  const invoice: Invoice = { id: uuidIdGenerator.next(), ...parsed.data };
  await unitOfWork(({ sql }) => invoices.insert(sql, invoice));
  return success(invoice);
}
```

Note `uuidIdGenerator` and `systemClock` — the domain gets identity and time through ports, so a
rule test is deterministic without freezing the global clock.

## Data access

SQL lives in `infra/` and nowhere else. Repositories are **modules of functions that take a
connection**, not classes holding one:

```ts
export async function byId(sql: Connection, tenantId: string, id: string): Promise<Invoice | null> {
  const rows: InvoiceRow[] = await sql`
    SELECT id, tenant_id, status, amount_cents, to_char(issued_at, 'YYYY-MM-DD') AS issued_at
      FROM invoice
     WHERE tenant_id = ${tenantId} AND id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : toInvoice(row);
}
```

Passing the connection is what makes a function work identically inside and outside a transaction —
a class that captured a pool cannot join the caller's transaction, and that is how "the write
succeeded but the audit row did not" happens.

Non-negotiables in this layer:

- **Every statement takes `tenantId` and filters on it.** Not "usually" — a query without the
  tenant predicate is a data breach with a code review as its only defence.
- **Name the columns.** `SELECT *` ships columns the caller does not need, breaks when a column is
  added, and hides the fact that a row type drifted.
- **Interpolate only through the tagged template.** `${value}` is a bind parameter;
  `sql.unsafe(text)` is not. For a list, `= ANY(${sql.array([...ids], 'TEXT')}::uuid[])`.
- **A row type plus a mapper.** `snake_case` stops at the repository boundary; the domain never
  sees `created_at`.
- **Dates as text.** `to_char(col, 'YYYY-MM-DD')` keeps a calendar date from becoming a timezone
  bug on the way out.

### N+1 queries

The loop that fetches one row per item is the single most common backend performance defect, and it
is invisible in tests with three rows.

```ts
// Bad: 1 + N round trips, and the N grows with the page size
for (const invoice of invoices) {
  invoice.customer = await customers.byId(sql, tenantId, invoice.customerId);
}

// Good: two round trips, regardless of page size
const customers = await customersRepo.byIds(sql, tenantId, invoices.map((i) => i.customerId));
const byCustomer = new Map(customers.map((c) => [c.id, c]));
const rows = invoices.map((invoice) => ({ ...invoice, customer: byCustomer.get(invoice.customerId) }));
```

The same shape scales to counters and aggregates: one grouped query returning a `Map<id, count>`
beats one `count(*)` per row. When several independent reads feed one response, fire them together:

```ts
const [invoice, payments, customer] = await Promise.all([
  invoices.byId(sql, tenantId, id),
  payments.ofInvoice(sql, tenantId, id),
  customers.byId(sql, tenantId, customerId),
]);
```

`Promise.all` on the same pool is real concurrency here — but it also multiplies pool demand, so
keep the fan-out bounded and never do it inside a loop.

### Indexes

An index exists to serve a query you can name. Before adding one, read the plan:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ... ;
```

Rules of thumb that hold up:

- Column order follows the query: equality columns first, then the range/sort column
  (`(tenant_id, status, issued_at DESC)` serves `WHERE tenant_id = $1 AND status = $2 ORDER BY issued_at DESC`).
- Every foreign key used in a join or a cascade wants an index — Postgres does not create one.
- A partial index (`WHERE status = 'open'`) is smaller and often the difference between a scan and
  a seek when one value dominates.
- A unique index is a business rule with teeth. `ON CONFLICT (…) WHERE …` then makes the write
  idempotent for free.

A constraint added to a table that already has rows and already has writers is not a local change:
it applies retroactively to **every** writer, including seeds, fixtures, and tests in modules that
have nothing to do with the feature you are building. A `CHECK` that says "a cancelled row must
carry a reason" is correct as a rule and still breaks the test three folders over that flips the
status directly in SQL to set up an unrelated scenario. Before proposing a constraint, grep the
suite and the seeds for writes to that table and say what you found — either the constraint stands
and those writers get fixed in the same change, or the rule belongs in the use case instead. Landing
a red suite on someone else's module is a worse outcome than an invariant the database does not
enforce yet.
- `count(*)` over a large filtered set is a scan. If a total is only decorative, drop it or
  approximate it — do not index your way around a requirement nobody has.

## Transactions

```ts
export async function unitOfWork<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T> {
  return await writer().begin(async (tx) => fn({ sql: tx }));
}
```

- **The boundary is the use case**, never the repository and never the route. One user intent, one
  transaction, all-or-nothing.
- **No network I/O inside a transaction.** An HTTP call, an e-mail, a queue publish — each of them
  holds the transaction (and a pool slot) open for a stranger's latency, and none of them roll back.
  Do the outside work after commit, or record intent in an outbox row inside the transaction.
- **Keep it short.** A transaction that spans a user's decision is a lock held for human time.
- **Read paths use `reader()` without a transaction.** A single statement is already atomic;
  wrapping it in `begin` buys nothing and costs two round trips.
- **Let the database enforce uniqueness.** `ON CONFLICT DO NOTHING RETURNING id` and then checking
  the returned rows beats "SELECT then INSERT", which is a race with a friendly face.

## Multi-tenancy and authorization

Every row belongs to a tenant, and the tenant comes from the *session*, never from the request body
or a query parameter. A client-supplied `tenantId` is an authorization bypass with extra steps.

Three layers, all of them required:

```ts
// 1. Coarse: does this role reach this route at all?
invoiceRoutes.use(requireRole(ROLE.billing));

// 2. Fine: is this specific resource inside the caller's scope?
const invoice = await invoiceInScope(c, c.req.param('id'));
if (invoice === null) throw new NotFound(RECORD_OUT_OF_SCOPE);

// 3. Structural: the query itself cannot return another tenant's row
await invoices.byId(sql, currentTenant(c), id);
```

Layer 3 is what saves you when layers 1 and 2 have a bug, which is why the tenant predicate belongs
in the SQL and not in a filter after the fetch.

Roles map to permissions in one table, and the default is deny:

```ts
const PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ['read', 'write', 'delete', 'administer'],
  operator: ['read', 'write'],
  viewer: ['read'],
};

export const allows = (role: Role, permission: Permission): boolean =>
  PERMISSIONS[role]?.includes(permission) ?? false;
```

Anything not listed is refused. A `default:` branch that returns `true`, or an `if (role !== 'admin')`
scattered across handlers, is how a new role silently inherits everything.

### Sessions, not tokens

For a first-party browser client, an opaque session id in a cookie beats a JWT: it is revocable in
one `DELETE`, it carries no claims that can go stale, and it cannot be read by a script.

```
HttpOnly; Secure; SameSite=Lax; Path=/
```

plus a row with an expiry, plus a scheduled purge. Rotate the id on login (session fixation), drop
the row on logout, and never put anything in the cookie you would mind the user editing — an opaque
id has nothing to edit.

If a JWT is ever required (service-to-service, a third party that cannot hold a cookie), the
checklist is: pin the algorithm to an allowlist and reject `alg: none`; verify `iss` and `aud`;
check `exp`/`nbf` with a small clock skew; resolve the key by `kid` from a cached JWKS; keep the
lifetime in minutes with a separate refresh path; never store it in `localStorage`.

Passwords go through `Bun.password` (argon2id with sane defaults), verified with
`Bun.password.verify` — which is constant-time. Verify against a dummy hash when the user does not
exist, so response timing does not enumerate accounts.

### Writes are marked

Browser-driven APIs get one more cheap guard: a required header on every unsafe method
(`X-Requested-By: <app>`) plus a strict `Content-Type` check. A cross-site form post cannot set
either, which kills classic CSRF without a token round trip — and it composes with `SameSite`.

## The middleware pipeline

Order is behaviour, not taste:

```ts
app.use(errorsMiddleware);       // outermost: nothing below it may leak a stack trace
app.use(correlationMiddleware);  // id exists before anything can log
app.use(cacheControlMiddleware); // runs after next(): sees the final response
app.use(createSessionMiddleware(identity.validSession));

api.use(createCorsMiddleware(config.allowedOrigins));
api.use(secureWriteMiddleware);       // reject unmarked writes before touching the body
api.use(jsonIdempotencyMiddleware);   // parses the body once, into context
```

Two properties worth keeping: the error handler is outermost so *every* failure below it becomes a
shaped response with a correlation id; and the body is parsed exactly once, by the idempotency
middleware, then read from context. A second `await c.req.json()` downstream gets an empty stream —
a bug that only shows up under a body large enough to arrive in two chunks.

Correlation rides in `AsyncLocalStorage`, so a logger three layers deep tags the line without the
id being threaded through every signature:

```ts
const storage = new AsyncLocalStorage<RequestContext>();
export const withContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);
```

## Errors and failure handling

One place converts a thrown value into a response:

```ts
export const errorStatus = (error: unknown): ErrorStatus => {
  if (error instanceof Unauthorized) return 401;
  if (error instanceof Forbidden) return 403;
  if (error instanceof NotFound) return 404;
  if (error instanceof BusinessRuleViolation) return 422;
  return 500;
};

export const errorsMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (error) {
    const status = errorStatus(error);
    logFailure(c, status, error);
    return errorResponse(c, status);
  }
};
```

- 4xx logs at `warn` with the reason; 5xx logs at `error` with the stack. Logging every 404 as an
  error is how a real incident gets buried.
- The client gets a code, a message, and a correlation id. Never a stack, a SQL string, or a
  driver message — those are a map of your schema.
- The same middleware serves HTML and JSON off one decision (`path.startsWith('/api')`), so a
  browser gets a page and a client gets an envelope without two error stacks existing.

### Retry, with jitter and a budget

Retrying is only correct for *idempotent* operations against *transient* failures, and naive
exponential backoff synchronizes every client into a thundering herd:

```ts
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts: number; baseMs: number; isRetryable: (error: unknown) => boolean },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!options.isRetryable(error) || attempt === options.attempts - 1) throw error;
      lastError = error;
      const ceiling = options.baseMs * 2 ** attempt;
      await Bun.sleep(Math.random() * ceiling);
    }
  }
  throw lastError;
}
```

Full jitter (`random() * ceiling`, not `ceiling`) is what de-correlates the herd. `isRetryable`
keeps you from retrying a 400 four times and from retrying a `POST` that already succeeded but
timed out on the way back — that one needs an idempotency key, not a retry.

Every outbound call gets a deadline, because a call without a timeout is a resource leak waiting
for a slow dependency:

```ts
const response = await fetch(url, { signal: AbortSignal.timeout(config.httpTimeoutMs) });
```

When a dependency is failing rather than slow, stop calling it: a circuit breaker (open after N
failures in a window, half-open probe after a cooldown) turns a cascading outage into a degraded
feature.

## Caching

Cache in this order — each layer is cheaper and less wrong than the next:

**1. HTTP cache headers.** Free, and correct by construction because the response says how it may
be reused:

```ts
if (isImmutableAsset(path)) c.header('cache-control', 'public, max-age=31536000, immutable');
else if (currentUserOrNull(c) !== null) {
  c.header('cache-control', 'private, no-store');
  c.header('vary', 'cookie', { append: true });
} else c.header('cache-control', 'no-store');
```

The `Vary: Cookie` on authenticated responses is not optional — without it a shared cache can serve
one user's page to another. Fingerprinted assets (`app.a1b2c3.css`) are the one thing that is safe
to cache forever, because a new build is a new URL.

**2. Per-request memoization.** The cheapest correct cache is not fetching the same row twice inside
one request: batch the ids, resolve once, reuse from a `Map`. It cannot go stale, because it does
not outlive the request.

**3. A shared cache (Redis or equivalent).** Not in this codebase today, and that is deliberate: it
adds a process to operate, a second source of truth, and a class of bug (stale reads) that is hard
to reproduce. It earns its rent when a measured read is both hot and expensive — the same query
dominating the slow log, on data that tolerates being seconds old.

When that day comes, the shape is cache-aside, and these details are what make it safe:

```ts
export async function invoiceById(id: string, tenantId: string): Promise<Invoice | null> {
  const key = `${CACHE_VERSION}:invoice:${tenantId}:${id}`;
  const cached = await cache.get(key);
  if (cached !== null) return cached === CACHE_MISS_MARKER ? null : JSON.parse(cached);

  const invoice = await invoices.byId(reader(), tenantId, id);
  const ttl = invoice === null ? NEGATIVE_TTL_S : TTL_S + Math.floor(Math.random() * TTL_JITTER_S);
  await cache.setex(key, ttl, invoice === null ? CACHE_MISS_MARKER : JSON.stringify(invoice));
  return invoice;
}
```

- The **tenant is part of the key**, always. A key collision across tenants is a data leak.
- A **version prefix** lets a deploy invalidate a whole shape without a scan.
- **TTL jitter** stops a thousand keys written together from expiring together.
- **Negative caching** stops a missing row from becoming an unbounded query stream.
- **Invalidate on write**, inside the same use case that wrote — and accept that a crash between
  commit and delete leaves a stale key, which is why TTL is a floor, not a decoration.
- Under a stampede, single-flight the miss (one loader per key, others await it) rather than letting
  every request rebuild the same value.

## Background work

### Scheduled work in-process

A `setInterval` plus a Postgres advisory lock is a complete scheduler when the work is periodic and
the process count is small:

```ts
export async function withExclusiveLock<T>(key: number, fn: () => Promise<T>): Promise<T | null> {
  const connection = await writer().reserve();
  try {
    const [row] = await connection<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${key}::bigint) AS acquired`;
    if (row?.acquired !== true) return null;
    try {
      return await fn();
    } finally {
      await connection`SELECT pg_advisory_unlock(${key}::bigint)`;
    }
  } finally {
    connection.release();
  }
}
```

`pg_try_advisory_lock` on a *reserved* connection is the point: the lock belongs to the session, so
it must be the same connection that releases it, and `try` (not the blocking form) means the second
instance skips the tick instead of queueing behind it. `timer.unref()` keeps a pending tick from
holding the process open at shutdown.

The cost hiding in `reserve()` is that the connection is **out of the pool for the whole run**, not
just for the two lock statements. A job that holds it while sending fifty e-mails is a pool slot
spent on someone else's latency — the same defect as network I/O inside a transaction, wearing a
different hat. Keep the work under a lock database-bound: claim what to do, release the connection,
do the talking, then reopen to record the outcome.

This is enough for purge jobs, digests, and reconciliation. It is *not* enough when work must
survive a crash, be retried, or be spread across machines.

### Durable work without a broker

When a job must not be lost, the queue is a table — and this is the pattern to reach for long before
Redis or a broker:

```sql
CREATE TABLE outbox (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  kind         text NOT NULL,
  payload      jsonb NOT NULL,
  run_after    timestamptz NOT NULL DEFAULT now(),
  attempts     int NOT NULL DEFAULT 0,
  locked_until timestamptz
);
CREATE INDEX outbox_ready ON outbox (run_after) WHERE locked_until IS NULL;
```

```ts
const claimed: OutboxRow[] = await sql`
  UPDATE outbox SET locked_until = now() + interval '1 minute', attempts = attempts + 1
   WHERE id IN (
     SELECT id FROM outbox
      WHERE locked_until IS NULL AND run_after <= now()
      ORDER BY run_after
      FOR UPDATE SKIP LOCKED
      LIMIT ${BATCH_SIZE})
  RETURNING *`;
```

`FOR UPDATE SKIP LOCKED` is what lets N workers pull disjoint batches without blocking each other.

That last sentence is also the rule for choosing between the two mechanisms above: **an advisory
lock and `SKIP LOCKED` are alternatives, not layers.** The advisory lock is for work that must run
as a *singleton* — one purge, one reconciliation, one instance at a time. `SKIP LOCKED` is for work
that should run *in parallel*, with the row itself as the unit of exclusion. Wrapping a drainer in
an exclusive advisory lock throws away exactly the concurrency the claim query was designed to give
you: N instances, one working, the rest skipping their tick. Pick the mechanism from the shape of
the work, and when a job changes shape, change its mechanism with it.

The row is written **inside the transaction that caused the work**, which is the outbox pattern: the
invoice and the "send the invoice" intent commit together, so there is no window where one exists
without the other.

Delivery is at-least-once, always. That is not a flaw to engineer away — it is a constraint to
design for: **every handler must be idempotent**, keyed on something stable (the outbox id, or a
natural key), so a duplicate delivery is a no-op. On failure, push `run_after` out with backoff and
jitter; past a maximum `attempts`, move the row to a dead-letter table where a human can see it.
A broker earns its rent when you need fan-out to independent consumers, cross-service delivery, or
throughput a single Postgres table cannot absorb.

### Rate limiting

The in-memory limiter is a teaching example, and it has two properties worth stating out loud
before anyone ships it: it is per-process (two instances mean twice the limit), and a naive `Map`
keyed by IP grows without bound until it is the memory leak.

```ts
export function rateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const recent = times.filter((time) => time > cutoff);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }, windowMs);
  sweep.unref();

  return (identifier: string): boolean => {
    const cutoff = Date.now() - windowMs;
    const recent = (hits.get(identifier) ?? []).filter((time) => time > cutoff);
    if (recent.length >= maxRequests) return false;
    recent.push(Date.now());
    hits.set(identifier, recent);
    return true;
  };
}
```

Rate-limit by *identity* where you have one (user id, session, api key) and fall back to IP only
for anonymous routes — and derive the IP from the trusted-proxy configuration, never straight from
`X-Forwarded-For`, which the client controls. Always answer 429 with `Retry-After`. Login and
password-reset endpoints want a stricter, per-account limit than the global one: that limit is an
account-takeover control, not a capacity control. Across instances, the counter has to live where
all of them can see it (Postgres, or the shared cache when one exists).

## Observability

```ts
logger.info({ route, tenant_id: tenantId, duration_ms: elapsed }, LOG_EVENTS.invoiceIssued);
```

- **Structured, one object per event.** The message is a stable identifier, not a sentence with
  values interpolated into it — you will grep and aggregate on it.
- **Redact by key**, in the logger, not at the call sites: password, token, secret, cookie,
  authorization, and anything else in the forbidden list get replaced before pino sees them. A
  redaction that depends on every developer remembering is not a control.
- **Correlation id on every line**, injected from `AsyncLocalStorage`, and returned in the response
  header so a user's screenshot is a log query.
- **Log identifiers, not payloads.** A user id, a route, a duration, a count. Not the request body,
  not the row.
- **Health and readiness are different endpoints**: liveness says the process is up, readiness says
  it can reach the database. Only readiness gates a rolling deploy.
- The metrics that answer "is it broken?" are Rate, Errors, Duration per route, with duration as
  percentiles — an average hides the tail that users actually feel.

When distributed tracing arrives (OpenTelemetry), carry `traceparent` in the same context object and
log `trace_id` alongside the correlation id, so logs and spans join.

## Configuration and process lifecycle

Parse the environment once, at boot, with a schema, and fail loudly:

```ts
export const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(MINIMUM_SECRET_LENGTH),
  PORT: z.coerce.number().int().positive().default(3000),
});
```

A missing variable must kill the process at startup, not surface as a `undefined` in a query at
3 a.m. Nothing below `shared/config` reads `process.env`.

Pool sizing is a budget, not a maximum: `max` per instance × instances must stay under the server's
`max_connections`, with headroom for migrations and psql. A pool larger than the database can serve
does not add throughput — it moves the queue from your process to the database, where it is harder
to see. Set `idleTimeout` and `connectionTimeout` so a dead backend fails fast instead of hanging.

Shutdown is part of correctness:

```ts
async function shutdown(signal: string): Promise<void> {
  const drain = server.stop(false);   // stop accepting, let in-flight requests finish
  scheduler.stop();
  await awaitDrain(drain);            // bounded by the request timeout + grace
  await closeDatabase();
  process.exit(0);
}
```

Without the bound, one stuck request blocks the deploy forever; without the drain, the deploy kills
requests mid-transaction.

## Testing

- **Test endpoints through HTTP against a real Postgres.** Mocking the database tests the mock; the
  interesting failures live in the SQL, the constraints, and the middleware order.
- **Four uncomfortable questions per endpoint**: no session, wrong role, a target in another tenant,
  a target in the same tenant but outside the caller's scope. A leak in any of those is a privacy
  incident, not a bug.
- **Domain rules get pure tests** — no database, no clock, no HTTP. That is what the ports are for.
- **One test per rule, named after the rule.** A test called `works` tells you nothing when it goes
  red six months from now.
- **Every test has a body.** An empty case with the assertion described in a comment is a lie the
  coverage report repeats back to you — see *Surviving the gate*.
- Also pin: the 400-vs-422 split, the repeated-`Idempotency-Key` path, pagination edges (page 0,
  page beyond the last, empty set), and the `Cache-Control` on an authenticated response.

## House rules for any change here

`bun run verify` is the gate, and it runs four things: `typecheck`, `check` (module boundaries),
`magic` (no literal that should be a named constant), and `test`. Before proposing a change as
done, run it.

Two conventions that surprise people:

- **`src/` carries no comments.** A test enforces it. What a comment would have said becomes a name,
  a type, or a test. Directives the tooling reads are the exception.
- **No magic values.** Routes, limits, codes, messages, and header names live in a `constants.ts`
  with a single owner, and the `magic` script fails the build when a literal reappears inline.

## Surviving the gate

Code that reads correctly and code that passes `verify` are different achievements, and the gap is
where proposals die. These four came out of applying a proposal to a real worktree and running it —
each one looked like a detail on paper and was a red suite in practice.

**A test you name and leave empty is worse than a test you never wrote.** A `test('rejects a
duplicate', () => { /* assert it refuses */ })` compiles, passes, and raises the count. Coverage
climbs, the gate goes green, and the feature ships with nothing holding it. If you propose a test,
propose its assertions; if you are not going to write the body, say plainly that the case is
uncovered and leave the name out.

**A document a test reads is code, and it is pinned to something specific.** Before "updating the
docs to match the change", find out what the test compares the document *against*. Here the stage
document is checked column-by-column against the baseline migration only — so adding your new
columns to it is what *creates* the divergence. The instinct to keep documentation current is right
and produces a red suite anyway.

**A duplication checker counts occurrences across the whole tree, not inside your diff.** Copying a
heading from a neighbouring template makes the third copy fail — and it fails on all three files,
including the two you never opened. When you lift prose or a literal from an existing file, check
how many times it already exists before adding one more.

**Generated artifacts are inputs to the suite, and some tests pin them by hand.** Rebuilding assets
changes the fingerprint in the stylesheet name, and a test may hold that exact string; a golden
snapshot only compares until it is told to rewrite. Build the artifacts before believing a failure,
and when a build changes a fingerprint, grep for the old one — the test that breaks is rarely in the
folder you were working in.

## Review checklist

Run this over any backend diff:

- [ ] Does every query filter by tenant, and does the tenant come from the session?
- [ ] Is the layering intact — no SQL outside `infra/`, no cross-module deep import, no I/O in `domain/`?
- [ ] Is business failure a `Result`, and is the status 422 (not 500, not 400)?
- [ ] Is there a loop containing an `await` on a query? (N+1)
- [ ] Is the list endpoint paginated and its `limit` clamped, with `sort` through an allowlist?
- [ ] If it is a cursor walk: does the cursor carry the key at full precision, and is the meaning of a
      concurrent insert stated?
- [ ] If it is background work: does the exclusion mechanism match the shape — advisory lock for a
      singleton, `SKIP LOCKED` for parallel workers, never both? Is any pool connection held across
      a network call?
- [ ] If it adds a constraint to an existing table: which existing writers — seeds, fixtures, tests
      in other modules — does it retroactively invalidate, and are they fixed in the same change?
- [ ] Does the `POST` require an `Idempotency-Key`, and is the key released on failure?
- [ ] Is the transaction boundary the use case, with no network call inside it?
- [ ] Do the logs carry the correlation id, and do they carry no secrets or payloads?
- [ ] Does an out-of-scope resource answer 404 rather than 403?
- [ ] Does the error response leak a stack, a SQL string, or a driver message?
- [ ] Are new constants in `constants.ts`, and did `bun run verify` pass?
- [ ] Is there a single comment — line, block, or JSDoc — anywhere in the `src/` code being proposed?
      A test scans every `.ts` under `apps/api/src` and fails on the first one, including a docstring
      written to explain a helper. Explain through the name, the type, or the test instead.

**Remember**: every pattern above exists to keep a change local. When one of them makes a change
harder without making a failure less likely, say so — a rule that only costs is a rule to revisit.
