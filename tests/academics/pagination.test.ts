/*
 * The paginated queries against the real database.
 *
 * What gets proven here is that the slicing happens in SQL, not afterwards: a page brings only its
 * own piece, the total counts the whole list, and neither of the two crosses the network boundary.
 * A slice that leaked tenant would be worse than an unsliced list — it would show little, and wrong.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import { identity } from '../../src/identity';
import { clearDatabase } from '../support/database';
import {
  DEFAULT_YEAR,
  fullScenario,
  createStudent,
  createAcademicYear,
  createSubject,
  createNetwork,
  createGuardian,
  createClassGroup,
  createSchool,
  createUser,
} from '../support/factories';

beforeEach(clearDatabase);

/** Names numbered with a leading zero so that alphabetical order is creation order. */
const numberedName = (position: number): string => `Pessoa ${String(position).padStart(3, '0')}`;

/*
 * The guardian listing left `academics` and became `identity.usersPage` filtered by
 * role — the context that owns the name is the one that sorts and paginates by it.
 */
describe('the guardian page, now filtered by role in identity', () => {
  test('the first page brings the requested size, and the total counts them all', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    for (let i = 1; i <= 7; i += 1) {
      await createGuardian({ networkId: network.id, schoolId: school.id, name: numberedName(i) });
    }

    const page = await identity.usersPage(network.id, 1, 3, 'guardian');

    expect(page.items.map((r) => r.name)).toEqual([
      numberedName(1), numberedName(2), numberedName(3),
    ]);
    expect(page).toMatchObject({ total: 7, page: 1, size: 3, pages: 3 });
  });

  test('the next page picks up where the previous one stopped, repeating nothing and skipping nothing', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    for (let i = 1; i <= 7; i += 1) {
      await createGuardian({ networkId: network.id, schoolId: school.id, name: numberedName(i) });
    }

    const [first, second, third] = await Promise.all([
      identity.usersPage(network.id, 1, 3, 'guardian'),
      identity.usersPage(network.id, 2, 3, 'guardian'),
      identity.usersPage(network.id, 3, 3, 'guardian'),
    ]);

    const traversed = [...first.items, ...second.items, ...third.items].map((r) => r.name);
    expect(traversed).toEqual(Array.from({ length: 7 }, (_, i) => numberedName(i + 1)));
  });

  test('a page past the end gives back the last one, not an empty list', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    for (let i = 1; i <= 5; i += 1) {
      await createGuardian({ networkId: network.id, schoolId: school.id, name: numberedName(i) });
    }

    const page = await identity.usersPage(network.id, 99, 2, 'guardian');

    expect(page.page).toBe(3);
    expect(page.items.map((r) => r.name)).toEqual([numberedName(5)]);
  });

  test('the total never counts a guardian from another network', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const ourSchool = await createSchool({ networkId: ours.id });
    const foreignSchool = await createSchool({ networkId: foreign.id });
    await createGuardian({ networkId: ours.id, schoolId: ourSchool.id, name: numberedName(1) });
    const fromOutside = await createGuardian({
      networkId: foreign.id, schoolId: foreignSchool.id, name: numberedName(2),
    });

    const page = await identity.usersPage(ours.id, 1, 50, 'guardian');

    expect(page.total).toBe(1);
    expect(page.items.map((r) => r.id)).not.toContain(fromOutside.id);
  });

  test('the role filter leaves out whoever is not a guardian', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    await createGuardian({ networkId: network.id, schoolId: school.id, name: numberedName(1) });
    await createUser({
      networkId: network.id, name: numberedName(2),
      roles: [{ schoolId: school.id, role: 'registrar' }],
    });
    await createUser({ networkId: network.id, name: numberedName(3) });

    const page = await identity.usersPage(network.id, 1, 50, 'guardian');

    expect(page.items.map((r) => r.name)).toEqual([numberedName(1)]);
  });
});

describe('studentsPage', () => {
  test('slices the search hits and counts everyone matching the term', async () => {
    const network = await createNetwork();
    for (let i = 1; i <= 6; i += 1) {
      await createStudent({ networkId: network.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }
    await createStudent({ networkId: network.id, name: 'Outro Sobrenome' });

    const page = await academics.studentsPage(network.id, 'Silva', 2, 4);

    expect(page.total).toBe(6);
    expect(page.items).toHaveLength(2);
    expect(page.items.every((student) => student.name.startsWith('Silva'))).toBe(true);
  });

  test('the paginated search does not reach a student in another network', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    await createStudent({ networkId: ours.id, name: 'Ana Silva' });
    await createStudent({ networkId: foreign.id, name: 'Ana Silva' });

    const page = await academics.studentsPage(ours.id, 'Ana Silva', 1, 20);

    expect(page.total).toBe(1);
    expect(page.items[0]?.networkId).toBe(ours.id);
  });
});

describe('classGroupsPage', () => {
  test('the scope goes in as a condition: only the class groups of the schools given', async () => {
    const network = await createNetwork();
    const [inScope, outside] = await Promise.all([
      createSchool({ networkId: network.id }),
      createSchool({ networkId: network.id }),
    ]);
    const academicYear = await createAcademicYear({ networkId: network.id });
    await createClassGroup({
      networkId: network.id, schoolId: inScope.id, academicYearId: academicYear.id, name: 'Da minha unidade',
    });
    await createClassGroup({
      networkId: network.id, schoolId: outside.id, academicYearId: academicYear.id, name: 'Da outra unidade',
    });

    const page = await academics.classGroupsPage(network.id, { schoolIds: [inScope.id] }, 1, 20);

    expect(page.items.map((classGroup) => classGroup.name)).toEqual(['Da minha unidade']);
    expect(page.total).toBe(1);
  });

  test('an empty list of schools means no class group, and never all of them', async () => {
    const scenario = await fullScenario();

    const page = await academics.classGroupsPage(scenario.network.id, { schoolIds: [] }, 1, 20);

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  test('the academic-year filter still holds alongside the scope', async () => {
    const scenario = await fullScenario();
    const otherYear = await createAcademicYear({ networkId: scenario.network.id, year: DEFAULT_YEAR + 1 });
    await createClassGroup({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id,
      academicYearId: otherYear.id, name: 'Turma do ano que vem',
    });

    const page = await academics.classGroupsPage(
      scenario.network.id,
      { schoolIds: [scenario.schools[0].id], academicYearId: otherYear.id },
      1,
      20,
    );

    expect(page.items.map((classGroup) => classGroup.name)).toEqual(['Turma do ano que vem']);
  });
});

describe('studentEnrollmentsPage', () => {
  test('brings the student history restricted to the schools in scope', async () => {
    const scenario = await fullScenario();
    const [student] = scenario.students;

    const page = await academics.studentEnrollmentsPage(
      scenario.network.id, student.id, [scenario.schools[0].id], 1, 20,
    );

    expect(page.total).toBe(1);
    expect(page.items[0]?.studentId).toBe(student.id);
  });

  test('a school outside the scope gives back no enrollment at all', async () => {
    const scenario = await fullScenario();
    const [student] = scenario.students;

    const page = await academics.studentEnrollmentsPage(
      scenario.network.id, student.id, [scenario.schools[1].id], 1, 20,
    );

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

describe('the counts that replaced the lists', () => {
  test('studentHasEnrollment tells the newly registered student from the one in another school', async () => {
    const scenario = await fullScenario();
    const newlyRegistered = await createStudent({ networkId: scenario.network.id });

    expect(await academics.studentHasEnrollment(scenario.network.id, scenario.students[0].id)).toBe(true);
    expect(await academics.studentHasEnrollment(scenario.network.id, newlyRegistered.id)).toBe(false);
  });

  test('countsBySchool gives back class groups, enrolled students and guardians for each school', async () => {
    const scenario = await fullScenario();

    const bySchool = await academics.countsBySchool(
      scenario.network.id, scenario.schools.map((school) => school.id),
    );

    // The scenario builds both class groups and all five enrollments in the first school.
    expect(bySchool.get(scenario.schools[0].id)).toEqual({
      classGroups: 2, enrollments: 5, guardians: 5,
    });
    expect(bySchool.get(scenario.schools[1].id)).toEqual({
      classGroups: 0, enrollments: 0, guardians: 0,
    });
  });

  test('scopeTotals counts each guardian once, even with children in two schools', async () => {
    const scenario = await fullScenario();
    await createSubject({ networkId: scenario.network.id });

    const totals = await academics.scopeTotals(
      scenario.network.id, scenario.schools.map((school) => school.id),
    );

    expect(totals.classGroups).toBe(2);
    expect(totals.enrollments).toBe(5);
    expect(totals.guardians).toBe(5);
    expect(totals.subjects).toBe(scenario.subjects.length + 1);
  });
});

describe('usersPage', () => {
  test('the roles come only from the users on the page, and they arrive complete', async () => {
    const scenario = await fullScenario();

    const page = await identity.usersPage(scenario.network.id, 1, 2);

    expect(page.items).toHaveLength(2);
    // The five guardians of the scenario are `app_user` rows like any other.
    expect(page.total).toBe(3 + scenario.guardians.length);
    const admin = page.items.find((user) => user.id === scenario.admin.id);
    if (admin !== undefined) expect(admin.roles).toHaveLength(2);
  });

  test('a network with a malformed id gives back an empty page instead of blowing up', async () => {
    const page = await identity.usersPage('nao-e-uuid', 1, 20);

    expect(page).toMatchObject({ items: [], total: 0, page: 1 });
  });
});
