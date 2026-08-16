/*
 * The academics reads. Two things get proven here for every query: that it answers what the screen
 * needs, and that it never crosses the network boundary — the `network_id` in every filter is what
 * keeps two city halls sharing the same database apart.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import { clearDatabase } from '../support/database';
import {
  DEFAULT_YEAR,
  fullScenario,
  createStudent,
  createAcademicYear,
  createSubject,
  createEnrollment,
  createNetwork,
  createGuardian,
  createClassGroup,
  createClassGroupSubject,
  createSchool,
  createUser,
  twoNetworks,
  linkStudentGuardian,
} from '../support/factories';

beforeEach(clearDatabase);

describe('searchStudents', () => {
  test('finds the student by a fragment of the name', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana Carolina Souza' });
    await createStudent({ networkId: network.id, name: 'Bruno Teixeira' });

    const found = await academics.searchStudents(network.id, 'Carolina');

    expect(found.map((student) => student.name)).toEqual(['Ana Carolina Souza']);
  });

  test('the search is case-insensitive', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana Carolina Souza' });

    const found = await academics.searchStudents(network.id, 'cArOLiNa');

    expect(found.map((student) => student.name)).toEqual(['Ana Carolina Souza']);
  });

  test('gives the hits back in name order', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Carlos Silva' });
    await createStudent({ networkId: network.id, name: 'Ana Silva' });
    await createStudent({ networkId: network.id, name: 'Bruno Silva' });

    const found = await academics.searchStudents(network.id, 'silva');

    expect(found.map((student) => student.name)).toEqual([
      'Ana Silva', 'Bruno Silva', 'Carlos Silva',
    ]);
  });

  test('never gives back a student from another network', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    await createStudent({ networkId: ours.id, name: 'Ana Silva' });
    await createStudent({ networkId: foreign.id, name: 'Ana Silva' });

    const found = await academics.searchStudents(ours.id, 'Ana Silva');

    expect(found).toHaveLength(1);
    expect(found[0]?.networkId).toBe(ours.id);
  });

  test('a fragment nobody carries gives back an empty list', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana Silva' });

    const found = await academics.searchStudents(network.id, 'Wagner');

    expect(found).toEqual([]);
  });

  test('the LIKE wildcards are searched for as ordinary text', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana 100% Silva' });
    await createStudent({ networkId: network.id, name: 'Bruno Teixeira' });

    const found = await academics.searchStudents(network.id, '100%');

    expect(found.map((student) => student.name)).toEqual(['Ana 100% Silva']);
  });

  test('the date of birth comes back in the application\'s canonical format', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana Silva', birthDate: '2014-05-10' });

    const found = await academics.searchStudents(network.id, 'Ana');

    expect(found[0]?.birthDate).toBe('2014-05-10');
  });
});

describe('studentById', () => {
  test('gives back the student of that network', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id, name: 'Ana Silva' });

    const found = await academics.studentById(network.id, student.id);

    expect(found).toEqual({
      id: student.id, networkId: network.id, name: 'Ana Silva', birthDate: student.birthDate,
    });
  });

  test('a student from another network is not reachable by id', async () => {
    const { a, b } = await twoNetworks();

    const found = await academics.studentById(a.network.id, b.students[0].id);

    expect(found).toBeNull();
  });
});

describe('class groups', () => {
  test('listClassGroups with no filter brings the network\'s class groups in grade-level and name order', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '7º B', gradeLevel: '7º ano',
    });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano',
    });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '7º A', gradeLevel: '7º ano',
    });

    const classGroups = await academics.listClassGroups(network.id);

    expect(classGroups.map((classGroup) => classGroup.name)).toEqual(['6º A', '7º A', '7º B']);
  });

  test('listClassGroups filters by school', async () => {
    const network = await createNetwork();
    const center = await createSchool({ networkId: network.id });
    const beach = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });
    await createClassGroup({
      networkId: network.id, schoolId: center.id, academicYearId: academicYear.id, name: 'Centro 6º A',
    });
    await createClassGroup({
      networkId: network.id, schoolId: beach.id, academicYearId: academicYear.id, name: 'Praia 6º A',
    });

    const classGroups = await academics.listClassGroups(network.id, { schoolId: center.id });

    expect(classGroups.map((classGroup) => classGroup.name)).toEqual(['Centro 6º A']);
  });

  test('listClassGroups filters by academic year', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const thisYear = await createAcademicYear({ networkId: network.id, year: DEFAULT_YEAR });
    const nextYear = await createAcademicYear({ networkId: network.id, year: DEFAULT_YEAR + 1 });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: thisYear.id, name: 'Turma de agora',
    });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: nextYear.id, name: 'Turma do ano que vem',
    });

    const classGroups = await academics.listClassGroups(network.id, { academicYearId: nextYear.id });

    expect(classGroups.map((classGroup) => classGroup.name)).toEqual(['Turma do ano que vem']);
  });

  test('listClassGroups never brings a class group from another network', async () => {
    const { a, b } = await twoNetworks();

    const classGroups = await academics.listClassGroups(a.network.id);

    expect(classGroups.every((classGroup) => classGroup.networkId === a.network.id)).toBe(true);
    expect(classGroups.map((classGroup) => classGroup.id)).not.toContain(b.classGroups[0].id);
  });

  test('classGroupById does not reach a class group in another network', async () => {
    const { a, b } = await twoNetworks();

    const found = await academics.classGroupById(a.network.id, b.classGroups[0].id);

    expect(found).toBeNull();
    expect(await academics.classGroupById(a.network.id, a.classGroups[0].id)).not.toBeNull();
  });
});

describe('the subjects of a class group and of a teacher', () => {
  test('listSubjects brings the network\'s subjects in name order', async () => {
    const network = await createNetwork();
    await createSubject({ networkId: network.id, name: 'Matemática' });
    await createSubject({ networkId: network.id, name: 'Artes' });
    await createSubject({ networkId: network.id, name: 'História' });

    const subjects = await academics.listSubjects(network.id);

    expect(subjects.map((subject) => subject.name)).toEqual([
      'Artes', 'História', 'Matemática',
    ]);
  });

  test('listClassGroupSubjects brings the class group\'s allocations along with the subject name', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;

    const assignments = await academics.listClassGroupSubjects(scenario.network.id, classGroup.id);

    expect(assignments).toHaveLength(3);
    expect(assignments.every((assignment) => assignment.classGroupId === classGroup.id)).toBe(true);
    expect(assignments.every((assignment) => assignment.subjectName.length > 0)).toBe(true);
    expect(assignments.every((assignment) => assignment.teacherUserId === scenario.teacher.id)).toBe(true);
  });

  test('classGroupSubjectById gives back the allocation and does not reach one in another network', async () => {
    const { a, b } = await twoNetworks();
    const target = a.classGroupSubjects[0];

    const found = await academics.classGroupSubjectById(a.network.id, target.id);

    expect(found?.id).toBe(target.id);
    expect(await academics.classGroupSubjectById(a.network.id, b.classGroupSubjects[0].id)).toBeNull();
  });

  test('teacherClassGroupSubjects brings class group and grade level along with the subject', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;

    const teacherRows = await academics.teacherClassGroupSubjects(
      scenario.network.id, scenario.teacher.id,
    );

    expect(teacherRows).toHaveLength(3);
    expect(teacherRows.every((row) => row.classGroupName === classGroup.name)).toBe(true);
    expect(teacherRows.every((row) => row.schoolId === classGroup.schoolId)).toBe(true);
    expect(teacherRows.every((row) => row.shift === classGroup.shift)).toBe(true);
  });

  test('a teacher with no allocation at all opens an empty dashboard', async () => {
    const scenario = await fullScenario();
    const anotherTeacher = await createUser({
      networkId: scenario.network.id,
      roles: [{ schoolId: scenario.schools[0].id, role: 'teacher' }],
    });

    const teacherRows = await academics.teacherClassGroupSubjects(
      scenario.network.id, anotherTeacher.id,
    );

    expect(teacherRows).toEqual([]);
  });

  test('teacherClassGroups brings each class group once, even with several subjects in it', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;

    const classGroups = await academics.teacherClassGroups(scenario.network.id, scenario.teacher.id);

    expect(classGroups.map((row) => row.id)).toEqual([classGroup.id]);
  });

  test('teacherClassGroups counts both class groups when the teacher teaches in both', async () => {
    const scenario = await fullScenario();
    const [first, second] = scenario.classGroups;
    const geography = await createSubject({ networkId: scenario.network.id, name: 'Geografia' });
    await createClassGroupSubject({
      networkId: scenario.network.id, classGroupId: second.id,
      subjectId: geography.id, teacherUserId: scenario.teacher.id,
    });

    const classGroups = await academics.teacherClassGroups(scenario.network.id, scenario.teacher.id);

    expect(classGroups.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
  });

  test('the allocations of a teacher in another network do not leak', async () => {
    const { a, b } = await twoNetworks();

    const ofTheForeignTeacher = await academics.teacherClassGroupSubjects(
      a.network.id, b.teacher.id,
    );

    expect(ofTheForeignTeacher).toEqual([]);
    expect(await academics.teacherClassGroups(a.network.id, b.teacher.id)).toEqual([]);
  });
});

describe('guardians', () => {
  /*
   * `listGuardians` left academics together with the guardian record; the listing is now
   * `identity.usersPage` filtered by role, and it is proven in `tests/academics/pagination.test.ts`.
   * What stays here is the link itself, which is all academics still owns.
   */
  test('studentGuardians brings the link with its relationship and the financial mark', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const mother = await createGuardian({
      networkId: network.id, name: 'Ana Souza', email: 'ana@familia.br',
    });
    const father = await createGuardian({
      networkId: network.id, name: 'Bruno Souza', email: 'bruno@familia.br',
    });
    await linkStudentGuardian({
      networkId: network.id, studentId: student.id, userId: mother.id,
      relationship: 'mãe', financiallyResponsible: true,
    });
    await linkStudentGuardian({
      networkId: network.id, studentId: student.id, userId: father.id,
      relationship: 'pai', financiallyResponsible: false,
    });

    const guardianLinks = await academics.studentGuardians(network.id, student.id);

    expect(guardianLinks).toHaveLength(2);
    expect(guardianLinks).toContainEqual({
      userId: mother.id, relationship: 'mãe', financiallyResponsible: true,
    });
    expect(guardianLinks).toContainEqual({
      userId: father.id, relationship: 'pai', financiallyResponsible: false,
    });
  });

  test('the name of a guardian is not academics to give: only the link comes back', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const mother = await createGuardian({ networkId: network.id, name: 'Ana Souza' });
    await linkStudentGuardian({
      networkId: network.id, studentId: student.id, userId: mother.id,
    });

    const [link] = await academics.studentGuardians(network.id, student.id);

    expect(Object.keys(link ?? {}).sort()).toEqual([
      'financiallyResponsible', 'relationship', 'userId',
    ]);
  });

  test('schoolGuardians brings whoever answers for a student with an active enrollment there', async () => {
    const scenario = await fullScenario();
    const [schoolWithStudents, emptySchool] = scenario.schools;

    const schoolGuardiansList = await academics.schoolGuardians(scenario.network.id, schoolWithStudents.id);

    expect(schoolGuardiansList).toHaveLength(5);
    expect(await academics.schoolGuardians(scenario.network.id, emptySchool.id)).toEqual([]);
  });

  test('the guardian of a student with no active enrollment receives no announcement from the school', async () => {
    const scenario = await fullScenario();
    const [school] = scenario.schools;
    const withoutEnrollment = await createGuardian({
      networkId: scenario.network.id, name: 'Zulmira Sem Turma',
    });
    const departedStudent = await createStudent({ networkId: scenario.network.id });
    await linkStudentGuardian({
      networkId: scenario.network.id, studentId: departedStudent.id, userId: withoutEnrollment.id,
    });
    await createEnrollment({
      networkId: scenario.network.id, studentId: departedStudent.id, classGroupId: scenario.classGroups[0].id,
      academicYearId: scenario.academicYear.id, status: 'transferred',
    });

    const schoolGuardiansList = await academics.schoolGuardians(scenario.network.id, school.id);

    expect(schoolGuardiansList).not.toContain(withoutEnrollment.id);
  });
});

describe('enrollments', () => {
  test('enrollmentById brings the student name, the class group name and the year', async () => {
    const scenario = await fullScenario();
    const [enrollment] = scenario.enrollments;
    const [student] = scenario.students;
    const [classGroup] = scenario.classGroups;

    const found = await academics.enrollmentById(scenario.network.id, enrollment.id);

    expect(found).toEqual({
      id: enrollment.id,
      networkId: scenario.network.id,
      studentId: student.id,
      studentName: student.name,
      classGroupId: classGroup.id,
      classGroupName: classGroup.name,
      schoolId: classGroup.schoolId,
      academicYearId: scenario.academicYear.id,
      year: DEFAULT_YEAR,
      enrollmentDate: enrollment.enrollmentDate,
      status: 'active',
    });
  });

  test('an enrollment from another network is not reachable by id', async () => {
    const { a, b } = await twoNetworks();

    const found = await academics.enrollmentById(a.network.id, b.enrollments[0].id);

    expect(found).toBeNull();
  });

  test('activeEnrollmentsOfClassGroup lists the active ones in student-name order', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;

    const active = await academics.activeEnrollmentsOfClassGroup(scenario.network.id, classGroup.id);

    const names = active.map((enrollment) => enrollment.studentName);
    expect(active).toHaveLength(5);
    expect(names).toEqual([...names].sort());
  });

  test('activeEnrollmentsOfClassGroup ignores whoever left the class group', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;
    const [departed] = scenario.enrollments;
    await academics.transfer({
      networkId: scenario.network.id, enrollmentId: departed.id,
      targetClassGroupId: scenario.classGroups[1].id, date: `${DEFAULT_YEAR}-06-01`,
    });

    const active = await academics.activeEnrollmentsOfClassGroup(scenario.network.id, classGroup.id);

    expect(active).toHaveLength(4);
    expect(active.map((enrollment) => enrollment.id)).not.toContain(departed.id);
  });

  test('guardianEnrollments gives back only the students linked to that guardian', async () => {
    const scenario = await fullScenario();
    const [first, second] = scenario.guardians;
    const [studentOfTheFirst] = scenario.students;

    const ofTheFirst = await academics.guardianEnrollments(scenario.network.id, first.id);

    expect(ofTheFirst.map((enrollment) => enrollment.studentId)).toEqual([studentOfTheFirst.id]);
    const ofTheSecond = await academics.guardianEnrollments(scenario.network.id, second.id);
    expect(ofTheSecond.map((enrollment) => enrollment.studentId)).not.toContain(studentOfTheFirst.id);
  });

  test('guardianEnrollments brings both children of whoever answers for two', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    const sibling = await createStudent({ networkId: scenario.network.id, name: 'Irmão Caçula' });
    await linkStudentGuardian({
      networkId: scenario.network.id, studentId: sibling.id, userId: guardian.id,
    });
    await createEnrollment({
      networkId: scenario.network.id, studentId: sibling.id, classGroupId: scenario.classGroups[1].id,
      academicYearId: scenario.academicYear.id,
    });

    const guardianRows = await academics.guardianEnrollments(scenario.network.id, guardian.id);

    expect(guardianRows).toHaveLength(2);
    expect(guardianRows.map((enrollment) => enrollment.studentName)).toContain('Irmão Caçula');
  });

  test('guardianEnrollments shows the history, most recent year first', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    const [student] = scenario.students;
    const nextYear = await createAcademicYear({ networkId: scenario.network.id, year: DEFAULT_YEAR + 1 });
    const futureClassGroup = await createClassGroup({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id, academicYearId: nextYear.id,
    });
    await createEnrollment({
      networkId: scenario.network.id, studentId: student.id, classGroupId: futureClassGroup.id,
      academicYearId: nextYear.id, enrollmentDate: `${DEFAULT_YEAR + 1}-02-05`,
    });

    const guardianRows = await academics.guardianEnrollments(scenario.network.id, guardian.id);

    expect(guardianRows.map((enrollment) => enrollment.year)).toEqual([DEFAULT_YEAR + 1, DEFAULT_YEAR]);
  });

  test('guardianEnrollments in another network gives back nothing', async () => {
    const { a, b } = await twoNetworks();

    const foreign = await academics.guardianEnrollments(a.network.id, b.guardians[0].id);

    expect(foreign).toEqual([]);
  });
});
