/*
 * The `assessment` reads against the real database, with the report card at the centre: average,
 * attendance percentage and status are computed on every read (I5) and have to agree, end to end,
 * with what the pure functions in `domain/reportCard.ts` decide.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { assessment } from '../../src/assessment';
import { clearDatabase } from '../support/database';
import {
  DEFAULT_YEAR,
  fullScenario,
  createStudent,
  createAcademicYear,
  createSubject,
  createEnrollment,
  createNetwork,
  createClassGroup,
  createClassGroupSubject,
  createSchool,
  createUser,
} from '../support/factories';

const TERMS = [1, 2, 3, 4];

type MinimalScenario = {
  networkId: string;
  classGroupId: string;
  classGroupName: string;
  classGroupSubjectId: string;
  subjectName: string;
  enrollmentId: string;
  studentName: string;
  teacherId: string;
};

beforeEach(clearDatabase);

/** A class group with one student and one subject: the smallest scenario a whole report card fits in. */
async function minimalScenario(): Promise<MinimalScenario> {
  const network = await createNetwork({});
  const school = await createSchool({ networkId: network.id });
  const academicYear = await createAcademicYear({ networkId: network.id });
  const classGroup = await createClassGroup({
    networkId: network.id,
    schoolId: school.id,
    academicYearId: academicYear.id,
  });
  const subject = await createSubject({ networkId: network.id });
  const teacher = await createUser({
    networkId: network.id,
    roles: [{ schoolId: school.id, role: 'teacher' }],
  });
  const classGroupSubject = await createClassGroupSubject({
    networkId: network.id,
    classGroupId: classGroup.id,
    subjectId: subject.id,
    teacherUserId: teacher.id,
  });
  const student = await createStudent({ networkId: network.id });
  const enrollment = await createEnrollment({
    networkId: network.id,
    studentId: student.id,
    classGroupId: classGroup.id,
    academicYearId: academicYear.id,
  });
  return {
    networkId: network.id,
    classGroupId: classGroup.id,
    classGroupName: classGroup.name,
    classGroupSubjectId: classGroupSubject.id,
    subjectName: subject.name,
    enrollmentId: enrollment.id,
    studentName: student.name,
    teacherId: teacher.id,
  };
}

/** Posts the same grade across the given terms and closes each one of them. */
async function attendTerms(
  minimal: MinimalScenario,
  value: number,
  terms: number[] = TERMS,
): Promise<void> {
  for (const term of terms) {
    await assessment.postGrades({
      networkId: minimal.networkId,
      classGroupSubjectId: minimal.classGroupSubjectId,
      term,
      postedBy: minimal.teacherId,
      grades: [{ enrollmentId: minimal.enrollmentId, value }],
    });
    await assessment.closeTerm({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      term,
      closedBy: minimal.teacherId,
    });
  }
}

/** Records `presentDays` days of attendance followed by `absences` days of absence, all in March. */
/*
 * Attendance is taken during the year and the terms are closed after it, which is the order these
 * cases now follow. They used to close first and take the roll call afterwards, and that stopped
 * working when `recordRollCall` began refusing a class group whose four terms are all closed: a
 * report card the guardian has already read may not change because somebody took a roll call in
 * December for a day in March.
 */
async function recordDays(
  minimal: MinimalScenario,
  presentDays: number,
  absences: number,
): Promise<void> {
  const total = presentDays + absences;
  for (let day = 1; day <= total; day += 1) {
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-${String(day).padStart(2, '0')}`,
      rows: [{ enrollmentId: minimal.enrollmentId, present: day <= presentDays }],
    });
  }
}

describe('classGroupSubjectGrades', () => {
  test('gives back the term\'s grades indexed by enrollment', async () => {
    const scenario = await fullScenario();
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [
        { enrollmentId: scenario.enrollments[0].id, value: 6.5 },
        { enrollmentId: scenario.enrollments[1].id, value: 9 },
      ],
    });

    const grades = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      1,
    );

    expect(grades.size).toBe(2);
    expect(grades.get(scenario.enrollments[0].id)).toBe(6.5);
    expect(grades.get(scenario.enrollments[1].id)).toBe(9);
  });

  test('does not mix in a grade from another term', async () => {
    const scenario = await fullScenario();
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 6 }],
    });

    const second = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      2,
    );

    expect(second.size).toBe(0);
  });

  test('does not give back a grade from another network', async () => {
    const scenario = await fullScenario();
    const other = await fullScenario();
    await assessment.postGrades({
      networkId: other.network.id,
      classGroupSubjectId: other.classGroupSubjects[0].id,
      term: 1,
      postedBy: other.teacher.id,
      grades: [{ enrollmentId: other.enrollments[0].id, value: 8 }],
    });

    const seenFromTheOtherNetwork = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      other.classGroupSubjects[0].id,
      1,
    );

    expect(seenFromTheOtherNetwork.size).toBe(0);
  });
});

describe('rollCallForDate', () => {
  test('gives back what has already been recorded for that day', async () => {
    const minimal = await minimalScenario();
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-02`,
      rows: [
        { enrollmentId: minimal.enrollmentId, present: false, excuse: 'Viagem em família' },
      ],
    });

    const rollCall = await assessment.rollCallForDate(
      minimal.networkId,
      minimal.classGroupId,
      `${DEFAULT_YEAR}-03-02`,
    );

    expect(rollCall.get(minimal.enrollmentId)).toEqual({
      present: false,
      excuse: 'Viagem em família',
    });
  });

  test('does not mix in the record from another day', async () => {
    const minimal = await minimalScenario();
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-02`,
      rows: [{ enrollmentId: minimal.enrollmentId, present: true }],
    });

    const anotherDay = await assessment.rollCallForDate(
      minimal.networkId,
      minimal.classGroupId,
      `${DEFAULT_YEAR}-03-03`,
    );

    expect(anotherDay.size).toBe(0);
  });

  test('gives back an empty map for a class group with no active enrollment', async () => {
    const scenario = await fullScenario();

    const rollCall = await assessment.rollCallForDate(
      scenario.network.id,
      scenario.classGroups[1].id,
      `${DEFAULT_YEAR}-03-02`,
    );

    expect(rollCall.size).toBe(0);
  });
});

describe('closingState', () => {
  test('gives back four open terms for a class group that has closed nothing yet', async () => {
    const minimal = await minimalScenario();

    const states = await assessment.closingState(minimal.networkId, minimal.classGroupId);

    expect(states).toEqual([
      { term: 1, closed: false, closedAt: null },
      { term: 2, closed: false, closedAt: null },
      { term: 3, closed: false, closedAt: null },
      { term: 4, closed: false, closedAt: null },
    ]);
  });

  test('does not see the closing of a class group in another network', async () => {
    const minimal = await minimalScenario();
    await attendTerms(minimal, 7, [1]);

    const seenFromAnotherNetwork = await assessment.closingState(
      crypto.randomUUID(),
      minimal.classGroupId,
    );

    expect(seenFromAnotherNetwork.every((state) => !state.closed)).toBe(true);
  });
});

describe('enrollmentAttendance', () => {
  test('gives back the history from the most recent day to the oldest', async () => {
    const minimal = await minimalScenario();
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-01`,
      rows: [{ enrollmentId: minimal.enrollmentId, present: true }],
    });
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-05`,
      rows: [{ enrollmentId: minimal.enrollmentId, present: false, excuse: 'Gripe' }],
    });

    const history = await assessment.enrollmentAttendance(minimal.networkId, minimal.enrollmentId);

    expect(history).toEqual([
      { date: `${DEFAULT_YEAR}-03-05`, present: false, excuse: 'Gripe' },
      { date: `${DEFAULT_YEAR}-03-01`, present: true, excuse: null },
    ]);
  });

  test('gives back an empty list for an enrollment in another network', async () => {
    const minimal = await minimalScenario();
    await recordDays(minimal, 2, 0);

    const history = await assessment.enrollmentAttendance(
      crypto.randomUUID(),
      minimal.enrollmentId,
    );

    expect(history).toEqual([]);
  });
});

describe('reportCard', () => {
  test('builds one row per subject of the class group, ordered by name', async () => {
    const scenario = await fullScenario();
    for (const classGroupSubject of scenario.classGroupSubjects) {
      await assessment.postGrades({
        networkId: scenario.network.id,
        classGroupSubjectId: classGroupSubject.id,
        term: 1,
        postedBy: scenario.teacher.id,
        grades: [{ enrollmentId: scenario.enrollments[0].id, value: 7 }],
      });
    }

    const reportCard = await assessment.reportCard(scenario.network.id, scenario.enrollments[0].id);

    const names = reportCard?.rows.map((row) => row.subjectName) ?? [];
    expect(names).toHaveLength(3);
    expect(names).toEqual([...names].sort());
    expect([...names].sort()).toEqual(scenario.subjects.map((d) => d.name).sort());
    expect(reportCard?.rows[0]).toEqual({
      subjectName: names[0] ?? '',
      grades: [7, null, null, null],
      average: null,
    });
  });

  test('leaves the student in progress while a grade is missing, never failed', async () => {
    const scenario = await fullScenario();

    const reportCard = await assessment.reportCard(scenario.network.id, scenario.enrollments[0].id);

    expect(reportCard?.overallAverage).toBeNull();
    expect(reportCard?.status).toBe('in_progress');
    expect(reportCard?.rows.every((row) => row.average === null)).toBe(true);
  });

  test('passes the student averaging 6.0 with 75 % attendance once the year closes', async () => {
    const minimal = await minimalScenario();
    await recordDays(minimal, 3, 1);

    await attendTerms(minimal, 6);

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);
    expect(reportCard).toEqual({
      enrollmentId: minimal.enrollmentId,
      studentName: minimal.studentName,
      classGroupName: minimal.classGroupName,
      year: DEFAULT_YEAR,
      rows: [{ subjectName: minimal.subjectName, grades: [6, 6, 6, 6], average: 6 }],
      termAverages: [6, 6, 6, 6],
      overallAverage: 6,
      attendanceRate: 75,
      totalDays: 4,
      presentDays: 3,
      status: 'passed',
    });
  });

  test('fails on attendance the student averaging 8.0 who missed too much', async () => {
    const minimal = await minimalScenario();
    await recordDays(minimal, 2, 2);

    await attendTerms(minimal, 8);

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);
    expect(reportCard?.overallAverage).toBe(8);
    expect(reportCard?.attendanceRate).toBe(50);
    expect(reportCard?.status).toBe('failed');
  });

  test('fails on grades the student averaging 5.9 with perfect attendance', async () => {
    const minimal = await minimalScenario();
    await recordDays(minimal, 4, 0);

    await attendTerms(minimal, 5.9);

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);
    expect(reportCard?.overallAverage).toBe(5.9);
    expect(reportCard?.attendanceRate).toBe(100);
    expect(reportCard?.status).toBe('failed');
  });

  test('keeps the student in progress while the fourth term is unclosed, however high the average', async () => {
    const minimal = await minimalScenario();
    await attendTerms(minimal, 9, [1, 2, 3]);
    await assessment.postGrades({
      networkId: minimal.networkId,
      classGroupSubjectId: minimal.classGroupSubjectId,
      term: 4,
      postedBy: minimal.teacherId,
      grades: [{ enrollmentId: minimal.enrollmentId, value: 9 }],
    });

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);

    expect(reportCard?.overallAverage).toBe(9);
    expect(reportCard?.status).toBe('in_progress');
  });

  test('gives back zero attendance, with no days at all, for a class group that has had no roll call yet', async () => {
    const minimal = await minimalScenario();

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);

    expect(reportCard?.totalDays).toBe(0);
    expect(reportCard?.presentDays).toBe(0);
    expect(reportCard?.attendanceRate).toBe(0);
  });

  test('gives back null for an enrollment in another network', async () => {
    const minimal = await minimalScenario();
    const other = await minimalScenario();

    const reportCard = await assessment.reportCard(minimal.networkId, other.enrollmentId);

    expect(reportCard).toBeNull();
  });

  test('gives back null for an enrollment that does not exist', async () => {
    const minimal = await minimalScenario();

    const reportCard = await assessment.reportCard(minimal.networkId, crypto.randomUUID());

    expect(reportCard).toBeNull();
  });
});
