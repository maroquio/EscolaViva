# CPF as the access identifier

**Date:** 2026-08-14
**Stage:** 01 (a change to what is already implemented; it anticipates nothing from Stage 02+)
**Status:** approved, awaiting an implementation plan

## Problem

Login today is `networkSlug + email + password`, and the e-mail plays two roles that are not the same
one: identifying whoever signs in and saying where to send messages. That blocks editing a record —
the path that started this work — because `guardian.email` and `app_user.email` are independent
columns that the product treats as if they were one.

The proof that the promise is false is in the help text of `registrar/guardian_new.eta`: *"Único na
rede. É por ele que o responsável entra quando o administrador criar o acesso"*. Nothing in the model
guarantees that — `inviteUser` accepts any e-mail typed in, and the divergence can be born today, with
no editing involved.

## Decision

The access identifier becomes the **CPF**, which does not change. E-mail goes back to being contact
only.

The link between a person's record (`guardian`, in academics) and their credential (`app_user`, in
identity) is now made through the CPF. Because the CPF is immutable, the divergence problem stops
existing by construction — it is not patched, it is eliminated.

A CPF is not a secret and does not become an authentication factor: the credential is still the
password. What the CPF brings is stable identification.

## Scope

**In:** a `cpf` column on `app_user` and `guardian`; check-digit validation; authentication by CPF;
invitation and registration asking for a CPF; formatted display; log redaction; a seed with generated
CPFs; an ADR recording the decision.

**Out:** editing the four entities and deactivating a school or a user — separately approved work that
comes after this change, because this change alters the content of those forms. A student's CPF (census
data, unused at Stage 01). A generic document with a type (passport, RNE).

## 1. Data model

Two migrations, following `docs/ADR/0003-migration-compatibility-window.md`: never drop a column the
previous version still reads.

### `0007_cpf.sql` — opens the window (commit A)

```sql
ALTER TABLE app_user ADD COLUMN cpf text;
ALTER TABLE guardian ADD COLUMN cpf text;

ALTER TABLE app_user ADD CONSTRAINT user_cpf_format
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
ALTER TABLE guardian ADD CONSTRAINT guardian_cpf_format
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

CREATE UNIQUE INDEX user_cpf_unique_in_network
  ON app_user (network_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX guardian_cpf_unique_in_network
  ON guardian (network_id, cpf) WHERE cpf IS NOT NULL;
```

The index is **partial** because rows without a CPF exist during the window, and several `NULL`s do not
collide with one another. Without the `WHERE`, the first row without a CPF would block the second.

### `0008_cpf_obrigatorio.sql` — closes the window (commit B)

```sql
ALTER TABLE app_user ALTER COLUMN cpf SET NOT NULL;

DROP INDEX user_cpf_unique_in_network;
ALTER TABLE app_user ADD CONSTRAINT user_cpf_unique_in_network UNIQUE (network_id, cpf);

ALTER TABLE app_user DROP CONSTRAINT user_email_unique_in_network;
```

`guardian.cpf` **does not change in this migration**: it stays nullable forever, with the partial index.
That is the decision about the foreign guardian — the person exists as a contact and appears on the
student's record, but cannot receive portal access until they supply a CPF.

`app_user.email` stays `NOT NULL` — it is the contact Stage 04 will use — but it stops being unique: a
mother and a father can share one family e-mail, a constraint that only made sense while the e-mail
identified.

**Storage:** eleven digits, no punctuation. The login lookup has to be deterministic regardless of
whether the person typed the dots.

**Division of responsibility**, the same one the project already practises: the database guarantees
shape and uniqueness; the domain guarantees the check digits.

## 2. Validation and generation — `src/shared/document/cpf.ts`

A pure module, with no dependency on the database, HTTP, logging or any library.

| Function | Contract |
|---|---|
| `normalizeCpf(raw: string): string` | returns the digits only |
| `isValidCpf(digits: string): boolean` | eleven digits, not all the same, both check digits correct |
| `formatCpf(digits: string): string` | `12345678909` → `123.456.789-09`; invalid input returns the same em dash the other formatters use |
| `generateCpf(seed: number): string` | a syntactically valid, deterministic CPF |

A repeated sequence (`00000000000`, `11111111111`, …) passes the check-digit arithmetic and needs an
explicit rejection.

`generateCpf` builds the nine base digits from the fixed prefix `10` followed by seven digits of the
seed, and then computes both check digits. The prefix has two digits that differ from each other, so the
base is **never** uniform — there is no case to skip, and skipping cases is exactly what would make two
seeds land on the same CPF. The mapping is injective for a seed in `[0, 10,000,000)`. It serves the seed
and the test fixtures — it has no production use, and the file header says so. It lives next to the
validator because it is the same algorithm seen from the other side: the property test
`isValidCpf(generateCpf(n)) === true` over a range of seeds exercises both at once, and an error in
either one brings the suite down.

### Dependency boundary

`src/shared/document/` is reachable from the domain. The `pure-domain` rule in dependency-cruiser
blocks `shared/{db,http,log,jobs}` today, so the code passes — but the rule's **comment** claims
something stricter (*"It may only reach `src/shared/ports/` and `src/shared/result.ts`"*).

The comment is updated alongside, to include pure-value utilities. Leaving the rule saying one thing and
the code doing another is worse than either alternative.

Rejected: putting the validator in `identity/domain/` and exposing it as `identity.isValidCpf`. It works
without touching any rule, but it couples `academics` to `identity` over check-digit arithmetic — against
the Stage 14 extraction goal.

## 3. Authentication

Login becomes `networkSlug + cpf + password`.

**Commit A (window open).** `authenticate` receives an identifier and decides by its shape: if it
contains `@`, it is an e-mail; otherwise it is normalised and treated as a CPF. The form field is called
`identificador` and the label reads **"CPF ou e-mail"** — honest about what the screen accepts at that
moment.

**Commit B (window closed).** The e-mail branch goes away. The field is renamed `cpf`, with the label
"CPF", `inputmode="numeric"`, and it accepts punctuation or not.

The rejection message stays deliberately vague — it now does not say whether the CPF exists, just as
today it does not say whether the e-mail exists.

## 4. Invitation and registration

`/network/users/new` gains a **mandatory CPF** field; the e-mail stays, as contact.

When a guardian record **that already has a CPF** is chosen, the domain refuses if the CPF typed differs
from the record's: *"O CPF não confere com o do cadastro de Fulana."* The message does not reveal the
number — whoever creates the access has the document in hand.

When the record has **no** CPF, there is no divergence to prevent and the invitation proceeds with the
CPF typed. That is deliberate and is what keeps the window honest: during it, guardians already
registered still have no CPF, and requiring one from the record would block a flow that used to work —
the opposite of what compatibility promises. The guardian's record gains a CPF whenever someone edits it,
work that comes in the next batch.

One consequence that has to be clear: while the window is open, a record and a credential for the same
guardian can hold different CPFs if someone mistypes at invitation time. It is a narrow window — it
disappears at commit B for anyone who has a CPF on both sides, and guardian editing closes the rest.

`/registrar/guardians/new` gains an **optional CPF** field, with help text explaining that without it the
person stays a contact and receives no portal access.

## 5. Presentation

A formatted CPF column on the user and guardian lists: whoever administers the network needs to be able
to tell someone what their access CPF is.

`formatCpf` joins the template context in `render.ts`, next to `formatDate` and the error helpers — the
template receives `it.formatCpf` ready to use.

## 6. Logging and privacy

`FORBIDDEN_LOG_KEYS` in `src/shared/constants.ts`, read by `src/shared/log/redaction.ts`, **already
contains `cpf`** — log redaction was written in anticipation of this day and needs no change at all.

What is missing is the proof. The test `tests/web/checklist.test.ts` already has
`const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/` and asserts that no log line contains a CPF. Today it passes
vacuously: there is no CPF in the system. It starts holding for real — the log scenario gains an
unmistakable CPF and the test asserts it does not appear, neither formatted nor as raw digits.

A CPF never enters a query string.

## 7. Seed

`scripts/seed.ts` writes a CPF into every `app_user` and every `guardian`, via `generateCpf`, and prints
the CPF next to the credentials — as it already publishes the password, this being a teaching database.

## 8. Tests

**Unit (`shared/document/cpf`)**
- `isValidCpf` accepts a correct CPF and refuses: wrong length, a non-numeric character, a wrong check
  digit, a repeated sequence
- `normalizeCpf` strips punctuation, spaces and dashes
- `formatCpf` returns the mask; invalid input returns the em dash
- property: `isValidCpf(generateCpf(n))` over a range of seeds, and `generateCpf` does not repeat within
  the range

**Authentication**
- signs in with a punctuated CPF and with a raw CPF
- signs in with an e-mail (commit A) — this test is **removed at commit B**, and the removal is part of
  the demonstration
- a nonexistent CPF and a wrong password give the same vague rejection

**Invitation and registration**
- an invalid CPF is refused with a field error
- a duplicate CPF in the same network is refused
- the same CPF in another network is accepted (uniqueness is per tenant)
- an invitation pointing at a guardian whose CPF diverges is refused
- an invitation pointing at a guardian without a CPF is refused

**Privacy**
- no CPF from the scenario appears in the log of a complete flow

## 9. Delivery sequence

**Commit A — opens the window.** `0007`, `shared/document/cpf.ts`, authentication accepting both,
invitation and registration with a CPF, display, log redaction, seed, tests. At the end, whoever has a
CPF signs in with it and whoever does not keeps signing in with an e-mail. Rollback is safe: the previous
code ignores the new column.

**Commit B — closes the window.** `0008`, removal of the e-mail branch in authentication, the form field
renamed, the window test removed. At the end, the CPF is the only identifier.

**ADR 0004** — `docs/ADR/0004-cpf-as-access-identifier.md`, recording the decision in the format the
repository already uses. It goes in at commit B, when the decision has actually been consummated.

## 10. Risks

**A CPF is now typed on every sign-in.** It is personal data under the LGPD. Mitigated by log redaction
(section 6) and by the absence of a CPF in any URL. Accepted: it is the trade-off of using a stable
identifier.

**The window could stay open indefinitely** if commit B never ships. Mitigated by delivering the two in
immediate sequence; the repository is teaching material and holds no real data to collect.

**Someone might read `generateCpf` as a production utility.** Mitigated by the file header and by the
name of the test directory that consumes it.
