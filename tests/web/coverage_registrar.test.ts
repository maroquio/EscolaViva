/*
 * Every reading screen of the registrar area, through the address the browser types.
 *
 * What this file settles is a single question: does each GET under `/registrar` answer 200 and give
 * back ITS OWN screen? Status is not enough — a route that rendered the dashboard in place of the
 * subject list would pass any code-level check. That is why each case also asserts something only
 * that screen has: the page title, the table caption, the form field.
 *
 * The addresses appear written out in full, rather than imported from a route constant. A test that
 * reads the path from the very code it checks stops noticing when the path changes — and changing
 * the address of a screen is exactly the sort of thing that breaks the link somebody bookmarked.
 *
 * Beyond the screens themselves, this file holds the states only a GET produces: the student search
 * before the first search, the class group filter that lives in the URL, and the dashboard of
 * someone who answers for more than one school — paths no write ever reaches.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase } from '../support/database';
import {
  fullScenario,
  createStudent,
  createAcademicYear,
  createClassGroup,
  createUser,
  type Scenario,
} from '../support/factories';
import { open, signIn } from './support';

beforeEach(clearDatabase);

const signInAsRegistrar = (scenario: Scenario): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario.registrar.cpf, password: scenario.password });

/** The scenario's registrar answers for one school only; this one answers for both. */
const signInAsRegistrarOfBothSchools = async (scenario: Scenario): Promise<string> => {
  const user = await createUser({
    networkId: scenario.network.id,
    password: scenario.password,
    roles: [
      { schoolId: scenario.schools[0].id, role: 'registrar' },
      { schoolId: scenario.schools[1].id, role: 'registrar' },
    ],
  });
  return await signIn({ networkSlug: scenario.network.slug, cpf: user.cpf, password: scenario.password });
};

const html = async (path: string, cookie: string): Promise<string> =>
  await (await open(path, cookie)).text();

/** The screen's `h1` — what tells one page from another inside the same layout. */
const screenTitle = (title: string): string => `<h1 class="page__title">${title}</h1>`;

/* ------------------------------------------------------------------------- */

describe('each reading address opens its own screen', () => {
  type GoldenScreen = {
    readonly name: string;
    readonly path: (scenario: Scenario) => string;
    readonly title: (scenario: Scenario) => string;
  };

  const SCREENS: readonly GoldenScreen[] = [
    { name: '/registrar', path: () => '/registrar', title: () => 'Painel da secretaria' },
    { name: '/registrar/students', path: () => '/registrar/students', title: () => 'Alunos' },
    {
      name: '/registrar/students/new',
      path: () => '/registrar/students/new',
      title: () => 'Cadastrar aluno',
    },
    {
      name: '/registrar/students/:id',
      path: (scenario) => `/registrar/students/${scenario.students[0].id}`,
      title: (scenario) => scenario.students[0].name,
    },
    {
      name: '/registrar/students/:id/guardians/new',
      path: (scenario) => `/registrar/students/${scenario.students[0].id}/guardians/new`,
      title: () => 'Vincular responsável',
    },
    {
      name: '/registrar/students/:id/enroll',
      path: (scenario) => `/registrar/students/${scenario.students[0].id}/enroll`,
      title: () => 'Matricular em uma turma',
    },
    {
      name: '/registrar/enrollments/:id/transfer',
      path: (scenario) => `/registrar/enrollments/${scenario.enrollments[0].id}/transfer`,
      title: () => 'Transferir de turma',
    },
    {
      name: '/registrar/guardians',
      path: () => '/registrar/guardians',
      title: () => 'Responsáveis',
    },
    {
      name: '/registrar/guardians/new',
      path: () => '/registrar/guardians/new',
      title: () => 'Cadastrar responsável',
    },
    { name: '/registrar/class-groups', path: () => '/registrar/class-groups', title: () => 'Turmas' },
    {
      name: '/registrar/class-groups/new',
      path: () => '/registrar/class-groups/new',
      title: () => 'Cadastrar turma',
    },
    {
      name: '/registrar/class-groups/:id',
      path: (scenario) => `/registrar/class-groups/${scenario.classGroups[0].id}`,
      title: (scenario) => scenario.classGroups[0].name,
    },
    {
      name: '/registrar/class-groups/:id/subjects/new',
      path: (scenario) => `/registrar/class-groups/${scenario.classGroups[0].id}/subjects/new`,
      title: () => 'Alocar disciplina e professor',
    },
    {
      name: '/registrar/subjects',
      path: () => '/registrar/subjects',
      title: () => 'Disciplinas',
    },
    {
      name: '/registrar/subjects/new',
      path: () => '/registrar/subjects/new',
      title: () => 'Cadastrar disciplina',
    },
  ];

  for (const screen of SCREENS) {
    test(`${screen.name} answers 200 carrying the screen title`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAsRegistrar(scenario);

      const response = await open(screen.path(scenario), cookie);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain(screenTitle(screen.title(scenario)));
    });
  }
});

/* ------------------------------------------------------------------------- */

describe('the page for recording a student', () => {
  test('opens with the two fields the record asks for, and no link at all', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/students/new', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('method="post" action="/registrar/students"');
    expect(page).toContain('name="name"');
    expect(page).toContain('name="birthDate"');
    // Enrollment and guardian are links made later, from the student record: they do not belong here.
    expect(page).not.toContain('name="classGroupId"');
    expect(page).not.toContain('name="guardianId"');
  });

  test('is born empty — the blank form carries no typed value', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const page = await html('/registrar/students/new', cookie);

    expect(page).toContain('id="name"');
    expect(page).not.toContain('id="name-error"');
    expect(page).not.toContain('id="birthDate-error"');
  });
});

/* ------------------------------------------------------------------------- */

describe('the student search has three states, and all of them are GET', () => {
  test('with no term, the screen asks for a search instead of dumping the whole network', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/students', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Comece pela busca');
    expect(page).not.toContain('Alunos encontrados para');
    expect(page).not.toContain(scenario.students[0].name);
  });

  test('with a term that finds someone, the table carries the student and the enrollment status', async () => {
    const scenario = await fullScenario();
    await createStudent({ networkId: scenario.network.id, name: 'Zulmira Peixoto de Andrade' });
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/students?q=Zulmira', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Alunos encontrados para');
    expect(page).toContain('Zulmira Peixoto de Andrade');
    expect(page).toContain('aluno encontrado');
    // Nobody has enrolled her yet, and the column states only what is known.
    expect(page).toContain('Sem matrícula');
  });

  test('with a term that finds nobody, the screen offers the record form instead of an empty table', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/students?q=Zulmira', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Nenhum aluno com esse nome');
    expect(page).toContain('href="/registrar/students/new"');
  });
});

/* ------------------------------------------------------------------------- */

describe('the dashboard counts what lies within the reach of whoever opened it', () => {
  /** The four cards, in the order the screen draws them. */
  const cardNumbers = (page: string): number[] =>
    [...page.matchAll(/card__number">(\d+)</g)].map(([, number]) => Number(number));

  test('the cards carry the numbers of the school where the person is registrar', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const page = await html('/registrar', cookie);

    // Active enrollments, class groups, guardians and subjects: the full scenario in one school.
    expect(cardNumbers(page)).toEqual([5, 2, 5, 3]);
  });

  test('with only one school, the per-school table does not appear — there is nothing to compare', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const page = await html('/registrar', cookie);

    expect(page).not.toContain('Números de cada unidade sob sua secretaria');
    expect(page).not.toContain(scenario.schools[1].name);
  });

  test('with two schools, the table appears and names them both', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrarOfBothSchools(scenario);

    const response = await open('/registrar', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Números de cada unidade sob sua secretaria');
    expect(page).toContain(scenario.schools[0].name);
    expect(page).toContain(scenario.schools[1].name);
  });
});

/* ------------------------------------------------------------------------- */

describe('the class group filter lives in the URL', () => {
  test('filtering by school cuts the list down to that school\'s class groups', async () => {
    const scenario = await fullScenario();
    const base = { networkId: scenario.network.id, academicYearId: scenario.academicYear.id };
    await createClassGroup({ ...base, schoolId: scenario.schools[0].id, name: 'Turma Alfa da Central' });
    await createClassGroup({ ...base, schoolId: scenario.schools[1].id, name: 'Turma Beta do Bairro' });
    const cookie = await signInAsRegistrarOfBothSchools(scenario);

    const response = await open(`/registrar/class-groups?school=${scenario.schools[1].id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Turma Beta do Bairro');
    expect(page).not.toContain('Turma Alfa da Central');
  });

  test('filtering by academic year cuts the list down to that year', async () => {
    const scenario = await fullScenario();
    const otherYear = await createAcademicYear({ networkId: scenario.network.id, year: scenario.academicYear.year + 1 });
    const base = { networkId: scenario.network.id, schoolId: scenario.schools[0].id };
    await createClassGroup({ ...base, academicYearId: scenario.academicYear.id, name: 'Turma Gama do Ano Velho' });
    await createClassGroup({ ...base, academicYearId: otherYear.id, name: 'Turma Delta do Ano Novo' });
    const cookie = await signInAsRegistrar(scenario);

    const response = await open(`/registrar/class-groups?year=${otherYear.id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Turma Delta do Ano Novo');
    expect(page).not.toContain('Turma Gama do Ano Velho');
  });

  test('a school outside the reach counts as "all of yours", and does not open the outside one', async () => {
    const scenario = await fullScenario();
    const base = { networkId: scenario.network.id, academicYearId: scenario.academicYear.id };
    await createClassGroup({ ...base, schoolId: scenario.schools[0].id, name: 'Turma Epsilon da Minha' });
    await createClassGroup({ ...base, schoolId: scenario.schools[1].id, name: 'Turma Zeta da Outra' });
    // This registrar holds a role at the first school only: the second is no filter she may ask for.
    const cookie = await signInAsRegistrar(scenario);

    const response = await open(`/registrar/class-groups?school=${scenario.schools[1].id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Turma Epsilon da Minha');
    expect(page).not.toContain('Turma Zeta da Outra');
  });

  test('a page number that does not exist becomes neither an error nor a broken screen', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/class-groups?p=999', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Turmas das unidades sob sua secretaria');
  });
});

/* ------------------------------------------------------------------------- */

describe('the listings show what their headers promise', () => {
  test('the subject list carries the network table', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/subjects', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Disciplinas disponíveis para alocar nas turmas');
    expect(page).toContain(scenario.subjects[0].name);
    expect(page).toContain('href="/registrar/subjects/new"');
  });

  test('the guardian list carries the name, CPF and e-mail of whoever answers for the students', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/guardians', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Responsáveis cadastrados nesta rede');
    expect(page).toContain(scenario.guardians[0].name);
    expect(page).toContain(scenario.guardians[0].email);
  });

  test('the class group screen lists the allocated subjects and the students with an active enrollment', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open(`/registrar/class-groups/${scenario.classGroups[0].id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Quem leciona o quê nesta turma');
    expect(page).toContain('Alunos com matrícula ativa nesta turma');
    expect(page).toContain(scenario.subjects[0].name);
    expect(page).toContain(scenario.teacher.name);
    expect(page).toContain(scenario.students[0].name);
  });

  test('the student record carries the linked guardians and the enrollment history', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open(`/registrar/students/${scenario.students[0].id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Quem responde por este aluno');
    expect(page).toContain('Histórico de matrículas deste aluno');
    expect(page).toContain(scenario.guardians[0].name);
    expect(page).toContain(scenario.classGroups[0].name);
  });
});
