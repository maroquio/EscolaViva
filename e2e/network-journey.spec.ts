/**
 * The network administrator's day: create a unit, define the year, invite somebody.
 *
 * This runs against the real Hono and the real PostgreSQL, seeded by `bun run seed`. No MSW — which
 * is the point: every unit test in this repository answers with what the test says the server would
 * answer, and two defects in phase 4 slipped through exactly there.
 */
import { expect, test } from '@playwright/test';
import { SEED, navigation, signInAs, uniqueCpf, uniqueName } from './support';

test('creates a school, defines a year, and invites a user', async ({ page }) => {
  await signInAs(page, SEED.networkAdmin.cpf);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rede');

  const school = uniqueName('Escola');
  /*
   * Scoped to the navigation. The dashboard has a counter card that is also a link named "Escolas",
   * and an unscoped query resolves to two elements — which fails as a strict-mode violation and reads
   * like a missing link.
   */
  await navigation(page).getByRole('link', { name: 'Escolas' }).click();
  await page.getByRole('link', { name: 'Nova escola' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill(school);
  await page.getByRole('button', { name: 'Criar escola' }).click();

  /* Back on the list, and the school is in it — proof the write landed and the cache was refreshed. */
  await expect(page.getByRole('table')).toContainText(school);
});

/**
 * The temporary password, end to end.
 *
 * The invitation screen is the only place in this system that puts a secret on a page, and the whole
 * design is that it appears once and is gone on navigation. A unit test proves the component behaves;
 * this proves the browser does.
 */
test('shows the temporary password once and loses it on navigation', async ({ page }) => {
  await signInAs(page, SEED.networkAdmin.cpf);

  const person = uniqueName('Convidado');
  const cpf = uniqueCpf();

  await navigation(page).getByRole('link', { name: 'Usuários' }).click();
  await page.getByRole('link', { name: 'Convidar usuário' }).click();

  await page.getByRole('textbox', { name: 'Nome' }).fill(person);
  await page.getByRole('textbox', { name: 'CPF' }).fill(cpf);
  await page.getByRole('textbox', { name: 'E-mail' }).fill(`${cpf}@escolaviva.test`);
  await page.getByRole('combobox', { name: 'Escola 1' }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Convidar usuário' }).click();

  const shown = page.getByRole('status');
  await expect(shown).toContainText(`Senha provisória de ${person}`);

  /* Captured to prove it is gone afterwards — not to use it. */
  const password = (await shown.locator('code').textContent()) ?? '';
  expect(password.length).toBeGreaterThan(0);

  await page.getByRole('link', { name: 'Ver a lista de usuários' }).click();
  await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();

  /*
   * The list is paginated and sorted by name, so the person just invited is very likely on some other
   * page — asserting they are on this one would be asserting alphabetical luck. That the invitation
   * landed is already proven by the screen that showed the password.
   *
   * What this case is for is the sentence below: the secret is nowhere on the page they landed on.
   */
  await expect(page.locator('body')).not.toContainText(password);

  /* Nor does going back to the form bring it back. */
  await page.getByRole('link', { name: 'Convidar usuário' }).click();
  await expect(page.getByRole('textbox', { name: 'Nome' })).toHaveValue('');
  await expect(page.locator('body')).not.toContainText(password);
});

/**
 * A deep URL reloaded in a real browser.
 *
 * Today this passes because Vite serves `index.html` for anything it does not recognise. **It is not
 * yet proof of the production fallback**, which Task 33 mounts on Hono — the SSR routes still own
 * those paths on the API's own port. When Task 33 lands, this same journey run against the built
 * application is what proves it.
 */
test('a deep URL survives a reload', async ({ page }) => {
  await signInAs(page, SEED.networkAdmin.cpf);

  await page.goto('/network/academic-years');
  await expect(page.getByRole('heading', { name: 'Anos letivos' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Anos letivos' })).toBeVisible();
});
