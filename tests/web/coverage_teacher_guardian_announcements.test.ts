/*
 * The reading screens of the teacher, the guardian and whoever publishes announcements.
 *
 * The suite already proved who *may* open each of these routes — 200 for the right role, 403 for
 * the wrong one, 404 for another family's record. What was missing was the other half of the
 * question: with the door open, is the screen that arrived the right screen? A GET can answer 200
 * while rendering the wrong dashboard, a table with no columns or a form with no fields, and no
 * status check would notice.
 *
 * So every case here looks at the content, and takes as its anchor whatever the screen exists to
 * show: the page title, the table header, the name of the form field, the link that leads to the
 * next step. Field names (`grade_<id>`, `present_<id>`, `guardians[]`) are a contract with the
 * browser, not an internal detail — changing them breaks the submission, and the assertion is what
 * turns that into a red test instead of a silent bug.
 *
 * The addresses are written by hand, one by one. Importing the constant the route uses would make
 * the test agree with the code by construction: if the path changed, test and application would
 * change together and nobody would learn that the URL the user bookmarked had ceased to exist.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase } from '../support/database';
import {
  fullScenario,
  createAnnouncement,
  createSubject,
  createClassGroupSubject,
  createSchool,
  createUser,
  type Scenario,
} from '../support/factories';
import { open, signIn } from './support';

type GoldenRole = 'admin' | 'registrar' | 'teacher' | 'guardian';

const signInAs = (scenario: Scenario, who: GoldenRole): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario[who].cpf, password: scenario.password });

/** The pair every case in this suite examines: the status code and the body of the screen it came with. */
const screen = async (path: string, cookie: string): Promise<{ status: number; html: string }> => {
  const response = await open(path, cookie);
  return { status: response.status, html: await response.text() };
};

/**
 * The title of the page itself, not the menu item of the same name. `Minhas turmas` and
 * `Meus alunos` show up in the navigation of every screen of the role: without the class, the
 * assertion would pass with any teacher page standing in for the teacher's dashboard.
 */
const pageTitle = (text: string): string => `<h1 class="page__title">${text}</h1>`;

/** The screen's writing `form`, and not the sign-out one the header carries on every page. */
const formFor = (target: string): string => `method="post" action="${target}"`;

beforeEach(async () => {
  await clearDatabase();
});

/* --- Teacher ---------------------------------------------------------------- */

describe('the four screens of the class register', () => {
  test('the dashboard groups by class group and offers the actions of the whole room', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [classGroup, withoutAssignment] = scenario.classGroups;

    const { status, html } = await screen('/teacher', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Minhas turmas'));
    expect(html).toContain(classGroup.name);
    // The three allocated subjects open the register; roll call and closing belong to the class group.
    for (const subject of scenario.classGroupSubjects) {
      expect(html).toContain(`href="/teacher/subjects/${subject.id}/grades"`);
    }
    expect(html).toContain(`href="/teacher/class-groups/${classGroup.id}/roll-call"`);
    expect(html).toContain(`href="/teacher/class-groups/${classGroup.id}/closing"`);
    // The class group with no allocation of this teacher does not show up on his dashboard.
    expect(html).not.toContain(`href="/teacher/class-groups/${withoutAssignment.id}/roll-call"`);
  });

  test('a teacher with no allocation sees what is missing, not an empty list', async () => {
    const scenario = await fullScenario();
    const newlyArrived = await createUser({
      networkId: scenario.network.id,
      password: scenario.password,
      roles: [{ schoolId: scenario.schools[0].id, role: 'teacher' }],
    });
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: newlyArrived.cpf,
      password: scenario.password,
    });

    const { status, html } = await screen('/teacher', cookie);

    expect(status).toBe(200);
    expect(html).toContain('Nenhuma turma alocada');
  });

  test('the grades screen opens the table of the requested term, with one field per enrollment', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [assignment] = scenario.classGroupSubjects;
    const [subject] = scenario.subjects;

    const { status, html } = await screen(
      `/teacher/subjects/${assignment.id}/grades?term=3`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(subject.name));
    expect(html).toContain(`Notas do 3º bimestre · ${subject.name} · ${scenario.classGroups[0].name}`);
    expect(html).toContain('<th scope="col">Nota (0 a 10)</th>');
    expect(html).toContain(formFor(`/teacher/subjects/${assignment.id}/grades`));
    // The field is named after the enrollment, and the student on the row shows up by name.
    for (const enrollment of scenario.enrollments) {
      expect(html).toContain(`name="grade_${enrollment.id}"`);
    }
    for (const student of scenario.students) {
      expect(html).toContain(student.name);
    }
  });

  test('a made-up term in the URL opens the first one, because navigating is not writing', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [assignment] = scenario.classGroupSubjects;

    const { status, html } = await screen(
      `/teacher/subjects/${assignment.id}/grades?term=9`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain('Notas do 1º bimestre');
  });

  test('the day\'s roll call opens on the requested date, with everyone present', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [classGroup] = scenario.classGroups;

    const { status, html } = await screen(
      `/teacher/class-groups/${classGroup.id}/roll-call?date=2026-03-02`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(`Chamada · ${classGroup.name}`));
    expect(html).toContain(`Chamada de 02/03/2026 · ${classGroup.name}`);
    expect(html).toContain('<th scope="col">Justificativa da falta</th>');
    expect(html).toContain(formFor(`/teacher/class-groups/${classGroup.id}/roll-call`));
    expect(html).toContain('name="date" value="2026-03-02"');
    // With nothing on record for the day, each student\'s box arrives already ticked.
    for (const enrollment of scenario.enrollments) {
      expect(html).toContain(`name="present_${enrollment.id}"\n                   checked`);
      expect(html).toContain(`name="excuse_${enrollment.id}"`);
    }
    // The axis of the screen is the calendar: one day back and one day forward.
    expect(html).toContain(`/teacher/class-groups/${classGroup.id}/roll-call?date=2026-03-01`);
    expect(html).toContain(`/teacher/class-groups/${classGroup.id}/roll-call?date=2026-03-03`);
  });

  test('a roll call with no date in the URL opens on a day, not on a screen with no date', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [classGroup] = scenario.classGroups;

    const { status, html } = await screen(`/teacher/class-groups/${classGroup.id}/roll-call`, cookie);

    expect(status).toBe(200);
    expect(html).toMatch(/name="date" value="\d{4}-\d{2}-\d{2}"/);
  });

  test('the roll call of a class group with no active enrollment explains the emptiness', async () => {
    const scenario = await fullScenario();
    // The scenario's second class group is born empty: allocating the teacher to it is what opens the door.
    const subject = await createSubject({ networkId: scenario.network.id });
    await createClassGroupSubject({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[1].id,
      subjectId: subject.id,
      teacherUserId: scenario.teacher.id,
    });
    const cookie = await signInAs(scenario, 'teacher');

    const { status, html } = await screen(
      `/teacher/class-groups/${scenario.classGroups[1].id}/roll-call`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain('Nenhum aluno matriculado');
  });

  test('the closing screen shows all four terms, the ones that have not even started included', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [classGroup] = scenario.classGroups;

    const { status, html } = await screen(`/teacher/class-groups/${classGroup.id}/closing`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(`Fechamento · ${classGroup.name}`));
    expect(html).toContain(formFor(`/teacher/class-groups/${classGroup.id}/closing`));
    for (const term of [1, 2, 3, 4]) {
      expect(html).toContain(`<h2>${term}º bimestre</h2>`);
      expect(html).toContain(`Fechar ${term}º bimestre`);
      expect(html).toContain(`name="term" value="${term}"`);
    }
    // Each open term offers the shortcut into the register of this teacher\'s subjects.
    expect(html).toContain(`/teacher/subjects/${scenario.classGroupSubjects[0].id}/grades?term=1`);
  });
});

/* --- Guardian --------------------------------------------------------------- */

describe('the screens of the guardian portal', () => {
  test('the dashboard lists the family\'s enrollments and points at report card and attendance', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'guardian');
    const [mine, fromAnotherFamily] = scenario.enrollments;

    const { status, html } = await screen('/guardian', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Meus alunos'));
    expect(html).toContain('Matrículas sob sua responsabilidade');
    expect(html).toContain(scenario.students[0].name);
    expect(html).toContain(`href="/guardian/enrollments/${mine.id}/report-card"`);
    expect(html).toContain(`href="/guardian/enrollments/${mine.id}/attendance"`);
    // A student from another family does not appear, not even as a link.
    expect(html).not.toContain(`href="/guardian/enrollments/${fromAnotherFamily.id}/report-card"`);
  });

  test('the dashboard carries what the school said and has not been read yet', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    const unread = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Reunião de pais na quinta',
      recipients: [{ guardianId: guardian.id }],
    });
    const alreadyRead = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Calendário do primeiro bimestre',
      recipients: [{ guardianId: guardian.id, readAt: new Date() }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status, html } = await screen('/guardian', cookie);

    expect(status).toBe(200);
    expect(html).toContain(`href="/guardian/board/${unread.id}"`);
    expect(html).toContain(unread.title);
    expect(html).toContain('Não lido');
    // The dashboard shows only what is left to read; what has been read lives on the board.
    expect(html).not.toContain(`href="/guardian/board/${alreadyRead.id}"`);
  });

  test('an account holding the role but no link sends the person to the registrar', async () => {
    const scenario = await fullScenario();
    const withoutGuardianLink = await createUser({
      networkId: scenario.network.id,
      password: scenario.password,
      roles: [{ schoolId: scenario.schools[0].id, role: 'guardian' }],
    });
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: withoutGuardianLink.cpf,
      password: scenario.password,
    });

    const { status, html } = await screen('/guardian', cookie);

    expect(status).toBe(200);
    expect(html).toContain('Nenhum aluno vinculado à sua conta');
  });

  test('the board splits what is unread from what is read into two weights', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    const unread = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Feira de ciências no sábado',
      recipients: [{ guardianId: guardian.id }],
    });
    const alreadyRead = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Uniforme novo a partir de março',
      recipients: [{ guardianId: guardian.id, readAt: new Date() }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status, html } = await screen('/guardian/board', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Mural de comunicados'));
    expect(html).toContain('<h2 id="unread-title">Não lidos</h2>');
    expect(html).toContain('<h2 id="read-title">Já lidos</h2>');
    expect(html).toContain(`href="/guardian/board/${unread.id}"`);
    expect(html).toContain(`href="/guardian/board/${alreadyRead.id}"`);
    expect(html).toContain(unread.title);
    expect(html).toContain(alreadyRead.title);
  });

  test('the announcement opens in full, with the button that records the reading', async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Vacinação na escola',
      body: 'A equipe da unidade de saúde estará na escola na próxima terça-feira.',
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status, html } = await screen(`/guardian/board/${announcement.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(announcement.title));
    expect(html).toContain(announcement.body);
    expect(html).toContain(scenario.registrar.name);
    // Opening the page marks no reading: what marks it is this form, over POST.
    expect(html).toContain(formFor(`/guardian/board/${announcement.id}/read`));
    expect(html).toContain('Marcar como lido');
  });

  test('an announcement already read shows the reading date in place of the button', async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Boletim disponível no portal',
      recipients: [{ guardianId: scenario.guardians[0].id, readAt: new Date() }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status, html } = await screen(`/guardian/board/${announcement.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(announcement.title));
    expect(html).toContain('tag--passed');
    expect(html).not.toContain('Marcar como lido');
    expect(html).not.toContain(formFor(`/guardian/board/${announcement.id}/read`));
  });

  test('an announcement of another family does not exist for whoever asks', async () => {
    const scenario = await fullScenario();
    const fromAnotherFamily = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[1].id }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status } = await screen(`/guardian/board/${fromAnotherFamily.id}`, cookie);

    expect(status).toBe(404);
  });

  test('an announcement not yet published opens on nobody\'s board', async () => {
    const scenario = await fullScenario();
    const draft = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status } = await screen(`/guardian/board/${draft.id}`, cookie);

    expect(status).toBe(404);
  });
});

/* --- Announcements ---------------------------------------------------------- */

describe('the screens of whoever publishes to the board', () => {
  /** Two recipients and one reading: the rate of that slice is exactly one half. */
  const halfReadAnnouncement = (scenario: Scenario, schoolId: string, title: string) =>
    createAnnouncement({
      networkId: scenario.network.id,
      schoolId,
      authorUserId: scenario.registrar.id,
      title,
      recipients: [
        { guardianId: scenario.guardians[0].id, readAt: new Date() },
        { guardianId: scenario.guardians[1].id },
      ],
    });

  test('the list shows the read rate, which is the reason the screen exists', async () => {
    const scenario = await fullScenario();
    const announcement = await halfReadAnnouncement(
      scenario,
      scenario.schools[0].id,
      'Semana de provas',
    );
    const cookie = await signInAs(scenario, 'registrar');

    const { status, html } = await screen('/announcements', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Comunicados'));
    expect(html).toContain('Comunicados e leituras');
    expect(html).toContain('<th scope="col">Destinatários</th>');
    expect(html).toContain('<th scope="col">Taxa de leitura</th>');
    expect(html).toContain(announcement.title);
    expect(html).toContain('50,0 %');
    expect(html).toContain('href="/announcements/new"');
  });

  test('the registrar sees the school where the role holds, and the administrator sees the network', async () => {
    const scenario = await fullScenario();
    const atRegistrarSchool = await halfReadAnnouncement(
      scenario,
      scenario.schools[0].id,
      'Aviso da Escola Central',
    );
    const atOtherSchool = await halfReadAnnouncement(
      scenario,
      scenario.schools[1].id,
      'Aviso da Escola Bairro',
    );

    const registrarList = await screen('/announcements', await signInAs(scenario, 'registrar'));
    const adminList = await screen('/announcements', await signInAs(scenario, 'admin'));

    expect(registrarList.status).toBe(200);
    expect(registrarList.html).toContain(atRegistrarSchool.title);
    expect(registrarList.html).not.toContain(atOtherSchool.title);

    expect(adminList.status).toBe(200);
    expect(adminList.html).toContain(atRegistrarSchool.title);
    expect(adminList.html).toContain(atOtherSchool.title);
  });

  test('the query filter cuts the list down to the chosen school', async () => {
    const scenario = await fullScenario();
    const atCentralSchool = await halfReadAnnouncement(
      scenario,
      scenario.schools[0].id,
      'Só da Escola Central',
    );
    const atNeighbourhoodSchool = await halfReadAnnouncement(
      scenario,
      scenario.schools[1].id,
      'Só da Escola Bairro',
    );
    const cookie = await signInAs(scenario, 'admin');

    const { status, html } = await screen(
      `/announcements?schoolId=${scenario.schools[1].id}`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(atNeighbourhoodSchool.title);
    expect(html).not.toContain(atCentralSchool.title);
    // The filter comes back already chosen, so the next page stays inside the same slice.
    expect(html).toContain(`<option value="${scenario.schools[1].id}" selected>`);
  });

  test('a school outside the reach of whoever is listing answers 404, not an empty list', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const { status } = await screen(`/announcements?schoolId=${scenario.schools[1].id}`, cookie);

    expect(status).toBe(404);
  });

  test('the sending starts by choosing the school, because the recipients come from it', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const { status, html } = await screen('/announcements/new', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Novo comunicado'));
    expect(html).toContain('Passo 1 · Unidade');
    expect(html).toContain('method="get" action="/announcements/new"');
    expect(html).toContain(`<option value="${scenario.schools[0].id}">`);
    // The school where this registrar holds no role does not enter the choice.
    expect(html).not.toContain(`<option value="${scenario.schools[1].id}">`);
  });

  test('with the school chosen, step two carries title, message and recipients', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const [school] = scenario.schools;

    const { status, html } = await screen(`/announcements/new?schoolId=${school.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain('Passo 2 · Mensagem');
    expect(html).toContain(school.name);
    expect(html).toContain(formFor('/announcements/new'));
    expect(html).toContain(`name="schoolId" value="${school.id}"`);
    expect(html).toContain('name="title"');
    expect(html).toContain('name="body"');
    // The `[]` suffix is what makes a second ticked box add up instead of overwriting the first.
    expect(html).toContain('name="guardians[]"');
    for (const guardian of scenario.guardians) {
      expect(html).toContain(`value="${guardian.id}"`);
      expect(html).toContain(guardian.name);
    }
  });

  test('a school outside the reach of whoever publishes does not open the form', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const { status } = await screen(
      `/announcements/new?schoolId=${scenario.schools[1].id}`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('an inactive school receives no announcement and does not show up in the choice', async () => {
    const scenario = await fullScenario();
    const closed = await createSchool({
      networkId: scenario.network.id,
      name: 'Escola Desativada',
      active: false,
    });
    const cookie = await signInAs(scenario, 'admin');

    const choice = await screen('/announcements/new', cookie);
    const direct = await screen(`/announcements/new?schoolId=${closed.id}`, cookie);

    expect(choice.status).toBe(200);
    expect(choice.html).toContain(`<option value="${scenario.schools[0].id}">`);
    expect(choice.html).not.toContain(`<option value="${closed.id}">`);
    expect(choice.html).not.toContain(closed.name);
    expect(direct.status).toBe(404);
  });
});
