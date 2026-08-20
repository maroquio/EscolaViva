import { Hono } from 'hono';
import { AUDIENCE, communication, type ReadStatistic } from '../../communication';
import { ROLE } from '../../identity';
import { CONTEXT_VARIABLES, STATUS } from '../../shared/constants';
import {
  currentNetwork,
  currentUser,
  errorBody,
  hasRole,
  requireRole,
  type Variables,
} from '../../shared/http';
import { emptyPage } from '../../shared/pagination';
import type { ApplicationError } from '../../shared/result';
import { ANNOUNCEMENT_ROUTES, API, API_ROUTES } from '../constants';
import { FORM_ERRORS, NO_SELECTION_ON_SEND } from './constants';
import { pageFromQuery } from '../pagination';
import type {
  AnnouncementBoard,
  PublishedAnnouncement,
} from '@escolaviva/contracts/announcements';
import {
  announcementAsJson,
  readSummaryAsJson,
  recipientAsJson,
  type ReadTotals,
  type Recipient,
} from '../presenters/announcements';
import { pageAsJson } from '../presenters/page';
import { created } from '../response';
import { announcementSchema, type AnnouncementBody } from '../schemas/announcements';
import { parse } from '../schemas/parse';
import { listScope, requestedSchool, sendContext, userSchools } from './announcementScope';

export const announcementRoutes = new Hono<{ Variables: Variables }>();

const EMPTY_SUMMARY: ReadTotals = { recipients: 0, reads: 0, rate: 0 };

const NO_SELECTION: ApplicationError = {
  ...FORM_ERRORS.noSelection,
  message: NO_SELECTION_ON_SEND,
};

announcementRoutes.use(requireRole(ROLE.registrar, ROLE.networkAdmin));

announcementRoutes.get(ANNOUNCEMENT_ROUTES.list, async (c) => {
  const user = currentUser(c);
  const networkId = currentNetwork(c);
  const seesWholeNetwork = hasRole(user, ROLE.networkAdmin);
  const schools = await userSchools(networkId, user, seesWholeNetwork);
  const scope = listScope(schools, requestedSchool(c), seesWholeNetwork);

  const outOfScope = scope === null && !seesWholeNetwork;
  const [page, summary] = await Promise.all([
    outOfScope
      ? Promise.resolve(emptyPage<ReadStatistic>())
      : communication.announcementsPage(networkId, scope ?? undefined, pageFromQuery(c)),
    outOfScope
      ? Promise.resolve(EMPTY_SUMMARY)
      : communication.announcementsSummary(networkId, scope ?? undefined),
  ]);

  const board: AnnouncementBoard = {
    announcements: pageAsJson(page, announcementAsJson),
    summary: readSummaryAsJson(summary),
    currentSchool: scope ?? '',
    seesWholeNetwork,
  };
  return c.json(board);
});

announcementRoutes.get(ANNOUNCEMENT_ROUTES.recipients, async (c) => {
  const context = await sendContext(currentNetwork(c), currentUser(c), requestedSchool(c));
  return c.json(context.guardians.map(recipientAsJson));
});

const checkRecipients = (
  values: AnnouncementBody,
  guardians: readonly Recipient[],
): ApplicationError | null => {
  if (values.audience === AUDIENCE.school) return null;
  if (values.recipients.length === 0) return NO_SELECTION;
  const ofSchool = new Set(guardians.map((guardian) => guardian.id));
  if (values.recipients.every((id) => ofSchool.has(id))) return null;
  return FORM_ERRORS.recipientOutsideSchool;
};

announcementRoutes.post(ANNOUNCEMENT_ROUTES.list, async (c) => {
  const user = currentUser(c);
  const networkId = currentNetwork(c);

  const input = parse(announcementSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const values = input.value;
  const context = await sendContext(networkId, user, values.schoolId);
  if (context.school === null) {
    return c.json(errorBody([FORM_ERRORS.missingSchool]), STATUS.refused);
  }

  const rejection = checkRecipients(values, context.guardians);
  if (rejection !== null) return c.json(errorBody([rejection]), STATUS.refused);

  const result = await communication.publishAnnouncement({
    networkId,
    schoolId: context.school.id,
    title: values.title,
    body: values.body,
    authorUserId: user.id,
    recipients:
      values.audience === AUDIENCE.school
        ? []
        : values.recipients.map((userId) => ({ userId })),
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  const published: PublishedAnnouncement = { id: result.value.id };
  return created(
    c,
    `${API.versionedPrefix}${API_ROUTES.announcements}`,
    published,
  );
});
