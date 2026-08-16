# CPF as the access identifier — implementation plan

> **Executed and closed.** This plan is kept as a record of how the change was made, so its
> steps still name `migrations/0007_cpf.sql` and `0008_cpf_obrigatorio.sql`. Those files no
> longer exist: once both sides of the compatibility window were shut, the eight migrations
> were folded into a single `migrations/0001_initial_schema.sql`. Read the file paths below as
> history, not as the current layout.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** change EscolaViva's access identifier from e-mail to CPF, in two phases that open and close a migration compatibility window.

**Architecture:** a pure module in `src/shared/document/cpf.ts` concentrates CPF normalisation, validation, formatting and generation; `identity` starts authenticating by CPF and `academics` starts storing the guardian's CPF. Phase A adds a nullable column and makes login accept CPF **or** e-mail; phase B makes the column mandatory and removes the e-mail branch. No POST URL changes.

**Tech Stack:** Bun · TypeScript · Hono · Eta · PostgreSQL 16 via `Bun.sql` · Zod · `bun:test`

**Spec:** `docs/superpowers/specs/2026-08-14-cpf-as-login-design.md` — read it before starting; this plan argues from it.

## Global Constraints

They apply to **every** task. Not repeated in the individual tasks.

- **Language:** every identifier, file name and folder name in **English**. Screen text and messages the end user reads stay in **Brazilian Portuguese**, with correct accents. Revoked on 2026-08-16 was what this line used to say ("every identifier, comment, error message and screen text in Brazilian Portuguese"): the repository is being converted to English.
- **Comments explain the why, never the what.** Look at any neighbouring file before writing: the repository documents decisions and trade-offs, not mechanics.
- **`bun run verify` green before any commit.** It runs `tsc --noEmit`, `depcruise`, the magic-value checker and the whole suite with the project's 80% coverage gate.
- **Commit:** `git add` **explicit, file by file**. Never `git add -A`, `git add .`, `git add -u`, `git commit -a` or `-am`. Run `git status --short` first and confirm only that task's files are staged.
- **Ask the user for authorisation before every commit and before any push.** Authorisation is scoped: "you may commit" does not authorise a push, and one authorised commit does not authorise the next.
- **Do not create a branch.** Work on the current branch.
- **No AI attribution** in commit messages.
- **Stage 01.** Nothing in this plan may anticipate a later-stage component — no queue, no cache, no e-mail delivery, no external service.
- **The CPF is always normalised in the database:** eleven digits, no punctuation. Never in a query string.
- **`ApplicationError`** is `{ campo?: string; codigo: string; mensagem: string }`. Use `fieldFailure(campo, codigo, mensagem)` from `src/shared/result.ts` for an error anchored to a field.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/shared/document/cpf.ts` | normalise, validate, format and generate a CPF; pure, no dependencies |
| `src/shared/document/index.ts` | re-exports the public surface of `cpf.ts` |
| `tests/shared/cpf.test.ts` | check-digit arithmetic and the generator property |
| `migrations/0007_cpf.sql` | opens the window: nullable column, shape CHECK, partial unique index |
| `migrations/0008_cpf_obrigatorio.sql` | closes the window: NOT NULL, uniqueness swapped, e-mail uniqueness dropped |
| `docs/ADR/0004-cpf-as-access-identifier.md` | the decision recorded, in the format of the existing ADRs |

**Modified**

| File | What changes |
|---|---|
| `config/.dependency-cruiser.js` | the `pure-domain` rule's comment now cites `shared/document/` |
| `src/identity/domain/user.ts` | the `User` type gains `cpf: string \| null` |
| `src/identity/infra/userRepository.ts` | reads and writes `cpf`; credential lookup by CPF |
| `src/identity/application/authenticate.ts` | accepts a CPF or an e-mail (phase A); CPF only (phase B) |
| `src/identity/application/inviteUser.ts` | requires a valid CPF; checks it against the guardian record |
| `src/academics/domain/guardian.ts` | the `Guardian` type gains `cpf: string \| null` |
| `src/academics/infra/guardianRepository.ts` | reads and writes `cpf`; gains `byId` |
| `src/academics/application/queries.ts` | exposes `guardianById` |
| `src/academics/index.ts` | publishes `guardianById` on the module's door |
| `src/academics/application/registerGuardian.ts` | accepts an optional CPF |
| `src/web/render.ts` | injects `formatCpf` into the template context |
| `src/web/templates/login.eta` | the identifier field |
| `src/web/routes/login.ts` | reads the new field |
| `src/web/templates/network/user_new.eta` | mandatory CPF field |
| `src/web/templates/network/users.eta` | CPF column |
| `src/web/routes/network.ts` | passes the CPF to the use case and fetches the guardian record |
| `src/web/templates/registrar/guardian_new.eta` | optional CPF field |
| `src/web/templates/registrar/guardians.eta` | CPF column |
| `src/web/routes/registrar.ts` | passes the CPF to the use case |
| `scripts/seed.ts` | writes and prints a CPF |
| `tests/support/factories.ts` | the factories generate CPFs |
| `tests/web/checklist.test.ts` | the log test starts holding for real |
| `tests/identity/authentication.test.ts` | login by CPF |

---

# PHASE A — opens the compatibility window

At the end of phase A: whoever has a CPF signs in with a CPF, whoever does not keeps signing in with an e-mail. The previous code ignores the new column, so a rollback is safe at any point.

---

### Task 1: The CPF module

**Files:**
- Create: `src/shared/document/cpf.ts`
- Create: `src/shared/document/index.ts`
- Test: `tests/shared/cpf.test.ts`
- Modify: `config/.dependency-cruiser.js` (comment of the `pure-domain` rule)

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeCpf(raw: string): string` · `isValidCpf(digits: string): boolean` · `formatCpf(digits: string): string` · `generateCpf(seed: number): string`. Every following task imports from `'../../shared/document'`.

- [ ] **Step 1: Write the failing test**

Create `tests/shared/cpf.test.ts`:

```ts
/*
 * The CPF is the access identifier (ADR 0004), and the check-digit arithmetic is the only thing
 * separating a typed number from a document.
 *
 * The generator is tested next to the validator on purpose: they are two sides of the same
 * algorithm, and `isValidCpf(generateCpf(n))` over a range of seeds brings the suite down if either
 * one is wrong — something a fixed table of cases would not catch.
 */

import { describe, expect, test } from 'bun:test';
import { formatCpf, generateCpf, isValidCpf, normalizeCpf } from '../../src/shared/document';

/** A well-known test CPF: both check digits close. It belongs to nobody. */
const VALID = '52998224725';
const SEEDS = 500;

describe('normalizeCpf', () => {
  test('strips punctuation, dashes and spaces', () => {
    expect(normalizeCpf(' 529.982.247-25 ')).toBe(VALID);
  });

  test('text with no digits at all becomes an empty string', () => {
    expect(normalizeCpf('sem número')).toBe('');
  });
});

describe('isValidCpf', () => {
  test('accepts a CPF with both check digits correct', () => {
    expect(isValidCpf(VALID)).toBe(true);
  });

  test('refuses when the last digit is wrong', () => {
    expect(isValidCpf('52998224724')).toBe(false);
  });

  test('refuses a length other than eleven', () => {
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('529982247250')).toBe(false);
  });

  test('refuses anything that is not digits only — normalisation comes first', () => {
    expect(isValidCpf('529.982.247-25')).toBe(false);
  });

  /* A repeated sequence satisfies the check-digit arithmetic and is still nobody's CPF. */
  test('refuses a sequence of repeated digits', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
  });
});

describe('formatCpf', () => {
  test('applies the mask', () => {
    expect(formatCpf(VALID)).toBe('529.982.247-25');
  });

  test('input that is not a CPF returns the em dash the other screens use', () => {
    expect(formatCpf('')).toBe('—');
  });
});

describe('generateCpf', () => {
  test('the same seed always returns the same CPF', () => {
    expect(generateCpf(0)).toBe('10000000019');
    expect(generateCpf(0)).toBe(generateCpf(0));
  });

  test('everything the generator produces passes the validator', () => {
    const invalid = Array.from({ length: SEEDS }, (_, i) => generateCpf(i)).filter(
      (cpf) => !isValidCpf(cpf),
    );

    expect(invalid).toEqual([]);
  });

  test('distinct seeds never collide', () => {
    const generated = Array.from({ length: SEEDS }, (_, i) => generateCpf(i));

    expect(new Set(generated).size).toBe(SEEDS);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
bun test tests/shared/cpf.test.ts
```

Expected: an import failure — `Cannot find module '../../src/shared/document'`.

- [ ] **Step 3: Implement the module**

Create `src/shared/document/cpf.ts`:

```ts
/**
 * CPF: normalise, validate, format and generate.
 *
 * A pure module — it knows nothing about the database, HTTP, logging or the domain. That is what
 * lets `identity` and `academics` use the same arithmetic without one depending on the other, and
 * what keeps the Stage 14 graph extractable.
 *
 * `generateCpf` exists for the seed and the test fixtures. It has no production use: nothing in the
 * system invents a person's CPF.
 */

const ONLY_DIGITS = /^[0-9]{11}$/;
const ALL_EQUAL = /^(\d)\1{10}$/;
const NON_DIGIT = /\D/g;

/** The same em dash `formatDate` and `formatGrade` use for a missing value. */
const MISSING = '—';

/** Whoever typed the dots and dashes and whoever typed it raw must arrive at the same place. */
export const normalizeCpf = (raw: string): string => raw.replace(NON_DIGIT, '');

/**
 * Each check digit is the sum of the digits weighted in descending order, times ten, modulo eleven —
 * and a remainder of ten becomes zero. The first weights from 10 over nine digits; the second, from
 * 11 over ten.
 */
const checkDigit = (digits: string, initialWeight: number): number => {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    sum += Number(digits[index]) * (initialWeight - index);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
};

const withCheckDigits = (base: string): string => {
  const first = checkDigit(base, 10);
  const second = checkDigit(`${base}${first}`, 11);
  return `${base}${first}${second}`;
};

/**
 * A repeated sequence is refused separately because it **passes** the arithmetic: `111.111.111-11`
 * closes both check digits. It is the most common filling of a form answered carelessly.
 */
export function isValidCpf(digits: string): boolean {
  if (!ONLY_DIGITS.test(digits)) return false;
  if (ALL_EQUAL.test(digits)) return false;
  return digits === withCheckDigits(digits.slice(0, 9));
}

/** `52998224725` becomes `529.982.247-25`; anything that is not a CPF returns the em dash. */
export function formatCpf(digits: string): string {
  if (!ONLY_DIGITS.test(digits)) return MISSING;
  const [a, b, c, d] = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
    digits.slice(9),
  ];
  return `${a}.${b}.${c}-${d}`;
}

/**
 * A fixed two-digit prefix whose digits differ from each other: the base is never uniform, so there
 * is no case to skip — and skipping cases is exactly what would make two seeds land on one CPF.
 */
const BASE_PREFIX = '10';
const SEED_DIGITS = 7;
const SEED_RANGE = 10 ** SEED_DIGITS;

/** A valid, deterministic CPF from a seed. Injective for a seed in [0, 10,000,000). */
export function generateCpf(seed: number): string {
  const remainder = String(Math.abs(Math.trunc(seed)) % SEED_RANGE).padStart(SEED_DIGITS, '0');
  return withCheckDigits(`${BASE_PREFIX}${remainder}`);
}
```

Create `src/shared/document/index.ts`:

```ts
export { formatCpf, generateCpf, isValidCpf, normalizeCpf } from './cpf';
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
bun test tests/shared/cpf.test.ts
```

Expected: everything passes. If `generateCpf(0)` does not yield `10000000019`, the check-digit arithmetic is wrong — check the weights before touching the test.

- [ ] **Step 5: Update the dependency rule's comment**

In `config/.dependency-cruiser.js`, in the `pure-domain` rule, the comment today says *"It may only reach `src/shared/ports/` and `src/shared/result.ts`"*. Replace that sentence with:

```
'It may only reach `src/shared/ports/`, `src/shared/result.ts` and `src/shared/document/` — ' +
'the last one because it is a pure value, with no I/O and no business rule from any module: the ' +
'CPF arithmetic is the same for identity and for academics, and duplicating it would be worse ' +
'than sharing it. '
```

Do not touch `from`, `to` or `severity`. The rule already allowed this; what was wrong was the text promising more rigour than the tool applies.

- [ ] **Step 6: Verify and commit**

```bash
bun run verify
git status --short
git add src/shared/document/cpf.ts src/shared/document/index.ts tests/shared/cpf.test.ts config/.dependency-cruiser.js
```

Ask the user for authorisation and then:

```bash
git commit -m "feat(shared): CPF module with validation, formatting and generation"
```

---

### Task 2: Migration 0007 and the column in both modules

**Files:**
- Create: `migrations/0007_cpf.sql`
- Modify: `src/identity/domain/user.ts`, `src/identity/infra/userRepository.ts`
- Modify: `src/academics/domain/guardian.ts`, `src/academics/infra/guardianRepository.ts`
- Modify: `tests/support/factories.ts`

**Interfaces:**
- Consumes: `generateCpf` from Task 1 (in the factories only).
- Produces: `User.cpf: string | null` · `Guardian.cpf: string | null` · `userRepository.credentialsByCpf(sql, networkId, cpf)` with the same return shape as `credentialsByEmail` · `userRepository.cpfExists(sql, networkId, cpf)` · `academics.guardianById(networkId, guardianId): Promise<Guardian | null>`, a new public door that Task 6 consumes.

- [ ] **Step 1: Write the migration**

Create `migrations/0007_cpf.sql`:

```sql
-- CPF as the access identifier (ADR 0004).
-- The first of the two steps of the compatibility window (I6, ADR 0003): the column is born nullable
-- so the previous version of the code keeps starting and so a rollback loses no row.
-- The second step, 0008, can only run once every user has a CPF.

ALTER TABLE app_user ADD COLUMN cpf text;
ALTER TABLE guardian ADD COLUMN cpf text;

-- The database guarantees the shape; the check digits are a domain rule and live in
-- `shared/document/cpf.ts`. The same division that already applies to uniqueness and format
-- in every table.
ALTER TABLE app_user ADD CONSTRAINT user_cpf_format
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
ALTER TABLE guardian ADD CONSTRAINT guardian_cpf_format
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

-- A PARTIAL index: during the window there are rows without a CPF, and without the WHERE the first
-- of them would block the second. Several NULLs do not collide with one another.
CREATE UNIQUE INDEX user_cpf_unique_in_network
  ON app_user (network_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX guardian_cpf_unique_in_network
  ON guardian (network_id, cpf) WHERE cpf IS NOT NULL;
```

- [ ] **Step 2: Apply and confirm**

```bash
bun run migrate && bun run migrate:status
```

Expected: `0007_cpf` applied.

- [ ] **Step 3: Write the failing test**

Add to `tests/identity/users.test.ts`, following the file's style (`beforeEach(clearDatabase)` and the factories):

```ts
test('the CPF written at invitation time comes back when the user is read', async () => {
  const network = await createNetwork({});
  const school = await createSchool({ networkId: network.id });

  const invitation = await identity.inviteUser({
    networkId: network.id,
    name: 'Marina Alves Correia',
    email: 'marina@escolaviva.test',
    cpf: '52998224725',
    roleAssignments: [{ schoolId: school.id, role: 'registrar' }],
  });
  if (!invitation.ok) throw new Error('invitation refused in the scenario');
  // `identity` exposes no query for a user by id, and creating a public door just to satisfy a test
  // would be scope nobody asked for. `checklist.test.ts` already asserts "the row landed in the
  // database" in exactly this way.
  const rows = await testSql()<{ cpf: string }[]>`
    SELECT cpf FROM app_user WHERE id = ${invitation.valor.userId}`;

  expect(rows[0]?.cpf).toBe('52998224725');
});
```

Import `testSql` from `../support/database`.

- [ ] **Step 4: Run and confirm the failure**

```bash
bun test tests/identity/users.test.ts
```

Expected: a type error on `cpf` — `inviteUser` does not accept the field yet, which Task 4 resolves. Mark this test with `test.skip` and the comment `// enabled in Task 4` so it does not block the rest of this task.

- [ ] **Step 5: Carry `cpf` into the domain and the repositories**

In `src/identity/domain/user.ts`, add `cpf: string | null` to the `User` type, right after `email` — the same position the column occupies in the table.

In `src/identity/infra/userRepository.ts`:
- add `cpf` to every `SELECT` column list and to the row mapping (`cpf: row.cpf`);
- add `cpf` to `INSERT INTO app_user (...)` and to the value list;
- add the credential lookup by CPF, a twin of the one that already exists by e-mail:

```ts
/** Twin of `credentialsByEmail`: during the window login can arrive through either one. */
export async function credentialsByCpf(
  sql: Connection,
  networkId: string,
  cpf: string,
): Promise<Credentials | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, network_id, name, email, cpf, active, guardian_id, password_hash
      FROM app_user
     WHERE network_id = ${networkId} AND cpf = ${cpf} AND active
  `;
  const row = rows[0];
  return row === undefined ? null : credentialsFromRow(row);
}

/** Twin of `emailExists`. The partial index from 0007 would refuse anyway; this query exists so
    the refusal reaches the screen as a field error rather than as a constraint failure. */
export async function cpfExists(
  sql: Connection,
  networkId: string,
  cpf: string,
): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT true AS exists FROM app_user WHERE network_id = ${networkId} AND cpf = ${cpf} LIMIT 1
  `;
  return rows.length > 0;
}
```

Use the type names and mapping function that already exist in the file — do not invent new names.

Do the equivalent in `src/academics/domain/guardian.ts` (`cpf: string | null` after `email`) and in `src/academics/infra/guardianRepository.ts`.

**The `academics` module has no query for a guardian by id yet** — today there are only `listGuardians`, `guardiansPage` and `studentGuardiansPage`. Task 6 needs one to check the invitation's CPF, so it is born here. In the repository:

```ts
/** A guardian by key. The web layer uses it at invitation time, to compare the CPF typed. */
export async function byId(
  sql: Connection,
  networkId: string,
  guardianId: string,
): Promise<Guardian | null> {
  const rows = await sql<GuardianRow[]>`
    SELECT id, network_id, name, email, phone, cpf
      FROM guardian
     WHERE network_id = ${networkId} AND id = ${guardianId}
  `;
  const row = rows[0];
  return row === undefined ? null : guardianFromRow(row);
}
```

In `src/academics/application/queries.ts`, expose it in the same shape as the neighbouring queries:

```ts
export function guardianById(networkId: string, guardianId: string): Promise<Guardian | null> {
  return guardians.byId(reader(), networkId, guardianId);
}
```

and add `guardianById` to the object exported from `src/academics/index.ts`, next to `listGuardians`.

- [ ] **Step 6: Generate CPFs in the test factories**

In `tests/support/factories.ts`, `createUser` and `createGuardian` start writing `cpf: generateCpf(next())` when the caller does not supply one — `next()` is the counter the file already uses to give names and e-mails uniqueness. Import `generateCpf` from `../../src/shared/document`. Accept `cpf` as an option, including `null`, for the tests that need a specific value or its absence.

Add `cpf` to the `TestUser` and `TestGuardian` types so the authentication tests can read `scenario.registrar.cpf`.

- [ ] **Step 7: Verify and commit**

```bash
bun run verify
git status --short
git add migrations/0007_cpf.sql src/identity/domain/user.ts src/identity/infra/userRepository.ts src/academics/domain/guardian.ts src/academics/infra/guardianRepository.ts src/academics/application/queries.ts src/academics/index.ts tests/support/factories.ts
```

Ask for authorisation and then:

```bash
git commit -m "feat(db): cpf column on app_user and guardian, nullable during the window"
```

---

### Task 3: Guardian registration with an optional CPF

**Files:**
- Modify: `src/academics/application/registerGuardian.ts`
- Test: `tests/academics/registrations.test.ts` (where `registerGuardian` is already exercised)

**Interfaces:**
- Consumes: `isValidCpf`, `normalizeCpf` (Task 1); `Guardian.cpf` (Task 2).
- Produces: `registerGuardian` accepts `cpf?: string | null` and returns a `Guardian` with `cpf` normalised or `null`.

- [ ] **Step 1: Write the failing tests**

```ts
test('registers a guardian without a CPF — the foreign guardian exists as a contact', async () => {
  const network = await createNetwork({});

  const created = await academics.registerGuardian({
    networkId: network.id,
    name: 'Aiko Tanaka',
    email: 'aiko@escolaviva.test',
    cpf: '',
  });

  expect(created.ok).toBe(true);
  if (created.ok) expect(created.valor.cpf).toBeNull();
});

test('refuses a CPF with a wrong check digit', async () => {
  const network = await createNetwork({});

  const created = await academics.registerGuardian({
    networkId: network.id,
    name: 'Marcos Vinícius Pires',
    email: 'marcos@escolaviva.test',
    cpf: '52998224724',
  });

  expect(created.ok).toBe(false);
  if (!created.ok) expect(created.erros[0]?.campo).toBe('cpf');
});

test('stores the CPF as digits only, even when typed with punctuation', async () => {
  const network = await createNetwork({});

  const created = await academics.registerGuardian({
    networkId: network.id,
    name: 'Heloísa Braga Sampaio',
    email: 'heloisa@escolaviva.test',
    cpf: '529.982.247-25',
  });

  expect(created.ok).toBe(true);
  if (created.ok) expect(created.valor.cpf).toBe('52998224725');
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
bun test tests/academics
```

Expected: a type error on `cpf`.

- [ ] **Step 3: Implement**

In `src/academics/application/registerGuardian.ts`, add to the Zod schema, after `phone`:

```ts
  // A blank field is the absence of a CPF, not an empty CPF: the foreign guardian exists as a
  // contact and simply cannot receive portal access until they supply the document.
  cpf: z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value === undefined || value === '' ? null : normalizeCpf(value)))
    .refine((value) => value === null || isValidCpf(value), 'Informe um CPF válido.'),
```

Import `isValidCpf` and `normalizeCpf` from `'../../shared/document'` and add `cpf?: string | null` to the signature of `registerGuardian`.

- [ ] **Step 4: Run and confirm it passes**

```bash
bun test tests/academics
```

- [ ] **Step 5: Verify and commit**

```bash
bun run verify
git status --short
git add src/academics/application/registerGuardian.ts tests/academics/registrations.test.ts
```

Ask for authorisation and then:

```bash
git commit -m "feat(academics): optional CPF when registering a guardian"
```

---

### Task 4: The invitation requiring a CPF

**Files:**
- Modify: `src/identity/application/inviteUser.ts`
- Test: `tests/identity/users.test.ts`

**Interfaces:**
- Consumes: `isValidCpf`, `normalizeCpf` (Task 1); `cpfExists`, `User.cpf` (Task 2).
- Produces: `inviteUser` now requires `cpf: string` and accepts `registeredCpf?: string | null`.

**Context the implementer needs.** Two things govern this file:

1. `inviteUser` writes the user and the roles in the **same** unit of work — an invitation that created the person and then failed to grant the role would leave someone able to sign in and see no screen at all. New checks go **inside** that transaction, next to the ones already there.
2. `identity` **may not** import `academics`. The `no-cross-module-shortcut` rule forbids it, and the permitted graph is `academics → identity`, never the other way. That is why the guardian record's CPF **arrives as a parameter**: whoever fetches it is the web layer, in Task 6, which already orchestrates both modules.

- [ ] **Step 1: Write the failing tests**

```ts
test('refuses an invitation with an invalid CPF', async () => {
  const network = await createNetwork({});
  const school = await createSchool({ networkId: network.id });

  const invitation = await identity.inviteUser({
    networkId: network.id, name: 'Rui Barbosa Neto', email: 'rui@escolaviva.test',
    cpf: '11111111111',
    roleAssignments: [{ schoolId: school.id, role: 'registrar' }],
  });

  expect(invitation.ok).toBe(false);
  if (!invitation.ok) expect(invitation.erros[0]?.campo).toBe('cpf');
});

test('refuses a CPF already used by another user of the same network', async () => {
  const network = await createNetwork({});
  const school = await createSchool({ networkId: network.id });
  await createUser({ networkId: network.id, cpf: '52998224725', roles: [] });

  const invitation = await identity.inviteUser({
    networkId: network.id, name: 'Outra Pessoa', email: 'outra@escolaviva.test',
    cpf: '52998224725',
    roleAssignments: [{ schoolId: school.id, role: 'registrar' }],
  });

  expect(invitation.ok).toBe(false);
  if (!invitation.ok) expect(invitation.erros[0]?.campo).toBe('cpf');
});

test('the same CPF in another network is accepted — uniqueness is per tenant', async () => {
  const a = await createNetwork({});
  const b = await createNetwork({});
  const schoolB = await createSchool({ networkId: b.id });
  await createUser({ networkId: a.id, cpf: '52998224725', roles: [] });

  const invitation = await identity.inviteUser({
    networkId: b.id, name: 'Homônimo de Outra Rede', email: 'homonimo@escolaviva.test',
    cpf: '52998224725',
    roleAssignments: [{ schoolId: schoolB.id, role: 'registrar' }],
  });

  expect(invitation.ok).toBe(true);
});

test('refuses when the CPF typed diverges from the guardian record', async () => {
  const network = await createNetwork({});
  const school = await createSchool({ networkId: network.id });
  const guardian = await createGuardian({ networkId: network.id, cpf: '52998224725' });

  const invitation = await identity.inviteUser({
    networkId: network.id, name: 'Mãe do Aluno', email: 'mae@escolaviva.test',
    cpf: generateCpf(1),
    guardianId: guardian.id,
    registeredCpf: guardian.cpf,
    registeredName: guardian.name,
    roleAssignments: [{ schoolId: school.id, role: 'guardian' }],
  });

  expect(invitation.ok).toBe(false);
  if (!invitation.ok) {
    expect(invitation.erros[0]?.campo).toBe('cpf');
    expect(invitation.erros[0]?.mensagem).toContain(guardian.name);
    expect(invitation.erros[0]?.mensagem).not.toContain(guardian.cpf);
  }
});

/* During the window the old records still have no CPF; requiring one would block a flow that used
   to work, which is the opposite of what compatibility promises. */
test('accepts when the guardian record has no CPF yet', async () => {
  const network = await createNetwork({});
  const school = await createSchool({ networkId: network.id });
  const guardian = await createGuardian({ networkId: network.id, cpf: null });

  const invitation = await identity.inviteUser({
    networkId: network.id, name: 'Pai do Aluno', email: 'pai@escolaviva.test',
    cpf: generateCpf(2),
    guardianId: guardian.id,
    registeredCpf: null,
    registeredName: guardian.name,
    roleAssignments: [{ schoolId: school.id, role: 'guardian' }],
  });

  expect(invitation.ok).toBe(true);
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
bun test tests/identity/users.test.ts
```

- [ ] **Step 3: Implement**

In the schema of `inviteUser.ts`, after `email`:

```ts
  cpf: z
    .string()
    .trim()
    .transform(normalizeCpf)
    .refine(isValidCpf, 'Informe um CPF válido.'),
  // The guardian record lives in `academics`, and `identity` may not reach it: whoever fetches it is
  // the web layer, which already orchestrates both modules. Only what the rule compares arrives here.
  registeredCpf: z.string().nullable().optional(),
  registeredName: z.string().optional(),
```

Add `cpf: string`, `registeredCpf?: string | null` and `registeredName?: string` to the signature, and `cpf: data.cpf` to the `User` object assembled at the end of the function.

Before assembling the user, the check:

```ts
  // It only checks when the record already has a CPF. Without a CPF there is no divergence to
  // prevent — that is what keeps the invitation working for guardians registered before 0007.
  const registeredCpf = data.registeredCpf ?? null;
  if (registeredCpf !== null && registeredCpf !== data.cpf) {
    return fieldFailure(
      'cpf',
      'cpf_diverge_do_cadastro',
      `O CPF não confere com o do cadastro de ${data.registeredName ?? 'responsável'}.`,
    );
  }
```

Inside the write, right after the `emailExists` check:

```ts
    if (await userRepository.cpfExists(sql, user.networkId, user.cpf)) {
      return fieldFailure('cpf', 'cpf_em_uso', 'já existe usuário com este CPF na rede');
    }
```

The message cites the **name** and never the number: whoever creates the access has the document in hand, and the screen is no place to publish somebody else's CPF.

- [ ] **Step 4: Run and confirm it passes**

```bash
bun test tests/identity/users.test.ts
```

Re-enable the test Task 2 marked with `test.skip`.

- [ ] **Step 5: Verify and commit**

```bash
bun run verify
git status --short
git add src/identity/application/inviteUser.ts src/identity/infra/userRepository.ts tests/identity/users.test.ts
```

Ask for authorisation and then:

```bash
git commit -m "feat(identity): the invitation requires a valid CPF and checks it against the record"
```

---

### Task 5: Authentication by CPF or e-mail

**Files:**
- Modify: `src/identity/application/authenticate.ts`
- Test: `tests/identity/authentication.test.ts`

**Interfaces:**
- Consumes: `normalizeCpf` (Task 1); `credentialsByCpf` (Task 2).
- Produces: `authenticate({ networkSlug, identifier, password, ip })` — the `email` field is renamed `identifier`.

**Context:** `authenticate.ts` keeps a `SECURITY.nonexistentUserHash` that is verified when nobody is found, so the answer takes the same time in both cases. **That behaviour must not be lost** — without it the clock starts telling people who works at the network.

- [ ] **Step 1: Write the failing tests**

```ts
test('signs in with a raw CPF', async () => {
  const scenario = await fullScenario();

  const attempt = await identity.authenticate({
    networkSlug: scenario.network.slug,
    identifier: scenario.registrar.cpf,
    password: scenario.password,
    ip: '',
  });

  expect(attempt.ok).toBe(true);
});

test('signs in with a punctuated CPF', async () => {
  const scenario = await fullScenario();
  const cpf = scenario.registrar.cpf;
  const punctuated = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

  const attempt = await identity.authenticate({
    networkSlug: scenario.network.slug, identifier: punctuated, password: scenario.password, ip: '',
  });

  expect(attempt.ok).toBe(true);
});

/* Removed in PHASE B, along with the e-mail branch. The removal is part of the demonstration. */
test('during the window, an e-mail still signs in', async () => {
  const scenario = await fullScenario();

  const attempt = await identity.authenticate({
    networkSlug: scenario.network.slug, identifier: scenario.registrar.email,
    password: scenario.password, ip: '',
  });

  expect(attempt.ok).toBe(true);
});

test('a nonexistent CPF and a wrong password give the same refusal', async () => {
  const scenario = await fullScenario();

  const [nonexistent, wrongPassword] = await Promise.all([
    identity.authenticate({
      networkSlug: scenario.network.slug, identifier: generateCpf(999_999),
      password: scenario.password, ip: '',
    }),
    identity.authenticate({
      networkSlug: scenario.network.slug, identifier: scenario.registrar.cpf,
      password: 'errada', ip: '',
    }),
  ]);

  expect(nonexistent.ok).toBe(false);
  expect(wrongPassword.ok).toBe(false);
  if (!nonexistent.ok && !wrongPassword.ok) {
    expect(nonexistent.erros).toEqual(wrongPassword.erros);
  }
});
```

- [ ] **Step 2: Run and confirm the failure**

```bash
bun test tests/identity/authentication.test.ts
```

- [ ] **Step 3: Implement**

In `authenticate.ts`, rename `email` to `identifier` in the schema (message `'informe o CPF'`) and in the signature. Replace the credential lookup with:

```ts
/**
 * During the compatibility window the same field accepts both shapes, and the at sign decides: an
 * e-mail has one, a CPF does not. It goes away in PHASE B, once every user has a CPF.
 */
const credentialsFor = async (
  sql: Connection,
  networkId: string,
  identifier: string,
): Promise<Credentials | null> =>
  identifier.includes('@')
    ? await userRepository.credentialsByEmail(sql, networkId, normalizedEmail(identifier))
    : await userRepository.credentialsByCpf(sql, networkId, normalizeCpf(identifier));
```

and, in the body of `authenticate`, `const credentials = await credentialsFor(sql, network.id, data.identifier);`.

Change `MESSAGES.login.invalidCredentials` to `'CPF ou senha inválidos'`. `SECURITY.nonexistentUserHash` and the constant-time comparison stay **exactly** as they are.

- [ ] **Step 4: Run and confirm it passes**

```bash
bun test tests/identity/authentication.test.ts
```

- [ ] **Step 5: Verify and commit**

```bash
bun run verify
git status --short
git add src/identity/application/authenticate.ts tests/identity/authentication.test.ts
```

Ask for authorisation and then:

```bash
git commit -m "feat(identity): authentication by CPF, with e-mail accepted during the window"
```

---

### Task 6: The web layer

**Files:**
- Modify: `src/web/render.ts`, `src/web/routes/login.ts`, `src/web/templates/login.eta`
- Modify: `src/web/routes/network.ts`, `src/web/templates/network/user_new.eta`, `src/web/templates/network/users.eta`
- Modify: `src/web/routes/registrar.ts`, `src/web/templates/registrar/guardian_new.eta`, `src/web/templates/registrar/guardians.eta`
- Test: `tests/web/form_pages.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 5.
- Produces: `it.formatCpf` available in every template.

- [ ] **Step 1: Inject `formatCpf` into the template context**

In `src/web/render.ts`, import `formatCpf` from `'../shared/document'` and add it to the `helpers` object, next to `formatDate`. One line; no other change to the file.

- [ ] **Step 2: Change the login field**

In `src/web/templates/login.eta`, the `email` field becomes `identificador`, with the label **"CPF ou e-mail"**, `inputmode="numeric"`, `autocomplete="username"` and help text saying the CPF can be typed with or without dots. In `src/web/routes/login.ts`, `text(body, 'email')` becomes `text(body, 'identificador')`; the local variable and the `values` object of the sign-in screen follow.

The label says both things because the screen **accepts** both things in this phase. It narrows in PHASE B.

- [ ] **Step 3: Put the CPF on the invitation and the user list**

In `user_new.eta`, a mandatory CPF field before the e-mail, with help text *"É por ele que a pessoa entra. Com ou sem pontos."* The e-mail gains new help text: *"Contato. Não é usado para entrar."*

In `network.ts`, `POST /users` reads `cpf` from the body and passes it along. When `guardianId` is not empty, fetch the record with `academics.guardianById(networkId, guardianId)` — the door created in Task 2 — and pass `registeredCpf: record?.cpf ?? null` and `registeredName: record?.name`. This is where cross-module orchestration happens, and it is the only place where it can: the user form already does the same kind of combination when it joins `identity.listSchools` with `academics.listGuardians`.

In `users.eta`, a "CPF" column after the name: `<td class="numero"><%= it.formatCpf(user.cpf ?? '') %></td>`.

- [ ] **Step 4: Put the CPF on guardian registration and the guardian list**

In `guardian_new.eta`, an **optional** CPF field after the e-mail, with help text *"Opcional. Sem CPF a pessoa fica como contato e não recebe acesso ao portal."* In `registrar.ts`, `POST /guardians` reads `cpf` and passes it along. In `guardians.eta`, a "CPF" column with the same treatment as the user list.

- [ ] **Step 5: Write the screen tests**

Add to `tests/web/form_pages.test.ts`:

```ts
test('the sign-in screen asks for a CPF', async () => {
  const html = await (await open('/login')).text();

  expect(html).toContain('name="identificador"');
});

test('the invitation refuses a CPF that diverges from the record, without publishing the number', async () => {
  const scenario = await fullScenario();
  const cookie = await signInAs(scenario, 'network_admin');
  const guardian = scenario.guardians[0];

  const response = await send('/network/users', {
    name: 'Mãe do Aluno', email: 'mae@escolaviva.test', cpf: generateCpf(987_654),
    guardianId: guardian.id, 'schools[]': scenario.schools[0].id, 'roles[]': 'guardian',
  }, cookie);
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain('id="cpf-error"');
  expect(html).toContain(guardian.name);
  expect(html).not.toContain(guardian.cpf);
});
```

The last `expect` is the rule written as a test: the message cites the name, never the number.

- [ ] **Step 6: Verify and commit**

```bash
bun run verify
git status --short
git add src/web/render.ts src/web/routes/login.ts src/web/templates/login.eta src/web/routes/network.ts src/web/templates/network/user_new.eta src/web/templates/network/users.eta src/web/routes/registrar.ts src/web/templates/registrar/guardian_new.eta src/web/templates/registrar/guardians.eta tests/web/form_pages.test.ts
```

Ask for authorisation and then:

```bash
git commit -m "feat(web): CPF on the login, the invitation and guardian registration"
```

---

### Task 7: Seed and the privacy proof

**Files:**
- Modify: `scripts/seed.ts`
- Modify: `tests/web/checklist.test.ts`

**Interfaces:**
- Consumes: `generateCpf` (Task 1).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write and print the CPF in the seed**

In `scripts/seed.ts`, every `app_user` and every `guardian` receives `cpf: generateCpf(index)`, with the same index that already gives the e-mails uniqueness. The credentials block printed at the end gains a CPF column, formatted — the database is for teaching and already publishes the password.

- [ ] **Step 2: Make the log test hold for real**

`tests/web/checklist.test.ts` already has `const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/` and asserts that no log contains a CPF, but today it passes vacuously: there is no CPF in the system. In the scenario used by the log flow, give the teacher an unmistakable CPF, return it in the scenario object, and add it to the `forbidden` list of the test `'nenhum valor pessoal do cenário aparece em linha de log'`, next to name, e-mail and grade. Also add:

```ts
expect(captured.raw).not.toContain(TEACHER_CPF);
```

Raw, not formatted: the log writes digits, and it is the raw form that would leak.

- [ ] **Step 3: Run the seed end to end**

```bash
bun run seed && bun run verify
```

Expected: the seed completes, prints CPFs, and the suite stays green.

- [ ] **Step 4: Commit**

```bash
git status --short
git add scripts/seed.ts tests/web/checklist.test.ts
```

Ask for authorisation and then:

```bash
git commit -m "feat(seed): a generated CPF for every user and guardian"
```

**PHASE A complete.** Confirm with the user before continuing: whoever has a CPF signs in with a CPF, whoever does not signs in with an e-mail, and a rollback is safe at any point.

---

# PHASE B — closes the window

---

### Task 8: Mandatory CPF and the end of e-mail login

**Files:**
- Create: `migrations/0008_cpf_obrigatorio.sql`
- Create: `docs/ADR/0004-cpf-as-access-identifier.md`
- Modify: `src/identity/application/authenticate.ts`, `src/identity/domain/user.ts`
- Modify: `src/web/templates/login.eta`, `src/web/routes/login.ts`
- Modify: `tests/identity/authentication.test.ts`

**Interfaces:**
- Consumes: everything from PHASE A.
- Produces: `User.cpf: string` (no longer nullable).

- [ ] **Step 1: Write the migration**

Create `migrations/0008_cpf_obrigatorio.sql`:

```sql
-- Closes the window opened by 0007 (ADR 0003). It can only run once every user has a CPF —
-- in a teaching database, after `bun run seed`.
-- The e-mail stays NOT NULL because it is the Stage 04 contact; what it stops being is unique,
-- a constraint that only made sense while it identified. A mother and a father can now share one
-- family e-mail.

ALTER TABLE app_user ALTER COLUMN cpf SET NOT NULL;

DROP INDEX user_cpf_unique_in_network;
ALTER TABLE app_user ADD CONSTRAINT user_cpf_unique_in_network UNIQUE (network_id, cpf);

ALTER TABLE app_user DROP CONSTRAINT user_email_unique_in_network;
```

`guardian.cpf` is **not** touched: it stays nullable forever, with the partial index from 0007. That is the decision about the guardian without a CPF.

- [ ] **Step 2: Apply**

```bash
bun run seed && bun run migrate && bun run migrate:status
```

The `seed` comes first on purpose: `SET NOT NULL` fails if any row lacks a CPF, and that failure is exactly what the window exists to avoid in production.

- [ ] **Step 3: Swap the window test**

In `tests/identity/authentication.test.ts`, **delete** the test `'during the window, an e-mail still signs in'` — the removal is part of the demonstration — and put this in its place:

```ts
test('an e-mail no longer signs in — the identifier is the CPF', async () => {
  const scenario = await fullScenario();

  const attempt = await identity.authenticate({
    networkSlug: scenario.network.slug, identifier: scenario.registrar.email,
    password: scenario.password, ip: '',
  });

  expect(attempt.ok).toBe(false);
});
```

- [ ] **Step 4: Run and confirm the failure**

```bash
bun test tests/identity/authentication.test.ts
```

Expected: the new test fails — the e-mail branch is still there.

- [ ] **Step 5: Remove the e-mail branch**

In `authenticate.ts`, `credentialsFor` goes away and the lookup becomes a single call again:

```ts
  const credentials = await userRepository.credentialsByCpf(
    sql,
    network.id,
    normalizeCpf(data.identifier),
  );
```

Delete the `normalizedEmail` import if it is left unused. In `src/identity/domain/user.ts`, `cpf` stops being `string | null` and becomes `string`; fix everything `tsc` flags.

In `login.eta`, the field is renamed `cpf`, with the label **"CPF"** and no mention of e-mail; in `login.ts`, `text(body, 'identificador')` becomes `text(body, FIELDS.login.cpf)`.

- [ ] **Step 6: Run and confirm it passes**

```bash
bun run verify
```

- [ ] **Step 7: Write the ADR**

Create `docs/ADR/0004-cpf-as-access-identifier.md` **in the format of the three existing ADRs** — read `docs/ADR/0003-migration-compatibility-window.md` before writing and follow its structure. The content comes from the spec: context (the e-mail was piling up identification and contact, and the product promised an equality the model did not guarantee), decision (the CPF, immutable), consequences (the e-mail stops being unique; a guardian without a CPF gets no portal; the CPF is personal data and enters log redaction) and the rejected alternative (keeping the e-mail and merely making the divergence visible on screen).

- [ ] **Step 8: Commit**

```bash
git status --short
git add migrations/0008_cpf_obrigatorio.sql src/identity/application/authenticate.ts src/identity/domain/user.ts src/web/templates/login.eta src/web/routes/login.ts tests/identity/authentication.test.ts docs/ADR/0004-cpf-as-access-identifier.md
```

Ask for authorisation and then:

```bash
git commit -m "feat(identity): mandatory CPF, end of e-mail login"
```

---

## Final check

- [ ] `bun run verify` green
- [ ] `bun run seed` completes and prints a CPF next to the credentials
- [ ] signing in through the screen with a punctuated CPF and with a raw CPF
- [ ] signing in with an e-mail is refused
- [ ] `migrations/` has 0007 and 0008, and `bun run migrate:status` shows both applied
- [ ] `docs/ADR/0004-...` exists and follows the format of the previous ones
