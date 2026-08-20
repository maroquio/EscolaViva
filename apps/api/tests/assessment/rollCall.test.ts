/*
 * Attendance in EscolaViva is PER DAY — never per class period. This file proves the two
 * consequences of that: resubmitting the roll call for a date corrects the existing row instead of
 * creating a second one, and the `attendance_unique_per_day` constraint holds the same rule inside
 * the database.
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

describe('attendance (domain)', () => {
  test('accepts an ISO date that exists on the calendar', () => {
    const accepted = ['2026-03-10', '2024-02-29', '2026-12-31'].map(isValidRollCallDate);

    expect(accepted).toEqual([true, true, true]);
  });

  test('refuses a date that does not exist, even in the right format', () => {
    const rejected = ['2026-02-30', '2026-13-01', '2026-00-10'].map(isValidRollCallDate);

    expect(rejected).toEqual([false, false, false]);
  });

  test('refuses anything outside the YYYY-MM-DD format', () => {
    const rejected = ['10/03/2026', '2026-3-10', '', 'ontem'].map(isValidRollCallDate);

    expect(rejected).toEqual([false, false, false, false]);
  });

  test('treats the academic year span as closed at both ends', () => {
    const start = isDateWithinAcademicYear('2026-02-01', '2026-02-01', '2026-12-15');
    const end = isDateWithinAcademicYear('2026-12-15', '2026-02-01', '2026-12-15');
    const middle = isDateWithinAcademicYear('2026-07-04', '2026-02-01', '2026-12-15');

    expect([start, end, middle]).toEqual([true, true, true]);
  });

  test('leaves out the date before the start and the one after the end', () => {
    const before = isDateWithinAcademicYear('2026-01-31', '2026-02-01', '2026-12-15');
    const after = isDateWithinAcademicYear('2026-12-16', '2026-02-01', '2026-12-15');

    expect([before, after]).toEqual([false, false]);
  });
});

describe('recordRollCall', () => {
  test('records the whole day\'s roll call for the class group', async () => {
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

    expect(result).toEqual({ ok: true, value: 5 });
    expect(await countAttendances(scenario.network.id)).toBe(5);
  });

  test('a second roll call for the same day updates the row instead of creating another', async () => {
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

    expect(result).toEqual({ ok: true, value: 1 });
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

  test('the correction that gives the student their presence back erases the excuse', async () => {
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

  test('different days live side by side as separate rows', async () => {
    const rollCall = {
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    };

    await assessment.recordRollCall({ ...rollCall, date: SCHOOL_DAY });
    await assessment.recordRollCall({ ...rollCall, date: ANOTHER_SCHOOL_DAY });

    expect(await countAttendances(scenario.network.id)).toBe(2);
  });

  test('refuses a date before the start of the academic year', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: `${DEFAULT_YEAR}-01-15`,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'date', code: 'date_outside_academic_year' })],
    });
    expect(await countAttendances(scenario.network.id)).toBe(0);
  });

  test('refuses a date after the end of the academic year', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: `${DEFAULT_YEAR}-12-20`,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'date', code: 'date_outside_academic_year' })],
    });
  });

  test('the refusal over a date says what the academic year span is', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: `${DEFAULT_YEAR}-01-15`,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    const message = result.ok ? '' : (result.errors[0]?.message ?? '');
    expect(message).toContain(scenario.academicYear.startDate);
    expect(message).toContain(scenario.academicYear.endDate);
  });

  test('refuses a date that does not exist on the calendar', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: `${DEFAULT_YEAR}-02-30`,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          field: 'date',
          message: 'Informe uma data válida no formato AAAA-MM-DD.',
        }),
      ],
    });
  });

  test('refuses a date in any format other than YYYY-MM-DD', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: '10/03/2026',
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'date' })],
    });
  });

  test('refuses a class group that does not belong to this network', async () => {
    const other = await fullScenario();

    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: other.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: true }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'classGroupId', code: 'not_found' })],
    });
  });

  test('refuses a roll call carrying an enrollment from another class group', async () => {
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
      errors: [expect.objectContaining({ field: 'rows', code: 'enrollment_outside_class_group' })],
    });
    expect(await countAttendances(scenario.network.id)).toBe(0);
  });

  test('refuses a roll call carrying an enrollment from another network', async () => {
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
      errors: [expect.objectContaining({ field: 'rows', code: 'enrollment_outside_class_group' })],
    });
    expect(await countAttendances(scenario.network.id)).toBe(0);
  });

  test('refuses a roll call carrying the same student twice', async () => {
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
      errors: [expect.objectContaining({ field: 'rows', code: 'duplicate_enrollment' })],
    });
  });

  test('refuses a roll call with no row at all', async () => {
    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ message: 'Nenhuma linha de chamada foi enviada.' })],
    });
  });

  test('accepts an excuse of exactly the character limit', async () => {
    const excuse = 'x'.repeat(ASSESSMENT_LIMITS.excuseCharacters);

    const result = await assessment.recordRollCall({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0].id,
      date: SCHOOL_DAY,
      rows: [{ enrollmentId: scenario.enrollments[0].id, present: false, excuse }],
    });

    expect(result).toEqual({ ok: true, value: 1 });
    const recorded = await assessment.rollCallForDate(
      scenario.network.id,
      scenario.classGroups[0].id,
      SCHOOL_DAY,
    );
    expect(recorded.get(scenario.enrollments[0].id)?.excuse?.length).toBe(
      ASSESSMENT_LIMITS.excuseCharacters,
    );
  });

  test('refuses an excuse one character past the limit', async () => {
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
      errors: [expect.objectContaining({ message: 'A justificativa é longa demais.' })],
    });
    expect(await countAttendances(scenario.network.id)).toBe(0);
  });
});

describe('the attendance_unique_per_day constraint', () => {
  test('the database blocks a second row for the same student on the same day', async () => {
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

/*
 * Closing a term freezes the grade and used to leave the attendance open, which is only half the
 * record: a student passes with an average of 6.0 AND 75% attendance, so a roll call taken after the
 * fact still moves the outcome. `postGrades` refuses on a closed term; `recordRollCall` never asked.
 *
 * Attendance is kept by date and nothing in the model maps a date to a term, so "the term of this
 * date is closed" is not a question this schema can answer. What it can answer is whether the year
 * is over — and that is the case that does the damage, because `finalStatus` only leaves
 * `in_progress` once every term is closed. Up to that point the roll call stays open, as it must.
 */
describe('a roll call after the year is closed', () => {
  beforeEach(clearDatabase);

  const closeEveryTerm = async (scenario: Awaited<ReturnType<typeof fullScenario>>): Promise<void> => {
    for (const term of [1, 2, 3, 4]) {
      await testSql()`
        INSERT INTO term_closing (id, network_id, class_group_id, term, closed_by)
        VALUES (${crypto.randomUUID()}, ${scenario.network.id}, ${scenario.classGroups[0]?.id},
                ${term}, ${scenario.teacher.id})`;
    }
  };

  test('is accepted while any term is still open, and refused once all four are closed', async () => {
    const scenario = await fullScenario();
    const record = {
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[0]?.id ?? '',
      date: '2026-03-10',
      rows: [{ enrollmentId: scenario.enrollments[0]?.id ?? '', present: false }],
    };

    const whileOpen = await assessment.recordRollCall(record);
    await closeEveryTerm(scenario);
    const afterClosing = await assessment.recordRollCall(record);

    expect(whileOpen.ok).toBe(true);
    expect(afterClosing.ok).toBe(false);
    expect(afterClosing.ok ? [] : afterClosing.errors).toEqual([
      {
        field: 'date',
        code: 'academic_year_already_closed',
        message:
          'Os quatro bimestres desta turma já foram fechados. A frequência não pode mais ser alterada.',
      },
    ]);
  });
});
