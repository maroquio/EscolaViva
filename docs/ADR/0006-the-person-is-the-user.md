# ADR 0006 — The person is the user: the `guardian` table stops existing

**Status:** accepted — Stage 01. **Implemented** in
`migrations/0002_the_person_is_the_user.sql`.
**Supersedes:** the consequence "a guardian without a CPF still exists as a contact" from ADR 0004,
and decisions 1, 2 and 3 of ADR 0005.

## Context

ADR 0005 accepted a duplication and deferred a debt, both because of one premise: a guardian can
exist without portal access. From that premise came the three decisions of that ADR — `name`, `email`
and `cpf` staying in both tables; `app_user.guardian_id` continuing to point from identity to
academics; and the direction fix staying as debt with a trigger.

**The premise changed.** Two product rules now apply:

1. A CPF is mandatory for a guardian.
2. Every guardian can log in.

With those, the record no longer needs to exist separately from the credential — and the right design
is no longer the one ADR 0005 deferred. Turning the column around would fix the direction of the
dependency at the cost of one query per guardian request. Under the new premises there is a solution
that costs no query at all, because there is nothing left to look up.

The analysis in ADR 0005 still stands and is the reason this one exists: the inversion lives in three
layers — a foreign key, a field returned by `validSession()` and a structural field in `SessionUser` —
none of them an `import`, which is why all three `dependency-cruiser` rules pass over it.

## Decision

**`app_user` becomes the person. `academics` keeps only the academic relationship, pointing at
identity.**

```sql
ALTER TABLE app_user ADD COLUMN phone text;

-- student_guardian and announcement_recipient swap guardian_id for
-- user_id uuid NOT NULL REFERENCES app_user(id), and the primary key goes with it:
-- (student_id, user_id) and (announcement_id, user_id).
CREATE INDEX student_guardian_by_user ON student_guardian (network_id, user_id);
CREATE INDEX announcement_recipient_by_user ON announcement_recipient (network_id, user_id);

ALTER TABLE app_user DROP CONSTRAINT app_user_guardian_id_fkey;
DROP INDEX app_user_by_guardian;
ALTER TABLE app_user DROP COLUMN guardian_id;
DROP TABLE guardian;
```

Nineteen tables become eighteen, forty-two foreign keys become forty, and **none points against the
direction of the code**. `identity` becomes a leaf of the graph in the database too. Counted after
the fact against the migrated schema, the arrows between modules are: `academics → identity` (10),
`assessment → academics` (4), `assessment → identity` (5), `communication → identity` (5),
`shared → identity` (1) — and from `identity`, only `identity → identity` (7).

**What disappears with it:** `guardianId` leaves `AuthenticatedUser` and `SessionUser`. The guardian
dashboard filters by `currentUser(c).id` directly — the logged-in user *is* the guardian, and there is
no translation to do. That is the difference between this decision and the one ADR 0005 deferred:
there, `guardianId` would have to be fetched on every request, because whoever assembles the session
is `identity` and `identity` may not know what a guardian is.

**The guardian listing changes owner.** It leaves `academics`, which today does `ORDER BY name` in
three queries, and becomes `identity.usersPage` filtered by role — which already sorts by `u.name`, in
the context that owns the name. Sorting and paginating by a field belonging to another context stops
being a problem because it stops being necessary.

**Role and link do not become redundant — they become two levels.** `user_role` answers "may open the
portal" and is what `requireRole` checks; `student_guardian` answers "for which students" and is what
the query filters by. It is the separation the guardian routes already make: `requireRole(ROLE.guardian)`
says the person is a guardian for someone — it does not say for whom. The new model only makes it more
honest, because both levels come to use the same key.

**Rejected:** splitting `app_user` into `person` (name, email, cpf, phone) and `credential`
(person_id, password_hash, active), with `student_guardian.person_id`. That is the general model, and
the only one that preserves a person without a credential without reopening the duplication. It falls
because it contradicts premise 2 and charges a join on every login to support a case the premise has
just declared nonexistent. It is recorded as the path to follow **if** premise 2 is ever revoked.

**Rejected as well:** keeping `guardian` as a table and merely moving the link inside it
(`guardian.user_id`), which was the fix foreseen in ADR 0005. It fixes the direction of the dependency
but keeps `name`, `email` and `cpf` duplicated across two tables that can drift apart, and it charges
the extra query. Under the new premises it is strictly worse than deleting the table.

## Consequences

- **A guardian without a CPF stops being representable — and that is accepted.** ADR 0004 recorded the
  opposite: `guardian.cpf` nullable *forever*, and whoever did not supply a CPF would keep existing as
  a contact, appearing on the student's record without receiving the portal. That was the explicit
  decision about the foreign guardian. Premise 1 revokes that consequence. The grandparent who only
  receives announcements, and the guardian without a CPF, become non-registrable. **The central
  decision of ADR 0004 — CPF as the access identifier, e-mail back to contact — is not superseded; it
  comes out reinforced.** All that falls is that one consequence.
- **No use case can make `name` or `email` diverge between record and credential**, because there are
  no longer two records. ADR 0004 eliminated the identifier's divergence by construction; this one
  eliminates the contact's by the same route. It is the end of the category, not a remedy for it.
- **Every person gains a `password_hash` and a temporary password**, including people who will never
  sign in. More sensitive material at rest, for a benefit that only materialises if the person logs in.
- **`guardian` comes to mean one thing only.** Today the name does two jobs: it is a value of `ROLES`,
  the permission, and it is the name of the record table. The ambiguity ADR 0005 flagged as a
  prerequisite for any change here resolves itself as a consequence, with no separate language work.
- **The migration's obstacle is data, not DDL.** The backfill requires one `app_user` per linked
  `guardian`, and `app_user.cpf` is `NOT NULL` — every guardian registered without a CPF blocks the
  step. **It is CPF collection that decides the schedule, not the migration.** The `SET NOT NULL` on
  the new `user_id` columns is where that failure surfaces, loudly, instead of silently dropping
  rows. In this repository the data comes from `scripts/seed.ts`, which was changed first so every
  guardian is born as an `app_user` with a CPF and a role.
- **It went in as one migration, not as the pair ADR 0003 asks for.** The compatibility window would
  be `0002` opening (nullable columns, backfill) and `0003` closing (`NOT NULL`, primary-key swap,
  the two `DROP`s). It was collapsed into `0002` by an explicit call: there is no previous version
  in flight and no data but the seed's. ADR 0003 stands — this is a deliberate exception to it,
  recorded here so it is not read as precedent.
- **`linkGuardian` does not grant the role in the same transaction.** The `identity` facade exposes no
  write that accepts the `sql` of an in-flight unit of work, and opening that door would leak
  infrastructure through the published language. The two operations stay separate, as they are today,
  and a user with a role and no link keeps seeing an empty portal — identical behaviour to the current
  one, not a regression.
- **Students logging in stops doubling the debt.** With the link already pointing at `app_user`, a
  `student.user_id` would follow the same direction. What stays open in that case is what premise 1
  does not resolve: the `student` table has no CPF, and requiring a CPF from a first-grader is a
  product decision, not a schema one.
- **Registering a guardian became inviting a user.** `academics.registerGuardian` is gone: the
  registrar's screen calls `identity.inviteUser` and shows the temporary password, the way the
  network's user screen already did. `user_role.school_id` is `NOT NULL`, so the form asks which
  school the person enters through — implicitly when the registrar has one, with a select when they
  have more. The listing follows the same move: it is `identity.usersPage` filtered by role.
- **The guardian's name and e-mail stop being academics' to give.** `studentGuardians` hands back the
  link alone — `userId`, `relationship`, `financiallyResponsible` — and whoever assembles the screen
  resolves the contact through `identity.userContacts`. It is the pattern the teacher already used
  (`class_group_subject.teacher_user_id` plus `identity.userNames`). Sorting and paginating the
  student's guardian list moved into memory, which is what keeps the alphabetical order the screen
  had while the name lived in the same table as the link.
