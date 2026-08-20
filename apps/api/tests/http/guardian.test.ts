/*
 * The guardian portal in JSON.
 *
 * Four decisions carry this whole front, and every case below exists to hold one of them.
 *
 * 1. Opening a communication does NOT record that it was read. Reading is a write, and a write may
 *    not be a side effect of navigation. The 12 % read rate is the measurement that justifies Stage
 *    04, and reads invented by a prefetch — or by a React Query refetch on window focus — would
 *    inflate it until it measured nothing. The GET is proven against the database, not against the
 *    response body: only `read_at IS NULL` after the trip proves the route wrote nothing.
 *
 * 2. Another family's record answers 404, never 403. A 403 confirms the record exists and merely
 *    belongs to somebody else, which is exactly what a guardian must not be able to find out about
 *    another family. The scope is `student_guardian`, and there is no `guardianId` anywhere: a
 *    guardian is an `app_user` reached through that table.
 *
 * 3. A guardian account with no `student_guardian` row is not an error. It is an account the
 *    registrar has not linked yet, and the dashboard answers 200 with empty lists.
 *
 * 4. No arithmetic happens at the edge. Average, term average, attendance rate and final status all
 *    come from `assessment`, nulls included. A second number computed here would diverge from the
 *    first, and it is that divergence the report card exists not to have.
 *
 * Two rows of the P5 table have no reachable case on this front, and that is a property of the
 * front rather than an omission — see the comments on `describe('marking a communication as read')`.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../src/http/app';
import { API } from '../../src/http/constants';
import { APPLICATION_MARK, HEADERS } from '../../src/shared/constants';
import { clearDatabase, testSql } from '../support/database';
import {
  createAnnouncement,
  createAttendance,
  createEnrollment,
  createGrade,
  createGuardian,
  createStudent,
  fullScenario,
  linkStudentGuardian,
  twoNetworks,
  type Scenario,
  type TestUser,
} from '../support/factories';
import { read, signIn, write, writeWithKey } from './support';

const GUARDIAN = `${API.versionedPrefix}/guardian`;
const DASHBOARD = `${GUARDIAN}/dashboard`;
const BOARD = `${GUARDIAN}/board`;

const reportCardOf = (enrollmentId: string): string =>
  `${GUARDIAN}/enrollments/${enrollmentId}/report-card`;
const attendanceOf = (enrollmentId: string): string =>
  `${GUARDIAN}/enrollments/${enrollmentId}/attendance`;
const announcementOf = (announcementId: string): string => `${BOARD}/${announcementId}`;
const markAsReadOf = (announcementId: string): string => `${BOARD}/${announcementId}/read`;

/**
 * `DEFAULT_PAGE_SIZE` is a server-side default argument, not a request parameter: no route reads
 * `size`, `limit` or `per_page`, and none may. Restating it here is what lets a case assert how
 * many items a second page carries without asking for a page size the API does not accept.
 */
const PAGE_SIZE = 10;
const MORE_THAN_ONE_PAGE = PAGE_SIZE + 2;
const SECOND_PAGE_SIZE = MORE_THAN_ONE_PAGE - PAGE_SIZE;
const A_HANDFUL = 2;
const FAR_PAST_THE_END = 999;
const MINUTE_IN_MS = 60_000;
const GRADE_IN_THE_FIRST_TERM = 8;
const FIRST_TERM = 1;
const ALL_FOUR_TERMS = [1, 2, 3, 4];
const FINAL_STATUSES = ['in_progress', 'passed', 'failed'];

type PageOf<T> = { items: T[]; page: number; pages: number; total: number; size: number };

type EnrollmentBody = {
  id: string;
  studentId: string;
  studentName: string;
  classGroupId: string;
  classGroupName: string;
  year: number;
  status: string;
};

type BoardItemBody = {
  announcementId: string;
  title: string;
  publishedAt: string;
  readAt: string | null;
};

type ReportCardBody = {
  enrollmentId: string;
  studentName: string;
  classGroupName: string;
  year: number;
  rows: { subjectName: string; grades: (number | null)[]; average: number | null }[];
  termAverages: (number | null)[];
  overallAverage: number | null;
  attendanceRate: number;
  totalDays: number;
  presentDays: number;
  status: string;
};

type DashboardBody = {
  enrollments: PageOf<EnrollmentBody>;
  unread: BoardItemBody[];
  totalUnread: number;
  totalOnBoard: number;
};

type ReportCardResponse = { reportCard: ReportCardBody; terms: number[] };

type AttendanceResponse = {
  enrollment: EnrollmentBody;
  reportCard: ReportCardBody;
  days: PageOf<{ date: string; present: boolean; excuse: string | null }>;
};

type BoardResponse = { unread: PageOf<BoardItemBody>; read: PageOf<BoardItemBody> };

type AnnouncementResponse = {
  announcement: {
    id: string;
    title: string;
    body: string;
    authorName: string;
    publishedAt: string | null;
  };
  readAt: string | null;
};

type Refusal = { errors: { field?: string; code: string; message: string }[] };

const enterAs = (scenario: Scenario, user: TestUser): Promise<string> =>
  signIn({
    networkSlug: scenario.network.slug,
    cpf: user.cpf,
    password: scenario.password,
  });

/**
 * Extra students linked to the same guardian: the only way this schema produces a guardian with
 * more than one page of enrollments, since one student is one row in `student_guardian`.
 */
const linkMoreStudents = async (scenario: Scenario, howMany: number): Promise<void> => {
  const networkId = scenario.network.id;
  await Promise.all(
    Array.from({ length: howMany }, async () => {
      const student = await createStudent({ networkId });
      await linkStudentGuardian({
        networkId,
        studentId: student.id,
        userId: scenario.guardian.id,
      });
      await createEnrollment({
        networkId,
        studentId: student.id,
        classGroupId: scenario.classGroups[0].id,
        academicYearId: scenario.academicYear.id,
      });
    }),
  );
};

/*
 * The board is ordered by `published_at DESC`, so two communications published in the same
 * millisecond would make `LIMIT/OFFSET` non-deterministic and a pagination case flaky. One minute
 * apart is what keeps page 1 and page 2 disjoint runs apart.
 */
const publishFor = async (
  scenario: Scenario,
  counts: { unread: number; read: number },
): Promise<void> => {
  const total = counts.unread + counts.read;
  await Promise.all(
    Array.from({ length: total }, (_, index) =>
      createAnnouncement({
        networkId: scenario.network.id,
        schoolId: scenario.schools[0].id,
        authorUserId: scenario.registrar.id,
        publishedAt: new Date(Date.now() - index * MINUTE_IN_MS),
        recipients: [
          {
            userId: scenario.guardian.id,
            readAt: index < counts.unread ? null : new Date(),
          },
        ],
      }),
    ),
  );
};

const recordAttendance = async (scenario: Scenario, days: number): Promise<void> => {
  const networkId = scenario.network.id;
  const enrollmentId = scenario.enrollments[0].id;
  await Promise.all(
    Array.from({ length: days }, (_, index) =>
      createAttendance({
        networkId,
        enrollmentId,
        attendanceDate: `${scenario.academicYear.year}-03-${String(index + 1).padStart(2, '0')}`,
        present: true,
      }),
    ),
  );
};

const readAtOf = async (announcementId: string, userId: string): Promise<Date | null> => {
  const rows = await testSql()<{ read_at: Date | null }[]>`
    SELECT read_at FROM announcement_recipient
     WHERE announcement_id = ${announcementId} AND user_id = ${userId}`;
  return rows[0]?.read_at ?? null;
};

const recipientRowsOf = async (announcementId: string, userId: string): Promise<number> => {
  const rows = await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM announcement_recipient
     WHERE announcement_id = ${announcementId} AND user_id = ${userId}`;
  return Number(rows[0]?.total ?? '0');
};

describe('the guardian dashboard', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('answers 200 with the enrollments, the unread block and the two counters', async () => {
    const scenario = await fullScenario();
    await publishFor(scenario, { unread: 2, read: 1 });
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as DashboardBody;

    expect(response.status).toBe(200);
    expect(body.enrollments.total).toBe(1);
    expect(body.enrollments.items[0]?.studentName).toBe(scenario.students[0].name);
    expect(body.unread.length).toBe(2);
    expect(body.totalUnread).toBe(2);
    expect(body.totalOnBoard).toBe(3);
  });

  /*
   * Decision 3. This is not a 404 and not a 403: the account exists, the role is right, and the
   * registrar simply has not linked a student yet. Answering anything but an empty 200 would send
   * the family to support over a step of the registrar's own workflow.
   */
  test('an account with the guardian role and no linked student sees empty lists, not an error', async () => {
    const scenario = await fullScenario();
    const unlinked = await createGuardian({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      password: scenario.password,
    });
    const cookie = await enterAs(scenario, unlinked);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as DashboardBody;

    expect(response.status).toBe(200);
    expect(body.enrollments.items).toEqual([]);
    expect(body.enrollments.total).toBe(0);
    expect(body.unread).toEqual([]);
    expect(body.totalUnread).toBe(0);
    expect(body.totalOnBoard).toBe(0);
  });

  test('without a session it is 401', async () => {
    const response = await read(DASHBOARD);

    expect(response.status).toBe(401);
  });

  /*
   * `requireRole` never throws — it answers directly — so a case that only exercised the thrown
   * path would prove nothing about the path a registrar actually takes.
   */
  test('a registrar is refused with 403 and a JSON body, not with an HTML page', async () => {
    const scenario = await fullScenario();
    const cookie = await enterAs(scenario, scenario.registrar);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(403);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  test('?p= advances the enrollments to a page that shares nothing with the first', async () => {
    const scenario = await fullScenario();
    await linkMoreStudents(scenario, MORE_THAN_ONE_PAGE - 1);
    const cookie = await enterAs(scenario, scenario.guardian);

    const first = (await (await read(DASHBOARD, cookie)).json()) as DashboardBody;
    const second = (await (
      await read(`${DASHBOARD}?p=2`, cookie)
    ).json()) as DashboardBody;

    expect(first.enrollments.page).toBe(1);
    expect(second.enrollments.page).toBe(2);
    expect(second.enrollments.total).toBe(MORE_THAN_ONE_PAGE);
    expect(second.enrollments.items.length).toBe(SECOND_PAGE_SIZE);
    const onFirst = new Set(first.enrollments.items.map((item) => item.id));
    expect(second.enrollments.items.some((item) => onFirst.has(item.id))).toBe(false);
  });

  /*
   * An over-range cursor is not an error. `queryPage` clamps to the last page and re-runs the query
   * for it, so a case asserting an empty page or a 404 here would be specifying a regression.
   */
  test('?p=999 answers 200 with the last page, filled', async () => {
    const scenario = await fullScenario();
    await linkMoreStudents(scenario, MORE_THAN_ONE_PAGE - 1);
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(`${DASHBOARD}?p=${FAR_PAST_THE_END}`, cookie);
    const body = (await response.json()) as DashboardBody;

    expect(response.status).toBe(200);
    expect(body.enrollments.page).toBe(body.enrollments.pages);
    expect(body.enrollments.items.length).toBe(SECOND_PAGE_SIZE);
  });
});

describe('the report card', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('answers 200 with the report card and one column per term', async () => {
    const scenario = await fullScenario();
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(reportCardOf(scenario.enrollments[0].id), cookie);
    const body = (await response.json()) as ReportCardResponse;

    expect(response.status).toBe(200);
    expect(body.reportCard.studentName).toBe(scenario.students[0].name);
    expect(body.reportCard.classGroupName).toBe(scenario.classGroups[0].name);
    expect(body.terms).toEqual(ALL_FOUR_TERMS);
    expect(FINAL_STATUSES).toContain(body.reportCard.status);
  });

  /*
   * Decision 4. One grade in one term is exactly the state where a subject has no average yet, and
   * the edge has to carry that `null` through rather than average what happens to be there. An
   * endpoint that computed its own number would answer 8 here, and the family would then read one
   * average on this screen and a different one wherever `assessment` is asked directly.
   */
  test('a subject with one term posted keeps the null average that assessment decided', async () => {
    const scenario = await fullScenario();
    await createGrade({
      networkId: scenario.network.id,
      enrollmentId: scenario.enrollments[0].id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      postedBy: scenario.teacher.id,
      term: FIRST_TERM,
      value: GRADE_IN_THE_FIRST_TERM,
    });
    const cookie = await enterAs(scenario, scenario.guardian);

    const body = (await (
      await read(reportCardOf(scenario.enrollments[0].id), cookie)
    ).json()) as ReportCardResponse;

    const posted = body.reportCard.rows.find(
      (row) => row.grades[0] === GRADE_IN_THE_FIRST_TERM,
    );
    expect(posted).toBeDefined();
    expect(posted?.average).toBeNull();
    expect(body.reportCard.overallAverage).toBeNull();
    expect(body.reportCard.status).toBe('in_progress');
  });

  /*
   * Decision 2. Same network, same school, another family — and the answer is 404, not 403. The two
   * are indistinguishable to whoever is asking, which is the point: a 403 would confirm that this
   * enrollment exists.
   */
  test("another family's enrollment answers 404, never 403", async () => {
    const scenario = await fullScenario();
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(reportCardOf(scenario.enrollments[1].id), cookie);

    expect(response.status).toBe(404);
  });

  test('an enrollment from another network answers 404 as well', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await enterAs(a, a.guardian);

    const response = await read(reportCardOf(b.enrollments[0].id), cookie);

    expect(response.status).toBe(404);
  });

  test('a guardian with no linked student gets 404 on any report card', async () => {
    const scenario = await fullScenario();
    const unlinked = await createGuardian({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      password: scenario.password,
    });
    const cookie = await enterAs(scenario, unlinked);

    const response = await read(reportCardOf(scenario.enrollments[0].id), cookie);

    expect(response.status).toBe(404);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const teacher = await enterAs(scenario, scenario.teacher);

    const anonymous = await read(reportCardOf(scenario.enrollments[0].id));
    const wrongRole = await read(reportCardOf(scenario.enrollments[0].id), teacher);

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});

describe('the attendance record', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('answers 200 with the enrollment, the tally and the days', async () => {
    const scenario = await fullScenario();
    await recordAttendance(scenario, A_HANDFUL);
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(attendanceOf(scenario.enrollments[0].id), cookie);
    const body = (await response.json()) as AttendanceResponse;

    expect(response.status).toBe(200);
    expect(body.enrollment.id).toBe(scenario.enrollments[0].id);
    expect(body.enrollment.studentName).toBe(scenario.students[0].name);
    expect(body.days.total).toBe(A_HANDFUL);
    expect(body.reportCard.totalDays).toBe(A_HANDFUL);
    expect(body.reportCard.presentDays).toBe(A_HANDFUL);
  });

  test('?p= advances the days and ?p=999 lands on the last page, filled', async () => {
    const scenario = await fullScenario();
    await recordAttendance(scenario, MORE_THAN_ONE_PAGE);
    const cookie = await enterAs(scenario, scenario.guardian);

    const second = (await (
      await read(`${attendanceOf(scenario.enrollments[0].id)}?p=2`, cookie)
    ).json()) as AttendanceResponse;
    const beyond = await read(
      `${attendanceOf(scenario.enrollments[0].id)}?p=${FAR_PAST_THE_END}`,
      cookie,
    );
    const clamped = (await beyond.json()) as AttendanceResponse;

    expect(second.days.page).toBe(2);
    expect(second.days.items.length).toBe(SECOND_PAGE_SIZE);
    expect(beyond.status).toBe(200);
    expect(clamped.days.page).toBe(clamped.days.pages);
    expect(clamped.days.items.length).toBe(SECOND_PAGE_SIZE);
  });

  test("another family's attendance answers 404, and anonymous answers 401", async () => {
    const scenario = await fullScenario();
    const cookie = await enterAs(scenario, scenario.guardian);

    const otherFamily = await read(attendanceOf(scenario.enrollments[1].id), cookie);
    const anonymous = await read(attendanceOf(scenario.enrollments[0].id));

    expect(otherFamily.status).toBe(404);
    expect(anonymous.status).toBe(401);
  });

  test('a registrar is refused with 403', async () => {
    const scenario = await fullScenario();
    const cookie = await enterAs(scenario, scenario.registrar);

    const response = await read(attendanceOf(scenario.enrollments[0].id), cookie);

    expect(response.status).toBe(403);
  });
});

describe('the board', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('answers 200 with the unread page and the read page', async () => {
    const scenario = await fullScenario();
    await publishFor(scenario, { unread: 2, read: 1 });
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(BOARD, cookie);
    const body = (await response.json()) as BoardResponse;

    expect(response.status).toBe(200);
    expect(body.unread.total).toBe(2);
    expect(body.read.total).toBe(1);
    expect(body.unread.items.every((item) => item.readAt === null)).toBe(true);
    expect(body.read.items.every((item) => item.readAt !== null)).toBe(true);
  });

  /*
   * Two independent cursors on one screen. Advancing the unread list must not move the read one:
   * a single `p` here would scroll a family past communications they have not seen, and the whole
   * reason the two names exist is that the two tables are read at different speeds.
   */
  test('?pUnread=2 advances only the unread list', async () => {
    const scenario = await fullScenario();
    await publishFor(scenario, { unread: MORE_THAN_ONE_PAGE, read: 3 });
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(`${BOARD}?pUnread=2`, cookie);
    const body = (await response.json()) as BoardResponse;

    expect(body.unread.page).toBe(2);
    expect(body.unread.items.length).toBe(SECOND_PAGE_SIZE);
    expect(body.read.page).toBe(1);
    expect(body.read.total).toBe(3);
  });

  test('?pRead=2 advances only the read list', async () => {
    const scenario = await fullScenario();
    await publishFor(scenario, { unread: 3, read: MORE_THAN_ONE_PAGE });
    const cookie = await enterAs(scenario, scenario.guardian);

    const body = (await (await read(`${BOARD}?pRead=2`, cookie)).json()) as BoardResponse;

    expect(body.read.page).toBe(2);
    expect(body.read.items.length).toBe(SECOND_PAGE_SIZE);
    expect(body.unread.page).toBe(1);
    expect(body.unread.total).toBe(3);
  });

  test('?pUnread=999 answers 200 with the last unread page, filled', async () => {
    const scenario = await fullScenario();
    await publishFor(scenario, { unread: MORE_THAN_ONE_PAGE, read: 0 });
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(`${BOARD}?pUnread=${FAR_PAST_THE_END}`, cookie);
    const body = (await response.json()) as BoardResponse;

    expect(response.status).toBe(200);
    expect(body.unread.page).toBe(body.unread.pages);
    expect(body.unread.items.length).toBe(SECOND_PAGE_SIZE);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const cookie = await enterAs(scenario, scenario.registrar);

    const anonymous = await read(BOARD);
    const wrongRole = await read(BOARD, cookie);

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});

describe('opening a communication', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('answers 200 with the whole communication and readAt still null', async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ userId: scenario.guardian.id }],
    });
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(announcementOf(announcement.id), cookie);
    const body = (await response.json()) as AnnouncementResponse;

    expect(response.status).toBe(200);
    expect(body.announcement.title).toBe(announcement.title);
    expect(body.announcement.body).toBe(announcement.body);
    expect(body.announcement.authorName).toBe(scenario.registrar.name);
    expect(body.readAt).toBeNull();
  });

  /*
   * Decision 1, and the case the whole front is built around. It asserts against the database
   * because the response body cannot tell the two implementations apart: a route that marked the
   * communication as read would still be free to answer `readAt: null` from the value it read
   * before writing. Only the row proves it. This case comes back in phase 5 as an E2E, because a
   * prefetch or a focus refetch on the front would break it without touching this file.
   */
  test('opening it does not record the read: read_at stays NULL in the database', async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ userId: scenario.guardian.id }],
    });
    const cookie = await enterAs(scenario, scenario.guardian);

    await read(announcementOf(announcement.id), cookie);
    await read(announcementOf(announcement.id), cookie);

    expect(await readAtOf(announcement.id, scenario.guardian.id)).toBeNull();
  });

  test('a communication addressed to somebody else answers 404', async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ userId: scenario.guardians[1].id }],
    });
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(announcementOf(announcement.id), cookie);

    expect(response.status).toBe(404);
  });

  /*
   * An unpublished communication is on nobody's board yet, and `announcementForGuardian` refuses it
   * even for a listed recipient. Without this case, a draft would leak the moment the registrar
   * added the recipients.
   */
  test('an unpublished communication answers 404 even to a listed recipient', async () => {
    const scenario = await fullScenario();
    const draft = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
      recipients: [{ userId: scenario.guardian.id }],
    });
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(announcementOf(draft.id), cookie);

    expect(response.status).toBe(404);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ userId: scenario.guardian.id }],
    });
    const registrar = await enterAs(scenario, scenario.registrar);

    const anonymous = await read(announcementOf(announcement.id));
    const wrongRole = await read(announcementOf(announcement.id), registrar);

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});

/*
 * The one write on this front, and it is worth saying what it cannot refuse.
 *
 * There is no request body: the announcement is in the path and the reader is the session, so the
 * P5 row for an edge refusal with a named field has nothing to name — the reachable 400 is the
 * malformed idempotency key, covered below. And the P5 row for a rule refusal with 422 has no
 * reachable case either: `markAsRead` refuses only a malformed identifier, and the route reaches it
 * solely after `announcementForGuardian` has matched a real row, which means the two identifiers it
 * validates are already known-good. Everything a guardian can get wrong here is scope, and scope
 * answers 404.
 */
describe('marking a communication as read', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const published = async (scenario: Scenario): Promise<string> => {
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ userId: scenario.guardian.id }],
    });
    return announcement.id;
  };

  test('answers 204, fills read_at and drops the unread counter', async () => {
    const scenario = await fullScenario();
    const announcementId = await published(scenario);
    const cookie = await enterAs(scenario, scenario.guardian);

    const before = (await (await read(DASHBOARD, cookie)).json()) as DashboardBody;
    const response = await write('POST', markAsReadOf(announcementId), {}, cookie);
    const after = (await (await read(DASHBOARD, cookie)).json()) as DashboardBody;

    expect(response.status).toBe(204);
    expect(await readAtOf(announcementId, scenario.guardian.id)).not.toBeNull();
    expect(before.totalUnread).toBe(1);
    expect(after.totalUnread).toBe(0);
    expect(after.totalOnBoard).toBe(1);
  });

  test('after marking it read, the communication carries readAt when opened', async () => {
    const scenario = await fullScenario();
    const announcementId = await published(scenario);
    const cookie = await enterAs(scenario, scenario.guardian);

    await write('POST', markAsReadOf(announcementId), {}, cookie);
    const body = (await (
      await read(announcementOf(announcementId), cookie)
    ).json()) as AnnouncementResponse;

    expect(body.readAt).not.toBeNull();
  });

  /*
   * Two taps on bad 4G. The repeat is recognised as a repeat — 200 with `{ repeated: true }` — and
   * the operation runs once.
   *
   * This case used to expect 204 twice, and the reason is worth keeping: the middleware took the
   * presence of a `Location` as the signal that a write had completed, so a 204 with nothing to
   * point at had its key released and the second tap ran the operation again. The row stayed single
   * anyway, because `markRead` only writes where `read_at IS NULL` — which is exactly how a broken
   * key went unnoticed. The signal is the status now, and this route is protected like any other.
   */
  test('the same key twice runs the operation once, leaves one row and does not move read_at', async () => {
    const scenario = await fullScenario();
    const announcementId = await published(scenario);
    const cookie = await enterAs(scenario, scenario.guardian);
    const key = crypto.randomUUID();

    const first = await writeWithKey('POST', markAsReadOf(announcementId), {}, cookie, key);
    const recordedFirst = await readAtOf(announcementId, scenario.guardian.id);
    const second = await writeWithKey('POST', markAsReadOf(announcementId), {}, cookie, key);
    const recordedSecond = await readAtOf(announcementId, scenario.guardian.id);

    expect(first.status).toBe(204);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { repeated: boolean }).repeated).toBe(true);
    expect(await recipientRowsOf(announcementId, scenario.guardian.id)).toBe(1);
    expect(recordedSecond).toEqual(recordedFirst);
  });

  test('two distinct keys still leave one row and one read_at', async () => {
    const scenario = await fullScenario();
    const announcementId = await published(scenario);
    const cookie = await enterAs(scenario, scenario.guardian);

    const first = await write('POST', markAsReadOf(announcementId), {}, cookie);
    const recordedFirst = await readAtOf(announcementId, scenario.guardian.id);
    const second = await write('POST', markAsReadOf(announcementId), {}, cookie);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(await recipientRowsOf(announcementId, scenario.guardian.id)).toBe(1);
    expect(await readAtOf(announcementId, scenario.guardian.id)).toEqual(recordedFirst);
  });

  test('a malformed Idempotency-Key is refused at the edge with 400', async () => {
    const scenario = await fullScenario();
    const announcementId = await published(scenario);
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await writeWithKey(
      'POST',
      markAsReadOf(announcementId),
      {},
      cookie,
      'nao-e-uma-chave',
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.code).toBe('missing_idempotency_key');
    expect(await readAtOf(announcementId, scenario.guardian.id)).toBeNull();
  });

  test("marking somebody else's communication answers 404 and writes nothing", async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ userId: scenario.guardians[1].id }],
    });
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await write('POST', markAsReadOf(announcement.id), {}, cookie);

    expect(response.status).toBe(404);
    expect(await readAtOf(announcement.id, scenario.guardians[1].id)).toBeNull();
  });

  /*
   * An anonymous write takes the thrown path (`rejectAnonymous` only redirects on GET), and a wrong
   * role takes the rendered one. Both have to come back as JSON, and only exercising the two proves
   * neither leaks an HTML page into the front's error handler.
   */
  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const announcementId = await published(scenario);
    const registrar = await enterAs(scenario, scenario.registrar);

    const anonymous = await write('POST', markAsReadOf(announcementId), {});
    const wrongRole = await write('POST', markAsReadOf(announcementId), {}, registrar);
    const refusal = (await wrongRole.json()) as Refusal;

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
    expect(refusal.errors.length).toBeGreaterThan(0);
    expect(await readAtOf(announcementId, scenario.guardian.id)).toBeNull();
  });
});

/*
 * Two things the board owes the rest of the API: a malformed id is refused like any other id it
 * cannot reach, and marking as read does not demand a body it never declared.
 */
describe('the board answers like its sibling fronts', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const publishedTo = async (scenario: Scenario): Promise<string> => {
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ userId: scenario.guardian.id }],
    });
    return announcement.id;
  };

  /*
   * The id went straight into a query against a uuid column, so PostgreSQL raised and the edge
   * answered 500 — with the driver's stack in the log — where every other front answers 404. A
   * caller cannot tell a malformed id from one that is simply not theirs, and should not.
   */
  test.each(['nao-e-uuid', '123', 'null'])('a malformed id (%s) is a 404 to read', async (id) => {
    const scenario = await fullScenario();
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await read(announcementOf(id), cookie);

    expect(response.status).toBe(404);
  });

  test('a malformed id is a 404 to mark as read too', async () => {
    const scenario = await fullScenario();
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await write('POST', markAsReadOf('nao-e-uuid'), {}, cookie);

    expect(response.status).toBe(404);
  });

  /*
   * The contract declares no body for this write, and the client should not have to invent `{}` to
   * satisfy a parser. An absent body is not a malformed one — a malformed one still answers 400.
   */
  test('marking as read works with no body at all', async () => {
    const scenario = await fullScenario();
    const announcementId = await publishedTo(scenario);
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await app.request(markAsReadOf(announcementId), {
      method: 'POST',
      headers: {
        Cookie: cookie,
        [HEADERS.contentType]: API.mediaType,
        [HEADERS.requestedBy]: APPLICATION_MARK,
        [HEADERS.idempotencyKey]: crypto.randomUUID(),
      },
    });

    expect(response.status).toBe(204);
  });

  test('a body that is there and malformed is still a 400', async () => {
    const scenario = await fullScenario();
    const announcementId = await publishedTo(scenario);
    const cookie = await enterAs(scenario, scenario.guardian);

    const response = await app.request(markAsReadOf(announcementId), {
      method: 'POST',
      headers: {
        Cookie: cookie,
        [HEADERS.contentType]: API.mediaType,
        [HEADERS.requestedBy]: APPLICATION_MARK,
        [HEADERS.idempotencyKey]: crypto.randomUUID(),
      },
      body: 'isto nao e json',
    });

    expect(response.status).toBe(400);
  });
});
