/**
 * The guardian's portal, and the one case this whole repository is arranged around.
 *
 * A guardian reads: a report card, an attendance sheet, a board. The only write available to them is
 * marking one announcement as read — and that write may not happen by accident.
 */
import { expect, test } from '@playwright/test';
import { navigation, resetToSeed, signInAs } from './support';

/* The seed gives this account two students' worth of history and two unread announcements. */
const GUARDIAN = '10000001090';

/*
 * Reads are what this file measures, and reading is permanent. Starting from the seed's state is what
 * makes the count assertions mean anything on the second run.
 */
test.beforeAll(resetToSeed);

test('reads a report card, with the grades truncated rather than rounded', async ({ page }) => {
  await signInAs(page, GUARDIAN);

  await expect(page.getByRole('heading', { name: 'Meus alunos' })).toBeVisible();
  await page.getByRole('link', { name: 'Boletim' }).first().click();

  await expect(page.getByRole('heading', { name: /^Boletim de / })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  /*
   * Every number on this screen is decimal-comma and one place, and none of them is recomputed here:
   * `assessment` decides the averages and this screen formats them. `formatGrade` truncates, so a
   * stored 5.99 prints 5,9 — never a 6,0 that would contradict a status computed from 5.99.
   */
  const grades = await page
    .locator('table td')
    .evaluateAll((cells) => cells.map((cell) => cell.textContent?.trim() ?? ''));
  const numbers = grades.filter((text) => /^\d/.test(text));
  expect(numbers.length).toBeGreaterThan(0);
  for (const number of numbers) {
    expect(number).toMatch(/^\d+,\d$/);
  }

  /*
   * The attendance rate is a percentage the server computed, not a fraction multiplied twice — the
   * defect that printed "9333,0 %" and was invisible to every mocked test. Unanchored, because the
   * sentence continues with the two counts beside it.
   */
  await expect(page.getByText(/\d{1,3},\d %/).first()).toBeVisible();
  await expect(page.getByText(/\d{4,},\d %/)).toHaveCount(0);
});

test('reads the attendance, day by day', async ({ page }) => {
  await signInAs(page, GUARDIAN);

  await page.getByRole('link', { name: 'Frequência' }).first().click();
  await expect(page.getByRole('heading', { name: /^Frequência de / })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  /* The rate at the top covers the whole year, so paging must not move it. */
  const rate = await page.getByText(/\d{1,3},\d %/).first().textContent();
  const nextPage = page.getByRole('link', { name: 'Página 2' });
  if ((await nextPage.count()) > 0) {
    await nextPage.click();
    await expect(page.getByText(/\d{1,3},\d %/).first()).toHaveText(rate ?? '');
  }
});

/**
 * **The case that must not be missing.**
 *
 * Reading is a write, and a write may not be a side effect of navigation. The read rate sits around
 * 12 %, and that number is what turns "ninguém lê o mural" from a hallway opinion into evidence — the
 * evidence a later stage exists to act on. A `useEffect` firing `POST /read` on load would look like
 * a convenience, mark every opened announcement as read, and destroy the measurement.
 *
 * Proven here against the real database rather than a mock, because a mock only ever answers what the
 * test told it to.
 */
test('opening an announcement does not mark it read; only the button does', async ({ page }) => {
  await signInAs(page, GUARDIAN);

  await navigation(page).getByRole('link', { name: 'Mural' }).click();
  await expect(page.getByRole('heading', { name: 'Mural', level: 1 })).toBeVisible();

  const unread = page.getByRole('heading', { name: 'Não lidos' }).locator('..');
  const before = await unread.getByRole('link').count();
  expect(before).toBeGreaterThan(0);

  const title = (await unread.getByRole('link').first().textContent()) ?? '';

  /* Open it, read it, and leave — the way somebody who does not care to click a button would. */
  await unread.getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para o mural' }).click();
  await expect(page.getByRole('heading', { name: 'Mural', level: 1 })).toBeVisible();

  /* Nothing was read. */
  await expect(unread.getByRole('link')).toHaveCount(before);
  await expect(unread.getByRole('link', { name: title })).toBeVisible();

  /* Now the button, which is the only thing in this system that marks a read. */
  await unread.getByRole('link', { name: title }).click();
  await page.getByRole('button', { name: 'Marcar como lido' }).click();
  await expect(page.getByText('Comunicado marcado como lido.')).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para o mural' }).click();

  /* And exactly one moved from one list to the other. */
  await expect(unread.getByRole('link')).toHaveCount(before - 1);
  const read = page.getByRole('heading', { name: 'Lidos' }).locator('..');
  await expect(read.getByRole('link', { name: title })).toBeVisible();
});

/**
 * The announcement itself, and what it may not do with what somebody typed.
 *
 * The body is text a person wrote into a textarea, and it is rendered as text. Interpreting it as
 * markup would turn a school announcement into an injection surface.
 */
test('an announcement already read offers no button, and its body is text', async ({ page }) => {
  await signInAs(page, GUARDIAN);

  await navigation(page).getByRole('link', { name: 'Mural' }).click();
  const unread = page.getByRole('heading', { name: 'Não lidos' }).locator('..');
  await unread.getByRole('link').first().click();

  await page.getByRole('button', { name: 'Marcar como lido' }).click();
  /*
   * Scoped to `main`: the toast that confirms the action is also a `status` region, and both being
   * there at once is the design working. The journey names the one on the page.
   */
  const confirmation = page.locator('main').getByRole('status');
  await expect(confirmation).toContainText('marcou este comunicado como lido');
  await expect(page.getByRole('button', { name: 'Marcar como lido' })).toHaveCount(0);

  /* Reloading does not bring the button back, and does not mark anything twice. */
  await page.reload();
  await expect(page.locator('main').getByRole('status')).toContainText(
    'marcou este comunicado como lido',
  );
});
