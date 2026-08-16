/*
 * As leituras do acadêmico. Duas coisas se provam aqui em cada consulta: que ela responde o que
 * a tela precisa e que ela nunca atravessa a fronteira da rede — o `rede_id` de todo filtro é o
 * que separa duas prefeituras que compartilham o mesmo banco.
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

describe('buscarAlunos', () => {
  test('acha o aluno por um trecho do nome', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana Carolina Souza' });
    await createStudent({ networkId: network.id, name: 'Bruno Teixeira' });

    const found = await academics.searchStudents(network.id, 'Carolina');

    expect(found.map((student) => student.name)).toEqual(['Ana Carolina Souza']);
  });

  test('a busca é insensível a maiúsculas e minúsculas', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana Carolina Souza' });

    const found = await academics.searchStudents(network.id, 'cArOLiNa');

    expect(found.map((student) => student.name)).toEqual(['Ana Carolina Souza']);
  });

  test('devolve os achados em ordem de nome', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Carlos Silva' });
    await createStudent({ networkId: network.id, name: 'Ana Silva' });
    await createStudent({ networkId: network.id, name: 'Bruno Silva' });

    const found = await academics.searchStudents(network.id, 'silva');

    expect(found.map((student) => student.name)).toEqual([
      'Ana Silva', 'Bruno Silva', 'Carlos Silva',
    ]);
  });

  test('nunca devolve aluno de outra rede', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    await createStudent({ networkId: ours.id, name: 'Ana Silva' });
    await createStudent({ networkId: foreign.id, name: 'Ana Silva' });

    const found = await academics.searchStudents(ours.id, 'Ana Silva');

    expect(found).toHaveLength(1);
    expect(found[0]?.networkId).toBe(ours.id);
  });

  test('trecho que ninguém tem devolve lista vazia', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana Silva' });

    const found = await academics.searchStudents(network.id, 'Wagner');

    expect(found).toEqual([]);
  });

  test('os curingas do LIKE são procurados como texto comum', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana 100% Silva' });
    await createStudent({ networkId: network.id, name: 'Bruno Teixeira' });

    const found = await academics.searchStudents(network.id, '100%');

    expect(found.map((student) => student.name)).toEqual(['Ana 100% Silva']);
  });

  test('a data de nascimento volta no formato canônico da aplicação', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Ana Silva', birthDate: '2014-05-10' });

    const found = await academics.searchStudents(network.id, 'Ana');

    expect(found[0]?.birthDate).toBe('2014-05-10');
  });
});

describe('alunoPorId', () => {
  test('devolve o aluno da rede', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id, name: 'Ana Silva' });

    const found = await academics.studentById(network.id, student.id);

    expect(found).toEqual({
      id: student.id, networkId: network.id, name: 'Ana Silva', birthDate: student.birthDate,
    });
  });

  test('aluno de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await twoNetworks();

    const found = await academics.studentById(a.network.id, b.students[0].id);

    expect(found).toBeNull();
  });
});

describe('turmas', () => {
  test('listarTurmas sem filtro traz as turmas da rede em ordem de série e nome', async () => {
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

  test('listarTurmas filtra por unidade', async () => {
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

  test('listarTurmas filtra por ano letivo', async () => {
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

  test('listarTurmas nunca traz turma de outra rede', async () => {
    const { a, b } = await twoNetworks();

    const classGroups = await academics.listClassGroups(a.network.id);

    expect(classGroups.every((classGroup) => classGroup.networkId === a.network.id)).toBe(true);
    expect(classGroups.map((classGroup) => classGroup.id)).not.toContain(b.classGroups[0].id);
  });

  test('turmaPorId não alcança turma de outra rede', async () => {
    const { a, b } = await twoNetworks();

    const found = await academics.classGroupById(a.network.id, b.classGroups[0].id);

    expect(found).toBeNull();
    expect(await academics.classGroupById(a.network.id, a.classGroups[0].id)).not.toBeNull();
  });
});

describe('disciplinas da turma e do professor', () => {
  test('listarDisciplinas traz as disciplinas da rede em ordem de nome', async () => {
    const network = await createNetwork();
    await createSubject({ networkId: network.id, name: 'Matemática' });
    await createSubject({ networkId: network.id, name: 'Artes' });
    await createSubject({ networkId: network.id, name: 'História' });

    const subjects = await academics.listSubjects(network.id);

    expect(subjects.map((subject) => subject.name)).toEqual([
      'Artes', 'História', 'Matemática',
    ]);
  });

  test('listarTurmaDisciplinas traz as alocações da turma com o nome da disciplina', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;

    const assignments = await academics.listClassGroupSubjects(scenario.network.id, classGroup.id);

    expect(assignments).toHaveLength(3);
    expect(assignments.every((assignment) => assignment.classGroupId === classGroup.id)).toBe(true);
    expect(assignments.every((assignment) => assignment.subjectName.length > 0)).toBe(true);
    expect(assignments.every((assignment) => assignment.teacherUserId === scenario.teacher.id)).toBe(true);
  });

  test('turmaDisciplinaPorId devolve a alocação e não alcança a de outra rede', async () => {
    const { a, b } = await twoNetworks();
    const target = a.classGroupSubjects[0];

    const found = await academics.classGroupSubjectById(a.network.id, target.id);

    expect(found?.id).toBe(target.id);
    expect(await academics.classGroupSubjectById(a.network.id, b.classGroupSubjects[0].id)).toBeNull();
  });

  test('turmaDisciplinasDoProfessor traz turma e série junto da disciplina', async () => {
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

  test('professor sem alocação nenhuma abre o painel vazio', async () => {
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

  test('turmasDoProfessor traz cada turma uma vez, mesmo com várias disciplinas nela', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;

    const classGroups = await academics.teacherClassGroups(scenario.network.id, scenario.teacher.id);

    expect(classGroups.map((row) => row.id)).toEqual([classGroup.id]);
  });

  test('turmasDoProfessor conta as duas turmas quando ele leciona nas duas', async () => {
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

  test('as alocações do professor de outra rede não vazam', async () => {
    const { a, b } = await twoNetworks();

    const ofTheForeignTeacher = await academics.teacherClassGroupSubjects(
      a.network.id, b.teacher.id,
    );

    expect(ofTheForeignTeacher).toEqual([]);
    expect(await academics.teacherClassGroups(a.network.id, b.teacher.id)).toEqual([]);
  });
});

describe('responsáveis', () => {
  test('listarResponsaveis traz os da rede em ordem de nome', async () => {
    const network = await createNetwork();
    await createGuardian({ networkId: network.id, name: 'Carla Dias' });
    await createGuardian({ networkId: network.id, name: 'Ana Souza' });

    const guardians = await academics.listGuardians(network.id);

    expect(guardians.map((guardian) => guardian.name)).toEqual(['Ana Souza', 'Carla Dias']);
  });

  test('listarResponsaveis não traz responsável de outra rede', async () => {
    const { a, b } = await twoNetworks();

    const guardians = await academics.listGuardians(a.network.id);

    expect(guardians.every((guardian) => guardian.networkId === a.network.id)).toBe(true);
    expect(guardians.map((guardian) => guardian.id)).not.toContain(b.guardians[0].id);
  });

  test('responsaveisDoAluno traz o vínculo com parentesco e marca de financeiro', async () => {
    const network = await createNetwork();
    const student = await createStudent({ networkId: network.id });
    const mother = await createGuardian({
      networkId: network.id, name: 'Ana Souza', email: 'ana@familia.br',
    });
    const father = await createGuardian({
      networkId: network.id, name: 'Bruno Souza', email: 'bruno@familia.br',
    });
    await linkStudentGuardian({
      networkId: network.id, studentId: student.id, guardianId: mother.id,
      relationship: 'mãe', financiallyResponsible: true,
    });
    await linkStudentGuardian({
      networkId: network.id, studentId: student.id, guardianId: father.id,
      relationship: 'pai', financiallyResponsible: false,
    });

    const guardianLinks = await academics.studentGuardians(network.id, student.id);

    expect(guardianLinks).toEqual([
      {
        guardianId: mother.id, name: 'Ana Souza', email: 'ana@familia.br',
        relationship: 'mãe', financiallyResponsible: true,
      },
      {
        guardianId: father.id, name: 'Bruno Souza', email: 'bruno@familia.br',
        relationship: 'pai', financiallyResponsible: false,
      },
    ]);
  });

  test('responsaveisDaUnidade traz quem responde por aluno com matrícula ativa ali', async () => {
    const scenario = await fullScenario();
    const [schoolWithStudents, emptySchool] = scenario.schools;

    const schoolGuardiansList = await academics.schoolGuardians(scenario.network.id, schoolWithStudents.id);

    expect(schoolGuardiansList).toHaveLength(5);
    expect(await academics.schoolGuardians(scenario.network.id, emptySchool.id)).toEqual([]);
  });

  test('responsável de aluno sem matrícula ativa não recebe comunicado da unidade', async () => {
    const scenario = await fullScenario();
    const [school] = scenario.schools;
    const withoutEnrollment = await createGuardian({
      networkId: scenario.network.id, name: 'Zulmira Sem Turma',
    });
    const departedStudent = await createStudent({ networkId: scenario.network.id });
    await linkStudentGuardian({
      networkId: scenario.network.id, studentId: departedStudent.id, guardianId: withoutEnrollment.id,
    });
    await createEnrollment({
      networkId: scenario.network.id, studentId: departedStudent.id, classGroupId: scenario.classGroups[0].id,
      academicYearId: scenario.academicYear.id, status: 'transferred',
    });

    const schoolGuardiansList = await academics.schoolGuardians(scenario.network.id, school.id);

    expect(schoolGuardiansList.map((guardian) => guardian.id)).not.toContain(withoutEnrollment.id);
  });
});

describe('matrículas', () => {
  test('matriculaPorId traz nome do aluno, nome da turma e ano', async () => {
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

  test('matrícula de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await twoNetworks();

    const found = await academics.enrollmentById(a.network.id, b.enrollments[0].id);

    expect(found).toBeNull();
  });

  test('matriculasAtivasDaTurma lista os ativos em ordem de nome do aluno', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;

    const active = await academics.activeEnrollmentsOfClassGroup(scenario.network.id, classGroup.id);

    const names = active.map((enrollment) => enrollment.studentName);
    expect(active).toHaveLength(5);
    expect(names).toEqual([...names].sort());
  });

  test('matriculasAtivasDaTurma ignora quem saiu da turma', async () => {
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

  test('matriculasDoResponsavel devolve só os alunos vinculados àquele responsável', async () => {
    const scenario = await fullScenario();
    const [first, second] = scenario.guardians;
    const [studentOfTheFirst] = scenario.students;

    const ofTheFirst = await academics.guardianEnrollments(scenario.network.id, first.id);

    expect(ofTheFirst.map((enrollment) => enrollment.studentId)).toEqual([studentOfTheFirst.id]);
    const ofTheSecond = await academics.guardianEnrollments(scenario.network.id, second.id);
    expect(ofTheSecond.map((enrollment) => enrollment.studentId)).not.toContain(studentOfTheFirst.id);
  });

  test('matriculasDoResponsavel traz os dois filhos de quem responde por dois', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    const sibling = await createStudent({ networkId: scenario.network.id, name: 'Irmão Caçula' });
    await linkStudentGuardian({
      networkId: scenario.network.id, studentId: sibling.id, guardianId: guardian.id,
    });
    await createEnrollment({
      networkId: scenario.network.id, studentId: sibling.id, classGroupId: scenario.classGroups[1].id,
      academicYearId: scenario.academicYear.id,
    });

    const guardianRows = await academics.guardianEnrollments(scenario.network.id, guardian.id);

    expect(guardianRows).toHaveLength(2);
    expect(guardianRows.map((enrollment) => enrollment.studentName)).toContain('Irmão Caçula');
  });

  test('matriculasDoResponsavel mostra o histórico, com o ano mais recente primeiro', async () => {
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

  test('matriculasDoResponsavel de outra rede não devolve nada', async () => {
    const { a, b } = await twoNetworks();

    const foreign = await academics.guardianEnrollments(a.network.id, b.guardians[0].id);

    expect(foreign).toEqual([]);
  });
});
