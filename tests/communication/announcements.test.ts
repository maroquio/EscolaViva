/*
 * Announcements, the board and the read rate, against the real database.
 *
 * Two things carry most of this file's value: the empty list of recipients, which means "the whole
 * school" and must reach nobody outside it; and `read_at`, which is the instrumentation behind the
 * pain of Stage 04 — it has to be idempotent, or the rate being measured turns into noise.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { communication, type Announcement } from '../../src/communication';
import { clearDatabase, testSql } from '../support/database';
import {
  fullScenario,
  createStudent,
  createAnnouncement,
  createEnrollment,
  createGuardian,
  createClassGroup,
  linkStudentGuardian,
  type Scenario,
} from '../support/factories';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OLD_READ = new Date('2026-01-05T08:30:00.000Z');

let scenario: Scenario;

beforeEach(async () => {
  await clearDatabase();
  scenario = await fullScenario();
});

/** Publishes and narrows the `Result`: when this fails, the error in the arrangement shows in full. */
async function publish(input: {
  schoolId?: string;
  title?: string;
  body?: string;
  recipients?: { guardianId: string }[];
}): Promise<Announcement> {
  const result = await communication.publishAnnouncement({
    networkId: scenario.network.id,
    schoolId: input.schoolId ?? scenario.schools[0].id,
    title: input.title ?? 'Reunião de pais',
    body: input.body ?? 'A reunião começa às 19h no auditório.',
    authorUserId: scenario.registrar.id,
    recipients: input.recipients ?? [],
  });
  if (!result.ok) {
    throw new Error(`publicação recusada no arranjo: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

async function recipientsOf(announcementId: string): Promise<string[]> {
  const rows = await testSql()<{ guardian_id: string }[]>`
    SELECT guardian_id FROM announcement_recipient
     WHERE announcement_id = ${announcementId}`;
  return rows.map((row) => row.guardian_id).sort();
}

async function readsOf(announcementId: string, guardianId: string): Promise<(Date | null)[]> {
  const rows = await testSql()<{ read_at: Date | null }[]>`
    SELECT read_at FROM announcement_recipient
     WHERE announcement_id = ${announcementId} AND guardian_id = ${guardianId}`;
  return rows.map((row) => row.read_at);
}

/** A guardian with a student actively enrolled at the given school. */
async function guardianAtSchool(schoolId: string): Promise<string> {
  const classGroup = await createClassGroup({
    networkId: scenario.network.id,
    schoolId,
    academicYearId: scenario.academicYear.id,
  });
  const student = await createStudent({ networkId: scenario.network.id });
  const guardian = await createGuardian({ networkId: scenario.network.id });
  await linkStudentGuardian({
    networkId: scenario.network.id,
    studentId: student.id,
    guardianId: guardian.id,
  });
  await createEnrollment({
    networkId: scenario.network.id,
    studentId: student.id,
    classGroupId: classGroup.id,
    academicYearId: scenario.academicYear.id,
  });
  return guardian.id;
}

describe('publishAnnouncement', () => {
  test('publishes with the author name and the publication date filled in', async () => {
    const announcement = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    expect(announcement.title).toBe('Reunião de pais');
    expect(announcement.body).toBe('A reunião começa às 19h no auditório.');
    expect(announcement.authorName).toBe(scenario.registrar.name);
    expect(announcement.schoolId).toBe(scenario.schools[0].id);
    expect(announcement.publishedAt).toMatch(ISO_INSTANT);
  });

  test('records one recipient for each guardian on the list', async () => {
    const chosen = [scenario.guardians[0].id, scenario.guardians[2].id];

    const announcement = await publish({
      recipients: chosen.map((guardianId) => ({ guardianId })),
    });

    expect(await recipientsOf(announcement.id)).toEqual([...chosen].sort());
  });

  test('the same guardian repeated on the list becomes a single recipient', async () => {
    const announcement = await publish({
      recipients: [
        { guardianId: scenario.guardians[0].id },
        { guardianId: scenario.guardians[0].id },
      ],
    });

    expect(await recipientsOf(announcement.id)).toEqual([scenario.guardians[0].id]);
  });

  test('an empty list reaches every guardian with a student actively enrolled at the school', async () => {
    const announcement = await publish({ recipients: [] });

    expect(await recipientsOf(announcement.id)).toEqual(
      scenario.guardians.map((guardian) => guardian.id).sort(),
    );
  });

  test('an empty list does not reach a guardian from another school of the same network', async () => {
    const fromAnotherSchool = await guardianAtSchool(scenario.schools[1].id);

    const announcement = await publish({ recipients: [] });

    expect(await recipientsOf(announcement.id)).not.toContain(fromAnotherSchool);
  });

  test('an empty list does not reach a guardian from another network', async () => {
    const other = await fullScenario();

    const announcement = await publish({ recipients: [] });

    const reached = await recipientsOf(announcement.id);
    for (const guardian of other.guardians) {
      expect(reached).not.toContain(guardian.id);
    }
  });

  test('an empty list ignores a guardian whose student holds no active enrollment', async () => {
    const shutDown = await guardianAtSchool(scenario.schools[0].id);
    await testSql()`
      UPDATE enrollment SET status = 'cancelled'
       WHERE student_id IN (SELECT student_id FROM student_guardian WHERE guardian_id = ${shutDown})`;

    const announcement = await publish({ recipients: [] });

    expect(await recipientsOf(announcement.id)).not.toContain(shutDown);
  });

  test('refuses when there is no guardian at all to receive it', async () => {
    const result = await communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: scenario.registrar.id,
      recipients: [],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'recipients', code: 'no_recipients' })],
    });
  });

  test('refuses an empty title and a title that runs too long', async () => {
    const empty = communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      title: '   ',
      body: 'Corpo do aviso.',
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    const long = communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      title: 't'.repeat(161),
      body: 'Corpo do aviso.',
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const [withoutTitle, longTitle] = await Promise.all([empty, long]);

    expect(withoutTitle).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'title', code: 'invalid_title' })],
    });
    expect(longTitle).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'title', code: 'invalid_title' })],
    });
  });

  test('refuses an empty body', async () => {
    const result = await communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      title: 'Aviso',
      body: '  ',
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'body', code: 'invalid_body' })],
    });
  });

  test('refuses a school that does not belong to this network', async () => {
    const other = await fullScenario();

    const result = await communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: other.schools[0].id,
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'schoolId', code: 'unknown_school' })],
    });
  });

  test('refuses an author who does not belong to this network', async () => {
    const other = await fullScenario();

    const result = await communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: other.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'authorUserId', code: 'unknown_author' })],
    });
  });
});

describe('markAsRead', () => {
  test('records the recipient\'s reading', async () => {
    const announcement = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const result = await communication.markAsRead({
      networkId: scenario.network.id,
      announcementId: announcement.id,
      guardianId: scenario.guardians[0].id,
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await readsOf(announcement.id, scenario.guardians[0].id)).not.toEqual([null]);
  });

  test('a second call does not move the date of the first reading', async () => {
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id, readAt: OLD_READ }],
    });

    await communication.markAsRead({
      networkId: scenario.network.id,
      announcementId: announcement.id,
      guardianId: scenario.guardians[0].id,
    });

    expect(await readsOf(announcement.id, scenario.guardians[0].id)).toEqual([OLD_READ]);
  });

  test('creates no reading for someone who is not a recipient', async () => {
    const announcement = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const result = await communication.markAsRead({
      networkId: scenario.network.id,
      announcementId: announcement.id,
      guardianId: scenario.guardians[1].id,
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await readsOf(announcement.id, scenario.guardians[1].id)).toEqual([]);
  });

  test('does not mark the reading from another network', async () => {
    const announcement = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    await communication.markAsRead({
      networkId: crypto.randomUUID(),
      announcementId: announcement.id,
      guardianId: scenario.guardians[0].id,
    });

    expect(await readsOf(announcement.id, scenario.guardians[0].id)).toEqual([null]);
  });

  test('refuses an identifier that is not a uuid', async () => {
    const result = await communication.markAsRead({
      networkId: scenario.network.id,
      announcementId: 'nao-e-uuid',
      guardianId: scenario.guardians[0].id,
    });

    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ field: 'announcementId' })],
    });
  });
});

describe('guardianBoard', () => {
  test('brings the guardian\'s announcements from the most recent to the oldest', async () => {
    const base = {
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    };
    const old = await createAnnouncement({
      ...base,
      title: 'Aviso de março',
      publishedAt: new Date('2026-03-01T12:00:00.000Z'),
    });
    const recent = await createAnnouncement({
      ...base,
      title: 'Aviso de maio',
      publishedAt: new Date('2026-05-01T12:00:00.000Z'),
    });

    const board = await communication.guardianBoard(
      scenario.network.id,
      scenario.guardians[0].id,
    );

    expect(board).toEqual([
      {
        announcementId: recent.id,
        title: 'Aviso de maio',
        publishedAt: '2026-05-01T12:00:00.000Z',
        readAt: null,
      },
      {
        announcementId: old.id,
        title: 'Aviso de março',
        publishedAt: '2026-03-01T12:00:00.000Z',
        readAt: null,
      },
    ]);
  });

  test('does not bring an announcement the guardian is no recipient of', async () => {
    await publish({ recipients: [{ guardianId: scenario.guardians[0].id }] });

    const board = await communication.guardianBoard(
      scenario.network.id,
      scenario.guardians[1].id,
    );

    expect(board).toEqual([]);
  });

  test('does not bring an announcement that has not been published yet', async () => {
    await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const board = await communication.guardianBoard(
      scenario.network.id,
      scenario.guardians[0].id,
    );

    expect(board).toEqual([]);
  });

  test('shows the reading date for whoever has already read it', async () => {
    await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: new Date('2026-03-01T12:00:00.000Z'),
      recipients: [{ guardianId: scenario.guardians[0].id, readAt: OLD_READ }],
    });

    const board = await communication.guardianBoard(
      scenario.network.id,
      scenario.guardians[0].id,
    );

    expect(board[0]?.readAt).toBe(OLD_READ.toISOString());
  });

  test('does not bring an announcement from another network', async () => {
    const other = await fullScenario();
    await createAnnouncement({
      networkId: other.network.id,
      schoolId: other.schools[0].id,
      authorUserId: other.registrar.id,
      recipients: [{ guardianId: other.guardians[0].id }],
    });

    const board = await communication.guardianBoard(
      scenario.network.id,
      other.guardians[0].id,
    );

    expect(board).toEqual([]);
  });
});

describe('announcementForGuardian', () => {
  test('gives the whole announcement back to whoever is a recipient', async () => {
    const published = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const announcement = await communication.announcementForGuardian(
      scenario.network.id,
      scenario.guardians[0].id,
      published.id,
    );

    expect(announcement).toEqual(published);
  });

  test('gives back null for whoever is not a recipient', async () => {
    const published = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const announcement = await communication.announcementForGuardian(
      scenario.network.id,
      scenario.guardians[1].id,
      published.id,
    );

    expect(announcement).toBeNull();
  });

  test('gives back null for an announcement that has not been published yet', async () => {
    const draft = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const announcement = await communication.announcementForGuardian(
      scenario.network.id,
      scenario.guardians[0].id,
      draft.id,
    );

    expect(announcement).toBeNull();
  });

  test('gives back null when the announcement belongs to another network', async () => {
    const published = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const announcement = await communication.announcementForGuardian(
      crypto.randomUUID(),
      scenario.guardians[0].id,
      published.id,
    );

    expect(announcement).toBeNull();
  });
});

describe('listAnnouncements', () => {
  test('three readings among ten recipients make a rate of 0.3', async () => {
    const ten = await Promise.all(
      Array.from({ length: 10 }, () => createGuardian({ networkId: scenario.network.id })),
    );
    const announcement = await publish({
      recipients: ten.map((guardian) => ({ guardianId: guardian.id })),
    });
    for (const guardian of ten.slice(0, 3)) {
      await communication.markAsRead({
        networkId: scenario.network.id,
        announcementId: announcement.id,
        guardianId: guardian.id,
      });
    }

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics).toEqual([
      {
        announcementId: announcement.id,
        title: 'Reunião de pais',
        publishedAt: expect.stringMatching(ISO_INSTANT),
        recipients: 10,
        reads: 3,
        rate: 0.3,
      },
    ]);
  });

  test('a single call gives back every announcement in the network along with each one\'s rate', async () => {
    const counts = [0, 1, 2, 3, 4, 5];
    const expected = [];
    for (const read of counts) {
      const announcement = await createAnnouncement({
        networkId: scenario.network.id,
        schoolId: scenario.schools[0].id,
        authorUserId: scenario.registrar.id,
        publishedAt: new Date(`2026-03-0${read + 1}T12:00:00.000Z`),
        recipients: scenario.guardians.map((guardian, position) => ({
          guardianId: guardian.id,
          readAt: position < read ? OLD_READ : null,
        })),
      });
      expected.push({ announcementId: announcement.id, reads: read, rate: read / 5 });
    }

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics).toHaveLength(6);
    expect(
      statistics.map((row) => ({
        announcementId: row.announcementId,
        reads: row.reads,
        rate: row.rate,
      })),
    ).toEqual([...expected].reverse());
    expect(statistics.every((row) => row.recipients === 5)).toBe(true);
  });

  test('an announcement with no recipient shows up at rate 0', async () => {
    const withoutAnyone = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
    });

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics).toEqual([
      expect.objectContaining({
        announcementId: withoutAnyone.id,
        recipients: 0,
        reads: 0,
        rate: 0,
      }),
    ]);
  });

  test('filters by school when a school is given', async () => {
    const ofTheFirst = await publish({
      schoolId: scenario.schools[0].id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    await publish({
      schoolId: scenario.schools[1].id,
      recipients: [{ guardianId: scenario.guardians[1].id }],
    });

    const statistics = await communication.listAnnouncements(
      scenario.network.id,
      scenario.schools[0].id,
    );

    expect(statistics.map((row) => row.announcementId)).toEqual([ofTheFirst.id]);
  });

  test('with no filter it brings both schools of the network and none from another', async () => {
    await publish({
      schoolId: scenario.schools[0].id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    await publish({
      schoolId: scenario.schools[1].id,
      recipients: [{ guardianId: scenario.guardians[1].id }],
    });
    const other = await fullScenario();
    await createAnnouncement({
      networkId: other.network.id,
      schoolId: other.schools[0].id,
      authorUserId: other.registrar.id,
    });

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics).toHaveLength(2);
  });

  test('the announcement not yet published sits at the end of the list', async () => {
    const draft = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
    });
    const published = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics.map((row) => row.announcementId)).toEqual([published.id, draft.id]);
    expect(statistics[1]?.publishedAt).toBeNull();
  });
});
