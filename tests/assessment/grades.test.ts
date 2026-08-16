/*
 * Posting grades against the real PostgreSQL. The two validations that matter — a term from 1 to 4
 * and a grade from 0 to 10 — are exercised in both places where they exist: in the application,
 * which gives a field error back to the teacher's screen, and in the database, which blocks any
 * write path trying to go around it (I8).
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

/** How many grade rows exist in the network — the count that tells "updated" from "duplicated". */
async function countGrades(networkId: string): Promise<number> {
  const rows = await testSql()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM grade WHERE network_id = ${networkId}`;
  return rows[0]?.total ?? 0;
}

/** An active enrollment in a completely separate network, for the isolation test. */
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

describe('grade (domain)', () => {
  test('accepts the four terms and refuses any other number', () => {
    const accepted = [1, 2, 3, 4].map(isValidTerm);
    const rejected = [0, 5, -1, 2.5, Number.NaN].map(isValidTerm);

    expect(accepted).toEqual([true, true, true, true]);
    expect(rejected).toEqual([false, false, false, false, false]);
  });

  test('accepts a grade from 0 to 10, endpoints included, and refuses anything outside', () => {
    const accepted = [0, 5.5, 10].map(isValidGradeValue);
    const rejected = [-0.1, 10.1, Number.NaN, Number.POSITIVE_INFINITY].map(isValidGradeValue);

    expect(accepted).toEqual([true, true, true]);
    expect(rejected).toEqual([false, false, false, false]);
  });
});

describe('postGrades', () => {
  test('records the whole batch for the subject in that term', async () => {
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

  test('reposting the same subject updates the grade instead of duplicating the row', async () => {
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

  test('a null value erases that student\'s grade and leaves the rest standing', async () => {
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

  test('a batch of nothing but null values erases everything and records no grade at all', async () => {
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

  test('refuses a grade above 10', async () => {
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

  test('refuses a negative grade', async () => {
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

  test('refuses a term outside 1 to 4', async () => {
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
      erros: [expect.objectContaining({ campo: 'term' })],
    });
    expect(zero).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'term' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('refuses an empty batch', async () => {
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

  test('refuses a subject of a class group that does not belong to this network', async () => {
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
      erros: [expect.objectContaining({ campo: 'classGroupSubjectId', codigo: 'nao_encontrada' })],
    });
  });

  test('refuses a batch carrying an enrollment from another class group', async () => {
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
      erros: [expect.objectContaining({ campo: 'grades', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('refuses a batch carrying an enrollment from another network', async () => {
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
      erros: [expect.objectContaining({ campo: 'grades', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('refuses a batch carrying the same student twice', async () => {
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
      erros: [expect.objectContaining({ campo: 'grades', codigo: 'matricula_repetida' })],
    });
    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('keeps the grades of different terms side by side', async () => {
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

describe('the constraints on the grade table', () => {
  /** The direct INSERT goes around the application on purpose: it is what proves the rule lives in the database. */
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

  test('the database blocks a grade above 10 even through a direct INSERT', async () => {
    await expect(insertRawGrade(1, 11)).rejects.toThrow(/value_valid/);

    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('the database blocks a negative grade even through a direct INSERT', async () => {
    await expect(insertRawGrade(1, -1)).rejects.toThrow(/value_valid/);

    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('the database blocks a term outside 1 to 4 even through a direct INSERT', async () => {
    await expect(insertRawGrade(5, 7)).rejects.toThrow(/term_valid/);

    expect(await countGrades(scenario.network.id)).toBe(0);
  });

  test('the database blocks a second grade for the same student in the same subject and term', async () => {
    await insertRawGrade(1, 7);

    await expect(insertRawGrade(1, 8)).rejects.toThrow(/grade_unique/);

    expect(await countGrades(scenario.network.id)).toBe(1);
  });

  test('a grade is born tied to the scenario\'s academic year and to the network that created it', async () => {
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
