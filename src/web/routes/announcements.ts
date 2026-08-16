import { Hono, type Context } from 'hono';
import { academics } from '../../academics';
import { AUDIENCE, communication, type Audience, type ReadStatistic } from '../../communication';
import { ROLE, identity, type School } from '../../identity';
import { CONTEXT_VARIABLES } from '../../shared/constants';
import { emptyPage } from '../../shared/pagination';
import {
  NotFound,
  currentUser,
  hasRole,
  requireRole,
  schoolsForRole,
  type FormBody,
  type SessionUser,
  type Variables,
} from '../../shared/http';
import type { ApplicationError } from '../../shared/result';
import {
  DIAGNOSTICS,
  FIELDS,
  FORM_ERRORS,
  NOTICES,
  NO_SELECTION_ON_SEND,
  PARAMS,
  ROUTES,
  TEMPLATES,
  TITLES,
} from '../constants';
import { pageFromQuery, pagination } from '../pagination';
import { render } from '../render';

type AnnouncementValues = {
  schoolId: string;
  title: string;
  body: string;
  audience: Audience;
  selected: string[];
};

type SendContext = {
  schools: School[];
  school: School | null;
  guardians: { id: string; name: string }[];
};

export const announcementRoutes = new Hono<{ Variables: Variables }>();

announcementRoutes.use(requireRole(ROLE.registrar, ROLE.networkAdmin));

const userSchools = async (
  user: SessionUser,
  seesWholeNetwork: boolean,
): Promise<School[]> => {
  const schools = await identity.listSchools(user.networkId);
  if (seesWholeNetwork) return schools;
  const allowed = new Set(schoolsForRole(user, ROLE.registrar));
  return schools.filter((school) => allowed.has(school.id));
};

const listScope = (
  schools: readonly School[],
  requested: string,
  seesWholeNetwork: boolean,
): string | null => {
  if (requested !== '') {
    if (!schools.some((school) => school.id === requested)) {
      throw new NotFound(DIAGNOSTICS.schoolOutOfScope);
    }
    return requested;
  }
  if (seesWholeNetwork) return null;
  return schools[0]?.id ?? null;
};

const EMPTY_SUMMARY = { recipients: 0, reads: 0, rate: 0 };

announcementRoutes.get(ROUTES.announcements.list.pattern, async (c) => {
  const user = currentUser(c);
  const seesWholeNetwork = hasRole(user, ROLE.networkAdmin);
  const schools = await userSchools(user, seesWholeNetwork);
  const scope = listScope(schools, c.req.query(PARAMS.schoolId) ?? '', seesWholeNetwork);

  const outOfScope = scope === null && !seesWholeNetwork;
  const [page, summary] = await Promise.all([
    outOfScope
      ? Promise.resolve(emptyPage<ReadStatistic>())
      : communication.announcementsPage(user.networkId, scope ?? undefined, pageFromQuery(c)),
    outOfScope
      ? Promise.resolve(EMPTY_SUMMARY)
      : communication.announcementsSummary(user.networkId, scope ?? undefined),
  ]);

  return render(c, TEMPLATES.announcements.list, {
    title: TITLES.announcements.list,
    schoolField: PARAMS.schoolId,
    announcements: page.items,
    pagination: pagination(c, page),
    summary,
    schools,
    currentSchool: scope ?? '',
    seesWholeNetwork,
  });
});

const fieldText = (form: FormBody, field: string): string => {
  const value = form[field];
  return typeof value === 'string' ? value.trim() : '';
};

const fieldList = (form: FormBody, field: string): string[] => {
  const value = form[field];
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const formValues = (form: FormBody): AnnouncementValues => ({
  schoolId: fieldText(form, FIELDS.announcement.schoolId),
  title: fieldText(form, FIELDS.announcement.title),
  body: fieldText(form, FIELDS.announcement.body),
  audience:
    fieldText(form, FIELDS.announcement.audience) === AUDIENCE.selected
      ? AUDIENCE.selected
      : AUDIENCE.school,
  selected: fieldList(form, FIELDS.announcement.guardians),
});

const sendContext = async (
  user: SessionUser,
  requestedSchoolId: string,
): Promise<SendContext> => {
  const all = await userSchools(user, hasRole(user, ROLE.networkAdmin));
  const schools = all.filter((school) => school.active);
  const school = schools.find((item) => item.id === requestedSchoolId) ?? null;
  if (requestedSchoolId !== '' && school === null) {
    throw new NotFound(DIAGNOSTICS.schoolOutOfScope);
  }
  const guardians =
    school === null ? [] : await academics.schoolGuardians(user.networkId, school.id);
  return { schools, school, guardians };
};

const MESSAGE_ROWS = 10;

const sendPage = (
  c: Context,
  context: SendContext,
  values: AnnouncementValues,
  errors: ApplicationError[],
): Response =>
  render(c, TEMPLATES.announcements.new, {
    title: TITLES.announcements.new,
    schoolField: PARAMS.schoolId,
    messageRows: MESSAGE_ROWS,
    ...context,
    values,
    errors,
  });

const initialValues = (schoolId: string): AnnouncementValues => ({
  schoolId,
  title: '',
  body: '',
  audience: AUDIENCE.school,
  selected: [],
});

const NO_SELECTION: ApplicationError = {
  ...FORM_ERRORS.noSelection,
  mensagem: NO_SELECTION_ON_SEND,
};

const checkRecipients = (
  values: AnnouncementValues,
  guardians: readonly { id: string }[],
): ApplicationError | null => {
  if (values.audience === AUDIENCE.school) return null;
  if (values.selected.length === 0) return NO_SELECTION;
  const ofSchool = new Set(guardians.map((guardian) => guardian.id));
  if (values.selected.every((id) => ofSchool.has(id))) return null;
  return FORM_ERRORS.recipientOutsideSchool;
};

announcementRoutes.get(ROUTES.announcements.new.pattern, async (c) => {
  const user = currentUser(c);
  const context = await sendContext(user, c.req.query(PARAMS.schoolId) ?? '');
  return sendPage(c, context, initialValues(context.school?.id ?? ''), []);
});

announcementRoutes.post(ROUTES.announcements.new.pattern, async (c) => {
  const user = currentUser(c);
  const values = formValues(c.get(CONTEXT_VARIABLES.body));
  const context = await sendContext(user, values.schoolId);

  if (context.school === null) {
    return sendPage(c, context, values, [FORM_ERRORS.missingSchool]);
  }

  const rejection = checkRecipients(values, context.guardians);
  if (rejection !== null) return sendPage(c, context, values, [rejection]);

  const result = await communication.publishAnnouncement({
    networkId: user.networkId,
    schoolId: context.school.id,
    title: values.title,
    body: values.body,
    authorUserId: user.id,
    recipients:
      values.audience === AUDIENCE.school
        ? []
        : values.selected.map((guardianId) => ({ guardianId })),
  });
  if (!result.ok) return sendPage(c, context, values, result.erros);

  const target = new URLSearchParams({
    [PARAMS.schoolId]: context.school.id,
    [PARAMS.ok]: NOTICES.announcementPublished,
  });
  return c.redirect(`${ROUTES.announcements.list()}?${target.toString()}`, 303);
});
