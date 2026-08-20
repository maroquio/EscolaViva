/*
 * Closing a term is the synchronous operation that plants the pain of Stage 05: it checks every
 * active enrollment against every allocated subject before writing anything, and refuses by saying
 * exactly what is missing. Once closed, a term takes no more grades — item 15 of Section 9.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { assessment } from '../../src/assessment';
import {
  allTermsClosed,
  closingPendingItems,
  closingStates,
  pendingItemsMessage,
} from '../../src/assessment/domain/termClosing';
import { clearDatabase, testSql } from '../support/database';
import { fullScenario, createClassGroupSubject, type Scenario } from '../support/factories';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

let scenario: Scenario;

beforeEach(async () => {
  await clearDatabase();
  scenario = await fullScenario();
});

/** Posts `value` for every enrollment across every subject of the class group in that term. */
async function postEverything(term: number, value = 7): Promise<void> {
  for (const classGroupSubject of scenario.classGroupSubjects) {
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: classGroupSubject.id,
      term,
      postedBy: scenario.teacher.id,
      grades: scenario.enrollments.map((enrollment) => ({ enrollmentId: enrollment.id, value })),
    });
  }
}

function close(term: number, classGroupId = scenario.classGroups[0].id): ReturnType<
  typeof assessment.closeTerm
> {
  return assessment.closeTerm({
    networkId: scenario.network.id,
    classGroupId,
    term,
    closedBy: scenario.teacher.id,
  });
}

function messageOf(result: { ok: boolean } & Record<string, unknown>): string {
  const errors = result.ok ? [] : ((result.errors ?? []) as { message: string }[]);
  return errors[0]?.message ?? '';
}

describe('termClosing (domain)', () => {
  test('expands the grid of four terms, reading absence as an open term', () => {
    const saved = [{ term: 2, closedAt: '2026-05-10T12:00:00Z' }];

    const states = closingStates(saved);

    expect(states).toEqual([
      { term: 1, closed: false, closedAt: null },
      { term: 2, closed: true, closedAt: '2026-05-10T12:00:00Z' },
      { term: 3, closed: false, closedAt: null },
      { term: 4, closed: false, closedAt: null },
    ]);
  });

  test('a class group with no closing at all has all four terms open', () => {
    const states = closingStates([]);

    expect(states).toHaveLength(4);
    expect(states.every((state) => !state.closed)).toBe(true);
  });

  test('calls the year over only once all four terms are closed', () => {
    const threeClosed = closingStates([1, 2, 3].map((term) => ({
      term,
      closedAt: '2026-05-10T12:00:00Z',
    })));
    const fourClosed = closingStates([1, 2, 3, 4].map((term) => ({
      term,
      closedAt: '2026-05-10T12:00:00Z',
    })));

    expect(allTermsClosed(threeClosed)).toBe(false);
    expect(allTermsClosed(fourClosed)).toBe(true);
  });

  test('lists only the subjects still standing in the way of the closing', () => {
    const subjects = [
      { id: 'a', subjectName: 'Matemática' },
      { id: 'b', subjectName: 'História' },
    ];

    const pendingItems = closingPendingItems(subjects, 5, new Map([['a', 5], ['b', 2]]));

    expect(pendingItems).toEqual([{ subjectName: 'História', missing: 3 }]);
  });

  test('a subject with nothing posted is missing the entire class group', () => {
    const subjects = [{ id: 'a', subjectName: 'Matemática' }];

    const pendingItems = closingPendingItems(subjects, 5, new Map());

    expect(pendingItems).toEqual([{ subjectName: 'Matemática', missing: 5 }]);
  });

  test('the message for a single pending item stays in the singular', () => {
    const message = pendingItemsMessage([{ subjectName: 'História', missing: 1 }]);

    expect(message).toBe('Falta 1 nota para fechar o bimestre: História (1).');
  });

  test('the message adds the pending items up and names each subject', () => {
    const message = pendingItemsMessage([
      { subjectName: 'História', missing: 3 },
      { subjectName: 'Matemática', missing: 4 },
    ]);

    expect(message).toBe('Faltam 7 notas para fechar o bimestre: História (3), Matemática (4).');
  });
});

describe('closeTerm', () => {
  test('refuses while grades are missing, and says how many and in which subjects', async () => {
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: scenario.enrollments.map((enrollment) => ({ enrollmentId: enrollment.id, value: 7 })),
    });

    const result = await close(1);

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'term', code: 'incomplete_closing' })],
    });
    const message = messageOf(result);
    expect(message).toContain('Faltam 10 notas para fechar o bimestre');
    expect(message).toContain(`${scenario.subjects[1].name} (5)`);
    expect(message).toContain(`${scenario.subjects[2].name} (5)`);
  });

  test('the refusal over a single missing grade stays in the singular and points at the subject', async () => {
    await postEverything(1);
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[2].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: null }],
    });

    const result = await close(1);

    expect(messageOf(result)).toBe(
      `Falta 1 nota para fechar o bimestre: ${scenario.subjects[2].name} (1).`,
    );
  });

  test('closes once every active enrollment has a grade in every allocated subject', async () => {
    await postEverything(1);

    const result = await close(1);

    expect(result).toEqual({ ok: true, value: undefined });
    const states = await assessment.closingState(scenario.network.id, scenario.classGroups[0].id);
    expect(states[0]).toEqual({
      term: 1,
      closed: true,
      closedAt: expect.stringMatching(ISO_INSTANT),
    });
    expect(states.slice(1).every((state) => !state.closed)).toBe(true);
  });

  test('refuses to close the same term twice', async () => {
    await postEverything(1);
    await close(1);

    const result = await close(1);

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'term', code: 'already_closed' })],
    });
  });

  test('once closed, the term takes no further grade posting', async () => {
    await postEverything(1);
    await close(1);

    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 10 }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'term', code: 'term_closed' })],
    });
    const grades = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      1,
    );
    expect(grades.get(scenario.enrollments[0].id)).toBe(7);
  });

  test('the closed term does not lock the other three', async () => {
    await postEverything(1);
    await close(1);

    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 2,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 9 }],
    });

    expect(result).toEqual({ ok: true, value: 1 });
  });

  test('closing one class group does not close the term of the class group next door', async () => {
    await createClassGroupSubject({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[1].id,
      subjectId: scenario.subjects[0].id,
      teacherUserId: scenario.teacher.id,
    });
    await postEverything(1);
    await close(1);

    const states = await assessment.closingState(scenario.network.id, scenario.classGroups[1].id);

    expect(states.every((state) => !state.closed)).toBe(true);
  });

  test('the grade of a transferred student does not count as a pending item', async () => {
    const transferred = scenario.enrollments[4];
    for (const classGroupSubject of scenario.classGroupSubjects) {
      await assessment.postGrades({
        networkId: scenario.network.id,
        classGroupSubjectId: classGroupSubject.id,
        term: 1,
        postedBy: scenario.teacher.id,
        grades: scenario.enrollments
          .filter((enrollment) => enrollment.id !== transferred.id)
          .map((enrollment) => ({ enrollmentId: enrollment.id, value: 7 })),
      });
    }
    await testSql()`
      UPDATE enrollment SET status = 'transferred' WHERE id = ${transferred.id}`;

    const result = await close(1);

    expect(result).toEqual({ ok: true, value: undefined });
  });

  test('refuses a class group with no subject allocated', async () => {
    const result = await close(1, scenario.classGroups[1].id);

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'classGroupId', code: 'no_subject' })],
    });
  });

  test('refuses a class group with no active enrollment', async () => {
    await createClassGroupSubject({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[1].id,
      subjectId: scenario.subjects[0].id,
      teacherUserId: scenario.teacher.id,
    });

    const result = await close(1, scenario.classGroups[1].id);

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'classGroupId', code: 'no_active_enrollment' })],
    });
  });

  test('refuses a class group that does not belong to this network', async () => {
    const other = await fullScenario();

    const result = await close(1, other.classGroups[0].id);

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'classGroupId', code: 'not_found' })],
    });
  });

  test('refuses a term outside 1 to 4', async () => {
    const result = await close(5);

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'term' })],
    });
  });

  test('closes all four terms of the class group, one by one', async () => {
    for (const term of [1, 2, 3, 4]) {
      await postEverything(term);
      await close(term);
    }

    const states = await assessment.closingState(scenario.network.id, scenario.classGroups[0].id);

    expect(allTermsClosed(states)).toBe(true);
  });
});
