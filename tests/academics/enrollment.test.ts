/*
 * Enrolling and transferring — the two academics writes the database guards on its own.
 * The partial unique index `active_enrollment_unique_per_year` is the rule; the use case exists to
 * turn it into a readable field error instead of letting the PostgreSQL violation reach the screen.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import type { ApplicationError, Result } from '../../src/shared/result';
import { clearDatabase, testSql } from '../support/database';
import {
  DEFAULT_YEAR,
  fullScenario,
  createStudent,
  createAcademicYear,
  createClassGroup,
  twoNetworks,
} from '../support/factories';

const ENROLLMENT_DATE = `${DEFAULT_YEAR}-02-10`;
const TRANSFER_DATE = `${DEFAULT_YEAR}-06-01`;

function valueOfResult<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(result.erros)}`);
  }
  return result.valor;
}

function errorsOf(result: Result<unknown>): ApplicationError[] {
  if (result.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return result.erros;
}

async function studentStatuses(studentId: string): Promise<string[]> {
  const rows = await testSql()<{ status: string }[]>`
    SELECT status FROM enrollment WHERE student_id = ${studentId} ORDER BY status, created_at`;
  return rows.map((row) => row.status);
}

beforeEach(clearDatabase);

describe('enroll', () => {
  test('creates the student\'s active enrollment in the class group of that academic year', async () => {
    const scenario = await fullScenario();
    const student = await createStudent({ networkId: scenario.network.id, name: 'Ana Souza' });
    const [, emptyClassGroup] = scenario.classGroups;

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: student.id,
      classGroupId: emptyClassGroup.id,
      academicYearId: scenario.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    const enrollment = valueOfResult(result);
    expect(enrollment).toEqual({
      id: enrollment.id,
      networkId: scenario.network.id,
      studentId: student.id,
      studentName: 'Ana Souza',
      classGroupId: emptyClassGroup.id,
      classGroupName: emptyClassGroup.name,
      schoolId: emptyClassGroup.schoolId,
      academicYearId: scenario.academicYear.id,
      year: DEFAULT_YEAR,
      enrollmentDate: ENROLLMENT_DATE,
      status: 'active',
    });
    const inClassGroup = await academics.activeEnrollmentsOfClassGroup(scenario.network.id, emptyClassGroup.id);
    expect(inClassGroup.map((row) => row.id)).toEqual([enrollment.id]);
  });

  test('the freshly created enrollment can be fetched back by id', async () => {
    const scenario = await fullScenario();
    const student = await createStudent({ networkId: scenario.network.id });
    const [, emptyClassGroup] = scenario.classGroups;

    const created = valueOfResult(
      await academics.enroll({
        networkId: scenario.network.id,
        studentId: student.id,
        classGroupId: emptyClassGroup.id,
        academicYearId: scenario.academicYear.id,
        enrollmentDate: ENROLLMENT_DATE,
      }),
    );

    expect(await academics.enrollmentById(scenario.network.id, created.id)).toEqual(created);
  });

  test('a second active enrollment for the same student in the same year is refused with a field error', async () => {
    const scenario = await fullScenario();
    const [alreadyEnrolled] = scenario.students;
    const [, anotherClassGroup] = scenario.classGroups;

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: alreadyEnrolled.id,
      classGroupId: anotherClassGroup.id,
      academicYearId: scenario.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'studentId',
        codigo: 'matricula_ativa_duplicada',
        mensagem: 'Este aluno já tem matrícula ativa neste ano letivo.',
      },
    ]);
    expect(await studentStatuses(alreadyEnrolled.id)).toEqual(['active']);
  });

  test('the refusal of the duplicate enrollment is a business message, not a raw database error', async () => {
    const scenario = await fullScenario();
    const [alreadyEnrolled] = scenario.students;
    const [, anotherClassGroup] = scenario.classGroups;

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: alreadyEnrolled.id,
      classGroupId: anotherClassGroup.id,
      academicYearId: scenario.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    const message = errorsOf(result)[0]?.mensagem ?? '';
    expect(message).not.toMatch(/duplicate key|23505|constraint|unique index/i);
    expect(message).toMatch(/matrícula ativa/i);
  });

  test('the same student can enroll in another academic year', async () => {
    const scenario = await fullScenario();
    const [alreadyEnrolled] = scenario.students;
    const nextYear = await createAcademicYear({ networkId: scenario.network.id, year: DEFAULT_YEAR + 1 });
    const classGroupOfNextYear = await createClassGroup({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id, academicYearId: nextYear.id,
    });

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: alreadyEnrolled.id,
      classGroupId: classGroupOfNextYear.id,
      academicYearId: nextYear.id,
      enrollmentDate: `${DEFAULT_YEAR + 1}-02-05`,
    });

    expect(valueOfResult(result).year).toBe(DEFAULT_YEAR + 1);
    expect(await studentStatuses(alreadyEnrolled.id)).toEqual(['active', 'active']);
  });

  test('a student from another network is refused', async () => {
    const { a, b } = await twoNetworks();

    const result = await academics.enroll({
      networkId: a.network.id,
      studentId: b.students[0].id,
      classGroupId: a.classGroups[1].id,
      academicYearId: a.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'studentId',
        codigo: 'aluno_nao_encontrado',
        mensagem: 'Aluno não encontrado nesta rede.',
      },
    ]);
  });

  test('a class group from another network is refused', async () => {
    const { a, b } = await twoNetworks();
    const student = await createStudent({ networkId: a.network.id });

    const result = await academics.enroll({
      networkId: a.network.id,
      studentId: student.id,
      classGroupId: b.classGroups[1].id,
      academicYearId: a.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'classGroupId',
        codigo: 'turma_nao_encontrada',
        mensagem: 'Turma não encontrada nesta rede.',
      },
    ]);
  });

  test('an academic year from another network is refused', async () => {
    const { a, b } = await twoNetworks();
    const student = await createStudent({ networkId: a.network.id });

    const result = await academics.enroll({
      networkId: a.network.id,
      studentId: student.id,
      classGroupId: a.classGroups[1].id,
      academicYearId: b.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('ano_letivo_nao_encontrado');
  });

  test('a class group from another academic year of the same network is refused', async () => {
    const scenario = await fullScenario();
    const student = await createStudent({ networkId: scenario.network.id });
    const otherYear = await createAcademicYear({ networkId: scenario.network.id, year: DEFAULT_YEAR + 1 });
    const classGroupOfAnotherYear = await createClassGroup({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id, academicYearId: otherYear.id,
    });

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: student.id,
      classGroupId: classGroupOfAnotherYear.id,
      academicYearId: scenario.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'classGroupId',
        codigo: 'turma_de_outro_ano',
        mensagem: 'A turma não pertence ao ano letivo informado.',
      },
    ]);
  });

  test('an enrollment date outside the format is refused before anything is written', async () => {
    const scenario = await fullScenario();
    const student = await createStudent({ networkId: scenario.network.id });

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: student.id,
      classGroupId: scenario.classGroups[1].id,
      academicYearId: scenario.academicYear.id,
      enrollmentDate: '10/02/2026',
    });

    expect(errorsOf(result)[0]?.campo).toBe('enrollmentDate');
    expect(await studentStatuses(student.id)).toEqual([]);
  });

  test('ids outside the format are refused by the input validation', async () => {
    const scenario = await fullScenario();

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: 'nao-e-uuid',
      classGroupId: 'tambem-nao',
      academicYearId: scenario.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    expect(errorsOf(result).map((error) => error.campo)).toEqual(['studentId', 'classGroupId']);
  });
});

describe('transfer', () => {
  test('closes the enrollment of origin and opens the new one in the destination class group, in the same year', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;
    const [sourceClassGroup, targetClassGroup] = scenario.classGroups;

    const result = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: targetClassGroup.id,
      date: TRANSFER_DATE,
    });

    const created = valueOfResult(result);
    expect(created.classGroupId).toBe(targetClassGroup.id);
    expect(created.status).toBe('active');
    expect(created.studentId).toBe(source.studentId);
    expect(created.academicYearId).toBe(source.academicYearId);
    expect(created.enrollmentDate).toBe(TRANSFER_DATE);
    const old = await academics.enrollmentById(scenario.network.id, source.id);
    expect(old?.status).toBe('transferred');
    expect(old?.classGroupId).toBe(sourceClassGroup.id);
  });

  test('after a transfer exactly one active enrollment of the student is left in the year', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;

    await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: scenario.classGroups[1].id,
      date: TRANSFER_DATE,
    });

    const rows = await testSql()<{ status: string }[]>`
      SELECT status FROM enrollment
       WHERE student_id = ${source.studentId} AND academic_year_id = ${source.academicYearId}
       ORDER BY status`;
    expect(rows.map((row) => row.status)).toEqual(['active', 'transferred']);
  });

  test('the class group of origin loses the student and the destination gains one', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;
    const [sourceClassGroup, targetClassGroup] = scenario.classGroups;

    await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: targetClassGroup.id,
      date: TRANSFER_DATE,
    });

    const atSource = await academics.activeEnrollmentsOfClassGroup(scenario.network.id, sourceClassGroup.id);
    const atTarget = await academics.activeEnrollmentsOfClassGroup(scenario.network.id, targetClassGroup.id);
    expect(atSource.map((row) => row.studentId)).not.toContain(source.studentId);
    expect(atTarget.map((row) => row.studentId)).toEqual([source.studentId]);
  });

  test('transferring into the same class group is refused and nothing changes', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;

    const result = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: source.classGroupId,
      date: TRANSFER_DATE,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'targetClassGroupId',
        codigo: 'mesma_turma',
        mensagem: 'A turma de destino é a mesma turma da matrícula atual.',
      },
    ]);
    expect(await studentStatuses(source.studentId)).toEqual(['active']);
  });

  test('transferring an already transferred enrollment is refused', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;
    const [, targetClassGroup] = scenario.classGroups;
    await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: targetClassGroup.id,
      date: TRANSFER_DATE,
    });

    const secondTime = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: targetClassGroup.id,
      date: TRANSFER_DATE,
    });

    expect(errorsOf(secondTime)).toEqual([
      {
        campo: 'enrollmentId',
        codigo: 'matricula_nao_ativa',
        mensagem: 'Apenas uma matrícula ativa pode ser transferida.',
      },
    ]);
    expect(await studentStatuses(source.studentId)).toEqual(['active', 'transferred']);
  });

  test('the enrollment can be transferred again, this time out of the new class group', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;
    const [sourceClassGroup, middleClassGroup] = scenario.classGroups;
    const first = valueOfResult(
      await academics.transfer({
        networkId: scenario.network.id,
        enrollmentId: source.id,
        targetClassGroupId: middleClassGroup.id,
        date: TRANSFER_DATE,
      }),
    );

    const second = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: first.id,
      targetClassGroupId: sourceClassGroup.id,
      date: `${DEFAULT_YEAR}-08-01`,
    });

    expect(valueOfResult(second).classGroupId).toBe(sourceClassGroup.id);
    const active = await testSql()<{ total: number }[]>`
      SELECT count(*)::int AS total FROM enrollment
       WHERE student_id = ${source.studentId} AND status = 'active'`;
    expect(active[0]?.total).toBe(1);
  });

  test('transferring into a class group of another academic year is refused', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;
    const otherYear = await createAcademicYear({ networkId: scenario.network.id, year: DEFAULT_YEAR + 1 });
    const classGroupOfAnotherYear = await createClassGroup({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id, academicYearId: otherYear.id,
    });

    const result = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: classGroupOfAnotherYear.id,
      date: TRANSFER_DATE,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'targetClassGroupId',
        codigo: 'turma_de_outro_ano',
        mensagem: 'A turma de destino pertence a outro ano letivo.',
      },
    ]);
    expect(await studentStatuses(source.studentId)).toEqual(['active']);
  });

  test('transferring into a class group of another network is refused', async () => {
    const { a, b } = await twoNetworks();
    const [source] = a.enrollments;

    const result = await academics.transfer({
      networkId: a.network.id,
      enrollmentId: source.id,
      targetClassGroupId: b.classGroups[1].id,
      date: TRANSFER_DATE,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('turma_nao_encontrada');
    expect(await studentStatuses(source.studentId)).toEqual(['active']);
  });

  test('an enrollment from another network is not reachable by its id', async () => {
    const { a, b } = await twoNetworks();

    const result = await academics.transfer({
      networkId: a.network.id,
      enrollmentId: b.enrollments[0].id,
      targetClassGroupId: a.classGroups[1].id,
      date: TRANSFER_DATE,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'enrollmentId',
        codigo: 'matricula_nao_encontrada',
        mensagem: 'Matrícula não encontrada nesta rede.',
      },
    ]);
    expect(await studentStatuses(b.enrollments[0].studentId)).toEqual(['active']);
  });

  test('an enrollment that does not exist is refused', async () => {
    const scenario = await fullScenario();

    const result = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: crypto.randomUUID(),
      targetClassGroupId: scenario.classGroups[1].id,
      date: TRANSFER_DATE,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('matricula_nao_encontrada');
  });

  test('a transfer date outside the format is refused', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;

    const result = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: scenario.classGroups[1].id,
      date: '01-06-2026',
    });

    expect(errorsOf(result)[0]?.campo).toBe('date');
    expect(await studentStatuses(source.studentId)).toEqual(['active']);
  });
});
