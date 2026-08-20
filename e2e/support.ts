/**
 * What every journey needs before it can do anything: a signed-in browser.
 *
 * **`signInAs` fills the form and clicks the button.** It does not `POST` to the API, and that is
 * half of what these journeys are for: the session cookie is first-party and travels through Vite's
 * proxy, and no unit test can prove that — MSW answers in the API's place, so the proxy is never
 * exercised.
 *
 * **It signs out first.** `POST /session` with a live session answers with the *current* user and
 * ignores the credentials in the body, so a journey that ran after another would silently act as the
 * previous person. That cost a real half-hour of confusion during phase 4, three times.
 *
 * The credentials are the seed's: network `demo`, the CPF the seed prints, and `escolaviva` for
 * everybody in the demo network. **Not** the suite's `teste-1234`, which belongs to the factories and
 * never reaches this database.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

export const NETWORK = 'demo';
export const PASSWORD = 'escolaviva';

export const SEED = {
  networkAdmin: { cpf: '10000000108', name: 'Marina Alves Correia' },
  registrar: { cpf: '10000000280', name: 'Eduarda Santos Teixeira' },
} as const;

/** The main navigation, which is where a journey clicks — never the whole page. */
export const navigation = (page: Page) =>
  page.getByRole('navigation', { name: 'Navegação principal' });

export async function signInAs(page: Page, cpf: string): Promise<void> {
  await page.goto('/login');

  /*
   * A session left over from an earlier journey would make the sign-in screen redirect to that
   * person's dashboard, and the form below would never appear. Clearing it is what makes each journey
   * independent of the order the file happens to run in.
   */
  await page.context().clearCookies();
  await page.goto('/login');

  await page.getByRole('textbox', { name: 'Rede' }).fill(NETWORK);
  await page.getByRole('textbox', { name: 'CPF' }).fill(cpf);
  await page.getByRole('textbox', { name: 'Senha' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
}

/**
 * Returns the database to the state the seed leaves it in: no closed terms, and none of the rows an
 * earlier run created.
 *
 * The teacher journey closes a term, which is the point of that case — and a closed term makes the
 * grade grid read-only, so the *next* run of the grade cases times out filling a disabled field. That
 * is exactly what happened the first time, and the failure read as "the field is not there". A test
 * that depends on state has to state the dependency.
 *
 * It runs `scripts/e2e-clean.ts` as a subprocess rather than importing it, because **Playwright runs
 * on Node and that script talks to PostgreSQL through `Bun.sql`**. Importing it fails with "Cannot
 * find package 'bun'", which is a true statement about the runtime and a confusing one to read in a
 * browser test.
 *
 * **It depends on `workers: 1`.** Wiping shared state from a `beforeAll` while another file is
 * running would delete rows that file is in the middle of asserting on. The config says one worker
 * for the same reason — these journeys share one database — and raising it would break this in a way
 * that looks like flakiness.
 */
export function resetToSeed(): void {
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
  execFileSync('bun', ['scripts/e2e-clean.ts'], { cwd: repositoryRoot, stdio: 'ignore' });
}

/**
 * A name nothing else in the database has, so a journey never collides with the seed or with itself.
 *
 * Every one carries the `[e2e]` mark, and that is not decoration: these journeys write to the
 * development database on purpose — proving the write lands is most of the point — and the mark is
 * what makes the rows findable afterwards. `bun run seed` rebuilds everything, but nobody should have
 * to reseed because a test ran.
 */
export const E2E_MARK = '[e2e]';

export const uniqueName = (prefix: string): string =>
  `${prefix} ${E2E_MARK} ${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/**
 * A CPF that passes the check digits, built from a random base.
 *
 * The journeys create people, and `identity` refuses an invalid CPF — so a random eleven digits would
 * fail for a reason that has nothing to do with what the journey is testing.
 */
export function uniqueCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));

  const digit = (digits: readonly number[]): number => {
    const weightStart = digits.length + 1;
    const sum = digits.reduce((total, value, index) => total + value * (weightStart - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const first = digit(base);
  const second = digit([...base, first]);
  return [...base, first, second].join('');
}
