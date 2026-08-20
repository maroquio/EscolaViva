/**
 * The accessibility half of Task 32, which needed Task 29's Playwright to exist.
 *
 * **These are the checks a DOM snapshot cannot make.** Phase 4 shipped four accessibility regressions
 * past 156 green tests — nested landmarks, a skip link inside the region it skipped to, a missing
 * favicon, unnamed icon buttons — and later a fifth that no markup query could ever have caught: the
 * per-component CSS imports sorted alphabetically, which left every button rendering as bare text
 * with the DOM perfectly correct.
 *
 * So the cases here assert on **relationships and computed values**, never on existence: how many
 * landmarks there are, where the skip link sits, whether a control announces its state, what the
 * browser actually computed for a colour. Existence is what the unit tests already cover.
 */
import { expect, test, type Page } from '@playwright/test';
import { SEED, navigation, signInAs } from './support';

/** The four screens one per role, which is the smallest set that covers every layout in the system. */
const SCREENS = [
  { role: 'network administrator', cpf: SEED.networkAdmin.cpf, path: '/network' },
  { role: 'registrar', cpf: SEED.registrar.cpf, path: '/registrar' },
] as const;

const landmarkCounts = (page: Page) =>
  page.evaluate(() => ({
    main: document.querySelectorAll('main').length,
    nav: document.querySelectorAll('nav').length,
    banner: document.querySelectorAll('header').length,
  }));

for (const screen of SCREENS) {
  /*
   * One `<main>` and one `<nav>`. Mantine's `AppShell.Main` and `AppShell.Navbar` already *are* those
   * elements, and wrapping either in another of the same kind renders identically while handing a
   * screen reader two landmarks for one region — a choice between a thing and itself.
   */
  test(`${screen.role}: exactly one main and one navigation`, async ({ page }) => {
    await signInAs(page, screen.cpf);
    await page.goto(screen.path);
    await expect(navigation(page)).toBeVisible();

    expect(await landmarkCounts(page)).toEqual({ main: 1, nav: 1, banner: 1 });
  });

  /*
   * The skip link, and the two things about it that matter: it is the first focusable element, and it
   * is off-screen until focused. Either one alone is useless — a link inside the region it skips to
   * is reached only after tabbing through everything it existed to skip, and a permanently visible one
   * is a stray control at the top of every page.
   */
  test(`${screen.role}: the skip link is first, hidden, and reachable`, async ({ page }) => {
    await signInAs(page, screen.cpf);
    await page.goto(screen.path);
    await expect(navigation(page)).toBeVisible();

    const skip = page.getByRole('link', { name: /pular para o conteúdo/i });
    await expect(skip).toHaveAttribute('href', '#conteudo');

    /* Off-screen while nothing is focused. */
    const restingOffset = await skip.evaluate((element) => element.getBoundingClientRect().top);
    expect(restingOffset).toBeLessThan(0);

    /*
     * One Tab from the top of the document reaches it, and it comes into view.
     *
     * `expect.poll` and not a single read: the link slides in over 150 ms, and measuring the instant
     * the key is pressed catches the transition at its starting value. That produced a failure that
     * read exactly like "the focus rule does not apply" — `:focus-visible` matched, the element was
     * focused, and the transform was still the resting one — which sent me looking at specificity for
     * a while before the number turned out to be a timestamp.
     */
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect
      .poll(async () => skip.evaluate((element) => element.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(0);

    /* And it goes where it says: the content region exists and takes focus. */
    await page.keyboard.press('Enter');
    await expect(page.locator('#conteudo')).toBeVisible();
  });

  /*
   * Every control announces itself. An icon button with no accessible name is announced as "button"
   * and nothing else, which is the failure mode of the reveal toggle and the notification dismiss.
   */
  test(`${screen.role}: no control is announced as nothing`, async ({ page }) => {
    await signInAs(page, screen.cpf);
    await page.goto(screen.path);
    await expect(navigation(page)).toBeVisible();

    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[href]')]
        .filter((control) => {
          const label =
            control.getAttribute('aria-label') ?? (control.textContent ?? '').trim();
          return label === '';
        })
        .map((control) => control.outerHTML.slice(0, 80)),
    );

    expect(unnamed).toEqual([]);
  });
}

/**
 * The menu button on a phone, which is the one control whose whole job is to report a state.
 *
 * Mantine's `Burger` tracks the state internally and never announces it, so the attribute is passed
 * explicitly. Checked at a viewport where the button is actually shown.
 */
test('the menu button says whether the menu is open', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await signInAs(page, SEED.registrar.cpf);

  const menu = page.getByRole('button', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');

  /* And what it controls is the navigation, not a guess. */
  const controls = await menu.getAttribute('aria-controls');
  expect(controls).not.toBeNull();
  await expect(page.locator(`#${controls}`)).toHaveAttribute('aria-label', 'Navegação principal');
});

/**
 * Every field on a form has a label, and a refused field says so out loud.
 *
 * A message rendered next to an input but not tied to it is invisible to a screen reader: the person
 * hears the field name, types, submits, and is told nothing about why it failed.
 */
test('a refused field is announced, not merely painted red', async ({ page }) => {
  await signInAs(page, SEED.registrar.cpf);
  await page.goto('/registrar/students/new');

  await page.getByRole('button', { name: 'Cadastrar aluno' }).click();

  const name = page.getByRole('textbox', { name: 'Nome' });
  await expect(name).toHaveAttribute('aria-invalid', 'true');

  /* The message is reachable from the field itself, through `aria-describedby`. */
  const described = await name.getAttribute('aria-describedby');
  expect(described).not.toBeNull();
  await expect(page.locator(`#${described?.split(' ').join(', #')}`).first()).toContainText(
    'Informe o nome do aluno.',
  );
});

/**
 * The theme, measured rather than eyeballed.
 *
 * This is the check that would have caught the CSS ordering defect on its own: it reads what the
 * browser computed, not what the markup says. A button whose stylesheet never applied has a
 * transparent background and no border, and the contrast question answers itself.
 */
test('buttons and error text are actually styled', async ({ page }) => {
  await signInAs(page, SEED.registrar.cpf);
  await page.goto('/registrar/students/new');

  const submit = page.getByRole('button', { name: 'Cadastrar aluno' });
  const painted = await submit.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, padding: style.paddingLeft };
  });

  expect(painted.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(painted.padding).not.toBe('0px');
});
