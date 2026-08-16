/*
 * The EscolaViva pedagogical rule, exercised where it lives: four pure functions, with no database
 * and no scenario. A simple arithmetic mean of the four terms, a pass at an average ≥ 6.0 AND
 * attendance ≥ 75 %, everything truncated at the second decimal.
 *
 * This file is what keeps the rule from turning into configuration by accident: the day someone
 * swaps truncation for rounding, or brings in per-assessment weights, this is where the suite
 * shouts.
 */

import { describe, expect, test } from 'bun:test';
import {
  subjectAverage,
  overallAverage,
  termAverages,
  attendanceRate,
  finalStatus,
} from '../../src/assessment/domain/reportCard';

describe('subjectAverage', () => {
  test('computes the simple arithmetic mean of the four terms', () => {
    const grades = [10, 0, 10, 0];

    const average = subjectAverage(grades);

    expect(average).toBe(5);
  });

  test('weights no term at all: the order of the grades does not move the average', () => {
    const ascending = [0, 0, 10, 10];
    const descending = [10, 10, 0, 0];

    const ascendingAverage = subjectAverage(ascending);
    const descendingAverage = subjectAverage(descending);

    expect(ascendingAverage).toBe(5);
    expect(descendingAverage).toBe(5);
  });

  test('truncates at the second decimal: an average of 5.995 is worth 5.99, not 6.00', () => {
    const grades = [5.99, 6, 5.99, 6];

    const average = subjectAverage(grades);

    expect(average).toBe(5.99);
  });

  test('preserves the exact grade when all four terms are equal', () => {
    const grades = [7.45, 7.45, 7.45, 7.45];

    const average = subjectAverage(grades);

    expect(average).toBe(7.45);
  });

  test('gives back null when some term has no grade', () => {
    const grades = [8, null, 7, 9];

    const average = subjectAverage(grades);

    expect(average).toBeNull();
  });

  test('gives back null when it does not get all four terms', () => {
    const incomplete = [8, 8, 8];

    const average = subjectAverage(incomplete);

    expect(average).toBeNull();
  });

  test('gives back null for an empty list of grades', () => {
    const none: (number | null)[] = [];

    const average = subjectAverage(none);

    expect(average).toBeNull();
  });
});

describe('overallAverage', () => {
  test('is the simple mean of the subject averages', () => {
    const averages = [10, 5, 0];

    const overall = overallAverage(averages);

    expect(overall).toBe(5);
  });

  test('truncates at the second decimal instead of rounding up', () => {
    const averages = [5.99, 6];

    const overall = overallAverage(averages);

    expect(overall).toBe(5.99);
  });

  test('gives back null while some subject still has no average', () => {
    const averages = [8, null, 9];

    const overall = overallAverage(averages);

    expect(overall).toBeNull();
  });

  test('gives back null when the student takes no subject at all', () => {
    const none: (number | null)[] = [];

    const overall = overallAverage(none);

    expect(overall).toBeNull();
  });
});

describe('termAverages', () => {
  const row = (subjectName: string, grades: (number | null)[]) => ({
    subjectName,
    grades,
    average: subjectAverage(grades),
  });

  test('is the simple mean of the grades of every subject in each term', () => {
    const rows = [row('Arte', [10, 8, 6, 4]), row('Ciências', [0, 2, 4, 6])];

    const averages = termAverages(rows);

    expect(averages).toEqual([5, 5, 5, 5]);
  });

  test('truncates at the second decimal, like the rest of the rule', () => {
    const rows = [row('Arte', [5.99, 10, 10, 10]), row('Ciências', [6, 10, 10, 10])];

    const averages = termAverages(rows);

    expect(averages[0]).toBe(5.99);
  });

  test('gives back null for the term where some subject is missing a grade', () => {
    const rows = [row('Arte', [7, null, 8, 9]), row('Ciências', [9, 9, 8, 7])];

    const averages = termAverages(rows);

    expect(averages).toEqual([8, null, 8, 8]);
  });

  test('gives back four null terms when the student takes no subject at all', () => {
    const none: ReturnType<typeof row>[] = [];

    const averages = termAverages(none);

    expect(averages).toEqual([null, null, null, null]);
  });
});

describe('attendanceRate', () => {
  test('gives back 0 with no day on record, instead of dividing by zero', () => {
    const withoutDay = attendanceRate(0, 0);

    expect(withoutDay).toBe(0);
    expect(Number.isNaN(withoutDay)).toBe(false);
  });

  test('turns days present into a percentage', () => {
    const percentage = attendanceRate(3, 4);

    expect(percentage).toBe(75);
  });

  test('truncates from the third decimal onwards', () => {
    const percentage = attendanceRate(2, 3);

    expect(percentage).toBe(66.66);
  });

  test('gives back 100 when the student was present on every day', () => {
    const percentage = attendanceRate(180, 180);

    expect(percentage).toBe(100);
  });

  test('gives back 0 when the student missed every day on record', () => {
    const percentage = attendanceRate(0, 200);

    expect(percentage).toBe(0);
  });
});

describe('finalStatus', () => {
  test('fails an average of 5.9 even on perfect attendance', () => {
    const status = finalStatus(5.9, 100, true);

    expect(status).toBe('failed');
  });

  test('passes an average of exactly 6.0', () => {
    const status = finalStatus(6, 100, true);

    expect(status).toBe('passed');
  });

  test('fails attendance of 74.9 % even on an average of 8.0', () => {
    const status = finalStatus(8, 74.9, true);

    expect(status).toBe('failed');
  });

  test('passes on the inclusive boundary: average 6.0 and attendance 75.0 %', () => {
    const status = finalStatus(6, 75, true);

    expect(status).toBe('passed');
  });

  test('fails an average of 5.995 because it is worth 5.99, not 6.00', () => {
    const status = finalStatus(5.995, 100, true);

    expect(status).toBe('failed');
  });

  test('leaves the student in progress while some term is open, however high the average', () => {
    const status = finalStatus(9.5, 100, false);

    expect(status).toBe('in_progress');
  });

  test('leaves the student in progress when a grade is missing, never failed', () => {
    const status = finalStatus(null, 100, true);

    expect(status).toBe('in_progress');
  });

  test('leaves the student in progress when a grade is missing, even with attendance below the minimum', () => {
    const status = finalStatus(null, 40, true);

    expect(status).toBe('in_progress');
  });
});

describe('the pedagogical rule, end to end', () => {
  test('a term with no grade leaves the subject without an average and the student in progress', () => {
    const subjectGrades = [8, null, 9, 10];

    const average = subjectAverage(subjectGrades);
    const overall = overallAverage([average]);
    const status = finalStatus(overall, attendanceRate(90, 100), true);

    expect(average).toBeNull();
    expect(overall).toBeNull();
    expect(status).toBe('in_progress');
  });

  test('passes the student who ends the year at 6.0 with 75 % attendance', () => {
    const subjectGrades = [6, 6, 6, 6];

    const overall = overallAverage([subjectAverage(subjectGrades)]);
    const attendance = attendanceRate(150, 200);
    const status = finalStatus(overall, attendance, true);

    expect(overall).toBe(6);
    expect(attendance).toBe(75);
    expect(status).toBe('passed');
  });

  test('fails on attendance the student who averaged 8.0 but missed too much', () => {
    const subjectGrades = [8, 8, 8, 8];

    const overall = overallAverage([subjectAverage(subjectGrades)]);
    const attendance = attendanceRate(149, 200);
    const status = finalStatus(overall, attendance, true);

    expect(overall).toBe(8);
    expect(attendance).toBe(74.5);
    expect(status).toBe('failed');
  });
});
