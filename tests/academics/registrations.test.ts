/*
 * The records the registrar feeds in before any enrollment. Every uniqueness here is a database
 * constraint (I8) turned into a field error by the use case — and every one of them holds WITHIN
 * the network: two city halls can carry the same subject, the same class group and the same
 * guardian e-mail without running each other over.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import type { ApplicationError, Result } from '../../src/shared/result';
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
  twoNetworks,
  linkStudentGuardian,
} from '../support/factories';

function valueOfResult<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

function errorsOf(result: Result<unknown>): ApplicationError[] {
  if (result.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return result.errors;
}

beforeEach(clearDatabase);

describe('defineAcademicYear', () => {
  test('records the network\'s academic year over the span given', async () => {
    const network = await createNetwork();

    const result = await academics.defineAcademicYear({
      networkId: network.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    const academicYear = valueOfResult(result);
    expect(academicYear).toEqual({
      id: academicYear.id, networkId: network.id, year: 2027,
      startDate: '2027-02-01', endDate: '2027-12-15',
    });
    expect(await academics.listAcademicYears(network.id)).toEqual([academicYear]);
  });

  test('refuses the same year twice within the network', async () => {
    const network = await createNetwork();
    await createAcademicYear({ networkId: network.id, year: 2027 });

    const result = await academics.defineAcademicYear({
      networkId: network.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    expect(errorsOf(result)).toEqual([
      { field: 'year', code: 'duplicate_year', message: 'Esta rede já tem o ano letivo 2027 definido.' },
    ]);
    expect(await academics.listAcademicYears(network.id)).toHaveLength(1);
  });

  test('accepts the same year in another network', async () => {
    const first = await createNetwork();
    const second = await createNetwork();
    await createAcademicYear({ networkId: first.id, year: 2027 });

    const result = await academics.defineAcademicYear({
      networkId: second.id, year: 2027, startDate: '2027-02-01', endDate: '2027-12-15',
    });

    expect(result.ok).toBe(true);
    expect(await academics.listAcademicYears(first.id)).toHaveLength(1);
  });

  test('refuses a span whose end comes before its start', async () => {
    const network = await createNetwork();

    const result = await academics.defineAcademicYear({
      networkId: network.id, year: 2027, startDate: '2027-12-15', endDate: '2027-02-01',
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'endDate',
        code: 'inconsistent_period',
        message: 'A data de término precisa ser posterior à data de início.',
      },
    ]);
  });

  test('refuses a year outside the range the product serves', async () => {
    const network = await createNetwork();

    const result = await academics.defineAcademicYear({
      networkId: network.id, year: 1998, startDate: '1998-02-01', endDate: '1998-12-15',
    });

    expect(errorsOf(result)[0]?.field).toBe('year');
  });

  test('lists the academic years from the most recent to the oldest', async () => {
    const network = await createNetwork();
    await createAcademicYear({ networkId: network.id, year: 2025 });
    await createAcademicYear({ networkId: network.id, year: 2027 });
    await createAcademicYear({ networkId: network.id, year: 2026 });

    const years = await academics.listAcademicYears(network.id);

    expect(years.map((academicYear) => academicYear.year)).toEqual([2027, 2026, 2025]);
  });
});

describe('registerSubject', () => {
  test('records the network\'s subject', async () => {
    const network = await createNetwork();

    const result = await academics.registerSubject({ networkId: network.id, name: 'Matemática' });

    const subject = valueOfResult(result);
    expect(subject).toEqual({ id: subject.id, networkId: network.id, name: 'Matemática' });
    expect(await academics.listSubjects(network.id)).toEqual([subject]);
  });

  test('refuses a subject whose name repeats within the network', async () => {
    const network = await createNetwork();
    await createSubject({ networkId: network.id, name: 'Matemática' });

    const result = await academics.registerSubject({ networkId: network.id, name: 'Matemática' });

    expect(errorsOf(result)).toEqual([
      {
        field: 'name',
        code: 'duplicate_subject',
        message: 'Esta rede já tem uma disciplina com este nome.',
      },
    ]);
    expect(await academics.listSubjects(network.id)).toHaveLength(1);
  });

  test('accepts the same subject in another network', async () => {
    const first = await createNetwork();
    const second = await createNetwork();
    await createSubject({ networkId: first.id, name: 'Matemática' });

    const result = await academics.registerSubject({ networkId: second.id, name: 'Matemática' });

    expect(result.ok).toBe(true);
  });

  test('refuses a subject with no name', async () => {
    const network = await createNetwork();

    const result = await academics.registerSubject({ networkId: network.id, name: '   ' });

    expect(errorsOf(result)[0]?.field).toBe('name');
  });
});

describe('registerClassGroup', () => {
  test('records the school\'s class group in the academic year', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    const classGroup = valueOfResult(result);
    expect(classGroup).toEqual({
      id: classGroup.id, networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });
    expect(await academics.classGroupById(network.id, classGroup.id)).toEqual(classGroup);
  });

  test('refuses a class group with the same name in the same school and academic year', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id, name: '6º A',
    });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'afternoon',
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'name',
        code: 'duplicate_class_group',
        message: 'Esta unidade já tem uma turma com este nome neste ano letivo.',
      },
    ]);
    expect(await academics.listClassGroups(network.id)).toHaveLength(1);
  });

  test('accepts the same class group name in another school of the same network', async () => {
    const network = await createNetwork();
    const center = await createSchool({ networkId: network.id });
    const beach = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });
    await createClassGroup({
      networkId: network.id, schoolId: center.id, academicYearId: academicYear.id, name: '6º A',
    });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: beach.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(result.ok).toBe(true);
  });

  test('accepts the same class group name in the same school in another academic year', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const thisYear = await createAcademicYear({ networkId: network.id, year: DEFAULT_YEAR });
    const nextYear = await createAcademicYear({ networkId: network.id, year: DEFAULT_YEAR + 1 });
    await createClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: thisYear.id, name: '6º A',
    });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: nextYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(result.ok).toBe(true);
  });

  test('refuses a shift the domain does not know', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });

    const result = await academics.registerClassGroup({
      networkId: network.id, schoolId: school.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'madrugada',
    });

    expect(errorsOf(result)[0]?.field).toBe('shift');
  });

  test('refuses a school from another network', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const otherSchool = await createSchool({ networkId: foreign.id });
    const academicYear = await createAcademicYear({ networkId: ours.id });

    const result = await academics.registerClassGroup({
      networkId: ours.id, schoolId: otherSchool.id, academicYearId: academicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'schoolId',
        code: 'school_not_found',
        message: 'Unidade não encontrada nesta rede.',
      },
    ]);
  });

  test('refuses an academic year from another network', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const school = await createSchool({ networkId: ours.id });
    const foreignAcademicYear = await createAcademicYear({ networkId: foreign.id });

    const result = await academics.registerClassGroup({
      networkId: ours.id, schoolId: school.id, academicYearId: foreignAcademicYear.id,
      name: '6º A', gradeLevel: '6º ano', shift: 'morning',
    });

    expect(errorsOf(result)[0]?.code).toBe('academic_year_not_found');
  });
});

describe('registerStudent', () => {
  test('records the network\'s student', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id, name: '  Ana Souza  ', birthDate: '2014-05-10',
    });

    const student = valueOfResult(result);
    expect(student).toEqual({
      id: student.id, networkId: network.id, name: 'Ana Souza', birthDate: '2014-05-10',
    });
    expect(await academics.studentById(network.id, student.id)).toEqual(student);
  });

  test('refuses a date of birth in the future', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id, name: 'Ana Souza', birthDate: '2099-01-01',
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'birthDate',
        code: 'date_in_future',
        message: 'A data de nascimento não pode estar no futuro.',
      },
    ]);
    expect(await academics.searchStudents(network.id, 'Ana')).toHaveLength(0);
  });

  test('refuses a date of birth outside the format', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id, name: 'Ana Souza', birthDate: '10/05/2014',
    });

    expect(errorsOf(result)[0]?.field).toBe('birthDate');
  });

  test('refuses a student with no name', async () => {
    const network = await createNetwork();

    const result = await academics.registerStudent({
      networkId: network.id, name: '', birthDate: '2014-05-10',
    });

    expect(errorsOf(result)[0]?.field).toBe('name');
  });

  test('two students may share a name: a namesake is not a duplicate', async () => {
    const network = await createNetwork();
    await academics.registerStudent({
      networkId: network.id, name: 'Ana Souza', birthDate: '2014-05-10',
    });

    const result = await academics.registerStudent({
      networkId: network.id, name: 'Ana Souza', birthDate: '2015-09-22',
    });

    expect(result.ok).toBe(true);
    expect(await academics.searchStudents(network.id, 'Ana Souza')).toHaveLength(2);
  });
});

describe('registerGuardian', () => {
  test('records the guardian with the e-mail normalized', async () => {
    const network = await createNetwork();

    const result = await academics.registerGuardian({
      networkId: network.id, name: 'Carla Dias', email: '  Carla.DIAS@Familia.BR ', phone: '27999990000',
    });

    const guardian = valueOfResult(result);
    expect(guardian).toEqual({
      id: guardian.id, networkId: network.id, name: 'Carla Dias', cpf: null,
      email: 'carla.dias@familia.br', phone: '27999990000',
    });
  });

  test('a blank phone becomes the absence of a phone', async () => {
    const network = await createNetwork();

    const result = await academics.registerGuardian({
      networkId: network.id, name: 'Carla Dias', email: 'carla@familia.br', phone: '',
    });

    expect(valueOfResult(result).phone).toBeNull();
  });

  test('refuses an e-mail already on record in the network', async () => {
    const network = await createNetwork();
    await createGuardian({ networkId: network.id, email: 'carla@familia.br' });

    const result = await academics.registerGuardian({
      networkId: network.id, name: 'Outra Carla', email: 'carla@familia.br',
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'email',
        code: 'duplicate_email',
        message: 'Esta rede já tem um responsável com este e-mail.',
      },
    ]);
    expect(await academics.listGuardians(network.id)).toHaveLength(1);
  });

  test('accepts the same guardian e-mail in another network', async () => {
    const first = await createNetwork();
    const second = await createNetwork();
    await createGuardian({ networkId: first.id, email: 'carla@familia.br' });

    const result = await academics.registerGuardian({
      networkId: second.id, name: 'Carla Dias', email: 'carla@familia.br',
    });

    expect(result.ok).toBe(true);
    expect(await academics.listGuardians(first.id)).toHaveLength(1);
    expect(await academics.listGuardians(second.id)).toHaveLength(1);
  });

  test('refuses an invalid e-mail', async () => {
    const network = await createNetwork();

    const result = await academics.registerGuardian({
      networkId: network.id, name: 'Carla Dias', email: 'carla-arroba-nada',
    });

    expect(errorsOf(result)[0]?.field).toBe('email');
  });

  test('records a guardian with no CPF — a foreigner exists as a contact', async () => {
    const network = await createNetwork({});

    const created = await academics.registerGuardian({
      networkId: network.id,
      name: 'Aiko Tanaka',
      email: 'aiko@escolaviva.test',
      cpf: '',
    });

    expect(created.ok).toBe(true);
    if (created.ok) expect(created.value.cpf).toBeNull();
  });

  test('accepts an explicit null CPF on the record', async () => {
    const network = await createNetwork({});

    const created = await academics.registerGuardian({
      networkId: network.id,
      name: 'Maria Santos',
      email: 'maria@escolaviva.test',
      cpf: null,
    });

    expect(created.ok).toBe(true);
    if (created.ok) expect(created.value.cpf).toBeNull();
  });

  test('refuses a CPF whose check digit is wrong', async () => {
    const network = await createNetwork({});

    const created = await academics.registerGuardian({
      networkId: network.id,
      name: 'Marcos Vinícius Pires',
      email: 'marcos@escolaviva.test',
      cpf: '52998224724',
    });

    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.errors[0]?.field).toBe('cpf');
  });

  test('stores the CPF as digits alone, even when typed with punctuation', async () => {
    const network = await createNetwork({});

    const created = await academics.registerGuardian({
      networkId: network.id,
      name: 'Heloísa Braga Sampaio',
      email: 'heloisa@escolaviva.test',
      cpf: '529.982.247-25',
    });

    expect(created.ok).toBe(true);
    if (created.ok) expect(created.value.cpf).toBe('52998224725');
  });
});

describe('linkGuardian', () => {
  test('ties the guardian to the student under the relationship given', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const guardian = await createGuardian({
      networkId: network.id, name: 'Carla Dias', email: 'carla@familia.br',
    });

    const result = await academics.linkGuardian({
      networkId: network.id, studentId: student.id, guardianId: guardian.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(result.ok).toBe(true);
    expect(await academics.studentGuardians(network.id, student.id)).toEqual([
      {
        guardianId: guardian.id, name: 'Carla Dias',
        email: 'carla@familia.br', relationship: 'mãe', financiallyResponsible: true,
      },
    ]);
  });

  test('refuses the same link twice', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const guardian = await createGuardian({ networkId: network.id });
    await linkStudentGuardian({
      networkId: network.id, studentId: student.id, guardianId: guardian.id,
    });

    const result = await academics.linkGuardian({
      networkId: network.id, studentId: student.id, guardianId: guardian.id,
      relationship: 'pai', financiallyResponsible: false,
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'guardianId',
        code: 'duplicate_link',
        message: 'Este responsável já está vinculado a este aluno.',
      },
    ]);
    expect(await academics.studentGuardians(network.id, student.id)).toHaveLength(1);
  });

  test('refuses a student from another network', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const foreignStudent = await createStudent({ networkId: foreign.id });
    const guardian = await createGuardian({ networkId: ours.id });

    const result = await academics.linkGuardian({
      networkId: ours.id, studentId: foreignStudent.id, guardianId: guardian.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(errorsOf(result)[0]?.code).toBe('student_not_found');
  });

  test('refuses a guardian from another network', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const student = await createStudent({ networkId: ours.id });
    const foreignGuardian = await createGuardian({ networkId: foreign.id });

    const result = await academics.linkGuardian({
      networkId: ours.id, studentId: student.id, guardianId: foreignGuardian.id,
      relationship: 'mãe', financiallyResponsible: true,
    });

    expect(errorsOf(result)[0]?.code).toBe('guardian_not_found');
  });

  test('refuses a link with no relationship', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const guardian = await createGuardian({ networkId: network.id });

    const result = await academics.linkGuardian({
      networkId: network.id, studentId: student.id, guardianId: guardian.id,
      relationship: ' ', financiallyResponsible: false,
    });

    expect(errorsOf(result)[0]?.field).toBe('relationship');
  });
});

describe('assignTeacher', () => {
  test('allocates the subject to the class group under a teacher of that school', async () => {
    const scenario = await fullScenario();
    const [, emptyClassGroup] = scenario.classGroups;
    const subject = await createSubject({ networkId: scenario.network.id, name: 'Geografia' });

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: emptyClassGroup.id,
      subjectId: subject.id, teacherUserId: scenario.teacher.id,
    });

    const assignment = valueOfResult(result);
    expect(assignment).toEqual({
      id: assignment.id, networkId: scenario.network.id, classGroupId: emptyClassGroup.id,
      subjectId: subject.id, subjectName: 'Geografia',
      teacherUserId: scenario.teacher.id,
    });
    expect(await academics.listClassGroupSubjects(scenario.network.id, emptyClassGroup.id)).toEqual([assignment]);
  });

  test('refuses whoever holds no teacher role in the class group\'s school', async () => {
    const scenario = await fullScenario();
    const [, emptyClassGroup] = scenario.classGroups;
    const subject = await createSubject({ networkId: scenario.network.id });

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: emptyClassGroup.id,
      subjectId: subject.id, teacherUserId: scenario.registrar.id,
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'teacherUserId',
        code: 'without_teacher_role',
        message: 'Este usuário não tem papel de professor na unidade desta turma.',
      },
    ]);
    expect(await academics.listClassGroupSubjects(scenario.network.id, emptyClassGroup.id)).toHaveLength(0);
  });

  test('refuses a teacher from another school of the same network', async () => {
    const scenario = await fullScenario();
    const [, anotherSchool] = scenario.schools;
    const classGroupOfAnotherSchool = await createClassGroup({
      networkId: scenario.network.id, schoolId: anotherSchool.id, academicYearId: scenario.academicYear.id,
    });
    const subject = await createSubject({ networkId: scenario.network.id });

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: classGroupOfAnotherSchool.id,
      subjectId: subject.id, teacherUserId: scenario.teacher.id,
    });

    expect(errorsOf(result)[0]?.code).toBe('without_teacher_role');
  });

  test('refuses a teacher from another network', async () => {
    const { a, b } = await twoNetworks();
    const [, emptyClassGroup] = a.classGroups;
    const subject = await createSubject({ networkId: a.network.id });

    const result = await academics.assignTeacher({
      networkId: a.network.id, classGroupId: emptyClassGroup.id,
      subjectId: subject.id, teacherUserId: b.teacher.id,
    });

    expect(errorsOf(result)[0]?.code).toBe('without_teacher_role');
  });

  test('refuses the same subject twice in the same class group', async () => {
    const scenario = await fullScenario();
    const [classGroupWithSubjects] = scenario.classGroups;
    const [portuguese] = scenario.subjects;

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: classGroupWithSubjects.id,
      subjectId: portuguese.id, teacherUserId: scenario.teacher.id,
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'subjectId',
        code: 'subject_already_assigned',
        message: 'Esta disciplina já está alocada nesta turma.',
      },
    ]);
    expect(
      await academics.listClassGroupSubjects(scenario.network.id, classGroupWithSubjects.id),
    ).toHaveLength(3);
  });

  test('the same subject can be allocated to another class group', async () => {
    const scenario = await fullScenario();
    const [, emptyClassGroup] = scenario.classGroups;
    const [portuguese] = scenario.subjects;

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: emptyClassGroup.id,
      subjectId: portuguese.id, teacherUserId: scenario.teacher.id,
    });

    expect(result.ok).toBe(true);
  });

  test('refuses a class group from another network', async () => {
    const { a, b } = await twoNetworks();
    const subject = await createSubject({ networkId: a.network.id });

    const result = await academics.assignTeacher({
      networkId: a.network.id, classGroupId: b.classGroups[1].id,
      subjectId: subject.id, teacherUserId: a.teacher.id,
    });

    expect(errorsOf(result)[0]?.code).toBe('class_group_not_found');
  });

  test('refuses a subject from another network', async () => {
    const { a, b } = await twoNetworks();

    const result = await academics.assignTeacher({
      networkId: a.network.id, classGroupId: a.classGroups[1].id,
      subjectId: b.subjects[0].id, teacherUserId: a.teacher.id,
    });

    expect(errorsOf(result)[0]?.code).toBe('subject_not_found');
  });

  test('refuses ids outside the format before touching the database', async () => {
    const scenario = await fullScenario();

    const result = await academics.assignTeacher({
      networkId: scenario.network.id, classGroupId: 'nao-e-uuid',
      subjectId: 'tambem-nao', teacherUserId: scenario.teacher.id,
    });

    expect(errorsOf(result).map((error) => error.field)).toEqual(['classGroupId', 'subjectId']);
  });
});
