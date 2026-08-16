/*
 * Record-keeping and listing on separate pages.
 *
 * There is one rule and it holds for all ten writing screens: whoever lists does not write, and
 * whoever writes does not list. That is what gets checked here, from both sides — the form page
 * exists, answers 200 and carries the `form` with the right `action`; the matching listing carries
 * none at all any more.
 *
 * The third group is what the separation could have broken without anyone noticing: a refused form
 * has to come back to the form page itself, carrying what was typed, and not to the list. The
 * fourth is reach: the new pages are new doors, and each one answers 404 for a record from outside
 * the network, just as the old ones did.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { generateCpf } from '../../src/shared/document';
import { clearDatabase } from '../support/database';
import { createUser, fullScenario, twoNetworks, type Scenario } from '../support/factories';
import { open, signIn, send } from './support';

const signInAs = (scenario: Scenario, who: 'admin' | 'registrar'): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario[who].cpf, password: scenario.password });

/** That page's writing `form`, and not the sign-out one that comes in the header. */
const hasFormFor = (html: string, target: string): boolean =>
  html.includes(`method="post" action="${target}"`);

beforeEach(async () => {
  await clearDatabase();
});

/* ------------------------------------------------------------------------- */

// Outside the file's four groups — this is neither record-keeping, listing, refusal nor reach —
// but the same family of check: the page opens and carries the field the current phase promises.
// The CPF window has closed: the field is called `cpf`, and the label no longer mentions
// e-mail — the first check alone would pass with the screen still saying "CPF ou e-mail" above a
// field renamed underneath; the second is what makes sure the screen also stopped promising what it
// no longer accepts.
test('the sign-in screen asks for a CPF, and no longer for an e-mail', async () => {
  const html = await (await open('/login')).text();

  expect(html).toContain('name="cpf"');
  expect(html).not.toContain('e-mail');
});

/* ------------------------------------------------------------------------- */

describe('every record-keeping action has its own page, and that page carries the form', () => {
  type Page = { path: string; target: string };

  const NETWORK_PAGES: readonly Page[] = [
    { path: '/network/schools/new', target: '/network/schools' },
    { path: '/network/academic-years/new', target: '/network/academic-years' },
    { path: '/network/users/new', target: '/network/users' },
  ];

  const REGISTRAR_PAGES: readonly Page[] = [
    { path: '/registrar/subjects/new', target: '/registrar/subjects' },
    { path: '/registrar/guardians/new', target: '/registrar/guardians' },
    { path: '/registrar/class-groups/new', target: '/registrar/class-groups' },
  ];

  for (const page of NETWORK_PAGES) {
    test(`${page.path} opens with the form that writes to ${page.target}`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAs(scenario, 'admin');

      const response = await open(page.path, cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(hasFormFor(html, page.target)).toBe(true);
    });
  }

  for (const page of REGISTRAR_PAGES) {
    test(`${page.path} opens with the form that writes to ${page.target}`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAs(scenario, 'registrar');

      const response = await open(page.path, cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(hasFormFor(html, page.target)).toBe(true);
    });
  }

  test('the guardian form carries the CPF field', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const html = await (await open('/registrar/guardians/new', cookie)).text();

    expect(html).toContain('name="cpf"');
  });

  test('linking a guardian has a page of its own, away from the student record', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const studentId = scenario.students[0].id;

    const response = await open(`/registrar/students/${studentId}/guardians/new`, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, `/registrar/students/${studentId}/guardians`)).toBe(true);
  });

  test('enrolling has a page of its own, away from the student record', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await open(`/registrar/students/${scenario.students[0].id}/enroll`, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, '/registrar/enrollments')).toBe(true);
  });

  test('transferring has a page of its own, and it knows the active enrollment', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const enrollmentId = scenario.enrollments[0].id;

    const response = await open(`/registrar/enrollments/${enrollmentId}/transfer`, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, `/registrar/enrollments/${enrollmentId}/transfer`)).toBe(true);
  });

  test('allocating a subject has a page of its own, away from the class group screen', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const classGroupId = scenario.classGroups[0].id;

    const response = await open(`/registrar/class-groups/${classGroupId}/subjects/new`, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, `/registrar/class-groups/${classGroupId}/subjects`)).toBe(true);
  });
});

/* ------------------------------------------------------------------------- */

describe('the listing became the table and nothing else', () => {
  const NETWORK_PAGES = ['/network/schools', '/network/academic-years', '/network/users'] as const;
  const REGISTRAR_PAGES = [
    '/registrar/subjects',
    '/registrar/guardians',
    '/registrar/class-groups',
  ] as const;

  for (const path of NETWORK_PAGES) {
    test(`${path} writes nothing any more`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAs(scenario, 'admin');

      const response = await open(path, cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(hasFormFor(html, path)).toBe(false);
    });
  }

  for (const path of REGISTRAR_PAGES) {
    test(`${path} writes nothing any more`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAs(scenario, 'registrar');

      const response = await open(path, cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(hasFormFor(html, path)).toBe(false);
    });
  }

  test('the class group filter is still standing — it reads, and that is why it is a GET', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const html = await (await open('/registrar/class-groups', cookie)).text();

    expect(html).toContain('method="get" action="/registrar/class-groups"');
  });

  test('the student record lost its three forms and gained the three links', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const studentId = scenario.students[0].id;

    const html = await (await open(`/registrar/students/${studentId}`, cookie)).text();

    expect(hasFormFor(html, `/registrar/students/${studentId}/guardians`)).toBe(false);
    expect(hasFormFor(html, '/registrar/enrollments')).toBe(false);
    expect(html).toContain(`href="/registrar/students/${studentId}/guardians/new"`);
    expect(html).toContain(`href="/registrar/students/${studentId}/enroll"`);
    expect(html).toContain(`href="/registrar/enrollments/${scenario.enrollments[0].id}/transfer"`);
  });

  test('the class group screen lost the allocation form and gained the link', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const classGroupId = scenario.classGroups[0].id;

    const html = await (await open(`/registrar/class-groups/${classGroupId}`, cookie)).text();

    expect(hasFormFor(html, `/registrar/class-groups/${classGroupId}/subjects`)).toBe(false);
    expect(html).toContain(`href="/registrar/class-groups/${classGroupId}/subjects/new"`);
  });
});

/* ------------------------------------------------------------------------- */

describe('the rejected form goes back to the form, not to the list', () => {
  test('a subject with no name comes back with the error on the field', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await send('/registrar/subjects', { name: '' }, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, '/registrar/subjects')).toBe(true);
    expect(html).toContain('id="name-error"');
    expect(html).not.toContain('Disciplinas disponíveis para alocar nas turmas');
  });

  test('a rejected class group comes back carrying what had already been typed', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await send(
      '/registrar/class-groups',
      { name: 'Turma Rejeitada', gradeLevel: '', shift: '', schoolId: '', academicYearId: '' },
      cookie,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, '/registrar/class-groups')).toBe(true);
    expect(html).toContain('value="Turma Rejeitada"');
    expect(html).not.toContain('Turmas das unidades sob sua secretaria');
  });

  test('a school with no name comes back to the page for creating a school', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await send('/network/schools', { name: '', inepCode: '123' }, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, '/network/schools')).toBe(true);
    expect(html).toContain('value="123"');
    expect(html).not.toContain('Unidades cadastradas');
  });

  test('an invalid CPF on the guardian form comes back with the error anchored to the field', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await send('/registrar/guardians', {
      name: 'Responsável Sem Acesso', email: 'sem.acesso@escolaviva.test', cpf: '52998224724',
    }, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="cpf-error"');
    expect(html).toContain('value="52998224724"');
  });

  /*
   * Registering a guardian became inviting a user, and `user_role.school_id` is NOT
   * NULL: the screen has to say which school the person enters through. A registrar of a single
   * school never sees the field — the route takes the only one there is — so what needs guarding
   * is the registrar of two.
   */
  test('a registrar of two schools has to pick one, and the guardian form says so', async () => {
    const scenario = await fullScenario();
    const [schoolA, schoolB] = scenario.schools;
    const registrar = await createUser({
      networkId: scenario.network.id,
      password: scenario.password,
      roles: [
        { schoolId: schoolA.id, role: 'registrar' },
        { schoolId: schoolB.id, role: 'registrar' },
      ],
    });
    const cookie = await signIn({
      networkSlug: scenario.network.slug, cpf: registrar.cpf, password: scenario.password,
    });

    const form = await (await open('/registrar/guardians/new', cookie)).text();
    expect(form).toContain('name="schoolId"');
    expect(form).toContain(`>${schoolB.name}</option>`);

    const refused = await send('/registrar/guardians', {
      name: 'Sem Unidade', email: 'sem.unidade@escolaviva.test', cpf: generateCpf(4_100_001),
      schoolId: '',
    }, cookie);
    const html = await refused.text();

    expect(refused.status).toBe(200);
    expect(html).toContain('id="schoolId-error"');
    expect(html).toContain('value="Sem Unidade"');

    const accepted = await send('/registrar/guardians', {
      name: 'Com Unidade', email: 'com.unidade@escolaviva.test', cpf: generateCpf(4_100_002),
      schoolId: schoolB.id,
    }, cookie);

    expect(accepted.status).toBe(303);
  });

  /*
   * The two tests that lived here guarded the `guardianId` field of the invitation form: one for a
   * CPF diverging from the record, one for an id outside the format. The record went away
   * and the field; the negative — the form no longer carries it — is in
   * `coverage_network_account_login.test.ts`.
   */

  test('a rejected link comes back to the link page, without the whole student record', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const studentId = scenario.students[0].id;

    const response = await send(
      `/registrar/students/${studentId}/guardians`,
      { userId: '', relationship: '' },
      cookie,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, `/registrar/students/${studentId}/guardians`)).toBe(true);
    expect(html).not.toContain('Histórico de matrículas deste aluno');
  });
});

/* ------------------------------------------------------------------------- */

describe('the new pages respect the registrar\'s reach', () => {
  test('a student from another network does not open the link page', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await open(`/registrar/students/${b.students[0].id}/guardians/new`, cookie);

    expect(response.status).toBe(404);
  });

  test('a student from another network does not open the enrollment page', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await open(`/registrar/students/${b.students[0].id}/enroll`, cookie);

    expect(response.status).toBe(404);
  });

  test('an enrollment from another network does not open the transfer page', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await open(`/registrar/enrollments/${b.enrollments[0].id}/transfer`, cookie);

    expect(response.status).toBe(404);
  });

  test('a class group from another network does not open the allocation page', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await open(`/registrar/class-groups/${b.classGroups[0].id}/subjects/new`, cookie);

    expect(response.status).toBe(404);
  });

  test('an identifier that is not a uuid answers 404, not a cast error', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await open('/registrar/students/nao-e-uuid/enroll', cookie);

    expect(response.status).toBe(404);
  });
});
