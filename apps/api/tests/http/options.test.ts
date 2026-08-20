/*
 * The six lists the choice fields in the forms are built from.
 *
 * These URLs are new. Until now each of these lists was assembled inside a `GET …/new` screen
 * handler, with its own scoping written by hand next to the template it fed. Concentrating them
 * here is what lets the front cache them, and it is also what makes the scoping testable: a slice
 * buried in a screen handler is only ever exercised through that screen.
 *
 * Two rules carry the whole file. The first is that scope is not the same thing as permission: a
 * guardian asking for the subject list is refused with 403 because the role may not have it at all,
 * while a registrar asking for the teachers of a school they do not serve gets 404 — the existence
 * of that school is already information. The second is that `/options/schools` answers every role,
 * and answers each of them a different list.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { API, API_ROUTES, OPTIONS_ROUTES, PARAMS } from '../../src/http/constants';
import { clearDatabase } from '../support/database';
import {
  DEFAULT_PASSWORD,
  createClassGroup,
  createUser,
  fullScenario,
  twoNetworks,
  type Scenario,
} from '../support/factories';
import { read, signIn } from './support';

const OPTIONS = `${API.versionedPrefix}${API_ROUTES.options}`;
const SCHOOLS = `${OPTIONS}${OPTIONS_ROUTES.schools}`;
const ACADEMIC_YEARS = `${OPTIONS}${OPTIONS_ROUTES.academicYears}`;
const GUARDIANS = `${OPTIONS}${OPTIONS_ROUTES.guardians}`;
const CLASS_GROUPS = `${OPTIONS}${OPTIONS_ROUTES.classGroups}`;
const SUBJECTS = `${OPTIONS}${OPTIONS_ROUTES.subjects}`;
const TEACHERS = `${OPTIONS}${OPTIONS_ROUTES.teachers}`;

const EVERY_LIST = [SCHOOLS, ACADEMIC_YEARS, GUARDIANS, CLASS_GROUPS, SUBJECTS, TEACHERS] as const;

const teachersOf = (schoolId: string): string => `${TEACHERS}?${PARAMS.schoolId}=${schoolId}`;

/** A uuid belonging to nothing: the shape is valid, so a 404 here is scope and not malformed input. */
const UNKNOWN_SCHOOL = '11111111-2222-3333-4444-555555555555';

type SchoolOptionBody = { id: string; name: string; active: boolean };
type SimpleOptionBody = { id: string; name: string };
type AcademicYearOptionBody = { id: string; year: number };
type ClassGroupOptionBody = {
  id: string;
  name: string;
  gradeLevel: string;
  shift: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  year: number | null;
};

const sessionOf = (scenario: Scenario, person: { cpf: string }): Promise<string> =>
  signIn({
    networkSlug: scenario.network.slug,
    cpf: person.cpf,
    password: DEFAULT_PASSWORD,
  });

const idsOf = (items: readonly { id: string }[]): string[] => items.map((item) => item.id).sort();

describe('who may ask at all', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * `rejectAnonymous` redirects a GET to `/login` unless the path is under `/api`. All six live
   * there, so all six must answer a JSON 401 — the loop is here because a router-level middleware
   * is easy to attach to five routes out of six and never notice.
   */
  test('without a session every one of the six lists answers 401', async () => {
    const answers = await Promise.all(EVERY_LIST.map((path) => read(path)));

    for (const answer of answers) expect(answer.status).toBe(401);
  });

  /*
   * The subject list is a registrar's tool. A guardian holds a real session and a real role, so the
   * refusal cannot be 401, and the subjects of a network are not a secret whose existence has to be
   * hidden from them — 403 is the honest answer, and it is `requireRole`'s own.
   */
  test('a guardian asking for the subjects is refused with 403', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.guardian);

    const response = await read(SUBJECTS, cookie);

    expect(response.status).toBe(403);
  });

  test('a teacher asking for the academic years is refused with 403', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.teacher);

    const response = await read(ACADEMIC_YEARS, cookie);

    expect(response.status).toBe(403);
  });

  test('a guardian asking for the class groups is refused with 403', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.guardian);

    const response = await read(CLASS_GROUPS, cookie);

    expect(response.status).toBe(403);
  });
});

describe('the school list, which every role may ask for', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * The registrar of `fullScenario` serves the first school only. The second exists, has a name and
   * is active — returning it would hand a registrar a school they may not write into, and every
   * form built on this list would then offer it.
   */
  test('a registrar sees only the schools where they hold the role', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(SCHOOLS, cookie);
    const body = (await response.json()) as SchoolOptionBody[];

    expect(response.status).toBe(200);
    expect(idsOf(body)).toEqual([scenario.schools[0].id]);
  });

  /*
   * The scope is "the schools of the session's roles", not "the schools where this person is a
   * registrar" — the list feeds forms across every role, which is why the route is open to all of
   * them. The case above cannot tell the two apart: `fullScenario`'s registrar holds exactly one
   * role, so both readings produce the same single school.
   *
   * This one separates them. Somebody who is a registrar in one school and a teacher in another
   * sees both, and deleting the role filter entirely would still be caught by the case above.
   */
  test('the schools of every role in the session are listed, not only the registrar ones', async () => {
    const scenario = await fullScenario();
    const person = await createUser({
      networkId: scenario.network.id,
      password: DEFAULT_PASSWORD,
      roles: [
        { schoolId: scenario.schools[0].id, role: 'registrar' },
        { schoolId: scenario.schools[1].id, role: 'teacher' },
      ],
    });
    const cookie = await sessionOf(scenario, person);

    const response = await read(SCHOOLS, cookie);
    const body = (await response.json()) as SchoolOptionBody[];

    expect(response.status).toBe(200);
    expect(idsOf(body).sort()).toEqual([scenario.schools[0].id, scenario.schools[1].id].sort());
  });

  /*
   * The admin of `fullScenario` holds a role in both schools, so filtering by the session's roles
   * produces the same two schools as the short-circuit does — deleting the `network_admin` branch
   * entirely left the suite green. This admin holds one role, and only the branch can show them the
   * school they were never assigned to.
   */
  test('a network_admin assigned to one school still sees the whole network', async () => {
    const scenario = await fullScenario();
    const narrow = await createUser({
      networkId: scenario.network.id,
      password: DEFAULT_PASSWORD,
      roles: [{ schoolId: scenario.schools[0].id, role: 'network_admin' }],
    });
    const cookie = await sessionOf(scenario, narrow);

    const response = await read(SCHOOLS, cookie);
    const body = (await response.json()) as SchoolOptionBody[];

    expect(response.status).toBe(200);
    expect(idsOf(body)).toContain(scenario.schools[1].id);
  });

  test('a network_admin sees every school of the network', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.admin);

    const response = await read(SCHOOLS, cookie);
    const body = (await response.json()) as SchoolOptionBody[];

    expect(response.status).toBe(200);
    expect(idsOf(body)).toEqual(idsOf(scenario.schools));
  });

  /*
   * "Any role" has to mean the guardian too, and it has to mean the guardian's own school. A 403
   * here would be a regression the moment a screen needs the school name of the person signed in.
   */
  test('a guardian reaches the list, and reaches their own school in it', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.guardian);

    const response = await read(SCHOOLS, cookie);
    const body = (await response.json()) as SchoolOptionBody[];

    expect(response.status).toBe(200);
    expect(idsOf(body)).toEqual([scenario.schools[0].id]);
  });

  /*
   * `active` is on the contract because a form has to be able to tell a closed unit apart from an
   * open one. A presenter that forgot the field would still answer 200 with plausible-looking rows.
   */
  test('each school carries its name and whether it is active', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.admin);

    const body = (await (await read(SCHOOLS, cookie)).json()) as SchoolOptionBody[];
    const first = body.find((school) => school.id === scenario.schools[0].id);

    expect(first?.name).toBe(scenario.schools[0].name);
    expect(first?.active).toBe(true);
  });

  /* A school of the other network is not in the session's roles and is not in the network either. */
  test('no school of another network reaches this session', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await sessionOf(a, a.admin);

    const body = (await (await read(SCHOOLS, cookie)).json()) as SchoolOptionBody[];

    expect(body.some((school) => idsOf(b.schools).includes(school.id))).toBe(false);
  });
});

describe('the academic year and guardian lists', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('the academic years come back with the year resolved, not merely an id', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(ACADEMIC_YEARS, cookie);
    const body = (await response.json()) as AcademicYearOptionBody[];

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: scenario.academicYear.id, year: scenario.academicYear.year }]);
  });

  test('a network_admin may ask for the academic years too', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.admin);

    const response = await read(ACADEMIC_YEARS, cookie);

    expect(response.status).toBe(200);
  });

  /*
   * There is no `academics.listGuardians` and there may not be one: a guardian is an `app_user`
   * holding the `guardian` role, reached through `student_guardian.user_id`. This case pins the
   * source — if the list ever came from a guardian table of its own, the registrar and the teacher
   * would not be excluded by role and would show up here.
   */
  test('the guardian list is the users holding the guardian role, and nobody else', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(GUARDIANS, cookie);
    const body = (await response.json()) as SimpleOptionBody[];
    const returned = idsOf(body);

    expect(response.status).toBe(200);
    expect(returned).toEqual(idsOf(scenario.guardians));
    expect(returned).not.toContain(scenario.registrar.id);
    expect(returned).not.toContain(scenario.teacher.id);
    expect(returned).not.toContain(scenario.admin.id);
  });

  test('the guardians of another network never reach this registrar', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await sessionOf(a, a.registrar);

    const body = (await (await read(GUARDIANS, cookie)).json()) as SimpleOptionBody[];

    expect(idsOf(body)).toEqual(idsOf(a.guardians));
    expect(body.some((person) => idsOf(b.guardians).includes(person.id))).toBe(false);
  });
});

describe('the class group list', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * The whole reason this list is worth an endpoint: a class group row on its own carries
   * `schoolId` and `academicYearId` and nothing a human can read. The screen that used to assemble
   * this resolved both by hand before rendering. If either resolution is dropped the answer is
   * still a valid 200 with the right number of rows — only these two assertions notice.
   */
  test('every class group carries the school name and the year, with no null where there is data', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(CLASS_GROUPS, cookie);
    const body = (await response.json()) as ClassGroupOptionBody[];

    expect(response.status).toBe(200);
    expect(idsOf(body)).toEqual(idsOf(scenario.classGroups));
    for (const classGroup of body) {
      expect(classGroup.schoolName).toBe(scenario.schools[0].name);
      expect(classGroup.year).toBe(scenario.academicYear.year);
    }
  });

  test('the grade level and the shift travel with each class group', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const body = (await (await read(CLASS_GROUPS, cookie)).json()) as ClassGroupOptionBody[];
    const first = body.find((classGroup) => classGroup.id === scenario.classGroups[0].id);

    expect(first?.gradeLevel).toBe(scenario.classGroups[0].gradeLevel);
    expect(first?.shift).toBe(scenario.classGroups[0].shift);
    expect(first?.academicYearId).toBe(scenario.academicYear.id);
  });

  test('the class groups of another network are not in scope', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await sessionOf(a, a.registrar);

    const body = (await (await read(CLASS_GROUPS, cookie)).json()) as ClassGroupOptionBody[];

    expect(body.some((classGroup) => idsOf(b.classGroups).includes(classGroup.id))).toBe(false);
  });
});

describe('the subject and teacher lists', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('the subjects of the network come back to the registrar', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(SUBJECTS, cookie);
    const body = (await response.json()) as SimpleOptionBody[];

    expect(response.status).toBe(200);
    expect(idsOf(body)).toEqual(idsOf(scenario.subjects));
  });

  test('the teachers of a school in scope come back with their names', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(teachersOf(scenario.schools[0].id), cookie);
    const body = (await response.json()) as SimpleOptionBody[];

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: scenario.teacher.id, name: scenario.teacher.name }]);
  });

  /*
   * 404 and not 403: the registrar has the role, so the role is not the problem. Answering 403
   * would confirm that the school exists — and the second school of this very network is exactly
   * the thing a registrar must not be able to probe for.
   */
  test('a school of the same network but outside the registrar scope answers 404', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(teachersOf(scenario.schools[1].id), cookie);

    expect(response.status).toBe(404);
  });

  test('a school of another network answers 404, the same as one that does not exist', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await sessionOf(a, a.registrar);

    const foreign = await read(teachersOf(b.schools[0].id), cookie);
    const nowhere = await read(teachersOf(UNKNOWN_SCHOOL), cookie);

    expect(foreign.status).toBe(404);
    expect(nowhere.status).toBe(404);
  });

  /*
   * No `schoolId` at all is not a different answer from a `schoolId` nobody may reach. There is no
   * edge schema on this front, so the missing parameter is decided by scope: an absent school is
   * outside every scope there is.
   */
  test('asking for the teachers with no schoolId at all answers 404', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(TEACHERS, cookie);

    expect(response.status).toBe(404);
  });
});

/*
 * The one line that keeps another school's class groups out of the registrar's picker is the
 * `schoolIds` filter, and nothing exercised it: every class group in `fullScenario` already lives
 * in the school the registrar serves, so dropping the filter changed no answer.
 *
 * A class group in the school they do not serve is what separates the two, and it matters beyond
 * tidiness: this list feeds the enrolment form, so an unfiltered picker offers a registrar a class
 * group they cannot write into — and the write behind it answers 404, which reads as a bug in the
 * screen rather than as the scope rule doing its job.
 */
describe('the class-group picker stops at the schools the registrar serves', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('a class group of another school of the same network is not offered', async () => {
    const scenario = await fullScenario();
    const elsewhere = await createClassGroup({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      academicYearId: scenario.academicYear.id,
    });
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(CLASS_GROUPS, cookie);
    const body = (await response.json()) as { id: string }[];

    expect(response.status).toBe(200);
    expect(body.map((item) => item.id)).not.toContain(elsewhere.id);
  });

  test('and the ones of the school they do serve are still offered', async () => {
    const scenario = await fullScenario();
    const cookie = await sessionOf(scenario, scenario.registrar);

    const response = await read(CLASS_GROUPS, cookie);
    const body = (await response.json()) as { id: string }[];

    expect(body.length).toBeGreaterThan(0);
    expect(body.map((item) => item.id)).toContain(scenario.classGroups[0].id);
  });
});
