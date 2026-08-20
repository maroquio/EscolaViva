/*
 * The class journal in JSON: what the teacher teaches, the grades of a term, the roll call of a day
 * and the closing.
 *
 * Three decisions from the SSR journal survive the port, and this file exists to hold them.
 *
 * The first is that the list of who is in the class group always comes from the database, never
 * from the body. The form used to name a field after every enrolment id (`grade_<uuid>`) precisely
 * because `parseBody` keeps one value per name; JSON removes that constraint but not the rule
 * behind it — an id the teacher's browser invented, or one belonging to another network, decides
 * nothing about who gets a grade.
 *
 * The second is that a class group the teacher does not teach answers 404 and not 403. 403 would
 * confirm the class group exists and merely is not theirs, which is a fact about another school
 * this teacher is not entitled to.
 *
 * The third is what separates 400 from 422 here. A term outside 1–4 arrives from a field the
 * application itself wrote, not from something a person typed, so it is not a shape problem the
 * edge should explain — it is a rule, and it answers 422. A missing `term` is shape, and answers
 * 400 naming the field.
 *
 * Pagination is absent on purpose: none of the seven endpoints is paginated. A class group has one
 * roll call per day and one grade sheet per term, both of them short by construction, and the P5
 * `?p=` cases have nothing to hold on to here.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { API } from '../../src/http/constants';
import { SHIFTS } from '@escolaviva/contracts/enumerations';
import { clearDatabase, testSql } from '../support/database';
import { DEFAULT_PASSWORD, fullScenario, twoNetworks, type Scenario } from '../support/factories';
import { read, signIn, write, writeWithKey } from './support';

const TEACHER = `${API.versionedPrefix}/teacher`;
const CLASS_GROUPS = `${TEACHER}/class-groups`;

const gradesOf = (classGroupSubjectId: string): string =>
  `${TEACHER}/subjects/${classGroupSubjectId}/grades`;
const rollCallOf = (classGroupId: string): string => `${CLASS_GROUPS}/${classGroupId}/roll-call`;
const closingOf = (classGroupId: string): string => `${CLASS_GROUPS}/${classGroupId}/closing`;

/** Inside the academic year the factory opens (`2026-02-01` to `2026-12-15`). */
const SCHOOL_DAY = '2026-03-10';

/** A key the middleware refuses to read: it is not a UUID. */
const MALFORMED_KEY = 'chave-que-nao-e-uuid';

type ClassGroupInList = {
  classGroupId: string;
  classGroupName: string;
  gradeLevel: string;
  shift: string;
  subjects: { id: string; subjectName: string }[];
};

type GradesScreenBody = {
  assignment: { id: string; subjectName: string; classGroupId: string; classGroupName: string };
  term: number;
  closed: boolean;
  rows: { enrollmentId: string; studentName: string; value: number | null }[];
};

type RollCallScreenBody = {
  date: string;
  rows: { enrollmentId: string; studentName: string; present: boolean; excuse: string | null }[];
};

type ClosingStateBody = { term: number; closed: boolean; closedAt: string | null };

type Refusal = { errors: { field?: string; code: string; message: string }[] };

type Repeat = { repeated: boolean; location: string };

const signInAs = (scenario: Scenario, person: { cpf: string }): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: person.cpf, password: DEFAULT_PASSWORD });

const gradeRow = (enrollmentId: string, value: number | null) => ({ enrollmentId, value });

const presentRow = (enrollmentId: string) => ({ enrollmentId, present: true, excuse: null });

const readGrades = async (
  classGroupSubjectId: string,
  cookie: string,
  query = '',
): Promise<GradesScreenBody> => {
  const response = await read(`${gradesOf(classGroupSubjectId)}${query}`, cookie);
  return (await response.json()) as GradesScreenBody;
};

const valueOf = (screen: GradesScreenBody, enrollmentId: string): number | null | undefined =>
  screen.rows.find((row) => row.enrollmentId === enrollmentId)?.value;

/** Every grade of every subject for one term: what `closeTerm` demands before it will close. */
const postEveryGrade = async (scenario: Scenario, cookie: string, term: number): Promise<void> => {
  for (const assignment of scenario.classGroupSubjects) {
    await write(
      'PUT',
      gradesOf(assignment.id),
      { term, grades: scenario.enrollments.map((enrolment) => gradeRow(enrolment.id, 8)) },
      cookie,
    );
  }
};

const totalOf = (rows: readonly { total: string }[]): number => Number(rows[0]?.total ?? '0');

describe('what the teacher teaches', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * The three subjects are three rows in `class_group_subject`, and the screen the teacher opens is
   * one card per class group. The grouping is the presenter's job precisely so the front never has
   * to do it — and a regression here shows up as three identical cards, which no assertion on a
   * count of rows would catch.
   */
  test('the three subjects come grouped under the one class group', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await read(CLASS_GROUPS, cookie);
    const body = (await response.json()) as ClassGroupInList[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.classGroupId).toBe(scenario.classGroups[0].id);
    expect(body[0]?.subjects.map((subject) => subject.id).sort()).toEqual(
      scenario.classGroupSubjects.map((assignment) => assignment.id).sort(),
    );
  });

  /*
   * The SSR card printed "turno manhã" because a person was reading it. The API answers the value
   * the front switches on: translating here would force the React side to parse Portuguese back
   * into an enum.
   */
  test('the shift leaves as the enumerated value, not as prose', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const body = (await (await read(CLASS_GROUPS, cookie)).json()) as ClassGroupInList[];

    expect((SHIFTS as readonly string[]).includes(body[0]?.shift ?? '')).toBe(true);
  });

  test('without a session the list answers 401', async () => {
    await fullScenario();

    const response = await read(CLASS_GROUPS);

    expect(response.status).toBe(401);
  });

  test('a registrar reading the teacher list answers 403', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.registrar);

    const response = await read(CLASS_GROUPS, cookie);

    expect(response.status).toBe(403);
  });

  /*
   * Two complete networks exist and the teacher of the first one is signed in. Nothing of the
   * second network may appear — the tenant is read from the session, never from the request.
   */
  test('a teacher sees no class group from another network', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, a.teacher);

    const body = (await (await read(CLASS_GROUPS, cookie)).json()) as ClassGroupInList[];

    expect(body.map((classGroup) => classGroup.classGroupId)).toEqual([a.classGroups[0].id]);
    expect(body.map((classGroup) => classGroup.classGroupId)).not.toContain(b.classGroups[0].id);
  });
});

describe('reading the grades of a subject', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('the sheet opens on the first term with one row per active enrolment', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await read(gradesOf(scenario.classGroupSubjects[0].id), cookie);
    const body = (await response.json()) as GradesScreenBody;

    expect(response.status).toBe(200);
    expect(body.assignment.id).toBe(scenario.classGroupSubjects[0].id);
    expect(body.assignment.classGroupId).toBe(scenario.classGroups[0].id);
    expect(body.term).toBe(1);
    expect(body.closed).toBe(false);
    expect(body.rows).toHaveLength(scenario.enrollments.length);
    expect(body.rows.every((row) => row.value === null)).toBe(true);
  });

  test('`?term=` chooses the term', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const screen = await readGrades(scenario.classGroupSubjects[0].id, cookie, '?term=2');

    expect(screen.term).toBe(2);
  });

  /*
   * A term outside 1–4 in the query string is navigation, not a write: nothing is being changed, so
   * refusing would only strand a teacher on an error page after a stale link. It falls back to the
   * first term. The same value in a `PUT` body is a different matter, and the case below pins it.
   */
  test('`?term=9` falls back to the first term instead of refusing', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const screen = await readGrades(scenario.classGroupSubjects[0].id, cookie, '?term=9');

    expect(screen.term).toBe(1);
  });

  test('a subject outside the teacher schedule answers 404, never 403', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, a.teacher);

    const response = await read(gradesOf(b.classGroupSubjects[0].id), cookie);

    expect(response.status).toBe(404);
  });

  test('without a session the sheet answers 401', async () => {
    const scenario = await fullScenario();

    const response = await read(gradesOf(scenario.classGroupSubjects[0].id));

    expect(response.status).toBe(401);
  });

  test('a registrar reading the sheet answers 403', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.registrar);

    const response = await read(gradesOf(scenario.classGroupSubjects[0].id), cookie);

    expect(response.status).toBe(403);
  });
});

describe('posting the grades of a term', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('a full sheet answers 200 with how many grades were saved, and the read shows them', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write(
      'PUT',
      gradesOf(scenario.classGroupSubjects[0].id),
      { term: 1, grades: scenario.enrollments.map((enrolment) => gradeRow(enrolment.id, 7.5)) },
      cookie,
    );
    const body = (await response.json()) as { saved: number };
    const screen = await readGrades(scenario.classGroupSubjects[0].id, cookie);

    expect(response.status).toBe(200);
    expect(body.saved).toBe(scenario.enrollments.length);
    expect(valueOf(screen, scenario.enrollments[0].id)).toBe(7.5);
  });

  test('a body without `term` is shape, and answers 400 naming the field', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write(
      'PUT',
      gradesOf(scenario.classGroupSubjects[0].id),
      { grades: [] },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('term');
  });

  /*
   * The counterpart of the `?term=9` case above. Here the value came from a field the application
   * wrote, so it is not a typing mistake to explain at the edge — it is a rule, and it answers 422.
   */
  test('a term outside the set on the write answers 422', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write(
      'PUT',
      gradesOf(scenario.classGroupSubjects[0].id),
      { term: 9, grades: [gradeRow(scenario.enrollments[0].id, 5)] },
      cookie,
    );

    expect(response.status).toBe(422);
  });

  /*
   * The field points at the enrolment and not at an array index, because that is the only thing the
   * front can turn back into a highlighted row. `grades.0.value` would name a position in a list the
   * server rebuilt from the database, which is not the list the teacher is looking at.
   */
  test('a grade outside the scale answers 422 with the field on the enrolment', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write(
      'PUT',
      gradesOf(scenario.classGroupSubjects[0].id),
      { term: 1, grades: [gradeRow(scenario.enrollments[0].id, 11)] },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe(scenario.enrollments[0].id);
  });

  test('`value: null` clears the grade that was there', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    const subjectId = scenario.classGroupSubjects[0].id;
    const enrolmentId = scenario.enrollments[0].id;

    await write('PUT', gradesOf(subjectId), { term: 1, grades: [gradeRow(enrolmentId, 8)] }, cookie);
    const cleared = await write(
      'PUT',
      gradesOf(subjectId),
      { term: 1, grades: [gradeRow(enrolmentId, null)] },
      cookie,
    );
    const screen = await readGrades(subjectId, cookie);

    expect(cleared.status).toBe(200);
    expect(valueOf(screen, enrolmentId)).toBeNull();
  });

  /*
   * An enrolment from another network in the body is not an error to report: it is a line that
   * decides nothing. The server iterates the class group's active enrolments and looks each one up
   * in what arrived, so anything else in the body is never read — and no grade lands on it.
   */
  test('an enrolment that is not in the class group is ignored, not refused', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, a.teacher);
    const intruder = b.enrollments[0].id;

    const response = await write(
      'PUT',
      gradesOf(a.classGroupSubjects[0].id),
      { term: 1, grades: [gradeRow(intruder, 9), gradeRow(a.enrollments[0].id, 5)] },
      cookie,
    );
    const screen = await readGrades(a.classGroupSubjects[0].id, cookie);
    const landed = totalOf(await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM grade WHERE enrollment_id = ${intruder}`);

    expect(response.status).toBe(200);
    expect(valueOf(screen, a.enrollments[0].id)).toBe(5);
    expect(landed).toBe(0);
  });

  test('a term already closed refuses the posting with 422', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    await testSql()`
      INSERT INTO term_closing (id, network_id, class_group_id, term, closed_by)
      VALUES (${crypto.randomUUID()}, ${scenario.network.id}, ${scenario.classGroups[0].id},
              ${1}, ${scenario.teacher.id})`;

    const response = await write(
      'PUT',
      gradesOf(scenario.classGroupSubjects[0].id),
      { term: 1, grades: [gradeRow(scenario.enrollments[0].id, 5)] },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('term');
  });

  /*
   * The sheet says the term is closed, so the front can disable the fields instead of letting the
   * teacher discover the refusal only after typing thirty grades.
   */
  test('the sheet of a closed term reads `closed: true`', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    await testSql()`
      INSERT INTO term_closing (id, network_id, class_group_id, term, closed_by)
      VALUES (${crypto.randomUUID()}, ${scenario.network.id}, ${scenario.classGroups[0].id},
              ${1}, ${scenario.teacher.id})`;

    const screen = await readGrades(scenario.classGroupSubjects[0].id, cookie);

    expect(screen.closed).toBe(true);
  });

  /*
   * `PUT` replaces the state of a term, which is the guarantee an idempotency key would buy — so the
   * middleware charges no key for it, and a malformed one is not even read. Sending a key that would
   * be refused on a `POST` and getting a 200 is the only way to prove which of the two gates ran.
   */
  test('the posting is not charged an Idempotency-Key', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await writeWithKey(
      'PUT',
      gradesOf(scenario.classGroupSubjects[0].id),
      { term: 1, grades: [gradeRow(scenario.enrollments[0].id, 6)] },
      cookie,
      MALFORMED_KEY,
    );

    expect(response.status).toBe(200);
  });

  test('the same key twice on a posting runs twice, and the second value wins', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    const subjectId = scenario.classGroupSubjects[0].id;
    const enrolmentId = scenario.enrollments[0].id;
    const key = crypto.randomUUID();

    await writeWithKey(
      'PUT',
      gradesOf(subjectId),
      { term: 1, grades: [gradeRow(enrolmentId, 6)] },
      cookie,
      key,
    );
    const second = await writeWithKey(
      'PUT',
      gradesOf(subjectId),
      { term: 1, grades: [gradeRow(enrolmentId, 9)] },
      cookie,
      key,
    );
    const screen = await readGrades(subjectId, cookie);

    expect(second.status).toBe(200);
    expect(valueOf(screen, enrolmentId)).toBe(9);
  });

  test('without a session the posting answers 401', async () => {
    const scenario = await fullScenario();

    const response = await write(
      'PUT',
      gradesOf(scenario.classGroupSubjects[0].id),
      { term: 1, grades: [] },
      '',
    );

    expect(response.status).toBe(401);
  });

  test('a registrar posting grades answers 403', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.registrar);

    const response = await write(
      'PUT',
      gradesOf(scenario.classGroupSubjects[0].id),
      { term: 1, grades: [] },
      cookie,
    );

    expect(response.status).toBe(403);
  });

  test('posting into another teacher subject answers 404', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, a.teacher);

    const response = await write(
      'PUT',
      gradesOf(b.classGroupSubjects[0].id),
      { term: 1, grades: [gradeRow(b.enrollments[0].id, 5)] },
      cookie,
    );

    expect(response.status).toBe(404);
  });
});

describe('the roll call of a day', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * Nothing recorded means present: the roll call is taken by marking absences, and a day nobody
   * touched is not a day everyone missed.
   */
  test('a day with nothing recorded comes back with everyone present', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await read(
      `${rollCallOf(scenario.classGroups[0].id)}?date=${SCHOOL_DAY}`,
      cookie,
    );
    const body = (await response.json()) as RollCallScreenBody;

    expect(response.status).toBe(200);
    expect(body.date).toBe(SCHOOL_DAY);
    expect(body.rows).toHaveLength(scenario.enrollments.length);
    expect(body.rows.every((row) => row.present && row.excuse === null)).toBe(true);
  });

  test('recording answers 204 and the next read shows the absence and the excuse', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    const absent = scenario.enrollments[0].id;

    const response = await write(
      'PUT',
      rollCallOf(scenario.classGroups[0].id),
      {
        date: SCHOOL_DAY,
        rows: [
          { enrollmentId: absent, present: false, excuse: 'Consulta médica' },
          ...scenario.enrollments.slice(1).map((enrolment) => presentRow(enrolment.id)),
        ],
      },
      cookie,
    );
    const after = (await (
      await read(`${rollCallOf(scenario.classGroups[0].id)}?date=${SCHOOL_DAY}`, cookie)
    ).json()) as RollCallScreenBody;
    const row = after.rows.find((candidate) => candidate.enrollmentId === absent);

    expect(response.status).toBe(204);
    expect(row?.present).toBe(false);
    expect(row?.excuse).toBe('Consulta médica');
  });

  /*
   * `PUT` twice is the browser's retry, and the day may end with one row per enrolment either way.
   * The uniqueness lives in `(enrollment_id, attendance_date)` and the write upserts onto it — a
   * regression that turned the upsert into an insert would pass every assertion on the read and
   * only show up here, in the count.
   */
  test('recording the same day twice leaves one row, not two', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    const enrolmentId = scenario.enrollments[0].id;
    const body = {
      date: SCHOOL_DAY,
      rows: scenario.enrollments.map((enrolment) => presentRow(enrolment.id)),
    };

    await write('PUT', rollCallOf(scenario.classGroups[0].id), body, cookie);
    const second = await write('PUT', rollCallOf(scenario.classGroups[0].id), body, cookie);
    const rows = totalOf(await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM attendance
       WHERE enrollment_id = ${enrolmentId} AND attendance_date = ${SCHOOL_DAY}`);

    expect(second.status).toBe(204);
    expect(rows).toBe(1);
  });

  /*
   * A date that is not a date reaches the handler as a well-formed string, so the edge has nothing
   * to complain about: it is `BusinessRuleViolation` that decides, and `errorStatus` maps it to 422 —
   * the same answer an out-of-set term gets, and for the same reason.
   */
  test('a malformed date answers 422', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write(
      'PUT',
      rollCallOf(scenario.classGroups[0].id),
      { date: '10/03/2026', rows: [] },
      cookie,
    );

    expect(response.status).toBe(422);
  });

  test('a date outside the academic year answers 422 naming the date', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write(
      'PUT',
      rollCallOf(scenario.classGroups[0].id),
      {
        date: '2027-01-05',
        rows: scenario.enrollments.map((enrolment) => presentRow(enrolment.id)),
      },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('date');
  });

  test('a body without `date` is shape, and answers 400 naming the field', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write(
      'PUT',
      rollCallOf(scenario.classGroups[0].id),
      { rows: [] },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('date');
  });

  /*
   * The same rule as the grade sheet, seen from the other side: an empty `rows` does not mean "leave
   * the day alone", it means every enrolment the database lists was left unmarked. The list is the
   * server's, so the day is written in full and everybody is absent.
   */
  test('who is in the class group comes from the database, not from `rows`', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write(
      'PUT',
      rollCallOf(scenario.classGroups[0].id),
      { date: SCHOOL_DAY, rows: [] },
      cookie,
    );
    const after = (await (
      await read(`${rollCallOf(scenario.classGroups[0].id)}?date=${SCHOOL_DAY}`, cookie)
    ).json()) as RollCallScreenBody;

    expect(response.status).toBe(204);
    expect(after.rows).toHaveLength(scenario.enrollments.length);
    expect(after.rows.every((row) => !row.present)).toBe(true);
  });

  test('an enrolment from another network in the body is ignored, not refused', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, a.teacher);

    const response = await write(
      'PUT',
      rollCallOf(a.classGroups[0].id),
      {
        date: SCHOOL_DAY,
        rows: [presentRow(b.enrollments[0].id), presentRow(a.enrollments[0].id)],
      },
      cookie,
    );
    const landed = totalOf(await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM attendance WHERE enrollment_id = ${b.enrollments[0].id}`);

    expect(response.status).toBe(204);
    expect(landed).toBe(0);
  });

  test('a class group outside the teacher schedule answers 404, never 403', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, a.teacher);

    const reading = await read(rollCallOf(b.classGroups[0].id), cookie);
    const writing = await write(
      'PUT',
      rollCallOf(b.classGroups[0].id),
      { date: SCHOOL_DAY, rows: [] },
      cookie,
    );

    expect(reading.status).toBe(404);
    expect(writing.status).toBe(404);
  });

  test('without a session the roll call answers 401', async () => {
    const scenario = await fullScenario();

    const reading = await read(rollCallOf(scenario.classGroups[0].id));
    const writing = await write(
      'PUT',
      rollCallOf(scenario.classGroups[0].id),
      { date: SCHOOL_DAY, rows: [] },
      '',
    );

    expect(reading.status).toBe(401);
    expect(writing.status).toBe(401);
  });

  test('a registrar taking the roll call answers 403', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.registrar);

    const response = await write(
      'PUT',
      rollCallOf(scenario.classGroups[0].id),
      { date: SCHOOL_DAY, rows: [] },
      cookie,
    );

    expect(response.status).toBe(403);
  });
});

describe('closing a term', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('the state answers one entry per term, all of them open', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await read(closingOf(scenario.classGroups[0].id), cookie);
    const body = (await response.json()) as ClosingStateBody[];

    expect(response.status).toBe(200);
    expect(body.map((state) => state.term)).toEqual([1, 2, 3, 4]);
    expect(body.every((state) => !state.closed && state.closedAt === null)).toBe(true);
  });

  /*
   * The refusal has to say *what* is missing, subject by subject. "Não foi possível concluir" sends
   * the teacher hunting through three sheets of thirty rows; the message the domain builds names
   * every subject and how many grades each one still owes.
   */
  test('closing with grades missing answers 422 listing what is missing', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write('POST', closingOf(scenario.classGroups[0].id), { term: 1 }, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('term');
    for (const subject of scenario.subjects) {
      expect(body.errors[0]?.message).toContain(subject.name);
    }
  });

  test('with every grade posted the closing answers 201 with the Location, and the state follows', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    await postEveryGrade(scenario, cookie, 1);

    const response = await write('POST', closingOf(scenario.classGroups[0].id), { term: 1 }, cookie);
    const states = (await (
      await read(closingOf(scenario.classGroups[0].id), cookie)
    ).json()) as ClosingStateBody[];

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(closingOf(scenario.classGroups[0].id));
    expect(states[0]?.closed).toBe(true);
    expect(states[0]?.closedAt).not.toBeNull();
  });

  /*
   * Unlike the two `PUT`s, this one creates a record that cannot be created twice, so the key is
   * charged. Without it a double tap on a slow connection closes the term once and then fails the
   * second time with "já está fechado", which reads like a bug to whoever is holding the phone.
   */
  test('a malformed Idempotency-Key refuses the closing with 400', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    await postEveryGrade(scenario, cookie, 1);

    const response = await writeWithKey(
      'POST',
      closingOf(scenario.classGroups[0].id),
      { term: 1 },
      cookie,
      MALFORMED_KEY,
    );

    expect(response.status).toBe(400);
  });

  test('the same key twice closes the term once and replays the location', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);
    await postEveryGrade(scenario, cookie, 1);
    const key = crypto.randomUUID();

    const first = await writeWithKey(
      'POST',
      closingOf(scenario.classGroups[0].id),
      { term: 1 },
      cookie,
      key,
    );
    const repeat = await writeWithKey(
      'POST',
      closingOf(scenario.classGroups[0].id),
      { term: 1 },
      cookie,
      key,
    );
    const body = (await repeat.json()) as Repeat;
    const closings = totalOf(await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM term_closing WHERE class_group_id = ${scenario.classGroups[0].id}`);

    expect(first.status).toBe(201);
    expect(body.repeated).toBe(true);
    expect(body.location).toBe(closingOf(scenario.classGroups[0].id));
    expect(closings).toBe(1);
  });

  test('a body without `term` is shape, and answers 400 naming the field', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write('POST', closingOf(scenario.classGroups[0].id), {}, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('term');
  });

  test('a term outside the set answers 422', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.teacher);

    const response = await write('POST', closingOf(scenario.classGroups[0].id), { term: 9 }, cookie);

    expect(response.status).toBe(422);
  });

  test('closing a class group outside the teacher schedule answers 404, never 403', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, a.teacher);

    const reading = await read(closingOf(b.classGroups[0].id), cookie);
    const writing = await write('POST', closingOf(b.classGroups[0].id), { term: 1 }, cookie);

    expect(reading.status).toBe(404);
    expect(writing.status).toBe(404);
  });

  test('without a session the closing answers 401', async () => {
    const scenario = await fullScenario();

    const reading = await read(closingOf(scenario.classGroups[0].id));
    const writing = await write('POST', closingOf(scenario.classGroups[0].id), { term: 1 }, '');

    expect(reading.status).toBe(401);
    expect(writing.status).toBe(401);
  });

  test('a registrar closing a term answers 403', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, scenario.registrar);

    const response = await write('POST', closingOf(scenario.classGroups[0].id), { term: 1 }, cookie);

    expect(response.status).toBe(403);
  });
});

/*
 * The half of "not your class group" that the port dropped.
 *
 * Every other case that claims this rule builds the target with `twoNetworks()` and reaches for the
 * other network's ids. That proves the tenant filter and nothing else: `teacherClassGroupSubjects`
 * takes the network AND the teacher, so the network half alone already empties the list, and the
 * schedule half is never exercised. Measured: replacing `taughtClassGroupOr404` with a plain
 * "does this class group exist in my network" lookup keeps all 45 of the other cases green.
 *
 * What that regression would open is the whole point of the rule — every teacher in the network
 * reading the grade sheet, the roll call and the closing state of every class group, and closing
 * terms on class groups they do not teach.
 *
 * The fixture needs no new factory call: `fullScenario` builds `classGroups[1]` in the SAME school
 * of the SAME network and never allocates a subject on it, so it is precisely "a class group this
 * teacher does not teach". The SSR suite already exercised this at
 * `tests/web/authorization.test.ts`; only the JSON port lost it.
 */
describe('a class group of my own network that I do not teach', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const teacherIn = async (scenario: Scenario): Promise<string> =>
    await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.teacher.cpf,
      password: DEFAULT_PASSWORD,
    });

  test('its roll call is a 404, not a 200 and not a 403', async () => {
    const scenario = await fullScenario();
    const cookie = await teacherIn(scenario);

    const response = await read(rollCallOf(scenario.classGroups[1].id), cookie);

    expect(response.status).toBe(404);
  });

  test('writing its roll call is a 404 as well, so the guard is not read-only', async () => {
    const scenario = await fullScenario();
    const cookie = await teacherIn(scenario);

    const response = await write(
      'PUT',
      rollCallOf(scenario.classGroups[1].id),
      { date: SCHOOL_DAY, rows: [] },
      cookie,
    );

    expect(response.status).toBe(404);
  });

  test('its closing is a 404 to read', async () => {
    const scenario = await fullScenario();
    const cookie = await teacherIn(scenario);

    const response = await read(closingOf(scenario.classGroups[1].id), cookie);

    expect(response.status).toBe(404);
  });

  /*
   * The gravest of the four: closing a term is irreversible, and a 404 here is what stops a teacher
   * from ending the term of a class group that belongs to a colleague.
   */
  test('closing its term is a 404, and closes nothing', async () => {
    const scenario = await fullScenario();
    const cookie = await teacherIn(scenario);

    const response = await write('POST', closingOf(scenario.classGroups[1].id), { term: 1 }, cookie);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM term_closing
       WHERE class_group_id = ${scenario.classGroups[1].id}`;

    expect(response.status).toBe(404);
    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });
});
