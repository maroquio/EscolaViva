/*
 * Matricular e transferir — as duas escritas do acadêmico que o banco protege sozinho.
 * O índice único parcial `active_enrollment_unique_per_year` é a regra; o caso de uso existe para
 * traduzi-la em erro de campo legível em vez de deixar a violação do PostgreSQL chegar à tela.
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

describe('matricular', () => {
  test('cria a matrícula ativa do aluno na turma do ano letivo', async () => {
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

  test('a matrícula recém-criada é recuperável por id', async () => {
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

  test('segunda matrícula ativa do mesmo aluno no mesmo ano é recusada com erro de campo', async () => {
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
        campo: 'alunoId',
        codigo: 'matricula_ativa_duplicada',
        mensagem: 'Este aluno já tem matrícula ativa neste ano letivo.',
      },
    ]);
    expect(await studentStatuses(alreadyEnrolled.id)).toEqual(['active']);
  });

  test('a recusa da matrícula duplicada é mensagem de negócio, não erro cru do banco', async () => {
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

  test('o mesmo aluno pode se matricular em outro ano letivo', async () => {
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

  test('aluno de outra rede é recusado', async () => {
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
        campo: 'alunoId',
        codigo: 'aluno_nao_encontrado',
        mensagem: 'Aluno não encontrado nesta rede.',
      },
    ]);
  });

  test('turma de outra rede é recusada', async () => {
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
        campo: 'turmaId',
        codigo: 'turma_nao_encontrada',
        mensagem: 'Turma não encontrada nesta rede.',
      },
    ]);
  });

  test('ano letivo de outra rede é recusado', async () => {
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

  test('turma de outro ano letivo da mesma rede é recusada', async () => {
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
        campo: 'turmaId',
        codigo: 'turma_de_outro_ano',
        mensagem: 'A turma não pertence ao ano letivo informado.',
      },
    ]);
  });

  test('data de matrícula fora do formato é recusada antes de escrever', async () => {
    const scenario = await fullScenario();
    const student = await createStudent({ networkId: scenario.network.id });

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: student.id,
      classGroupId: scenario.classGroups[1].id,
      academicYearId: scenario.academicYear.id,
      enrollmentDate: '10/02/2026',
    });

    expect(errorsOf(result)[0]?.campo).toBe('dataMatricula');
    expect(await studentStatuses(student.id)).toEqual([]);
  });

  test('ids fora do formato são recusados pela validação de entrada', async () => {
    const scenario = await fullScenario();

    const result = await academics.enroll({
      networkId: scenario.network.id,
      studentId: 'nao-e-uuid',
      classGroupId: 'tambem-nao',
      academicYearId: scenario.academicYear.id,
      enrollmentDate: ENROLLMENT_DATE,
    });

    expect(errorsOf(result).map((error) => error.campo)).toEqual(['alunoId', 'turmaId']);
  });
});

describe('transferir', () => {
  test('encerra a matrícula de origem e abre a nova na turma de destino, no mesmo ano', async () => {
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

  test('depois de transferir sobra exatamente uma matrícula ativa do aluno no ano', async () => {
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

  test('a turma de origem perde o aluno e a de destino ganha', async () => {
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

  test('transferir para a mesma turma é recusado e nada muda', async () => {
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
        campo: 'turmaDestinoId',
        codigo: 'mesma_turma',
        mensagem: 'A turma de destino é a mesma turma da matrícula atual.',
      },
    ]);
    expect(await studentStatuses(source.studentId)).toEqual(['active']);
  });

  test('transferir matrícula já transferida é recusado', async () => {
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
        campo: 'matriculaId',
        codigo: 'matricula_nao_ativa',
        mensagem: 'Apenas uma matrícula ativa pode ser transferida.',
      },
    ]);
    expect(await studentStatuses(source.studentId)).toEqual(['active', 'transferred']);
  });

  test('a matrícula pode ser transferida de novo a partir da turma nova', async () => {
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

  test('transferir para turma de outro ano letivo é recusado', async () => {
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
        campo: 'turmaDestinoId',
        codigo: 'turma_de_outro_ano',
        mensagem: 'A turma de destino pertence a outro ano letivo.',
      },
    ]);
    expect(await studentStatuses(source.studentId)).toEqual(['active']);
  });

  test('transferir para turma de outra rede é recusado', async () => {
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

  test('matrícula de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await twoNetworks();

    const result = await academics.transfer({
      networkId: a.network.id,
      enrollmentId: b.enrollments[0].id,
      targetClassGroupId: a.classGroups[1].id,
      date: TRANSFER_DATE,
    });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'matriculaId',
        codigo: 'matricula_nao_encontrada',
        mensagem: 'Matrícula não encontrada nesta rede.',
      },
    ]);
    expect(await studentStatuses(b.enrollments[0].studentId)).toEqual(['active']);
  });

  test('matrícula inexistente é recusada', async () => {
    const scenario = await fullScenario();

    const result = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: crypto.randomUUID(),
      targetClassGroupId: scenario.classGroups[1].id,
      date: TRANSFER_DATE,
    });

    expect(errorsOf(result)[0]?.codigo).toBe('matricula_nao_encontrada');
  });

  test('data de transferência fora do formato é recusada', async () => {
    const scenario = await fullScenario();
    const [source] = scenario.enrollments;

    const result = await academics.transfer({
      networkId: scenario.network.id,
      enrollmentId: source.id,
      targetClassGroupId: scenario.classGroups[1].id,
      date: '01-06-2026',
    });

    expect(errorsOf(result)[0]?.campo).toBe('data');
    expect(await studentStatuses(source.studentId)).toEqual(['active']);
  });
});
