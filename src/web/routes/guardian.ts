import { Hono, type Context } from 'hono';
import { ACADEMIC_VOCABULARY, academics, type Enrollment } from '../../academics';
import {
  ARITHMETIC,
  ASSESSMENT_VOCABULARY,
  PASSING,
  assessment,
  type ReportCard,
} from '../../assessment';
import { communication, type BoardItem } from '../../communication';
import { ROLE } from '../../identity';
import {
  NotFound,
  currentNetwork,
  currentUser,
  requireRole,
  type Variables,
} from '../../shared/http';
import { emptyPage } from '../../shared/pagination';
import {
  DIAGNOSTICS,
  MISSING_VALUE,
  NOTICES,
  PARAMS,
  PRESENTATION,
  ROUTES,
  TEMPLATES,
  TITLES,
} from '../constants';
import { pageFromQuery, pagination } from '../pagination';
import { formatGrade, render } from '../render';

export const guardianRoutes = new Hono<{ Variables: Variables }>();

guardianRoutes.use(requireRole(ROLE.guardian));

const PARTIALS = { partials: TEMPLATES.partials };

const ASSESSMENT_LABELS = {
  statusLabel: ASSESSMENT_VOCABULARY.finalStatus,
  attendanceLabel: {
    present: ASSESSMENT_VOCABULARY.attendance.present,
    excusedAbsence: ASSESSMENT_VOCABULARY.attendance.excusedAbsence,
    absence: ASSESSMENT_VOCABULARY.attendance.absence,
  },
};

const ACADEMIC_LABELS = {
  statusLabel: ACADEMIC_VOCABULARY.enrollmentStatus,
};

const toScreenScale = (inHundredths: number): number => inHundredths / ARITHMETIC.hundredths;

const PASSING_CRITERIA = {
  average: formatGrade(toScreenScale(PASSING.minimumAverageInHundredths)),
  attendance: `${toScreenScale(PASSING.minimumAttendanceInHundredths)}${PRESENTATION.percentSuffix}`,
};

const sessionGuardian = (c: Context): string | null => currentUser(c).guardianId;

const enrollmentUnderResponsibility = async (
  c: Context,
  enrollmentId: string,
): Promise<Enrollment> => {
  const guardianId = sessionGuardian(c);
  if (guardianId === null) throw new NotFound(DIAGNOSTICS.accountWithoutGuardian);

  const enrollments = await academics.guardianEnrollments(currentNetwork(c), guardianId);
  const enrollment = enrollments.find((row) => row.id === enrollmentId);
  if (enrollment === undefined) {
    throw new NotFound(DIAGNOSTICS.enrollmentOutsideResponsibility);
  }
  return enrollment;
};

const termsOf = (reportCard: ReportCard): number[] =>
  Array.from({ length: reportCard.rows[0]?.grades.length ?? 0 }, (_, index) => index + 1);

const withNotice = (target: string, notice: Record<string, string>): string =>
  `${target}?${new URLSearchParams(notice).toString()}`;

guardianRoutes.get(ROUTES.guardian.dashboard.pattern, async (c) => {
  const networkId = currentNetwork(c);
  const guardianId = sessionGuardian(c);

  if (guardianId === null) {
    return render(c, TEMPLATES.guardian.dashboard, {
      ...PARTIALS,
      ...ACADEMIC_LABELS,
      title: TITLES.guardian.dashboard,
      enrollments: [],
      pagination: pagination(c, emptyPage<Enrollment>()),
      unread: [],
      unreadTotal: 0,
      boardTotal: 0,
    });
  }

  const [page, unread, counts] = await Promise.all([
    academics.guardianEnrollmentsPage(networkId, guardianId, pageFromQuery(c)),
    communication.boardPage(networkId, guardianId, false, 1),
    communication.boardCounts(networkId, guardianId),
  ]);

  return render(c, TEMPLATES.guardian.dashboard, {
    ...PARTIALS,
    ...ACADEMIC_LABELS,
    title: TITLES.guardian.dashboard,
    enrollments: page.items,
    pagination: pagination(c, page),
    unread: unread.items,
    unreadTotal: counts.unread,
    boardTotal: counts.total,
  });
});

guardianRoutes.get(ROUTES.guardian.reportCard.pattern, async (c) => {
  const { id: enrollmentId } = c.req.param();
  await enrollmentUnderResponsibility(c, enrollmentId);

  const reportCard = await assessment.reportCard(currentNetwork(c), enrollmentId);
  if (reportCard === null) throw new NotFound(DIAGNOSTICS.enrollmentWithoutReportCard);

  return render(c, TEMPLATES.guardian.reportCard, {
    ...PARTIALS,
    statusLabel: ASSESSMENT_LABELS.statusLabel,
    criteria: PASSING_CRITERIA,
    title: TITLES.guardian.reportCard(reportCard.studentName),
    enrollmentId,
    reportCard,
    terms: termsOf(reportCard),
  });
});

guardianRoutes.get(ROUTES.guardian.attendance.pattern, async (c) => {
  const { id: enrollmentId } = c.req.param();
  const networkId = currentNetwork(c);
  const enrollment = await enrollmentUnderResponsibility(c, enrollmentId);

  const [days, reportCard] = await Promise.all([
    assessment.attendancePage(networkId, enrollmentId, pageFromQuery(c)),
    assessment.reportCard(networkId, enrollmentId),
  ]);
  if (reportCard === null) throw new NotFound(DIAGNOSTICS.enrollmentWithoutAttendance);

  return render(c, TEMPLATES.guardian.attendance, {
    ...PARTIALS,
    attendanceLabel: ASSESSMENT_LABELS.attendanceLabel,
    missingValue: MISSING_VALUE,
    criteria: PASSING_CRITERIA,
    title: TITLES.guardian.attendance(enrollment.studentName),
    enrollment,
    reportCard,
    days: days.items,
    pagination: pagination(c, days),
  });
});

guardianRoutes.get(ROUTES.guardian.board.pattern, async (c) => {
  const guardianId = sessionGuardian(c);
  const networkId = currentNetwork(c);
  const [unread, read] =
    guardianId === null
      ? [emptyPage<BoardItem>(), emptyPage<BoardItem>()]
      : await Promise.all([
          communication.boardPage(
            networkId,
            guardianId,
            false,
            pageFromQuery(c, PARAMS.unreadPage),
          ),
          communication.boardPage(
            networkId,
            guardianId,
            true,
            pageFromQuery(c, PARAMS.readPage),
          ),
        ]);

  return render(c, TEMPLATES.guardian.board, {
    ...PARTIALS,
    title: TITLES.guardian.board,
    unread: unread.items,
    unreadPagination: pagination(c, unread, PARAMS.unreadPage),
    unreadTotal: unread.total,
    read: read.items,
    readPagination: pagination(c, read, PARAMS.readPage),
    readTotal: read.total,
  });
});

guardianRoutes.get(ROUTES.guardian.announcement.pattern, async (c) => {
  const { comunicadoId: announcementId } = c.req.param();
  const networkId = currentNetwork(c);
  const guardianId = sessionGuardian(c);
  if (guardianId === null) throw new NotFound(DIAGNOSTICS.accountWithoutGuardian);

  const [announcement, board] = await Promise.all([
    communication.announcementForGuardian(networkId, guardianId, announcementId),
    communication.guardianBoard(networkId, guardianId),
  ]);
  if (announcement === null) throw new NotFound(DIAGNOSTICS.announcementOutsideBoard);

  return render(c, TEMPLATES.guardian.announcement, {
    title: announcement.title,
    announcement,
    readAt: board.find((item) => item.announcementId === announcementId)?.readAt ?? null,
  });
});

guardianRoutes.post(ROUTES.guardian.announcementRead.pattern, async (c) => {
  const { comunicadoId: announcementId } = c.req.param();
  const networkId = currentNetwork(c);
  const guardianId = sessionGuardian(c);
  if (guardianId === null) throw new NotFound(DIAGNOSTICS.accountWithoutGuardian);

  const announcement = await communication.announcementForGuardian(
    networkId,
    guardianId,
    announcementId,
  );
  if (announcement === null) throw new NotFound(DIAGNOSTICS.announcementOutsideBoard);

  const result = await communication.markAsRead({
    networkId,
    announcementId,
    guardianId,
  });
  if (!result.ok) {
    const message = result.erros[0]?.mensagem ?? NOTICES.readNotRecorded;
    return c.redirect(
      withNotice(ROUTES.guardian.announcement({ comunicadoId: announcementId }), {
        [PARAMS.error]: message,
      }),
      303,
    );
  }

  return c.redirect(
    withNotice(ROUTES.guardian.board(), { [PARAMS.ok]: NOTICES.announcementRead }),
    303,
  );
});
