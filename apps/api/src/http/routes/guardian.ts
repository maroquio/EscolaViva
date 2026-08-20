import { Hono, type Context } from 'hono';
import { academics, type Enrollment } from '../../academics';
import { assessment } from '../../assessment';
import { BOARD_SCOPE, communication } from '../../communication';
import { ROLE } from '../../identity';
import {
  currentNetwork,
  currentUser,
  errorBody,
  isUuid,
  NotFound,
  requireRole,
  type Variables,
} from '../../shared/http';
import { STATUS } from '../../shared/constants';
import { GUARDIAN_ROUTES, PARAMS } from '../constants';
import { DIAGNOSTICS } from './constants';
import { pageFromQuery } from '../pagination';
import {
  announcementViewAsJson,
  attendanceViewAsJson,
  boardAsJson,
  dashboardAsJson,
  reportCardViewAsJson,
} from '../presenters/guardian';

export const guardianRoutes = new Hono<{ Variables: Variables }>();

const ROUTE_PARAMS = { id: 'id', announcementId: 'announcementId' } as const;

const DASHBOARD_UNREAD_PAGE = 1;

guardianRoutes.use(requireRole(ROLE.guardian));

const enrollmentUnderResponsibility = async (
  c: Context,
  enrollmentId: string,
): Promise<Enrollment> => {
  if (!isUuid(enrollmentId)) throw new NotFound(DIAGNOSTICS.enrollmentOutsideResponsibility);
  const enrollment = await academics.guardianEnrollmentById(
    currentNetwork(c),
    currentUser(c).id,
    enrollmentId,
  );
  if (enrollment === null) {
    throw new NotFound(DIAGNOSTICS.enrollmentOutsideResponsibility);
  }
  return enrollment;
};

guardianRoutes.get(GUARDIAN_ROUTES.dashboard, async (c) => {
  const networkId = currentNetwork(c);
  const userId = currentUser(c).id;

  const [enrollments, unread, counts] = await Promise.all([
    academics.guardianEnrollmentsPage(networkId, userId, pageFromQuery(c)),
    communication.boardPage(networkId, userId, BOARD_SCOPE.unread, DASHBOARD_UNREAD_PAGE),
    communication.boardCounts(networkId, userId),
  ]);

  return c.json(dashboardAsJson(enrollments, unread.items, counts), STATUS.ok);
});

guardianRoutes.get(GUARDIAN_ROUTES.reportCard, async (c) => {
  const enrollmentId = c.req.param(ROUTE_PARAMS.id);
  await enrollmentUnderResponsibility(c, enrollmentId);

  const reportCard = await assessment.reportCard(currentNetwork(c), enrollmentId);
  if (reportCard === null) throw new NotFound(DIAGNOSTICS.enrollmentWithoutReportCard);

  return c.json(reportCardViewAsJson(reportCard), STATUS.ok);
});

guardianRoutes.get(GUARDIAN_ROUTES.attendance, async (c) => {
  const enrollmentId = c.req.param(ROUTE_PARAMS.id);
  const networkId = currentNetwork(c);
  const enrollment = await enrollmentUnderResponsibility(c, enrollmentId);

  const [days, reportCard] = await Promise.all([
    assessment.attendancePage(networkId, enrollmentId, pageFromQuery(c)),
    assessment.reportCard(networkId, enrollmentId),
  ]);
  if (reportCard === null) throw new NotFound(DIAGNOSTICS.enrollmentWithoutAttendance);

  return c.json(attendanceViewAsJson(enrollment, reportCard, days), STATUS.ok);
});

guardianRoutes.get(GUARDIAN_ROUTES.board, async (c) => {
  const networkId = currentNetwork(c);
  const userId = currentUser(c).id;

  const [unread, read] = await Promise.all([
    communication.boardPage(networkId, userId, BOARD_SCOPE.unread, pageFromQuery(c, PARAMS.unreadPage)),
    communication.boardPage(networkId, userId, BOARD_SCOPE.read, pageFromQuery(c, PARAMS.readPage)),
  ]);

  return c.json(boardAsJson(unread, read), STATUS.ok);
});

guardianRoutes.get(GUARDIAN_ROUTES.announcement, async (c) => {
  const announcementId = c.req.param(ROUTE_PARAMS.announcementId);
  if (!isUuid(announcementId)) throw new NotFound(DIAGNOSTICS.announcementOutsideBoard);
  const networkId = currentNetwork(c);
  const userId = currentUser(c).id;

  const [announcement, readAt] = await Promise.all([
    communication.announcementForGuardian(networkId, userId, announcementId),
    communication.announcementReadAt(networkId, userId, announcementId),
  ]);
  if (announcement === null) throw new NotFound(DIAGNOSTICS.announcementOutsideBoard);

  return c.json(announcementViewAsJson(announcement, readAt), STATUS.ok);
});

guardianRoutes.post(GUARDIAN_ROUTES.announcementRead, async (c) => {
  const announcementId = c.req.param(ROUTE_PARAMS.announcementId);
  if (!isUuid(announcementId)) throw new NotFound(DIAGNOSTICS.announcementOutsideBoard);
  const networkId = currentNetwork(c);
  const userId = currentUser(c).id;

  const announcement = await communication.announcementForGuardian(
    networkId,
    userId,
    announcementId,
  );
  if (announcement === null) throw new NotFound(DIAGNOSTICS.announcementOutsideBoard);

  const result = await communication.markAsRead({ networkId, announcementId, userId });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  return c.body(null, STATUS.noContent);
});
