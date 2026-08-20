/**
 * The registrar's day, end to end: register a student, register a guardian, link them, enrol.
 *
 * This is the longest journey in the suite and the one that touches the most tables, and it runs
 * against the real server — which is the point. Every unit test in this repository is answered by
 * MSW, which says whatever the test tells it to; two defects in phase 4 lived exactly in that gap.
 */
import { expect, test } from '@playwright/test';
import { SEED, navigation, signInAs, uniqueCpf, uniqueName } from './support';

test('registers a student, links a guardian, and enrols them', async ({ page }) => {
  await signInAs(page, SEED.registrar.cpf);
  await expect(page.getByRole('heading', { name: 'Painel da secretaria' })).toBeVisible();

  /* A guardian first: the student cannot be linked to somebody who does not exist. */
  const guardian = uniqueName('Responsável');
  await navigation(page).getByRole('link', { name: 'Responsáveis' }).click();
  /*
   * `.first()` throughout: the page header offers the action and so does the empty state, which is
   * deliberate — half the empty states in this system carry the next step. Two links with one name is
   * the design working, not a defect, so the journey picks the first rather than the page being
   * changed to suit it.
   */
  await page.getByRole('link', { name: 'Cadastrar responsável' }).first().click();
  await page.getByRole('textbox', { name: 'Nome' }).fill(guardian);
  await page.getByRole('textbox', { name: 'CPF' }).fill(uniqueCpf());
  await page.getByRole('textbox', { name: 'E-mail' }).fill(`${Date.now()}@escolaviva.test`);
  await page.getByRole('button', { name: 'Cadastrar responsável' }).click();

  /* The password screen again, this time on the registrar's side of the system. */
  await expect(page.getByRole('status')).toContainText(`Senha provisória de ${guardian}`);

  const student = uniqueName('Aluno');
  await navigation(page).getByRole('link', { name: 'Alunos' }).click();
  await page.getByRole('link', { name: 'Cadastrar aluno' }).first().click();
  await expect(page.getByRole('heading', { name: 'Cadastrar aluno' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nome' }).fill(student);
  await page.getByLabel(/^Data de nascimento/).fill('2015-06-20');
  await page.getByRole('button', { name: 'Cadastrar aluno' }).click();

  /* Registering a student lands on their record, which is the errand's next step. */
  await expect(page.getByRole('heading', { name: student })).toBeVisible();
  await expect(page.getByText('Nenhum responsável vinculado')).toBeVisible();
  await expect(page.getByText('Nenhuma matrícula')).toBeVisible();

  const record = page.url();

  await page.getByRole('link', { name: 'Vincular responsável' }).first().click();
  await page.getByRole('combobox', { name: 'Responsável' }).selectOption({ label: guardian });
  await page.getByRole('textbox', { name: 'Parentesco' }).fill('Mãe');
  await page.getByRole('button', { name: 'Vincular responsável' }).click();

  await expect(page.getByRole('table').first()).toContainText(guardian);

  await page.getByRole('link', { name: 'Matricular' }).first().click();
  await page.getByRole('combobox', { name: 'Turma' }).selectOption({ index: 1 });
  await page.getByRole('combobox', { name: 'Ano letivo' }).selectOption({ index: 1 });
  await page.getByLabel(/^Data da matrícula/).fill('2026-02-10');
  await page.getByRole('button', { name: 'Matricular' }).click();

  /* Back on the record, with an active enrolment and therefore a transfer to offer. */
  await expect(page.getByRole('heading', { name: student })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Transferir' })).toBeVisible();

  /*
   * The deep URL, reloaded in a real browser. Today this passes because Vite serves `index.html` for
   * anything it does not recognise — it is **not yet** proof of the production fallback, which Task 33
   * mounts on Hono. When that lands, this same assertion run against the built application is what
   * proves it.
   */
  await page.goto(record);
  await page.reload();
  await expect(page.getByRole('heading', { name: student })).toBeVisible();
  await expect(page.getByRole('table').first()).toContainText(guardian);
});

/**
 * The search, which is the screen a registrar spends the day on.
 *
 * Two rules that only a browser can settle: the screen opens without asking the server anything, and
 * the term ends up in the address — which is what makes a search something you can send to somebody.
 */
test('the search opens empty and puts the term in the address', async ({ page }) => {
  await signInAs(page, SEED.registrar.cpf);

  await navigation(page).getByRole('link', { name: 'Alunos' }).click();
  await expect(page.getByText('Comece pela busca')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Buscar por nome' }).fill('silva');
  await page.getByRole('button', { name: 'Buscar' }).click();

  await expect(page).toHaveURL(/\?q=silva/);
  await expect(page.getByRole('table')).toBeVisible();

  /* And reopening that address searches straight away, with no second click. */
  await page.reload();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Buscar por nome' })).toHaveValue('silva');
});
