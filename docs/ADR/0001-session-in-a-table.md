# ADR 0001 — Session in a table, signed cookie carrying only the id

**Status:** accepted — Stage 01

## Context

EscolaViva needs to know who is on the other side of every request. There are two common
routes: keeping the session state *inside* the cookie (the cookie carries user, network and
roles, all signed) or keeping only an identifier in the cookie and the state in the database.

The first route is tempting because it costs no query at all. It charges elsewhere: there is
no real logout — a signed cookie stays valid until it expires, even if the user clicked "sair",
even if the registrar deactivated the account. Revoking requires an invalidation list, which is
exactly the table one was trying to avoid, only without the guarantees the database gives.

Invariant I2 says the application is stateless. A session in process memory (a module-level
`Map`) or in a file on the container disk breaks I2 silently: it works with one instance and
disappears on the first deploy. Tearing down the container and bringing up another must not lose
anything beyond what is declared as losable.

## Decision

The `ev_session` cookie is **signed** and carries **only the session id**. The state —
`user_id`, `network_id`, `created_at`, `expires_at`, `ip` — lives in the PostgreSQL `session`
table, which is the single source of truth (I5).

The cookie is `HttpOnly`, `SameSite=Lax` and `Secure` when `APP_ENV=production`.
The duration comes from `SESSION_DURATION_HOURS`, and expiration belongs to the row, not to the
cookie: the browser may lie about the cookie's validity, the database does not.

## Consequences

- **Logout is real.** `endSession` deletes the row; the next request carrying that cookie finds
  no session and goes back to the login screen. Deactivating a user has the same immediate effect.
- **The application stays stateless.** No module variable holding state, no writing to disk. Any
  instance serves any request — that is what makes Stage 08 (more instances behind a load
  balancer) an infrastructure change rather than a code change.
- **It costs one query per authenticated request.** It is a primary-key `SELECT` on a small
  table. At Stage 01 scale (40 networks, 18 thousand students) it does not show up in the p95.
- **Expired rows pile up.** That is a desired consequence: it gives real work to the stage's only
  periodic job (I20), `expurgo-de-sessoes`, which runs every 15 minutes under
  `pg_try_advisory_lock`. With one instance the lock is redundant; with six, at Stage 08, it is
  what keeps the job from running six times. Having the job do real work from day 1 means the
  mechanism will already be proven by the time it matters.
