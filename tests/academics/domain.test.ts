/*
 * The academics domain is made of decisions that need no database: which shift exists, which
 * enrollment status exists, whether a period makes sense, and how old a student is on a given date.
 */

import { describe, expect, test } from 'bun:test';
import { ageOn } from '../../src/academics/domain/student';
import { isCoherentPeriod } from '../../src/academics/domain/academicYear';
import {
  ENROLLMENT_STATUSES,
  canTransfer,
  isValidEnrollmentStatus,
  type Enrollment,
  type EnrollmentStatus,
} from '../../src/academics/domain/enrollment';
import { SHIFTS, isValidShift } from '../../src/academics/domain/classGroup';

const enrollmentWith = (status: EnrollmentStatus): Enrollment => ({
  id: 'matricula-1',
  networkId: 'rede-1',
  studentId: 'aluno-1',
  studentName: 'Ana Souza',
  classGroupId: 'turma-1',
  classGroupName: '6º A',
  schoolId: 'unidade-1',
  academicYearId: 'ano-1',
  year: 2026,
  enrollmentDate: '2026-02-05',
  status,
});

describe('the class group shift', () => {
  test('recognizes the four shifts the schema accepts', () => {
    const known = [...SHIFTS];

    const valid = known.map(isValidShift);

    expect(valid).toEqual([true, true, true, true]);
  });

  test('does not recognize a made-up shift', () => {
    const madeUp = 'madrugada';

    const valid = isValidShift(madeUp);

    expect(valid).toBe(false);
  });

  test('the comparison is exact: a shift with a stray space does not get through', () => {
    const withSpace = 'morning ';

    const valid = isValidShift(withSpace);

    expect(valid).toBe(false);
  });
});

describe('the enrollment status', () => {
  test('recognizes the four statuses the schema accepts', () => {
    const known = [...ENROLLMENT_STATUSES];

    const valid = known.map(isValidEnrollmentStatus);

    expect(valid).toEqual([true, true, true, true]);
  });

  test('does not recognize a status outside the set', () => {
    const outsider = 'trancada';

    const valid = isValidEnrollmentStatus(outsider);

    expect(valid).toBe(false);
  });

  test('only an active enrollment can be transferred', () => {
    const statuses = [...ENROLLMENT_STATUSES].map(enrollmentWith);

    const transferable = statuses.map(canTransfer);

    expect(transferable).toEqual([true, false, false, false]);
  });
});

describe('the span of the academic year', () => {
  test('an end after the start is coherent', () => {
    const start = '2026-02-01';
    const end = '2026-12-15';

    const coherent = isCoherentPeriod(start, end);

    expect(coherent).toBe(true);
  });

  test('an end before the start is not coherent', () => {
    const start = '2026-12-15';
    const end = '2026-02-01';

    const coherent = isCoherentPeriod(start, end);

    expect(coherent).toBe(false);
  });

  test('a span of a single day, with start equal to end, is not coherent', () => {
    const sameDay = '2026-02-01';

    const coherent = isCoherentPeriod(sameDay, sameDay);

    expect(coherent).toBe(false);
  });

  test('the comparison crosses the turn of the year', () => {
    const start = '2026-08-01';
    const end = '2027-06-30';

    const coherent = isCoherentPeriod(start, end);

    expect(coherent).toBe(true);
  });
});

describe('the age of a student on a date', () => {
  test('counts whole years once the birthday has already passed that year', () => {
    const birth = '2014-05-10';

    const age = ageOn(birth, '2026-08-13');

    expect(age).toBe(12);
  });

  test('on the birthday itself the age is already the new one', () => {
    const birth = '2014-05-10';

    const age = ageOn(birth, '2026-05-10');

    expect(age).toBe(12);
  });

  test('on the eve of the birthday the age is still the old one', () => {
    const birth = '2014-05-10';

    const age = ageOn(birth, '2026-05-09');

    expect(age).toBe(11);
  });

  test('born in December, the birthday has not come around by January', () => {
    const birth = '2014-12-31';

    const age = ageOn(birth, '2026-01-01');

    expect(age).toBe(11);
  });

  test('born on 29 February, the age turns over on 1 March in a common year', () => {
    const birth = '2016-02-29';

    const age = ageOn(birth, '2026-03-01');

    expect(age).toBe(10);
  });

  test('a date of birth in the future gives back a negative age', () => {
    const birth = '2026-08-20';

    const age = ageOn(birth, '2026-08-13');

    expect(age).toBe(-1);
  });

  test('a newborn is zero years old on the very day', () => {
    const birth = '2026-08-13';

    const age = ageOn(birth, '2026-08-13');

    expect(age).toBe(0);
  });
});
