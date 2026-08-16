# ADR 0005 — Guardian and user remain two records, and the arrow that forces

**Status:** superseded by ADR 0006 — all three decisions fell together with the premise that held
them up ("a guardian can exist without a credential"). The **analysis** still stands and is the
reason ADR 0006 exists: the three layers of the inversion, the `dependency-cruiser` blind spot and
the contrast with the teacher.

## Context

The same person shows up twice in the database when a guardian has portal access: `guardian`
(academics) holds the record, `app_user` (identity) holds the credential. Three columns exist in
both tables — `name`, `email` and `cpf` — and they can drift apart. Changing the e-mail on the
registrar's record does not change the login e-mail.

ADR 0004 already dealt with half of this. It took the identifying role away from the e-mail and gave
it back to contact, and the CPF, being immutable, became the stable bridge between record and
credential. In practice that bridge is a **guard**, not a key: `inviteUser` refuses the invitation
when `registeredCpf` diverges from the CPF supplied. The structural link is still the
`app_user.guardian_id` column, created in `0006_usuario_responsavel.sql`. `name` and `email` remain
free to diverge from the first invitation onward — which is what 0004 accepted when it dropped
e-mail uniqueness so that a mother and a father can share one family e-mail.

The structural price of that column is a dependency inversion, and it shows up in three layers —
none of them an `import`, which is why all three `dependency-cruiser` rules pass:

| Layer | Where |
|---|---|
| Database | `app_user.guardian_id` REFERENCES `guardian(id)` — identity points at academics |
| Published language | `identity.validSession()` returns `guardianId` |
| Shared kernel | `SessionUser.guardianId`, in `src/shared/http/session.ts` |

The third is the most uncomfortable: `shared/` declares a field whose meaning belongs to
`academics`. It escapes `shared-knows-no-domain` because it is a `string | null` declared
structurally, without importing anything. Nominal coupling is not module coupling as far as the tool
is concerned — but it is for whoever maintains the code.

The contrast that explains the origin is inside academics itself: **the teacher does not have this
problem.** They are `class_group_subject.teacher_user_id REFERENCES app_user(id)` — academics
pointing at identity, the right direction — and they have no table of their own. The difference is
accidental: the guardian needed `phone` and `relationship`, someone created the table, and `name`,
`email` and `cpf` came along for the ride. The inversion was born out of a contact column, not out of
a decision.

## Decision

**1. A guardian can still exist without a credential.** That is what the code does — registering does
not create an `app_user`, and `inviteUser` requires a `guardianId` that already exists — and it is
what ADR 0004 recorded when it said `guardian.cpf` stays nullable *forever*: whoever does not supply
a CPF still exists as a contact and appears on the student's record, without receiving portal access.
That order — register the family first, hand out access later — is a requirement, not an accident.

**2. `name`, `email` and `cpf` stay in both tables.** `guardian` is the truth of the record,
`app_user` is the truth of access, and the immutable CPF is the bridge 0004 guarantees.

**Rejected:** keeping only `phone` on `guardian` and holding `name`, `email` and `cpf` solely on
`app_user`. That is the correct model in the abstract — it is exactly the teacher's shape — and it
resolves the duplication in one move. It falls because of decision 1: without a `name` of its own,
registering a guardian would require creating an `app_user`, which requires a `NOT NULL` CPF and a
`password_hash`. The guardian without a CPF, whom 0004 explicitly protected, would stop being
representable. And it leaks into announcements: `schoolGuardians` selects `FROM guardian` with no
join against `app_user`, so an announcement today reaches guardians without a login — who would end
up nameless on the read-tracking screen.

There is a second cost, smaller but concrete: `academics` does `ORDER BY name` in three guardian
queries. With the name living in another context, the pattern already established for the teacher —
return the id and resolve the name with `identity.userNames()`, joining in memory — **does not sort
and does not paginate**. For the teacher that does not hurt, because the assignment list paginates on
something else and the name is decorative. The registrar's guardian list paginates by name.

**Rejected as well:** deriving the link with `JOIN ON app_user.cpf = guardian.cpf`, dispensing with
the column. `guardian.cpf` is nullable by decision of 0004, so a guardian without a CPF would never
match and their portal would come up empty with no error at all. Tying two tables together by a
business value rather than by identity also breaks on the first correction of a mistyped CPF.

**3. The inversion is recorded as debt, with the moment to pay it.** The fix is known and mechanical:
move the column to the other side.

```sql
ALTER TABLE guardian ADD COLUMN user_id uuid REFERENCES app_user(id);
CREATE INDEX guardian_by_user ON guardian (network_id, user_id);
ALTER TABLE app_user DROP COLUMN guardian_id;
```

Along with it, `guardianId` disappears from `AuthenticatedUser` and from `SessionUser`, and the
guardian routes start asking `academics.guardianOfUser(networkId, userId)` instead of reading it from
the session. The three layers fall together and `identity` becomes a leaf of the graph in the
database too.

It is not done now because the cost shows up on every guardian request — today `guardianId` arrives
for free in the `SELECT` that assembles the session, and it cannot be resolved with a `JOIN`, because
whoever assembles the session is `identity` and `identity` may not know what a guardian is. The extra
query is the consequence of respecting the boundary, not a side effect to optimise away.

**The two triggers that make the debt due:**

- **Module extraction (Stage 14).** The question "what else touches this?" has an answer through
  `index.ts`, but not through the schema: separating `identity` from `academics` into distinct
  databases runs into this foreign key, and only into it.
- **Students starting to log in.** The current model would double the inversion — `app_user.student_id`
  pointing back at academics again, and `studentId` joining `SessionUser` next to `guardianId`.
  Turning the column around first makes `academics.student.user_id` the natural direction. What stays
  open in that case is the problem 0004 already exposed: `app_user.cpf` is `NOT NULL`, and the
  `student` table has no CPF at all — requiring a CPF from a first-grader is a product decision, not a
  schema one.

## Consequences

- **The divergence of `name` and `email` is accepted and not instrumented.** Nothing warns when the
  record's e-mail and the login's e-mail differ. ADR 0004 already rejected the divergence warning as a
  remedy for the identifier; for contact, the divergence is not a defect — it is the use case of a
  mother and a father sharing one family e-mail.
- **`dependency-cruiser` stays green over real coupling.** The three rules read `import`s, and the
  three layers of this inversion are a foreign key, a return field and a structural field. It is worth
  knowing that green there does not mean the boundary is intact, and that this ADR is the only place
  where that is written down.
- **`guardian` is a name doing two jobs.** It is a value of `ROLES` — the permission, in `user_role` —
  and it is the name of the record table, in `academics`. Both readings coexist in every conversation
  about this subject. Separating the vocabulary is a prerequisite for any future change here, and it is
  language work before it is schema work.
- **The teacher remains the reference model.** When the question is "how should this have been
  modelled?", the answer is in `class_group_subject.teacher_user_id`: no mirror table, no duplicated
  attribute, arrow pointing from academics to identity.
