/*
 * Lançamento de notas contra o PostgreSQL de verdade. As duas validações que importam — bimestre
 * de 1 a 4 e nota de 0 a 10 — são exercidas nos dois lugares onde existem: na aplicação, que
 * devolve erro de campo para a tela do professor, e no banco, que barra qualquer caminho de
 * escrita que tente contorná-la (I8).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { assessment } from '../../src/assessment';
import { isValidGradeValue, isValidTerm } from '../../src/assessment/domain/grade';
import { clearDatabase, testSql } from '../support/database';
import {
  DEFAULT_YEAR,
  fullScenario,
  createStudent,
  createAcademicYear,
  createEnrollment,
  createNetwork,
  createClassGroup,
  createSchool,
  type Scenario,
} from '../support/factories';

let scenario: Scenario;

beforeEach(async () => {
  await clearDatabase();
  scenario = await fullScenario();
});

/** Quantas linhas de nota existem na rede — a contagem que separa "atualizou" de "duplicou". */
async function countGrades(networkId: string): Promise<number> {
  const rows = await testSql()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM grade WHERE network_id = ${networkId}`;
  return rows[0]?.total ?? 0;
}

/** Uma matrícula ativa em uma rede completamente separada, para o teste de isolamento. */
async function enrollmentOfAnotherNetwork(): Promise<string> {
  const network = await createNetwork({});
  const school = await createSchool({ networkId: network.id });
  const academicYear = await createAcademicYear({ networkId: network.id });
  const classGroup = await createClassGroup({
    networkId: network.id,
    schoolId: school.id,
    academicYearId: academicYear.id,
  });
  const student = await createStudent({ networkId: network.id });
  const enrollment = await createEnrollment({
    networkId: network.id,
    studentId: student.id,
    classGroupId: classGroup.id,
    academicYearId: academicYear.id,
  });
  return enrollment.id;
}

describe('nota (domínio)', () => {
  test('aceita os quatro bimestres e recusa qualquer outro número', () => {
    const accepted = [1, 2, 3, 4].map(isValidTerm);
    const rejected = [0, 5, -1, 2.5, Number.NaN].map(isValidTerm);

    expect(accepted).toEqual([true, true, true, true]);
    expect(rejected).toEqual([false, false, false, false, false]);
  });

  test('aceita nota de 0 a 10, inclusive nas pontas, e recusa fora do intervalo', () => {
    const accepted = [0, 5.5, 10].map(isValidGradeValue);
    const rejected = [-0.1, 10.1, Number.NaN, Number.POSITIVE_INFINITY].map(isValidGradeValue);

    expect(accepted).toEqual([true, true, true]);
    expect(rejected).toEqual([false, false, false, false]);
  });
});

describe('postGrades', () => {
  test('grava o lote inteiro da disciplina no bimestre', async () => {
    const grades = scenario.enrollments.map((enrollment, position) => ({
      enrollmentId: enrollment.id,
      value: position + 5,
    }));

    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades,
    });

    expect(result).toEqual({ ok: true, valor: 5 });
    const saved = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      1,
    );
    expect(saved.size).toBe(5);
    expect(saved.get(scenario.enrollments[0].id)).toBe(5);
    expect(saved.get(scenario.enrollments[4].id)).toBe(9);
  });

  test('relançar a mesma disciplina atualiza a nota em vez de duplicar a linha', async () => {
    const posting = {
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
    };
    await assessment.postGrades({
      ...posting,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 8 }],
    });

    const result = await assessment.postGrades({
      ...posting,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 9.5 }],
    });

    expect(result).toEqual({ ok: true, valor: 1 });
    expect(await countGrades(scenario.network.id)).toBe(1);
    const saved = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      1,
    );
    expect(saved.get(scenario.enrollments[0].id)).toBe(9.5);
  });

  test('valor nulo apaga a nota daquele aluno e preserva as demais', async () => {
    const posting = {
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 2,
      postedBy: scenario.teacher.id,
    };
    await assessment.postGrades({
      ...posting,
      grades: [
        { enrollmentId: scenario.enrollments[0].id, value: 8 },
        { enrollmentId: scenario.enrollments[1].id, value: 7 },
      ],
    });

    const result = await assessment.postGrades({
      ...posting,
      grades: [
        { enrollmentId: scenario.enrollments[0].id, value: null },
        { enrollmentId: scenario.enrollments[1].id, value: 7 },
      ],
    });

    expect(result).toEqual({ ok: true, valor: 1 });
    const saved = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      2,
    );
    expect(saved.has(scenario.enrollments[0].id)).toBe(false);
    expect(saved.get(scenario.enrollments[1].id)).toBe(7);
  });

  test('um lote só de valores nulos apaga tudo e não grava nota nenhuma', async () => {
    const posting = {
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
    };
    await assessment.postGrades({
      ...posting,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 6 }],
    });

    const result = await assessment.postGrades({
      ...posting,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: null }],
    });

    expect(result).toEqual({ ok: true, valor: 0 });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('recusa nota acima de 10', async () => {
    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 10.5 }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'A nota precisa ficar entre 0 e 10.' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('recusa nota negativa', async () => {
    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: -1 }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'A nota precisa ficar entre 0 e 10.' })],
    });
  });

  test('recusa bimestre fora de 1 a 4', async () => {
    const base = {
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 7 }],
    };

    const fifth = await assessment.postGrades({ ...base, term: 5 });
    const zero = await assessment.postGrades({ ...base, term: 0 });

    expect(fifth).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'bimestre' })],
    });
    expect(zero).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'bimestre' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('recusa lote vazio', async () => {
    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'Nenhuma nota foi enviada.' })],
    });
  });

  test('recusa disciplina de turma que não é desta rede', async () => {
    const other = await fullScenario();

    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: other.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 7 }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'turmaDisciplinaId', codigo: 'nao_encontrada' })],
    });
  });

  test('recusa o lote com matrícula de outra turma', async () => {
    const student = await createStudent({ networkId: scenario.network.id });
    const outsider = await createEnrollment({
      networkId: scenario.network.id,
      studentId: student.id,
      classGroupId: scenario.classGroups[1].id,
      academicYearId: scenario.academicYear.id,
    });

    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [
        { enrollmentId: scenario.enrollments[0].id, value: 7 },
        { enrollmentId: outsider.id, value: 8 },
      ],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'notas', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('recusa o lote com matrícula de outra rede', async () => {
    const fromAnotherNetwork = await enrollmentOfAnotherNetwork();

    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [
        { enrollmentId: scenario.enrollments[0].id, value: 7 },
        { enrollmentId: fromAnotherNetwork, value: 8 },
      ],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'notas', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('recusa o lote com o mesmo aluno duas vezes', async () => {
    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [
        { enrollmentId: scenario.enrollments[0].id, value: 7 },
        { enrollmentId: scenario.enrollments[0].id, value: 8 },
      ],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'notas', codigo: 'matricula_repetida' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('mantém as notas de bimestres diferentes lado a lado', async () => {
    const base = {
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 6 }],
    };

    await assessment.postGrades({ ...base, term: 1 });
    await assessment.postGrades({
      ...base,
      term: 2,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 9 }],
    });

    const first = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      1,
    );
    const second = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      2,
    );
    expect(first.get(scenario.enrollments[0].id)).toBe(6);
    expect(second.get(scenario.enrollments[0].id)).toBe(9);
    expect(await countGrades(scenario.network.id)).toBe(2);
  });
});

describe('constraints da tabela nota', () => {
  /** O INSERT direto contorna a aplicação de propósito: é o que prova que a regra vive no banco. */
  function insertRawGrade(term: number, value: number): Promise<void> {
    const sql = testSql();
    return (async () => {
      await sql`
        INSERT INTO grade (id, network_id, enrollment_id, class_group_subject_id,
                          term, value, posted_by)
        VALUES (${crypto.randomUUID()}, ${scenario.network.id}, ${scenario.enrollments[0].id},
                ${scenario.classGroupSubjects[0].id}, ${term}, ${value},
                ${scenario.teacher.id})`;
    })();
  }

  test('o banco barra nota acima de 10 mesmo por INSERT direto', async () => {
    await expect(insertRawGrade(1, 11)).rejects.toThrow(/value_valid/);

    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('o banco barra nota negativa mesmo por INSERT direto', async () => {
    await expect(insertRawGrade(1, -1)).rejects.toThrow(/value_valid/);

    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('o banco barra bimestre fora de 1 a 4 mesmo por INSERT direto', async () => {
    await expect(insertRawGrade(5, 7)).rejects.toThrow(/term_valid/);

    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('o banco barra a segunda nota do mesmo aluno na mesma disciplina e bimestre', async () => {
    await insertRawGrade(1, 7);

    await expect(insertRawGrade(1, 8)).rejects.toThrow(/grade_unique/);

    expect(await countGrades(scenario.network.id)).toBe(1);
  });

  test('a nota nasce presa ao ano letivo do cenário e à rede que a criou', async () => {
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 7 }],
    });

    const fromAnotherNetwork = await assessment.classGroupSubjectGrades(
      crypto.randomUUID(),
      scenario.classGroupSubjects[0].id,
      1,
    );

    expect(scenario.academicYear.year).toBe(DEFAULT_YEAR);
    expect(fromAnotherNetwork.size).toBe(0);
  });
});
