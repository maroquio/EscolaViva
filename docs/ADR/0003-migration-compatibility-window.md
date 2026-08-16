# ADR 0003 — Compatibility window: never drop a column the previous version still reads

**Status:** accepted — Stage 01

## Context

Migrations are numbered `.sql` files under `migrations/`, applied by `bun run migrate` in one
transaction per file, with a record in `schema_migrations` (I6). The runner is our own, with no ORM
and no external tool.

The Stage 01 deploy is manual and tolerates two minutes of downtime. Even so, there is always an
interval — between applying the migration and the new process being up, or between the new process
starting and the old one finishing the requests in flight — in which **two versions of the code talk
to the same database**. A migration that drops or renames a column during that interval takes down
the version that still reads it.

Writing this down as a rule now is free. Writing it after the first incident costs the incident.

## Decision

Every schema change respects this window, in this order, in **separate migrations and separate
deploys**:

1. **Add** the new structure (column, table, index). Never `NOT NULL` without a default in the same
   migration — the old version does not know how to fill the field.
2. **Migrate** the data. The new code writes to both places; the old one keeps reading the old one.
3. **Stop writing** to the old one, once no instance of the previous version is still up.
4. **Drop** the old structure, in a migration that only happens once step 3 has been in production
   long enough that no rollback is plausible.

Renaming a column is always the sequence above — never `ALTER TABLE ... RENAME COLUMN`, which is
steps 1 and 4 compressed into a single instant.

## Consequences

- A change that "would be one line" becomes four migrations spread over weeks. That is the price of
  being able to roll the process back without rolling the database back.
- Rollback stays available at all times: since no migration drops what the previous version reads,
  reverting to the old image is enough to revert the system.
- The database carries duplicated structure during the window. That is temporary and visible —
  steps 3 and 4 are tasks, not good intentions.
- The rule applies from day 1, with a single instance. By the time Stage 08 puts six instances up
  and Stage 12 automates the deploy, the habit will be formed and no migration will need rewriting.
