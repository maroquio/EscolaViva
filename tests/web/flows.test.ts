/*
 * The two paths that cross all of Stage 01 over HTTP.
 *
 * Nothing here calls a use case directly: every step is a request the way the browser would make
 * it, with a urlencoded form, an idempotency key and POST-Redirect-GET. What gets checked at the
 * end is not the return of a function, it is what the next screen shows — because that is what the
 * registrar and the guardian actually see.
 *
 * (a) The registrar records a student, records a guardian, ties the two together, enrolls, and the
 *     enrollment shows up in the class group.
 * (b) The teacher posts the grades of all four terms, records the roll call, closes the four
 *     terms — and only then does the guardian's report card stop saying "em curso" and give the
 *     final status. It is the path that ties `academics`, `assessment` and the pedagogical rule
 *     together.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { generateCpf } from '../../src/shared/document';
import { clearDatabase, testSql } from '../support/database';
import { fullScenario, type Scenario } from '../support/factories';
import { open, signIn, send } from './support';

const FLOW_DEADLINE_MS = 60_000;

const TERMS = [1, 2, 3, 4] as const;
const ROLL_CALL_DAYS = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'] as const;
const NOTA_DE_APROVACAO = '8';

const targetIdentifier = (response: Response): string => {
  const target = response.headers.get('Location') ?? '';
  const path = target.split('?')[0] ?? '';
  return path.slice(path.lastIndexOf('/') + 1);
};

const guardianByEmail = async (networkId: string, email: string): Promise<string> => {
  const rows = await testSql()<{ id: string }[]>`
    SELECT id::text FROM app_user WHERE network_id = ${networkId} AND email = ${email}`;
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`responsável ${email} não foi gravado`);
  return id;
};

const signInAs = (
  scenario: Scenario,
  who: 'registrar' | 'teacher' | 'guardian',
): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario[who].cpf, password: scenario.password });

describe('the registrar enrolls a new student, from the record to the class group', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('recording, linking and enrolling leaves the student in the chosen class group', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const targetClassGroup = scenario.classGroups[1];
    const studentName = 'Marina Aparecida do Vale';
    const guardianName = 'Cleuza do Vale';
    const guardianEmail = 'cleuza.do.vale@escolaviva.test';

    const registration = await send(
      '/registrar/students',
      { name: studentName, birthDate: '2014-07-21' },
      cookie,
    );
    const studentId = targetIdentifier(registration);

    const guardian = await send(
      '/registrar/guardians',
      {
        name: guardianName, email: guardianEmail, phone: '(27) 99999-0000',
        cpf: generateCpf(7_100_001),
      },
      cookie,
    );
    const guardianId = await guardianByEmail(scenario.network.id, guardianEmail);

    const guardianLink = await send(
      `/registrar/students/${studentId}/guardians`,
      { userId: guardianId, relationship: 'mãe', financiallyResponsible: 'on' },
      cookie,
    );

    const enrollment = await send(
      '/registrar/enrollments',
      {
        studentId: studentId,
        classGroupId: targetClassGroup.id,
        academicYearId: scenario.academicYear.id,
        enrollmentDate: '2026-02-10',
      },
      cookie,
    );

    const classGroup = await open(`/registrar/class-groups/${targetClassGroup.id}`, cookie);
    const classGroupPage = await classGroup.text();

    expect([registration.status, guardian.status, guardianLink.status, enrollment.status]).toEqual([
      303, 303, 303, 303,
    ]);
    expect(enrollment.headers.get('Location')).toContain(`/registrar/students/${studentId}`);
    expect(classGroup.status).toBe(200);
    expect(classGroupPage).toContain(studentName);
  }, FLOW_DEADLINE_MS);

  test('the student record shows the linked guardian and the active enrollment', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const studentName = 'Ivo Sampaio Rezende';
    const guardianEmail = 'tia.de.ivo@escolaviva.test';

    const registration = await send(
      '/registrar/students',
      { name: studentName, birthDate: '2013-01-30' },
      cookie,
    );
    const studentId = targetIdentifier(registration);
    await send(
      '/registrar/guardians',
      { name: 'Regina Sampaio', email: guardianEmail, phone: '', cpf: generateCpf(7_100_002) },
      cookie,
    );
    const guardianId = await guardianByEmail(scenario.network.id, guardianEmail);
    await send(
      `/registrar/students/${studentId}/guardians`,
      { userId: guardianId, relationship: 'tia', financiallyResponsible: 'on' },
      cookie,
    );
    await send(
      '/registrar/enrollments',
      {
        studentId: studentId,
        classGroupId: scenario.classGroups[1].id,
        academicYearId: scenario.academicYear.id,
        enrollmentDate: '2026-02-10',
      },
      cookie,
    );

    const record = await (await open(`/registrar/students/${studentId}`, cookie)).text();

    expect(record).toContain('Regina Sampaio');
    expect(record).toContain('tia');
    expect(record).toContain(scenario.classGroups[1].name);
    expect(record).toContain('Ativa');
  }, FLOW_DEADLINE_MS);
});

describe('the teacher closes the year and the guardian reads the report card', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const postAllGrades = async (scenario: Scenario, cookie: string): Promise<Response[]> => {
    const submissions: Response[] = [];
    for (const assignment of scenario.classGroupSubjects) {
      for (const term of TERMS) {
        const fields: Record<string, string> = { term: String(term) };
        for (const enrollment of scenario.enrollments) {
          fields[`grade_${enrollment.id}`] = NOTA_DE_APROVACAO;
        }
        submissions.push(await send(`/teacher/subjects/${assignment.id}/grades`, fields, cookie));
      }
    }
    return submissions;
  };

  const recordFullRollCall = async (
    scenario: Scenario,
    cookie: string,
  ): Promise<Response[]> => {
    const submissions: Response[] = [];
    for (const date of ROLL_CALL_DAYS) {
      const fields: Record<string, string> = { date: date };
      for (const enrollment of scenario.enrollments) fields[`present_${enrollment.id}`] = 'on';
      submissions.push(
        await send(`/teacher/class-groups/${scenario.classGroups[0].id}/roll-call`, fields, cookie),
      );
    }
    return submissions;
  };

  const closeTerm = (scenario: Scenario, cookie: string, term: number): Promise<Response> =>
    send(
      `/teacher/class-groups/${scenario.classGroups[0].id}/closing`,
      { term: String(term) },
      cookie,
    );

  test('four terms posted, roll call recorded and the year closed give the final status', async () => {
    const scenario = await fullScenario();
    const teacherCookie = await signInAs(scenario, 'teacher');
    const guardianCookie = await signInAs(scenario, 'guardian');
    const reportCardOf = (): Promise<Response> =>
      open(`/guardian/enrollments/${scenario.enrollments[0].id}/report-card`, guardianCookie);

    const grades = await postAllGrades(scenario, teacherCookie);
    const rollCalls = await recordFullRollCall(scenario, teacherCookie);

    const beforeClosing = await (await reportCardOf()).text();
    const closings: Response[] = [];
    for (const term of TERMS) {
      closings.push(await closeTerm(scenario, teacherCookie, term));
    }
    const afterClosing = await reportCardOf();
    const reportCard = await afterClosing.text();

    expect(grades.every((response) => response.status === 303)).toBe(true);
    expect(rollCalls.every((response) => response.status === 303)).toBe(true);
    expect(closings.every((response) => response.status === 303)).toBe(true);
    expect(beforeClosing).toContain('Em curso');
    expect(afterClosing.status).toBe(200);
    expect(reportCard).toContain('Aprovado');
    expect(reportCard).not.toContain('Em curso');
  }, FLOW_DEADLINE_MS);

  test('the report card shows the average and the attendance that decided the status', async () => {
    const scenario = await fullScenario();
    const teacherCookie = await signInAs(scenario, 'teacher');
    const guardianCookie = await signInAs(scenario, 'guardian');

    await postAllGrades(scenario, teacherCookie);
    await recordFullRollCall(scenario, teacherCookie);
    for (const term of TERMS) await closeTerm(scenario, teacherCookie, term);
    const reportCard = await (
      await open(`/guardian/enrollments/${scenario.enrollments[0].id}/report-card`, guardianCookie)
    ).text();

    expect(reportCard).toContain('8,0');
    expect(reportCard).toContain('100,0 %');
    expect(reportCard).toContain(scenario.students[0].name);
    for (const subject of scenario.subjects) expect(reportCard).toContain(subject.name);
  }, FLOW_DEADLINE_MS);

  test('the day-by-day attendance shows all four roll calls recorded', async () => {
    const scenario = await fullScenario();
    const teacherCookie = await signInAs(scenario, 'teacher');
    const guardianCookie = await signInAs(scenario, 'guardian');

    await recordFullRollCall(scenario, teacherCookie);
    const page = await open(
      `/guardian/enrollments/${scenario.enrollments[0].id}/attendance`,
      guardianCookie,
    );
    const attendance = await page.text();

    expect(page.status).toBe(200);
    expect(attendance).toContain('02/03/2026');
    expect(attendance).toContain('05/03/2026');
  }, FLOW_DEADLINE_MS);

  test('the closing is refused while grades are missing, and the report card stays in progress', async () => {
    const scenario = await fullScenario();
    const teacherCookie = await signInAs(scenario, 'teacher');
    const guardianCookie = await signInAs(scenario, 'guardian');

    const rejection = await closeTerm(scenario, teacherCookie, 1);
    const rejectionBody = await rejection.text();
    const reportCard = await (
      await open(`/guardian/enrollments/${scenario.enrollments[0].id}/report-card`, guardianCookie)
    ).text();

    // Five active enrollments across three allocated subjects, no grade posted: fifteen are missing.
    expect(rejection.status).toBe(200);
    expect(rejectionBody).toContain('Faltam 15 notas para fechar o bimestre');
    expect(reportCard).toContain('Em curso');
  }, FLOW_DEADLINE_MS);
});
