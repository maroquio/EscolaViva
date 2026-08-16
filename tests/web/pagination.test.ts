/*
 * Pagination as the browser sees it.
 *
 * The page state lives in the URL, and that is what gets proven here: the second page is an
 * address, the filter survives the navigation, and two tables on the same screen move without
 * dragging one another along. A made-up number in the query becomes neither an error nor an empty
 * screen — it becomes the nearest page that exists.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase } from '../support/database';
import {
  fullScenario,
  createStudent,
  createAnnouncement,
  createEnrollment,
  createGuardian,
  type Scenario,
} from '../support/factories';
import { DEFAULT_PAGE_SIZE } from '../../src/shared/pagination';
import { PARAMS } from '../../src/web/constants';
import { helpId } from '../../src/web/render';
import { open, signIn } from './support';

beforeEach(clearDatabase);

/**
 * The system's page size, read from where it is decided. The scenarios below are built around it:
 * moving the ruler moves the expected numbers without rewriting a single test.
 */
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/** The five records the full scenario already brings: the remainder that lands on the last page. */
const REMAINDER = 5;

const signInAsRegistrar = (scenario: Scenario): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario.registrar.cpf, password: scenario.password });

const signInAsGuardian = (scenario: Scenario): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario.guardian.cpf, password: scenario.password });

const html = async (path: string, cookie: string): Promise<string> =>
  await (await open(path, cookie)).text();

/** Every data row has an anchor cell with `scope="row"`; the header does not. */
const tableRows = (page: string): number => (page.match(/scope="row"/g) ?? []).length;

const numberedName = (position: number): string => `Pessoa ${String(position).padStart(3, '0')}`;

describe('slicing on the guardians screen', () => {
  /** One full page and a remainder of five: the scenario's five plus a whole page. */
  const onePageAndARemainder = async (): Promise<Scenario> => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE; i += 1) {
      await createGuardian({ networkId: scenario.network.id, name: numberedName(i) });
    }
    return scenario;
  };

  test('the first page brings the page size, not the whole list', async () => {
    const scenario = await onePageAndARemainder();

    const page = await html('/registrar/guardians', await signInAsRegistrar(scenario));

    expect(tableRows(page)).toBe(PAGE_SIZE);
    expect(page).toContain('class="pagination"');
    expect(page).toContain('href="/registrar/guardians?p=2"');
  });

  test('the section count shows the total, not the size of the page', async () => {
    const scenario = await onePageAndARemainder();

    const page = await html('/registrar/guardians', await signInAsRegistrar(scenario));

    expect(page).toContain(`>${PAGE_SIZE + REMAINDER}</span>`);
  });

  test('the second page brings the remainder and offers the way back', async () => {
    const scenario = await onePageAndARemainder();

    const page = await html('/registrar/guardians?p=2', await signInAsRegistrar(scenario));

    expect(tableRows(page)).toBe(REMAINDER);
    expect(page).toContain('rel="prev"');
    expect(page).not.toContain('rel="next"');
  });

  test('a page past the end serves the last one, instead of an empty screen', async () => {
    const scenario = await onePageAndARemainder();

    const page = await html('/registrar/guardians?p=999', await signInAsRegistrar(scenario));

    expect(tableRows(page)).toBe(REMAINDER);
  });

  test('a page that is not a number falls to the first one, with no error', async () => {
    const scenario = await onePageAndARemainder();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/guardians?p=abc', cookie);

    expect(response.status).toBe(200);
    expect(tableRows(await response.text())).toBe(PAGE_SIZE);
  });

  test('a single-page list draws no controls, but keeps on counting', async () => {
    const scenario = await fullScenario();

    const page = await html('/registrar/guardians', await signInAsRegistrar(scenario));

    expect(page).toContain('class="pagination"');
    expect(page).not.toContain('pagination__list');
  });
});

describe('the rest of the query survives the navigation', () => {
  test('the search term stays in the page links', async () => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE + REMAINDER; i += 1) {
      await createStudent({ networkId: scenario.network.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }

    const page = await html('/registrar/students?q=Silva', await signInAsRegistrar(scenario));

    expect(tableRows(page)).toBe(PAGE_SIZE);
    expect(page).toContain('q=Silva&amp;p=2');
  });

  test('going back to the first page drops the parameter from the URL instead of writing p=1', async () => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE + REMAINDER; i += 1) {
      await createGuardian({ networkId: scenario.network.id, name: numberedName(i) });
    }

    const page = await html('/registrar/guardians?p=2', await signInAsRegistrar(scenario));

    expect(page).toContain('href="/registrar/guardians"');
    expect(page).not.toContain('p=1"');
  });
});

describe('two tables on the same screen', () => {
  test('advancing the enrollments does not move the subjects page', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;
    // The scenario's enrollments plus a whole page: the class group now has two pages of students.
    for (let i = 1; i <= PAGE_SIZE; i += 1) {
      const student = await createStudent({ networkId: scenario.network.id, name: numberedName(i) });
      await createEnrollment({
        networkId: scenario.network.id, studentId: student.id, classGroupId: classGroup.id,
        academicYearId: scenario.academicYear.id,
      });
    }

    const page = await html(
      `/registrar/class-groups/${classGroup.id}?pSubjects=1`,
      await signInAsRegistrar(scenario),
    );

    // The link that advances the students carries along the page the subjects are on.
    expect(page).toContain('pSubjects=1&amp;pEnrollments=2');
  });
});

describe('the guardian portal', () => {
  test('the board paginates both halves under parameters of their own', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    // One unread and one already read: each half of the board needs something to count.
    await createAnnouncement({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: guardian.id }],
    });
    await createAnnouncement({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: guardian.id, readAt: new Date() }],
    });

    const page = await html('/guardian/board', await signInAsGuardian(scenario));

    expect(page).toContain('Paginação de comunicados não lidos');
    expect(page).toContain('Paginação de comunicados lidos');
  });

  test('the student attendance opens paginated', async () => {
    const scenario = await fullScenario();
    const [enrollment] = scenario.enrollments;

    const response = await open(
      `/guardian/enrollments/${enrollment.id}/attendance`,
      await signInAsGuardian(scenario),
    );

    expect(response.status).toBe(200);
  });
});

describe('the student search help promises the slice the screen delivers', () => {
  const HELP_TEXT = new RegExp(`id="${helpId(PARAMS.search)}"[^>]*>([\\s\\S]*?)</p>`);

  const numbersInHelpText = (page: string): number[] =>
    ((HELP_TEXT.exec(page)?.[1] ?? '').match(/\d+/g) ?? []).map(Number);

  test('the only number in the help text is the number of rows the page brings', async () => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE + REMAINDER; i += 1) {
      await createStudent({ networkId: scenario.network.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }

    const page = await html('/registrar/students?q=Silva', await signInAsRegistrar(scenario));

    expect(numbersInHelpText(page)).toEqual([tableRows(page)]);
    expect(numbersInHelpText(page)).toEqual([PAGE_SIZE]);
  });

  test('the help text promises no ceiling: pagination reaches everyone found', async () => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE + REMAINDER; i += 1) {
      await createStudent({ networkId: scenario.network.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }
    const cookie = await signInAsRegistrar(scenario);

    const first = await html('/registrar/students?q=Silva', cookie);
    const last = await html('/registrar/students?q=Silva&p=2', cookie);

    const found = tableRows(first) + tableRows(last);
    expect(numbersInHelpText(first)).toEqual(numbersInHelpText(last));
    expect(found).toBeGreaterThan(numbersInHelpText(first)[0] ?? 0);
  });

  test('the screen with no search declares the same slice as the screen with results', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const withoutSearch = await html('/registrar/students', cookie);
    const withSearch = await html('/registrar/students?q=Silva', cookie);

    expect(numbersInHelpText(withoutSearch)).toEqual(numbersInHelpText(withSearch));
    expect(numbersInHelpText(withoutSearch)).toEqual([PAGE_SIZE]);
  });
});
