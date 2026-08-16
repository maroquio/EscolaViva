/*
 * A frequência do EscolaViva é POR DIA — nunca por aula. Este arquivo prova as duas consequências
 * disso: reenviar a chamada de uma data corrige a linha existente em vez de criar uma segunda, e a
 * constraint `attendance_unique_per_day` sustenta a mesma regra no banco.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { ASSESSMENT_LIMITS, assessment } from '../../src/assessment';
import {
  isDateWithinAcademicYear,
  isValidRollCallDate,
} from '../../src/assessment/domain/attendance';
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

const SCHOOL_DAY = `${DEFAULT_YEAR}-03-10`;
const ANOTHER_SCHOOL_DAY = `${DEFAULT_YEAR}-03-11`;

let scenario: Scenario;

beforeEach(async () => {
  await clearDatabase();
  scenario = await fullScenario();
});

async function countAttendances(networkId: string): Promise<number> {
  const rows = await testSql()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM attendance WHERE network_id = ${networkId}`;
  return rows[0]?.total ?? 0;
}

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

describe('frequencia (domínio)', () => {
  test('aceita data ISO que existe no calendário', () => {
    const accepted = ['2026-03-10', '2024-02-29', '2026-12-31'].map(isValidRollCallDate);

    expect(accepted).toEqual([true, true, true]);
  });

  test('recusa data que não existe, mesmo com o formato certo', () => {
    const rejected = ['2026-02-30', '2026-13-01', '2026-00-10'].map(isValidRollCallDate);

    expect(rejected).toEqual([false, false, false]);
  });

  test('recusa qualquer coisa fora do formato AAAA-MM-DD', () => {
    const rejected = ['10/03/2026', '2026-3-10', '', 'ontem'].map(isValidRollCallDate);

    expect(rejected).toEqual([false, false, false, false]);
  });

  test('trata o intervalo do ano letivo como fechado nas duas pontas', () => {
    const start = isDateWithinAcademicYear('2026-02-01', '2026-02-01', '2026-12-15');
    const end = isDateWithinAcademicYear('2026-12-15', '2026-02-01', '2026-12-15');
    const middle = isDateWithinAcademicYear('2026-07-04', '2026-02-01', '2026-12-15');

    expect([start, end, middle]).toEqual([true, true, true]);
  });

  test('deixa de fora a data anterior ao início e a posterior ao fim', () => {
    const before = isDateWithinAcademicYear('2026-01-31', '2026-02-01', '2026-12-15');
    const after = isDateWithinAcademicYear('2026-12-16', '2026-02-01', '2026-12-15');

    expect([before, after]).toEqual([false, false]);
  });
});

describe('recordRollCall', () => {
  test('grava a chamada do dia inteiro da turma', async () => {
    const rows = scenario.enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      present: true,
    }));

    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows,
    });

    expect(result).toEqual({ ok: true, valor: 5 });
    expect(await countAttendances(scenario.network.id)).toBe(5);
  });

  test('a segunda chamada do mesmo dia atualiza a linha em vez de criar outra', async () => {
    const rollCall = {
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
    };
    await assessment.recordRollCall({
      ...rollCall,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    const result = await assessment.recordRollCall({
      ...rollCall,
      rows: [
        { enrollmentId: scenario.enrollments[0].id, present: false, excuse: 'Consulta médica' },
      ],
    });

    expect(result).toEqual({ ok: true, valor: 1 });
    expect(await countAttendances(scenario.network.id)).toBe(1);
    const recorded = await assessment.rollCallForDate(
      scenario.network.id,
      scenario.classGroups[0].id,
      SCHOOL_DAY,
    );
    expect(recorded.get(scenario.enrollments[0].id)).toEqual({
      present: false,
      excuse: 'Consulta médica',
    });
  });

  test('a correção que devolve a presença ao aluno apaga a justificativa', async () => {
    const rollCall = {
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
    };
    await assessment.recordRollCall({
      ...rollCall,
      rows: [
        { enrollmentId: scenario.enrollments[0].id, present: false, excuse: 'Atestado' },
      ],
    });

    await assessment.recordRollCall({
      ...rollCall,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    const recorded = await assessment.rollCallForDate(
      scenario.network.id,
      scenario.classGroups[0].id,
      SCHOOL_DAY,
    );
    expect(recorded.get(scenario.enrollments[0].id)).toEqual({
      present: true,
      excuse: null,
    });
  });

  test('dias diferentes convivem como linhas separadas', async () => {
    const rollCall = {
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    };

    await assessment.recordRollCall({ ...rollCall, date: SCHOOL_DAY });
    await assessment.recordRollCall({ ...rollCall, date: ANOTHER_SCHOOL_DAY });

    expect(await countAttendances(scenario.network.id)).toBe(2);
  });

  test('recusa data anterior ao início do ano letivo', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: `${DEFAULT_YEAR}-01-15`,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'data', codigo: 'data_fora_do_ano_letivo' })],
    });
    expect(await countAttendances(scenario.network.id)).toBe(0);
  });

  test('recusa data posterior ao fim do ano letivo', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: `${DEFAULT_YEAR}-12-20`,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'data', codigo: 'data_fora_do_ano_letivo' })],
    });
  });

  test('a recusa por data diz qual é o intervalo do ano letivo', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: `${DEFAULT_YEAR}-01-15`,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    const message = result.ok ? '' : (result.erros[0]?.mensagem ?? '');
    expect(message).toContain(scenario.academicYear.startDate);
    expect(message).toContain(scenario.academicYear.endDate);
  });

  test('recusa data que não existe no calendário', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: `${DEFAULT_YEAR}-02-30`,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [
        expect.objectContaining({
          campo: 'data',
          mensagem: 'Informe uma data válida no formato AAAA-MM-DD.',
        }),
      ],
    });
  });

  test('recusa data em formato diferente de AAAA-MM-DD', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: '10/03/2026',
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'data' })],
    });
  });

  test('recusa turma que não é desta rede', async () => {
    const other = await fullScenario();

    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: other.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'turmaId', codigo: 'nao_encontrada' })],
    });
  });

  test('recusa a chamada com matrícula de outra turma', async () => {
    const student = await createStudent({ networkId: scenario.network.id });
    const outsider = await createEnrollment({
      networkId: scenario.network.id,
      studentId: student.id,
      classGroupId: scenario.classGroups[1].id,
      academicYearId: scenario.academicYear.id,
    });

    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [
        { enrollmentId: scenario.enrollments[0].id, present: true },
        { enrollmentId: outsider.id, present: false },
      ],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'linhas', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await countAttendances(scenario.network.id)).toBe(0);
  });

  test('recusa a chamada com matrícula de outra rede', async () => {
    const fromAnotherNetwork = await enrollmentOfAnotherNetwork();

    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [
        { enrollmentId: scenario.enrollments[0].id, present: true },
        { enrollmentId: fromAnotherNetwork, present: true },
      ],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'linhas', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await countAttendances(scenario.network.id)).toBe(0);
  });

  test('recusa a chamada com o mesmo aluno duas vezes', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [
        { enrollmentId: scenario.enrollments[0].id, present: true },
        { enrollmentId: scenario.enrollments[0].id, present: false },
      ],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'linhas', codigo: 'matricula_repetida' })],
    });
  });

  test('recusa chamada sem linha nenhuma', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'Nenhuma linha de chamada foi enviada.' })],
    });
  });

  test('aceita justificativa com exatamente o limite em caracteres', async () => {
    const excuse = 'x'.repeat(ASSESSMENT_LIMITS.excuseCharacters);

    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: false, excuse }],
    });

    expect(result).toEqual({ ok: true, valor: 1 });
    const recorded = await assessment.rollCallForDate(
      scenario.network.id,
      scenario.classGroups[0].id,
      SCHOOL_DAY,
    );
    expect(recorded.get(scenario.enrollments[0].id)?.excuse?.length).toBe(
      ASSESSMENT_LIMITS.excuseCharacters,
    );
  });

  test('recusa justificativa com um caractere além do limite', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [
        {
          enrollmentId: scenario.enrollments[0].id,
          present: false,
          excuse: 'x'.repeat(ASSESSMENT_LIMITS.excuseCharacters + 1),
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'A justificativa é longa demais.' })],
    });
    expect(await countAttendances(scenario.network.id)).toBe(0);
  });
});

describe('constraint frequencia_unica_por_dia', () => {
  test('o banco barra a segunda linha do mesmo aluno no mesmo dia', async () => {
    const sql = testSql();
    const insert = async (): Promise<void> => {
      await sql`
        INSERT INTO attendance (id, network_id, enrollment_id, attendance_date, present)
        VALUES (${crypto.randomUUID()}, ${scenario.network.id}, ${scenario.enrollments[0].id},
                ${SCHOOL_DAY}, true)`;
    };
    await insert();

    await expect(insert()).rejects.toThrow(/attendance_unique_per_day/);

    expect(await countAttendances(scenario.network.id)).toBe(1);
  });
});
