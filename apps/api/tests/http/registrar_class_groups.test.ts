/*
 * Class groups and subjects, in JSON.
 *
 * The whole point of this file is that the registrar's scope survives the port. In the SSR screens
 * the scope was a set of helpers ("in scope", "not found") that every handler called by hand, and
 * nothing but a test kept a new handler from forgetting one. The rules pinned here are, in order:
 *
 *   - a filter out of scope is an *ignored filter*, never an error — `?school=` pointing at a unit
 *     this registrar does not answer for comes back as the full in-scope list, and `?year=` at a
 *     year that does not exist comes back unfiltered. Turning either into a 404 would be a new rule;
 *   - a *body* id out of scope is a 404, not a field error: the screen does not confirm that a
 *     school it will not let you write into exists;
 *   - the teacher's name is read once per screen, from `identity.userNames`, and a teacher the query
 *     no longer reaches is a dash, not a crash and not an empty string;
 *   - the two tables on the record page carry their own cursors, so paging the subjects must leave
 *     the enrollments exactly where they were.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { API } from '../../src/http/constants';
import { MISSING_VALUE } from '../../src/shared/constants';
import { clearDatabase, testSql } from '../support/database';
import {
  createClassGroup,
  createClassGroupSubject,
  createSubject,
  fullScenario,
  twoNetworks,
  type Scenario,
  type TestUser,
} from '../support/factories';
import { read, signIn, write, writeWithKey } from './support';

const CLASS_GROUPS = `${API.versionedPrefix}/registrar/class-groups`;
const SUBJECTS = `${API.versionedPrefix}/registrar/subjects`;

const classGroupPath = (id: string): string => `${CLASS_GROUPS}/${id}`;
const assignmentsPath = (id: string): string => `${classGroupPath(id)}/subjects`;

/** A uuid that belongs to nothing: it passes the shape check and fails every lookup. */
const NOWHERE = '11111111-1111-4111-8111-111111111111';

type Refusal = { errors: { field?: string; code: string; message: string }[] };

type PageOf<T> = { items: T[]; page: number; pages: number; total: number; size: number };

type ClassGroupItem = {
  id: string;
  name: string;
  gradeLevel: string;
  shift: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  year: number | null;
};

type AssignmentItem = { id: string; subjectName: string; teacherName: string };

type SubjectItem = { id: string; name: string };

type EnrollmentItem = { id: string; studentName: string; classGroupId: string };

type ClassGroupRecordBody = {
  classGroup: ClassGroupItem;
  assignments: PageOf<AssignmentItem>;
  enrollments: PageOf<EnrollmentItem>;
};

type CreatedBody = { id: string };

type Repeat = { repeated: boolean; location: string };

const sessionFor = (scenario: Scenario, user: TestUser): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: user.cpf, password: scenario.password });

const registrarSession = async (): Promise<{ scenario: Scenario; cookie: string }> => {
  const scenario = await fullScenario();
  return { scenario, cookie: await sessionFor(scenario, scenario.registrar) };
};

type ClassGroupBody = {
  name: string;
  gradeLevel: string;
  shift: string;
  schoolId: string;
  academicYearId: string;
};

const validClassGroup = (scenario: Scenario, name: string): ClassGroupBody => ({
  name,
  gradeLevel: '8º ano',
  shift: 'afternoon',
  schoolId: scenario.schools[0].id,
  academicYearId: scenario.academicYear.id,
});

/** Enough class groups in scope for the list to have a second page (`DEFAULT_PAGE_SIZE` is 10). */
const fillClassGroups = async (scenario: Scenario, howMany: number): Promise<void> => {
  await Promise.all(
    Array.from({ length: howMany }, () =>
      createClassGroup({
        networkId: scenario.network.id,
        schoolId: scenario.schools[0].id,
        academicYearId: scenario.academicYear.id,
      }),
    ),
  );
};

/** The same, for the subjects table of the class group record. */
const fillAssignments = async (scenario: Scenario, howMany: number): Promise<void> => {
  const subjects = await Promise.all(
    Array.from({ length: howMany }, () => createSubject({ networkId: scenario.network.id })),
  );
  await Promise.all(
    subjects.map((subject) =>
      createClassGroupSubject({
        networkId: scenario.network.id,
        classGroupId: scenario.classGroups[0].id,
        subjectId: subject.id,
        teacherUserId: scenario.teacher.id,
      }),
    ),
  );
};

describe('listing the class groups', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('the registrar sees the class groups of their own school, with the school and the year', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await read(CLASS_GROUPS, cookie);
    const page = (await response.json()) as PageOf<ClassGroupItem>;

    expect(response.status).toBe(200);
    expect(page.total).toBe(2);
    expect(page.items.every((item) => item.schoolId === scenario.schools[0].id)).toBe(true);
    expect(page.items[0]?.schoolName).toBe(scenario.schools[0].name);
    expect(page.items[0]?.year).toBe(scenario.academicYear.year);
  });

  /*
   * The list is the registrar's scope and not the network's: a class group of the other unit belongs
   * to the same network, the same year and the same tables, and only the role assignment keeps it
   * out. A query that forgot the school filter would still answer 200 here.
   */
  test('a class group of a school this registrar does not answer for stays out', async () => {
    const { scenario, cookie } = await registrarSession();
    const elsewhere = await createClassGroup({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      academicYearId: scenario.academicYear.id,
    });

    const response = await read(CLASS_GROUPS, cookie);
    const page = (await response.json()) as PageOf<ClassGroupItem>;

    expect(page.items.some((item) => item.id === elsewhere.id)).toBe(false);
  });

  /*
   * An out-of-scope filter counts as "all" — this is the rule that is easiest to break by
   * "improving" it into a 404, and the one that would silently empty the screen for a registrar who
   * merely kept a stale bookmark.
   */
  test('a `?school=` out of scope is an ignored filter, not a refusal', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await read(`${CLASS_GROUPS}?school=${scenario.schools[1].id}`, cookie);
    const page = (await response.json()) as PageOf<ClassGroupItem>;

    expect(response.status).toBe(200);
    expect(page.total).toBe(2);
  });

  test('a `?year=` that exists nowhere is ignored the same way', async () => {
    const { cookie } = await registrarSession();

    const response = await read(`${CLASS_GROUPS}?year=${NOWHERE}`, cookie);
    const page = (await response.json()) as PageOf<ClassGroupItem>;

    expect(response.status).toBe(200);
    expect(page.total).toBe(2);
  });

  test('a `?school=` in scope does filter', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await read(`${CLASS_GROUPS}?school=${scenario.schools[0].id}`, cookie);
    const page = (await response.json()) as PageOf<ClassGroupItem>;

    expect(page.total).toBe(2);
    expect(page.items.every((item) => item.schoolId === scenario.schools[0].id)).toBe(true);
  });

  test('`?p=` moves to another page instead of repeating the first one', async () => {
    const { scenario, cookie } = await registrarSession();
    await fillClassGroups(scenario, 9);

    const first = (await (await read(CLASS_GROUPS, cookie)).json()) as PageOf<ClassGroupItem>;
    const second = (await (
      await read(`${CLASS_GROUPS}?p=2`, cookie)
    ).json()) as PageOf<ClassGroupItem>;

    expect(first.page).toBe(1);
    expect(first.items.length).toBe(10);
    expect(second.page).toBe(2);
    expect(second.items.length).toBe(1);
    expect(first.items.some((item) => item.id === second.items[0]?.id)).toBe(false);
  });

  /*
   * An over-range cursor is not an error: `queryPage` clamps and re-runs the query for the last
   * page. A test that expected an empty page — or a 404 — would be specifying a regression.
   */
  test('`?p=999` answers the last page, never an empty one', async () => {
    const { scenario, cookie } = await registrarSession();
    await fillClassGroups(scenario, 9);

    const response = await read(`${CLASS_GROUPS}?p=999`, cookie);
    const page = (await response.json()) as PageOf<ClassGroupItem>;

    expect(response.status).toBe(200);
    expect(page.page).toBe(page.pages);
    expect(page.items.length).toBeGreaterThan(0);
  });

  test('without a session it is 401, with a body — never a redirect to a screen', async () => {
    await fullScenario();

    const response = await read(CLASS_GROUPS);

    expect(response.status).toBe(401);
    expect(response.headers.get('Location')).toBe(null);
  });

  test('a teacher of the same network is refused with 403', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionFor(scenario, scenario.teacher);

    const response = await read(CLASS_GROUPS, cookie);

    expect(response.status).toBe(403);
  });
});

describe('registering a class group', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('a valid class group answers 201 with the id and the Location of its record', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await write('POST', CLASS_GROUPS, validClassGroup(scenario, '8A'), cookie);
    const body = (await response.json()) as CreatedBody;

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(classGroupPath(body.id));
  });

  /*
   * The 201 is only worth something if the row is really there: a handler that answered the id
   * without writing would pass the assertion above and fail this one.
   */
  test('what was registered shows up on the list', async () => {
    const { scenario, cookie } = await registrarSession();

    await write('POST', CLASS_GROUPS, validClassGroup(scenario, '8A'), cookie);
    const page = (await (await read(CLASS_GROUPS, cookie)).json()) as PageOf<ClassGroupItem>;

    expect(page.total).toBe(3);
    expect(page.items.some((item) => item.name === '8A')).toBe(true);
  });

  test('a missing name is refused by the edge, with 400 and the field named', async () => {
    const { scenario, cookie } = await registrarSession();
    const { gradeLevel, shift, schoolId, academicYearId } = validClassGroup(scenario, '8A');

    const response = await write(
      'POST',
      CLASS_GROUPS,
      { gradeLevel, shift, schoolId, academicYearId },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.field).toBe('name');
  });

  /*
   * The shift is a closed set, and membership of a closed set is shape: the edge answers it. The
   * database has the same set in a CHECK constraint, and letting the request travel that far to be
   * refused by Postgres would turn a 400 into a 500.
   */
  test('a shift outside the closed set is 400 on the `shift` field', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await write(
      'POST',
      CLASS_GROUPS,
      { ...validClassGroup(scenario, '8A'), shift: 'noturno' },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.field).toBe('shift');
  });

  /*
   * A well-shaped id that points at no year is a rule, not a shape: 422, and named on the field the
   * form has, so the screen can put the message under the right select.
   */
  test('an academic year that does not exist is a rule refusal, 422 with the field', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await write(
      'POST',
      CLASS_GROUPS,
      { ...validClassGroup(scenario, '8A'), academicYearId: NOWHERE },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(refusal.errors[0]?.field).toBe('academicYearId');
  });

  /*
   * The school in the body is scope, and scope answers 404 rather than a field error: telling the
   * registrar "this school exists, you just cannot use it" is telling them something the screen has
   * no business confirming.
   */
  /*
   * The row count is the half that makes this a scope test rather than a status test. A 404 says
   * what the caller was told; only the table says whether the class group was created first and
   * refused afterwards. Move the guard to after `registerClassGroup(...)` and the status stays 404
   * while a class group appears in a school this registrar does not serve — which is the regression
   * the case exists to stop.
   */
  test('a school this registrar does not answer for is a 404, and creates nothing', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await write(
      'POST',
      CLASS_GROUPS,
      { ...validClassGroup(scenario, '8A'), schoolId: scenario.schools[1].id },
      cookie,
    );
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM class_group
       WHERE school_id = ${scenario.schools[1].id} AND name = '8A'`;

    expect(response.status).toBe(404);
    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });

  test('a school of another network is the same 404', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await sessionFor(a, a.registrar);

    const response = await write(
      'POST',
      CLASS_GROUPS,
      { ...validClassGroup(a, '8A'), schoolId: b.schools[0].id },
      cookie,
    );

    expect(response.status).toBe(404);
  });

  test('a write without a usable idempotency key is refused with 400', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await writeWithKey(
      'POST',
      CLASS_GROUPS,
      validClassGroup(scenario, '8A'),
      cookie,
      'nao-e-uma-chave',
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.code).toBe('missing_idempotency_key');
  });

  /*
   * I4: the same key twice is one class group. The repeat answers the stored location instead of a
   * body, which is what lets the front navigate to the record it created the first time — a second
   * 201, or a 422 for the duplicate name, would both mean the key was released when it should not.
   */
  test('the same key twice creates one class group and the repeat answers the location', async () => {
    const { scenario, cookie } = await registrarSession();
    const key = crypto.randomUUID();
    const body = validClassGroup(scenario, '8A');

    const first = await writeWithKey('POST', CLASS_GROUPS, body, cookie, key);
    const again = await writeWithKey('POST', CLASS_GROUPS, body, cookie, key);
    const repeat = (await again.json()) as Repeat;
    const page = (await (await read(CLASS_GROUPS, cookie)).json()) as PageOf<ClassGroupItem>;

    expect(first.status).toBe(201);
    expect(repeat.repeated).toBe(true);
    expect(repeat.location).toBe(first.headers.get('Location') ?? '');
    expect(page.items.filter((item) => item.name === '8A').length).toBe(1);
  });

  test('without a session it is 401', async () => {
    const scenario = await fullScenario();

    const response = await write('POST', CLASS_GROUPS, validClassGroup(scenario, '8A'));

    expect(response.status).toBe(401);
  });

  test('a network administrator is not a registrar: 403', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionFor(scenario, scenario.admin);

    const response = await write('POST', CLASS_GROUPS, validClassGroup(scenario, '8A'), cookie);

    expect(response.status).toBe(403);
  });
});

describe('the class group record', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('it answers the class group, its subjects and its active enrollments', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await read(classGroupPath(scenario.classGroups[0].id), cookie);
    const record = (await response.json()) as ClassGroupRecordBody;

    expect(response.status).toBe(200);
    expect(record.classGroup.id).toBe(scenario.classGroups[0].id);
    expect(record.classGroup.schoolName).toBe(scenario.schools[0].name);
    expect(record.assignments.total).toBe(3);
    expect(record.enrollments.total).toBe(5);
    expect(record.assignments.items[0]?.teacherName).toBe(scenario.teacher.name);
  });

  /*
   * The name of the assigned teacher comes from one query for the whole page, and that query
   * answers about the network — not about the school. An assignment whose teacher the query no
   * longer reaches has to degrade into a dash: the registrar still needs to see the subject, and an
   * empty string on the screen would read as "nobody teaches this" rather than "look into this".
   */
  test('an assignment whose teacher the name query no longer reaches shows a dash', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await sessionFor(a, a.registrar);
    await createClassGroupSubject({
      networkId: a.network.id,
      classGroupId: a.classGroups[1].id,
      subjectId: a.subjects[0].id,
      teacherUserId: b.teacher.id,
    });

    const response = await read(classGroupPath(a.classGroups[1].id), cookie);
    const record = (await response.json()) as ClassGroupRecordBody;

    expect(response.status).toBe(200);
    expect(record.assignments.items[0]?.teacherName).toBe(MISSING_VALUE);
    expect(record.assignments.items[0]?.subjectName).toBe(a.subjects[0].name);
  });

  /*
   * The two tables are independent, and this is the case that proves it. With a single `p` shared
   * between them, asking for the second page of subjects would also throw the enrollments table to
   * a page that does not exist, and the screen would come back half empty.
   */
  test('`?pSubjects=` advances the subjects table and leaves the enrollments where they were', async () => {
    const { scenario, cookie } = await registrarSession();
    await fillAssignments(scenario, 8);
    const path = classGroupPath(scenario.classGroups[0].id);

    const first = (await (await read(path, cookie)).json()) as ClassGroupRecordBody;
    const second = (await (await read(`${path}?pSubjects=2`, cookie)).json()) as ClassGroupRecordBody;

    expect(first.assignments.page).toBe(1);
    expect(first.assignments.items.length).toBe(10);
    expect(second.assignments.page).toBe(2);
    expect(second.assignments.items.length).toBe(1);
    expect(second.enrollments.page).toBe(1);
    expect(second.enrollments.items[0]?.id).toBe(first.enrollments.items[0]?.id);
  });

  test('`?pSubjects=999` clamps to the last page of subjects, with 200', async () => {
    const { scenario, cookie } = await registrarSession();
    await fillAssignments(scenario, 8);

    const response = await read(
      `${classGroupPath(scenario.classGroups[0].id)}?pSubjects=999`,
      cookie,
    );
    const record = (await response.json()) as ClassGroupRecordBody;

    expect(response.status).toBe(200);
    expect(record.assignments.page).toBe(record.assignments.pages);
    expect(record.assignments.items.length).toBeGreaterThan(0);
  });

  test('a class group of another school of the same network does not exist here', async () => {
    const { scenario, cookie } = await registrarSession();
    const elsewhere = await createClassGroup({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      academicYearId: scenario.academicYear.id,
    });

    const response = await read(classGroupPath(elsewhere.id), cookie);

    expect(response.status).toBe(404);
  });

  test('a class group of another network does not exist either', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await sessionFor(a, a.registrar);

    const response = await read(classGroupPath(b.classGroups[0].id), cookie);

    expect(response.status).toBe(404);
  });

  /*
   * An id that is not a uuid never reaches the database: it is refused as "does not exist", the
   * same answer as an id that exists elsewhere, so the address bar cannot be used to tell the two
   * apart — and Postgres is never handed a value it would reject with a 500.
   */
  test('an id that is not a uuid is a 404, not a 500', async () => {
    const { cookie } = await registrarSession();

    const response = await read(classGroupPath('nao-e-uuid'), cookie);

    expect(response.status).toBe(404);
  });

  test('without a session it is 401', async () => {
    const scenario = await fullScenario();

    const response = await read(classGroupPath(scenario.classGroups[0].id));

    expect(response.status).toBe(401);
  });

  test('a guardian of the same network is refused with 403', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionFor(scenario, scenario.guardian);

    const response = await read(classGroupPath(scenario.classGroups[0].id), cookie);

    expect(response.status).toBe(403);
  });
});

describe('assigning a subject to a class group', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * There is no screen for a single assignment, so the Location is the record the front goes back
   * to. That is also what a repeated key replays, which is why it must not be left out.
   */
  test('a valid assignment answers 201 and points back at the class group record', async () => {
    const { scenario, cookie } = await registrarSession();
    const subject = await createSubject({ networkId: scenario.network.id });
    const path = assignmentsPath(scenario.classGroups[0].id);

    const response = await write(
      'POST',
      path,
      { subjectId: subject.id, teacherUserId: scenario.teacher.id },
      cookie,
    );
    const body = (await response.json()) as CreatedBody;
    const record = (await (
      await read(classGroupPath(scenario.classGroups[0].id), cookie)
    ).json()) as ClassGroupRecordBody;

    expect(response.status).toBe(201);
    expect(body.id).not.toBe('');
    expect(response.headers.get('Location')).toBe(classGroupPath(scenario.classGroups[0].id));
    expect(record.assignments.total).toBe(4);
  });

  test('a missing teacher is refused by the edge, with 400 and the field named', async () => {
    const { scenario, cookie } = await registrarSession();
    const subject = await createSubject({ networkId: scenario.network.id });

    const response = await write(
      'POST',
      assignmentsPath(scenario.classGroups[0].id),
      { subjectId: subject.id },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.field).toBe('teacherUserId');
  });

  test('a subject already assigned to this class group is a rule refusal, 422 with the field', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await write(
      'POST',
      assignmentsPath(scenario.classGroups[0].id),
      { subjectId: scenario.subjects[0].id, teacherUserId: scenario.teacher.id },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(refusal.errors[0]?.field).toBe('subjectId');
  });

  /*
   * Whoever is assigned has to hold the teacher role *at that school*. This is a rule and not a
   * shape — the id is a perfectly good uuid of a perfectly real person — so it is 422, named on the
   * field, and never a 404: the person exists and the registrar chose them from a list.
   */
  test('somebody who does not teach at that school is a 422 on the teacher field', async () => {
    const { scenario, cookie } = await registrarSession();
    const subject = await createSubject({ networkId: scenario.network.id });

    const response = await write(
      'POST',
      assignmentsPath(scenario.classGroups[0].id),
      { subjectId: subject.id, teacherUserId: scenario.guardian.id },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(refusal.errors[0]?.field).toBe('teacherUserId');
  });

  test('a class group out of scope refuses the assignment with 404', async () => {
    const { scenario, cookie } = await registrarSession();
    const elsewhere = await createClassGroup({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      academicYearId: scenario.academicYear.id,
    });
    const subject = await createSubject({ networkId: scenario.network.id });

    const response = await write(
      'POST',
      assignmentsPath(elsewhere.id),
      { subjectId: subject.id, teacherUserId: scenario.teacher.id },
      cookie,
    );

    expect(response.status).toBe(404);
  });

  test('a write without a usable idempotency key is refused with 400', async () => {
    const { scenario, cookie } = await registrarSession();
    const subject = await createSubject({ networkId: scenario.network.id });

    const response = await writeWithKey(
      'POST',
      assignmentsPath(scenario.classGroups[0].id),
      { subjectId: subject.id, teacherUserId: scenario.teacher.id },
      cookie,
      'nao-e-uma-chave',
    );

    expect(response.status).toBe(400);
  });

  test('the same key twice assigns the subject once', async () => {
    const { scenario, cookie } = await registrarSession();
    const subject = await createSubject({ networkId: scenario.network.id });
    const key = crypto.randomUUID();
    const path = assignmentsPath(scenario.classGroups[0].id);
    const body = { subjectId: subject.id, teacherUserId: scenario.teacher.id };

    const first = await writeWithKey('POST', path, body, cookie, key);
    const again = await writeWithKey('POST', path, body, cookie, key);
    const repeat = (await again.json()) as Repeat;
    const record = (await (
      await read(classGroupPath(scenario.classGroups[0].id), cookie)
    ).json()) as ClassGroupRecordBody;

    expect(first.status).toBe(201);
    expect(repeat.repeated).toBe(true);
    expect(repeat.location).toBe(first.headers.get('Location') ?? '');
    expect(record.assignments.total).toBe(4);
  });

  test('without a session it is 401', async () => {
    const scenario = await fullScenario();

    const response = await write('POST', assignmentsPath(scenario.classGroups[0].id), {
      subjectId: scenario.subjects[0].id,
      teacherUserId: scenario.teacher.id,
    });

    expect(response.status).toBe(401);
  });

  test('a teacher cannot assign themselves: 403', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionFor(scenario, scenario.teacher);

    const response = await write(
      'POST',
      assignmentsPath(scenario.classGroups[0].id),
      { subjectId: scenario.subjects[0].id, teacherUserId: scenario.teacher.id },
      cookie,
    );

    expect(response.status).toBe(403);
  });
});

describe('listing and registering subjects', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('the subjects of the network come back paginated', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await read(SUBJECTS, cookie);
    const page = (await response.json()) as PageOf<SubjectItem>;

    expect(response.status).toBe(200);
    expect(page.total).toBe(3);
    expect(page.items.some((item) => item.name === scenario.subjects[0].name)).toBe(true);
  });

  /*
   * A subject belongs to the network, not to the school — but never to another network. This is the
   * tenant boundary on the one read of this front that has no school filter at all.
   */
  test('a subject of another network is not on this list', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await sessionFor(a, a.registrar);

    const page = (await (await read(SUBJECTS, cookie)).json()) as PageOf<SubjectItem>;

    expect(page.total).toBe(3);
    expect(page.items.some((item) => item.id === b.subjects[0].id)).toBe(false);
  });

  test('`?p=` moves to another page, and `?p=999` clamps to the last one', async () => {
    const { scenario, cookie } = await registrarSession();
    await Promise.all(
      Array.from({ length: 8 }, () => createSubject({ networkId: scenario.network.id })),
    );

    const first = (await (await read(SUBJECTS, cookie)).json()) as PageOf<SubjectItem>;
    const second = (await (await read(`${SUBJECTS}?p=2`, cookie)).json()) as PageOf<SubjectItem>;
    const beyond = await read(`${SUBJECTS}?p=999`, cookie);
    const last = (await beyond.json()) as PageOf<SubjectItem>;

    expect(first.items.length).toBe(10);
    expect(second.page).toBe(2);
    expect(second.items.length).toBe(1);
    expect(beyond.status).toBe(200);
    expect(last.page).toBe(last.pages);
    expect(last.items.length).toBeGreaterThan(0);
  });

  test('a valid subject answers 201 with the id and the Location of the list', async () => {
    const { cookie } = await registrarSession();

    const response = await write('POST', SUBJECTS, { name: 'Geografia' }, cookie);
    const body = (await response.json()) as CreatedBody;
    const page = (await (await read(SUBJECTS, cookie)).json()) as PageOf<SubjectItem>;

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(SUBJECTS);
    expect(page.items.some((item) => item.id === body.id)).toBe(true);
  });

  test('a missing name is refused by the edge, with 400 and the field named', async () => {
    const { cookie } = await registrarSession();

    const response = await write('POST', SUBJECTS, {}, cookie);
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.field).toBe('name');
  });

  /*
   * A name is a string either way, so "already exists" cannot be answered at the edge: only the
   * unique index in the database knows. That is exactly the line between 400 and 422.
   */
  test('a subject that already exists in the network is a rule refusal, 422 with the field', async () => {
    const { scenario, cookie } = await registrarSession();

    const response = await write('POST', SUBJECTS, { name: scenario.subjects[0].name }, cookie);
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(refusal.errors[0]?.field).toBe('name');
  });

  test('a write without a usable idempotency key is refused with 400', async () => {
    const { cookie } = await registrarSession();

    const response = await writeWithKey(
      'POST',
      SUBJECTS,
      { name: 'Geografia' },
      cookie,
      'nao-e-uma-chave',
    );

    expect(response.status).toBe(400);
  });

  test('the same key twice registers one subject', async () => {
    const { cookie } = await registrarSession();
    const key = crypto.randomUUID();

    const first = await writeWithKey('POST', SUBJECTS, { name: 'Geografia' }, cookie, key);
    const again = await writeWithKey('POST', SUBJECTS, { name: 'Geografia' }, cookie, key);
    const repeat = (await again.json()) as Repeat;
    const page = (await (await read(SUBJECTS, cookie)).json()) as PageOf<SubjectItem>;

    expect(first.status).toBe(201);
    expect(repeat.repeated).toBe(true);
    expect(repeat.location).toBe(SUBJECTS);
    expect(page.items.filter((item) => item.name === 'Geografia').length).toBe(1);
  });

  test('without a session both the list and the write answer 401', async () => {
    await fullScenario();

    const list = await read(SUBJECTS);
    const registration = await write('POST', SUBJECTS, { name: 'Geografia' });

    expect(list.status).toBe(401);
    expect(registration.status).toBe(401);
  });

  test('a guardian is refused with 403 on both', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionFor(scenario, scenario.guardian);

    const list = await read(SUBJECTS, cookie);
    const registration = await write('POST', SUBJECTS, { name: 'Geografia' }, cookie);

    expect(list.status).toBe(403);
    expect(registration.status).toBe(403);
  });
});
