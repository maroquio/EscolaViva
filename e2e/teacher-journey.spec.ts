/**
 * The teacher's day: post grades, take the roll call, close a term.
 *
 * The demo database plants two cases on purpose, and they are the proof that the rule survived the
 * migration: term 1 is complete and closes, term 3 is 45 grades short and is refused with the list of
 * what is missing. Measured against the seed on 2026-08-17 — terms 1 and 2 hold 720 grades each,
 * term 3 holds 449.
 */
import { expect, test } from '@playwright/test';
import { navigation, resetToSeed, signInAs } from './support';

const TEACHER = '10000000442';

/*
 * Every term starts open, because one of these cases closes one.
 *
 * Without this the second run of the file fails in the grade cases, timing out on a disabled field —
 * a closed term makes the grid read-only — and the message says the field could not be filled, which
 * points at the grid rather than at the term. `e2e:clean` empties `term_closing` at the end of a run
 * too; this is the same guarantee at the beginning, for whoever runs a single file.
 */
test.beforeAll(resetToSeed);

test('posts a grade with a comma and reads it back with a comma', async ({ page }) => {
  await signInAs(page, TEACHER);

  await expect(page.getByRole('heading', { name: 'Minhas turmas' })).toBeVisible();
  await page.getByRole('link', { name: /^Notas de/ }).first().click();
  await expect(page.getByRole('heading', { name: /^Notas de/ })).toBeVisible();

  const cell = page.getByRole('textbox').first();
  const student = (await cell.getAttribute('aria-label')) ?? '';
  expect(student).toMatch(/^Nota de /);

  await cell.fill('7,5');
  await page.getByRole('button', { name: 'Lançar notas' }).click();
  await expect(page.getByText(/nota\(s\) lançada\(s\)/)).toBeVisible();

  /* Reloaded from the server, and still written the way this country writes it. */
  await page.reload();
  await expect(page.getByRole('textbox', { name: student })).toHaveValue('7,5');
});

/*
 * The grade that protects a grade. `11` is "typed and invalid": it lights the cell and stops the
 * submission, and it must never be read as "clear this grade" — that would erase somebody's mark
 * because a teacher typed 77 meaning 7, and nobody would be told.
 */
test('a grade outside the scale lights the cell and sends nothing', async ({ page }) => {
  await signInAs(page, TEACHER);
  await page.getByRole('link', { name: /^Notas de/ }).first().click();

  const cell = page.getByRole('textbox').first();
  const student = (await cell.getAttribute('aria-label')) ?? '';
  const before = await cell.inputValue();

  await cell.fill('11');
  await page.getByRole('button', { name: 'Lançar notas' }).click();
  await expect(page.getByText('Nota entre 0 e 10.')).toBeVisible();

  /* Nothing was posted: the server still holds what it held. */
  await page.reload();
  await expect(page.getByRole('textbox', { name: student })).toHaveValue(before);
});

test('takes a roll call with one absence, and finds it again the next day', async ({ page }) => {
  await signInAs(page, TEACHER);

  await navigation(page).getByRole('link', { name: 'Minhas turmas' }).click();
  await page.getByRole('link', { name: 'Frequência' }).first().click();
  await expect(page.getByRole('button', { name: 'Registrar frequência' })).toBeVisible();

  /*
   * A day the seed never touches. Its register runs 10/03 to 14/08/2026, and picking a date inside
   * that range means the sheet opens with whatever the seed recorded — so "it opens with everybody
   * present" would be asserting the seed's luck rather than the rule. September is empty, and
   * `e2e:clean` empties it again afterwards.
   */
  const day = '2026-09-15';
  await page.goto(`${new URL(page.url()).pathname}?date=${day}`);
  /*
   * By the table's caption. The date appears twice on this screen — beside the day buttons and in the
   * caption — and both are deliberate, so the journey names the one it means.
   */
  await expect(page.getByRole('table', { name: 'Chamada de 15/09/2026' })).toBeVisible();

  /* It opens with everybody present — an absence is the exception. */
  const first = page.getByRole('checkbox').first();
  await expect(first).toBeChecked();
  const student = ((await first.getAttribute('aria-label')) ?? '').replace(' presente', '');

  await first.uncheck();
  await page.getByRole('textbox', { name: `Justificativa de ${student}` }).fill('Consulta médica');
  await page.getByRole('button', { name: 'Registrar frequência' }).click();
  await expect(page.getByText('Frequência registrada.')).toBeVisible();

  /* Away to another day and back: the register is what was recorded, not a fresh sheet. */
  await page.getByRole('button', { name: 'Próximo dia' }).click();
  await expect(page.getByRole('table', { name: 'Chamada de 16/09/2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Dia anterior' }).click();
  await expect(page.getByRole('table', { name: 'Chamada de 15/09/2026' })).toBeVisible();

  await expect(page.getByRole('checkbox', { name: `${student} presente` })).not.toBeChecked();
  await expect(page.getByRole('textbox', { name: `Justificativa de ${student}` })).toHaveValue(
    'Consulta médica',
  );
});

/**
 * The closing, in both directions.
 *
 * A term short of grades is refused **with the list of what is missing**, because compressing that
 * into "não foi possível fechar" would send the teacher hunting through six subjects for the ones
 * that are incomplete. And a complete term closes — which is what makes the refusal a rule rather
 * than a screen that never works.
 */
test('refuses an incomplete term with the list, and closes a complete one', async ({ page }) => {
  await signInAs(page, TEACHER);

  await navigation(page).getByRole('link', { name: 'Minhas turmas' }).click();
  await page.getByRole('link', { name: 'Fechamento' }).first().click();
  await expect(page.getByRole('heading', { name: 'Fechamento do bimestre' })).toBeVisible();

  /* Term 3 is 45 grades short in the seed, spread across three subjects. */
  await page.getByRole('button', { name: 'Fechar 3º bimestre' }).click();
  const refusal = page.getByRole('alert');
  await expect(refusal).toContainText('Faltam');
  await expect(refusal).toContainText('notas para fechar o bimestre');
  /* The subjects are named — that is the difference between a message and an errand. */
  await expect(refusal).toContainText(/Arte|Ciências|Geografia/);

  /* Term 1 is complete, and closes. */
  await page.getByRole('button', { name: 'Fechar 1º bimestre' }).click();
  await expect(page.getByText('1º bimestre fechado.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fechar 1º bimestre' })).toHaveCount(0);

  /*
   * And a closed term turns the grade grid read-only, with the reason on screen. A grid that merely
   * refused on submit would let a teacher retype twenty grades before finding out.
   */
  await navigation(page).getByRole('link', { name: 'Minhas turmas' }).click();
  await page.getByRole('link', { name: /^Notas de/ }).first().click();
  await expect(page.getByText(/já foi fechado/)).toBeVisible();
  await expect(page.getByRole('textbox').first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Lançar notas' })).toHaveCount(0);
});
