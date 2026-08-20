/*
 * The registrar's first front in JSON: students, guardians, enrollments and the transfer.
 *
 * Everything this file pins already existed on the SSR screens; what changes is the envelope. The
 * scope rules are the reason the suite is this long — a registrar answers for the schools where they
 * hold the role and for nothing else, and every leak of that boundary is a privacy incident rather
 * than a bug. So each endpoint is asked the same four uncomfortable questions: what happens with no
 * session, with the wrong role, with a target from another network, and with a target from a school
 * of the same network the registrar does not answer for.
 *
 * The single deliberate asymmetry is `POST /registrar/guardians`: a school outside the scope comes
 * back as a field error, not as a 404, because that screen shows a selector and the person has to be
 * told which field is wrong. Tightening it into a 404 would be a behaviour change, so a case below
 * holds it in place.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { API } from '../../src/http/constants';
import { clearDatabase, testSql } from '../support/database';
import {
  DEFAULT_YEAR,
  createAcademicYear,
  createClassGroup,
  createEnrollment,
  createGuardian,
  createStudent,
  createUser,
  fullScenario,
  linkStudentGuardian,
  twoNetworks,
  type Scenario,
  type TestUser,
} from '../support/factories';
import { read, signIn, write, writeWithKey } from './support';

const REGISTRAR = `${API.versionedPrefix}/registrar`;
const DASHBOARD = `${REGISTRAR}/dashboard`;
const STUDENTS = `${REGISTRAR}/students`;
const GUARDIANS = `${REGISTRAR}/guardians`;
const ENROLLMENTS = `${REGISTRAR}/enrollments`;

const ENROLLMENT_DATE = `${DEFAULT_YEAR}-02-10`;
const TRANSFER_DATE = `${DEFAULT_YEAR}-03-01`;
const VALID_CPF = '529.982.247-25';

/** Not a uuid, which is the only shape the idempotency middleware accepts. */
const MALFORMED_KEY = 'chave-que-nao-e-uuid';

type Refusal = { errors: { field?: string; code: string; message: string }[] };
type Created = { id: string };
type Invited = { id: string; temporaryPassword: string };
type Repeated = { repeated: boolean; location: string };

type PageOf<T> = {
  items: T[];
  page: number;
  pages: number;
  total: number;
  size: number;
};

type StudentRow = {
  id: string;
  name: string;
  birthDate: string;
  classGroupName: string | null;
  year: number | null;
  status: string | null;
};

type GuardianRow = {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
};

type LinkRow = {
  userId: string;
  name: string;
  email: string;
  relationship: string;
  financiallyResponsible: boolean;
};

type EnrollmentRow = {
  id: string;
  studentId: string;
  classGroupId: string;
  classGroupName: string;
  year: number;
  status: string;
};

type RecordBody = {
  student: { id: string; name: string; birthDate: string };
  guardians: PageOf<LinkRow>;
  enrollments: PageOf<EnrollmentRow>;
  active: EnrollmentRow | null;
};

type TransferBody = {
  enrollment: EnrollmentRow;
  student: { id: string };
  classGroups: { id: string; schoolName: string; year: number | null }[];
};

type DashboardBody = {
  schools: PageOf<{
    schoolId: string;
    schoolName: string;
    students: number;
    classGroups: number;
    guardians: number;
  }>;
  currentYear: { id: string; year: number } | null;
  totals: { classGroups: number; enrollments: number; guardians: number; subjects: number };
};

const signInAs = (scenario: Scenario, user: TestUser): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: user.cpf, password: user.password });

const asRegistrar = (scenario: Scenario): Promise<string> => signInAs(scenario, scenario.registrar);

/** A student of the same network with no enrollment anywhere — nobody's exclusive record. */
const studentWithoutEnrollment = (scenario: Scenario): Promise<{ id: string }> =>
  createStudent({ networkId: scenario.network.id });

/** A student who studies at the second school, where the scenario's registrar has no role. */
async function studentOfTheOtherSchool(scenario: Scenario): Promise<{ id: string }> {
  const classGroup = await createClassGroup({
    networkId: scenario.network.id,
    schoolId: scenario.schools[1].id,
    academicYearId: scenario.academicYear.id,
  });
  const student = await createStudent({ networkId: scenario.network.id });
  await createEnrollment({
    networkId: scenario.network.id,
    studentId: student.id,
    classGroupId: classGroup.id,
    academicYearId: scenario.academicYear.id,
  });
  return student;
}

/*
 * Counting straight against the database, one query per table. A 201 says what the route believes;
 * only the row says what happened — and for the idempotency cases it is the only difference between
 * "answered twice" and "created twice".
 */
const total = (rows: { total: string }[]): number => Number(rows[0]?.total ?? '0');

const countStudentsById = async (id: string): Promise<number> =>
  total(await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM student WHERE id = ${id}`);

const countStudentsNamed = async (name: string): Promise<number> =>
  total(await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM student WHERE name = ${name}`);

const countLinksOf = async (userId: string): Promise<number> =>
  total(await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM student_guardian WHERE user_id = ${userId}`);

const countRolesOf = async (userId: string): Promise<number> =>
  total(await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM user_role WHERE user_id = ${userId}`);

const countUsersWithEmail = async (email: string): Promise<number> =>
  total(await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM app_user WHERE email = ${email}`);

const countEnrollmentsOf = async (studentId: string): Promise<number> =>
  total(await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM enrollment WHERE student_id = ${studentId}`);

describe('the registrar dashboard counters', () => {
  /*
   * The three per-school numbers had no assertion at all, and one of them was renamed on the way
   * out: the presenter emitted `students` for what the domain counts as `enrollments`, and what the
   * SSR table headed "Matrículas ativas". They are not synonyms — a transfer closes one enrolment
   * and opens another for the same person — so a screen reading `students` would put the wrong
   * word above a real number.
   *
   * Swapping any two of the three keys in the presenter used to keep the suite green. These cases
   * are what stops that.
   */
  test('each school reports its own enrolments, class groups and guardians', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as {
      schools: { items: { schoolId: string; enrollments: number; classGroups: number; guardians: number }[] };
    };
    const school = body.schools.items.find((item) => item.schoolId === scenario.schools[0].id);

    expect(response.status).toBe(200);
    expect(school?.enrollments).toBe(scenario.enrollments.length);
    expect(school?.guardians).toBe(scenario.guardians.length);
    expect(school?.classGroups).toBeGreaterThan(0);
  });

  /*
   * The counters must differ from one another, or an assertion on three equal numbers would pass
   * against a presenter that read the same field three times.
   */
  test('the three counters are not the same number', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const body = (await (await read(DASHBOARD, cookie)).json()) as {
      schools: { items: { schoolId: string; enrollments: number; classGroups: number }[] };
    };
    const school = body.schools.items.find((item) => item.schoolId === scenario.schools[0].id);

    expect(school?.enrollments).not.toBe(school?.classGroups);
  });
});

describe('the registrar dashboard', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('it answers the totals of the schools the registrar answers for', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as DashboardBody;

    expect(response.status).toBe(200);
    expect(body.totals.enrollments).toBe(scenario.enrollments.length);
    expect(body.totals.classGroups).toBe(scenario.classGroups.length);
    expect(body.currentYear?.year).toBe(scenario.academicYear.year);
  });

  /*
   * The scenario's registrar holds the role in one school out of two, and the second school has a
   * class group and no registrar of its own. A dashboard that counted the network instead of the
   * scope would show the same numbers to two people with different responsibilities.
   */
  test('the school the registrar does not answer for is not in the page', async () => {
    const scenario = await fullScenario();
    await studentOfTheOtherSchool(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as DashboardBody;

    expect(body.schools.total).toBe(1);
    expect(body.schools.items[0]?.schoolId).toBe(scenario.schools[0].id);
    expect(body.totals.enrollments).toBe(scenario.enrollments.length);
  });

  /*
   * The cursor is clamped, not refused: `queryPage` and `sliceItems` both fall back to the last
   * page. An empty page or a 404 here would be a regression dressed as strictness.
   */
  test('a page beyond the end answers the last page, not an empty one', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(`${DASHBOARD}?p=999`, cookie);
    const body = (await response.json()) as DashboardBody;

    expect(response.status).toBe(200);
    expect(body.schools.page).toBe(1);
    expect(body.schools.items.length).toBe(1);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const teacher = await signInAs(scenario, scenario.teacher);

    const anonymous = await read(DASHBOARD);
    const wrongRole = await read(DASHBOARD, teacher);

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});

describe('searching for students', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * The empty search never reaches the database. Five students exist in this scenario and the
   * answer is still an empty page — which is what proves no query ran, since any query over
   * `name ILIKE '%%'` would have returned all five.
   */
  test('with no term it answers an empty page without searching', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(STUDENTS, cookie);
    const body = (await response.json()) as PageOf<StudentRow>;

    expect(response.status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  test('with a term it answers the students and their active enrollment', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const wanted = scenario.students[0];

    const response = await read(`${STUDENTS}?q=${encodeURIComponent(wanted.name)}`, cookie);
    const body = (await response.json()) as PageOf<StudentRow>;

    expect(response.status).toBe(200);
    expect(body.items[0]?.id).toBe(wanted.id);
    expect(body.items[0]?.classGroupName).toBe(scenario.classGroups[0].name);
    expect(body.items[0]?.year).toBe(scenario.academicYear.year);
    expect(body.items[0]?.status).toBe('active');
  });

  /*
   * The student studies at the other school. The row still comes back — the search is by network —
   * but the enrollment columns are empty, because the enrollment is not the registrar's to see.
   */
  test('a student enrolled elsewhere comes back without the enrollment columns', async () => {
    const scenario = await fullScenario();
    const student = await studentOfTheOtherSchool(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await read(`${STUDENTS}?q=Aluno`, cookie);
    const body = (await response.json()) as PageOf<StudentRow>;
    const row = body.items.find((item) => item.id === student.id);

    expect(row?.classGroupName).toBeNull();
    expect(row?.status).toBeNull();
  });

  test('a page beyond the end answers the last page with the rows on it', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(`${STUDENTS}?q=Aluno&p=999`, cookie);
    const body = (await response.json()) as PageOf<StudentRow>;

    expect(response.status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.items.length).toBe(scenario.students.length);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await read(`${STUDENTS}?q=Aluno`)).status).toBe(401);
    expect((await read(`${STUDENTS}?q=Aluno`, teacher)).status).toBe(403);
  });
});

describe('the student record', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('it carries the student, the guardians, the history and the active enrollment', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const student = scenario.students[0];

    const response = await read(`${STUDENTS}/${student.id}`, cookie);
    const body = (await response.json()) as RecordBody;

    expect(response.status).toBe(200);
    expect(body.student.id).toBe(student.id);
    expect(body.guardians.items[0]?.userId).toBe(scenario.guardians[0].id);
    expect(body.enrollments.total).toBe(1);
    expect(body.active?.id).toBe(scenario.enrollments[0].id);
  });

  /*
   * The rule that the SSR helper `studentInScope` encodes: a student with an enrollment, but none
   * in the registrar's schools, does not exist for that registrar. It is a 404 and not a 403 on
   * purpose — confirming the record exists would already leak that the person studies somewhere.
   */
  test('a student who studies at another school does not exist for this registrar', async () => {
    const scenario = await fullScenario();
    const student = await studentOfTheOtherSchool(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await read(`${STUDENTS}/${student.id}`, cookie);

    expect(response.status).toBe(404);
  });

  /*
   * The other half of the same rule, and the reason it is not simply "the registrar's schools": a
   * student with no enrollment at all belongs to the network, and every registrar of the network
   * has to be able to open the record — otherwise nobody could ever enroll them.
   */
  test('a student with no enrollment appears for every registrar of the network', async () => {
    const scenario = await fullScenario();
    const student = await studentWithoutEnrollment(scenario);
    const other = await createUser({
      networkId: scenario.network.id,
      roles: [{ schoolId: scenario.schools[1].id, role: 'registrar' }],
    });

    const mine = await read(`${STUDENTS}/${student.id}`, await asRegistrar(scenario));
    const theirs = await read(`${STUDENTS}/${student.id}`, await signInAs(scenario, other));

    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(200);
  });

  /*
   * Two tables, two cursors. A single `p` would move both, and the person who reached the second
   * page of guardians would silently lose the enrollment they were reading beside it.
   */
  test('pGuardians advances the guardians alone, leaving the enrollments where they were', async () => {
    const scenario = await fullScenario();
    const student = scenario.students[0];
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        const guardian = await createGuardian({
          networkId: scenario.network.id,
          schoolId: scenario.schools[0].id,
        });
        await linkStudentGuardian({
          networkId: scenario.network.id,
          studentId: student.id,
          userId: guardian.id,
        });
      }),
    );
    const cookie = await asRegistrar(scenario);

    const first = (await (await read(`${STUDENTS}/${student.id}`, cookie)).json()) as RecordBody;
    const second = (await (
      await read(`${STUDENTS}/${student.id}?pGuardians=2&pEnrollments=1`, cookie)
    ).json()) as RecordBody;

    expect(first.guardians.total).toBe(11);
    expect(first.guardians.items.length).toBe(10);
    expect(second.guardians.page).toBe(2);
    expect(second.guardians.items.length).toBe(1);
    expect(second.enrollments.items).toEqual(first.enrollments.items);
  });

  test('a student of another network does not exist here', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await asRegistrar(a);

    const response = await read(`${STUDENTS}/${b.students[0].id}`, cookie);

    expect(response.status).toBe(404);
  });

  /*
   * An id that is not a uuid never reaches the database: `isUuid` refuses it first. Without that
   * guard the query would raise, and a malformed address would answer 500 instead of 404.
   */
  test('an id that is not a uuid is a 404, not a failure', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(`${STUDENTS}/nao-e-um-uuid`, cookie);

    expect(response.status).toBe(404);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const path = `${STUDENTS}/${scenario.students[0].id}`;
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await read(path)).status).toBe(401);
    expect((await read(path, teacher)).status).toBe(403);
  });
});

describe('registering a student', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const student = { name: 'Ana Souza', birthDate: '2015-03-11' };

  test('a valid student answers 201 with the id and the Location', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', STUDENTS, student, cookie);
    const body = (await response.json()) as Created;

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(`${STUDENTS}/${body.id}`);
    expect(await countStudentsById(body.id)).toBe(1);
  });

  test('a missing name is refused by the edge, with 400 and the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', STUDENTS, { birthDate: student.birthDate }, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('name');
  });

  /*
   * Shape and rule are different answers. The empty name has the right shape — it is a string — so
   * the edge lets it through and the use case refuses it with 422 on the same field the form named.
   */
  test('an empty name is refused by the rule, with 422 on the same field', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', STUDENTS, { ...student, name: '' }, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('name');
  });

  test('a birth date in the future is refused by the rule on its own field', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', STUDENTS, { ...student, birthDate: '2999-01-01' }, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('birthDate');
  });

  test('a malformed idempotency key is refused before the route runs', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await writeWithKey('POST', STUDENTS, student, cookie, MALFORMED_KEY);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.code).toBe('missing_idempotency_key');
    expect(await countStudentsNamed(student.name)).toBe(0);
  });

  /*
   * I4: the same key twice is one record. The repeat does not create a second student and does not
   * answer 201 either — it hands back the address the first attempt produced.
   */
  test('the same key twice creates one student and the repeat points at it', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const key = crypto.randomUUID();

    const first = await writeWithKey('POST', STUDENTS, student, cookie, key);
    const again = await writeWithKey('POST', STUDENTS, student, cookie, key);
    const created = (await first.json()) as Created;
    const repeat = (await again.json()) as Repeated;

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(repeat.repeated).toBe(true);
    expect(repeat.location).toBe(`${STUDENTS}/${created.id}`);
    expect(await countStudentsNamed(student.name)).toBe(1);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await write('POST', STUDENTS, student)).status).toBe(401);
    expect((await write('POST', STUDENTS, student, teacher)).status).toBe(403);
  });
});

describe('linking a guardian to a student', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const link = (userId: string): Record<string, unknown> => ({
    userId,
    relationship: 'mãe',
    financiallyResponsible: true,
  });

  test('a valid link answers 201 pointing at the record it changed', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const student = scenario.students[0];
    const guardian = scenario.guardians[1];

    const response = await write(
      'POST',
      `${STUDENTS}/${student.id}/guardians`,
      link(guardian.id),
      cookie,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(`${STUDENTS}/${student.id}`);
    expect(await countLinksOf(guardian.id)).toBe(2);
  });

  /*
   * `financiallyResponsible` is a boolean in JSON, where the form used to say "the field is
   * present". A string is the wrong shape and the edge answers 400 — the use case never sees it.
   */
  test('a financiallyResponsible that is not a boolean is refused by the edge', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      `${STUDENTS}/${scenario.students[0].id}/guardians`,
      { ...link(scenario.guardians[1].id), financiallyResponsible: 'sim' },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('financiallyResponsible');
  });

  test('an empty relationship is refused by the rule on its field', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      `${STUDENTS}/${scenario.students[0].id}/guardians`,
      { ...link(scenario.guardians[1].id), relationship: '' },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('relationship');
  });

  test('linking the same guardian twice is refused by the rule, not by a crash', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      `${STUDENTS}/${scenario.students[0].id}/guardians`,
      link(scenario.guardians[0].id),
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('userId');
  });

  /*
   * The name promises the refusal happens *before any rule runs*, and only the table can say so: a
   * guard that ran after `linkGuardian` would answer the same 404 with the link already written.
   */
  test('a student out of the registrar scope is a 404 before any rule runs', async () => {
    const scenario = await fullScenario();
    const student = await studentOfTheOtherSchool(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      `${STUDENTS}/${student.id}/guardians`,
      link(scenario.guardians[0].id),
      cookie,
    );
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM student_guardian WHERE student_id = ${student.id}`;

    expect(response.status).toBe(404);
    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });

  test('the same key twice creates one link', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const guardian = scenario.guardians[1];
    const key = crypto.randomUUID();
    const path = `${STUDENTS}/${scenario.students[0].id}/guardians`;

    const first = await writeWithKey('POST', path, link(guardian.id), cookie, key);
    const again = await writeWithKey('POST', path, link(guardian.id), cookie, key);
    const repeat = (await again.json()) as Repeated;

    expect(first.status).toBe(201);
    expect(repeat.repeated).toBe(true);
    expect(await countLinksOf(guardian.id)).toBe(2);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const path = `${STUDENTS}/${scenario.students[0].id}/guardians`;
    const body = link(scenario.guardians[1].id);
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await write('POST', path, body)).status).toBe(401);
    expect((await write('POST', path, body, teacher)).status).toBe(403);
  });
});

describe('the guardians available for a student', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * The selector only offers what can still be chosen. A guardian already linked would be an
   * option that always fails, and the person would only find out after submitting.
   */
  test('a guardian already linked is not among the options', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const student = scenario.students[0];

    const response = await read(`${STUDENTS}/${student.id}/available-guardians`, cookie);
    const body = (await response.json()) as { id: string; name: string }[];
    const ids = body.map((option) => option.id);

    expect(response.status).toBe(200);
    expect(ids).not.toContain(scenario.guardians[0].id);
    expect(ids).toContain(scenario.guardians[1].id);
  });

  test('a student out of scope answers 404', async () => {
    const scenario = await fullScenario();
    const student = await studentOfTheOtherSchool(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await read(`${STUDENTS}/${student.id}/available-guardians`, cookie);

    expect(response.status).toBe(404);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const path = `${STUDENTS}/${scenario.students[0].id}/available-guardians`;
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await read(path)).status).toBe(401);
    expect((await read(path, teacher)).status).toBe(403);
  });
});

describe('the guardians of the network', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /** Twelve guardians and ten rows per page: the second page is what proves `?p=` is honoured. */
  const twelveGuardians = async (scenario: Scenario): Promise<void> => {
    await Promise.all(
      Array.from({ length: 7 }, () =>
        createGuardian({ networkId: scenario.network.id, schoolId: scenario.schools[0].id }),
      ),
    );
  };

  test('the page changes with p, and no guardian appears on both pages', async () => {
    const scenario = await fullScenario();
    await twelveGuardians(scenario);
    const cookie = await asRegistrar(scenario);

    const first = (await (await read(GUARDIANS, cookie)).json()) as PageOf<GuardianRow>;
    const second = (await (await read(`${GUARDIANS}?p=2`, cookie)).json()) as PageOf<GuardianRow>;
    const firstIds = new Set(first.items.map((guardian) => guardian.id));

    expect(first.total).toBe(12);
    expect(first.items.length).toBe(10);
    expect(second.page).toBe(2);
    expect(second.items.length).toBe(2);
    expect(second.items.some((guardian) => firstIds.has(guardian.id))).toBe(false);
  });

  test('a page beyond the end answers the last page, with rows on it', async () => {
    const scenario = await fullScenario();
    await twelveGuardians(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await read(`${GUARDIANS}?p=999`, cookie);
    const body = (await response.json()) as PageOf<GuardianRow>;

    expect(response.status).toBe(200);
    expect(body.page).toBe(2);
    expect(body.items.length).toBe(2);
  });

  test('the guardians of another network are not on this page', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await asRegistrar(a);

    const response = await read(GUARDIANS, cookie);
    const body = (await response.json()) as PageOf<GuardianRow>;
    const ids = body.items.map((guardian) => guardian.id);

    expect(body.total).toBe(a.guardians.length);
    expect(ids).not.toContain(b.guardians[0].id);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await read(GUARDIANS)).status).toBe(401);
    expect((await read(GUARDIANS, teacher)).status).toBe(403);
  });
});

describe('registering a guardian', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const guardian = {
    name: 'Marta Lima',
    email: 'marta.lima@escolaviva.test',
    phone: '(27) 99999-0000',
    cpf: VALID_CPF,
  };

  /** A registrar of two schools: the one case where the body's `schoolId` is actually read. */
  const registrarOfTwoSchools = (scenario: Scenario): Promise<TestUser> =>
    createUser({
      networkId: scenario.network.id,
      roles: [
        { schoolId: scenario.schools[0].id, role: 'registrar' },
        { schoolId: scenario.schools[1].id, role: 'registrar' },
      ],
    });

  /*
   * The invitation answers with the temporary password because there is nowhere else for it to
   * come from: no e-mail is sent at this stage, and the registrar has to be able to read it out to
   * the guardian. It is shown once and stored nowhere — which is why the assertion below checks it
   * is a non-empty string instead of comparing it to a value.
   */
  test('a guardian of the only school is registered without the body naming it', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', GUARDIANS, guardian, cookie);
    const body = (await response.json()) as Invited;

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(GUARDIANS);
    expect(typeof body.temporaryPassword).toBe('string');
    expect(body.temporaryPassword.length).toBeGreaterThan(0);
    expect(await countRolesOf(body.id)).toBe(1);
  });

  /*
   * The documented asymmetry of this front. Every other write answers a target outside the scope
   * with 404; this one answers a field error, because the screen has a school selector and the
   * person needs to be told which field to fix.
   */
  test('a school outside the scope is a field error on schoolId, not a 404', async () => {
    const { a, b } = await twoNetworks();
    const registrar = await registrarOfTwoSchools(a);
    const cookie = await signInAs(a, registrar);

    const response = await write(
      'POST',
      GUARDIANS,
      { ...guardian, schoolId: b.schools[0].id },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('schoolId');
    expect(body.errors[0]?.code).toBe('guardian_school_required');
  });

  test('a registrar of two schools chooses one of them and the invitation goes through', async () => {
    const scenario = await fullScenario();
    const registrar = await registrarOfTwoSchools(scenario);
    const cookie = await signInAs(scenario, registrar);

    const response = await write(
      'POST',
      GUARDIANS,
      { ...guardian, schoolId: scenario.schools[1].id },
      cookie,
    );
    const body = (await response.json()) as Invited;

    expect(response.status).toBe(201);
    expect(await countRolesOf(body.id)).toBe(1);
  });

  test('a missing e-mail is refused by the edge, with the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      GUARDIANS,
      { name: guardian.name, cpf: guardian.cpf },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('email');
  });

  test('an invalid CPF is refused by the rule, on the cpf field', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', GUARDIANS, { ...guardian, cpf: '111.111.111-11' }, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('cpf');
  });

  test('the same key twice invites one guardian', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const key = crypto.randomUUID();

    const first = await writeWithKey('POST', GUARDIANS, guardian, cookie, key);
    const again = await writeWithKey('POST', GUARDIANS, guardian, cookie, key);
    const repeat = (await again.json()) as Repeated;

    expect(first.status).toBe(201);
    expect(repeat.repeated).toBe(true);
    expect(await countUsersWithEmail(guardian.email)).toBe(1);
  });

  /* The temporary password is never written where a second reader could find it. */
  test('the temporary password does not reach the idempotency table', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', GUARDIANS, guardian, cookie);
    const body = (await response.json()) as Invited;
    const rows = await testSql()<{ response_location: string }[]>`
      SELECT response_location FROM idempotent_request`;

    expect(rows.every((row) => !row.response_location.includes(body.temporaryPassword))).toBe(true);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await write('POST', GUARDIANS, guardian)).status).toBe(401);
    expect((await write('POST', GUARDIANS, guardian, teacher)).status).toBe(403);
  });
});

describe('enrolling a student', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const enrollment = (scenario: Scenario, studentId: string): Record<string, unknown> => ({
    studentId,
    classGroupId: scenario.classGroups[0].id,
    academicYearId: scenario.academicYear.id,
    enrollmentDate: ENROLLMENT_DATE,
  });

  test('a valid enrollment answers 201 with the id and the Location', async () => {
    const scenario = await fullScenario();
    const student = await studentWithoutEnrollment(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', ENROLLMENTS, enrollment(scenario, student.id), cookie);

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(`${STUDENTS}/${student.id}`);
    expect(await countEnrollmentsOf(student.id)).toBe(1);
  });

  /*
   * The class group belongs to a school the registrar does not answer for. The answer is 404 and
   * not 422: the screen never offered that class group, so confirming it exists would be telling
   * the person about a school outside their scope.
   */
  test('a class group out of scope is a 404, not a field error', async () => {
    const scenario = await fullScenario();
    const student = await studentWithoutEnrollment(scenario);
    const classGroup = await createClassGroup({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      academicYearId: scenario.academicYear.id,
    });
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      ENROLLMENTS,
      { ...enrollment(scenario, student.id), classGroupId: classGroup.id },
      cookie,
    );

    expect(response.status).toBe(404);
    expect(await countEnrollmentsOf(student.id)).toBe(0);
  });

  test('a student of another network is a 404', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await asRegistrar(a);

    const response = await write('POST', ENROLLMENTS, enrollment(a, b.students[0].id), cookie);

    expect(response.status).toBe(404);
  });

  test('a missing academic year is refused by the edge with the field named', async () => {
    const scenario = await fullScenario();
    const student = await studentWithoutEnrollment(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      ENROLLMENTS,
      {
        studentId: student.id,
        classGroupId: scenario.classGroups[0].id,
        enrollmentDate: ENROLLMENT_DATE,
      },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('academicYearId');
  });

  /*
   * Two active enrollments in the same year are refused by a partial unique index, not by a check
   * in the application. The route only has to hand the failure back as 422 on the field.
   */
  test('a second active enrollment in the same year is refused by the rule', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      ENROLLMENTS,
      { ...enrollment(scenario, scenario.students[0].id), classGroupId: scenario.classGroups[1].id },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('studentId');
  });

  test('the same key twice enrolls once', async () => {
    const scenario = await fullScenario();
    const student = await studentWithoutEnrollment(scenario);
    const cookie = await asRegistrar(scenario);
    const key = crypto.randomUUID();
    const body = enrollment(scenario, student.id);

    const first = await writeWithKey('POST', ENROLLMENTS, body, cookie, key);
    const again = await writeWithKey('POST', ENROLLMENTS, body, cookie, key);
    const repeat = (await again.json()) as Repeated;

    expect(first.status).toBe(201);
    expect(repeat.repeated).toBe(true);
    expect(await countEnrollmentsOf(student.id)).toBe(1);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const student = await studentWithoutEnrollment(scenario);
    const body = enrollment(scenario, student.id);
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await write('POST', ENROLLMENTS, body)).status).toBe(401);
    expect((await write('POST', ENROLLMENTS, body, teacher)).status).toBe(403);
  });
});

describe('transferring an enrollment', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const transferPath = (enrollmentId: string): string =>
    `${ENROLLMENTS}/${enrollmentId}/transfer`;

  test('the screen carries the enrollment, the student and the class groups it can go to', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(transferPath(scenario.enrollments[0].id), cookie);
    const body = (await response.json()) as TransferBody;

    expect(response.status).toBe(200);
    expect(body.enrollment.id).toBe(scenario.enrollments[0].id);
    expect(body.student.id).toBe(scenario.students[0].id);
    expect(body.classGroups.map((classGroup) => classGroup.id)).toEqual([
      scenario.classGroups[1].id,
    ]);
  });

  /* Transferring to where the student already is is not a transfer, and the source is not offered. */
  test('the source class group is not among the destinations', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(transferPath(scenario.enrollments[0].id), cookie);
    const body = (await response.json()) as TransferBody;

    expect(body.classGroups.map((classGroup) => classGroup.id)).not.toContain(
      scenario.classGroups[0].id,
    );
  });

  test('a valid transfer answers 201 and closes the previous enrollment', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const origin = scenario.enrollments[0];

    const response = await write(
      'POST',
      transferPath(origin.id),
      { targetClassGroupId: scenario.classGroups[1].id, date: TRANSFER_DATE },
      cookie,
    );
    await response.json();
    const rows = await testSql()<{ status: string }[]>`
      SELECT status FROM enrollment WHERE id = ${origin.id}`;

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(`${STUDENTS}/${origin.studentId}`);
    expect(rows[0]?.status).toBe('transferred');
  });

  /*
   * The destination is in scope — it is the class group the student is already in — so this is a
   * rule and not a scope question: 422 on the field, never a 404.
   */
  test('a transfer to the source class group is refused by the rule', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      transferPath(scenario.enrollments[0].id),
      { targetClassGroupId: scenario.classGroups[0].id, date: TRANSFER_DATE },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('targetClassGroupId');
  });

  test('a destination out of scope is a 404', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const classGroup = await createClassGroup({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      academicYearId: scenario.academicYear.id,
    });

    const response = await write(
      'POST',
      transferPath(scenario.enrollments[0].id),
      { targetClassGroupId: classGroup.id, date: TRANSFER_DATE },
      cookie,
    );

    expect(response.status).toBe(404);
  });

  test('a missing date is refused by the edge with the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      transferPath(scenario.enrollments[0].id),
      { targetClassGroupId: scenario.classGroups[1].id },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('date');
  });

  test('an enrollment of another network does not exist here, on the screen or on the write', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await asRegistrar(a);

    const screen = await read(transferPath(b.enrollments[0].id), cookie);
    const attempt = await write(
      'POST',
      transferPath(b.enrollments[0].id),
      { targetClassGroupId: a.classGroups[1].id, date: TRANSFER_DATE },
      cookie,
    );

    expect(screen.status).toBe(404);
    expect(attempt.status).toBe(404);
  });

  test('the same key twice transfers once', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);
    const key = crypto.randomUUID();
    const path = transferPath(scenario.enrollments[0].id);
    const body = { targetClassGroupId: scenario.classGroups[1].id, date: TRANSFER_DATE };

    const first = await writeWithKey('POST', path, body, cookie, key);
    const again = await writeWithKey('POST', path, body, cookie, key);
    const repeat = (await again.json()) as Repeated;

    expect(first.status).toBe(201);
    expect(repeat.repeated).toBe(true);
    expect(await countEnrollmentsOf(scenario.students[0].id)).toBe(2);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const path = transferPath(scenario.enrollments[0].id);
    const body = { targetClassGroupId: scenario.classGroups[1].id, date: TRANSFER_DATE };
    const teacher = await signInAs(scenario, scenario.teacher);

    expect((await read(path)).status).toBe(401);
    expect((await read(path, teacher)).status).toBe(403);
    expect((await write('POST', path, body)).status).toBe(401);
    expect((await write('POST', path, body, teacher)).status).toBe(403);
  });
});

/*
 * A registrar answers for the schools they were assigned to, and an enrolment lives in a school.
 *
 * `transferInScope` checks three things and only two of them were ever exercised: the enrolment
 * exists in the network, the student is reachable, and — the untested one — the enrolment's own
 * school is one this registrar serves. Deleting that third check kept the whole suite green,
 * because every enrolment the tests build already sits in the registrar's own school.
 *
 * The gap is not cosmetic. A network's registrars are scoped per school precisely so that one
 * school's secretary cannot move another school's students, and the transfer is the write that
 * moves them.
 */
describe('an enrollment that lives in a school this registrar does not serve', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * The student has to stay reachable, or a different guard answers first and the one under test is
   * never consulted: `transferInScope` also refuses when `studentInScope` fails, and a student
   * enrolled only in the other school fails there. So this reuses a student of the registrar's own
   * school — reachable through their existing enrolment — and gives them a second enrolment in the
   * school the registrar does not serve. Only the enrolment's own school check can refuse that.
   */
  const elsewhere = async (
    scenario: Scenario,
  ): Promise<{ enrollmentId: string; studentId: string }> => {
    const anotherYear = await createAcademicYear({
      networkId: scenario.network.id,
      year: scenario.academicYear.year + 1,
    });
    const classGroup = await createClassGroup({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      academicYearId: anotherYear.id,
    });
    const student = scenario.students[0];
    const enrollment = await createEnrollment({
      networkId: scenario.network.id,
      studentId: student.id,
      classGroupId: classGroup.id,
      academicYearId: anotherYear.id,
    });
    return { enrollmentId: enrollment.id, studentId: student.id };
  };

  test('its transfer screen is a 404', async () => {
    const scenario = await fullScenario();
    const { enrollmentId } = await elsewhere(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await read(`${ENROLLMENTS}/${enrollmentId}/transfer`, cookie);

    expect(response.status).toBe(404);
  });

  test('transferring it is a 404, and the enrollment does not move', async () => {
    const scenario = await fullScenario();
    const { enrollmentId } = await elsewhere(scenario);
    const cookie = await asRegistrar(scenario);

    const response = await write(
      'POST',
      `${ENROLLMENTS}/${enrollmentId}/transfer`,
      { targetClassGroupId: scenario.classGroups[0].id, date: TRANSFER_DATE },
      cookie,
    );
    const rows = await testSql()<{ status: string }[]>`
      SELECT status FROM enrollment WHERE id = ${enrollmentId}`;

    expect(response.status).toBe(404);
    expect(rows[0]?.status).toBe('active');
  });
});

/*
 * The school of a guardian: asked for, or filled in — never swapped.
 *
 * A registrar who answers for a single school may omit `schoolId`, and the server fills it from the
 * session; that is what the form relies on. But the filling used to happen unconditionally, so a
 * body naming another school was silently replaced by the one in scope — and the scope check that
 * follows ran on the value already replaced, so it never refused anything. The result was a 201 and
 * a guardian attached to a school nobody asked for.
 */
describe('the school a guardian is invited into', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('a school outside the registrar\'s scope is refused, not quietly replaced', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const response = await writeWithKey(
      'POST',
      `${API.versionedPrefix}/registrar/guardians`,
      {
        name: 'Fora do Alcance',
        email: 'fora@familia.br',
        cpf: '52998224725',
        schoolId: scenario.schools[1]?.id,
      },
      cookie,
      crypto.randomUUID(),
    );
    const created = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM app_user WHERE email = 'fora@familia.br'`;

    expect(response.status).toBe(422);
    expect(Number(created[0]?.total ?? '0')).toBe(0);
  }, 60_000);

  test('and an omitted school is still filled in from the session', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const response = await writeWithKey(
      'POST',
      `${API.versionedPrefix}/registrar/guardians`,
      { name: 'Sem Escola', email: 'sem@familia.br', cpf: '11144477735' },
      cookie,
      crypto.randomUUID(),
    );
    const roles = await testSql()<{ school_id: string }[]>`
      SELECT ur.school_id FROM user_role ur
        JOIN app_user u ON u.id = ur.user_id
       WHERE u.email = 'sem@familia.br'`;

    expect(response.status).toBe(201);
    expect(roles[0]?.school_id).toBe(scenario.schools[0]?.id ?? '');
  }, 60_000);
});
