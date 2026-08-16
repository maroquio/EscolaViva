import { Hono, type Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { ACADEMIC_LIMITS, academics, type ClassGroup } from '../../academics';
import {
  IDENTITY_LIMITS,
  IDENTITY_VOCABULARY,
  ROLE,
  ROLES,
  identity,
  type Role,
} from '../../identity';
import { config } from '../../shared/config';
import { CONTEXT_VARIABLES, MASKED_CPF_LENGTH } from '../../shared/constants';
import {
  currentNetwork,
  isUuid,
  requireRole,
  type FormBody,
  type Variables,
} from '../../shared/http';
import { logger } from '../../shared/log';
import {
  FIELDS,
  FORM_ERRORS,
  FOUR_DIGIT_YEAR,
  ID_SUFFIXES,
  INITIAL_VALUES,
  INVITE_COOKIE,
  LOG_EVENTS,
  MISSING_VALUE,
  NOTICES,
  NOTICE_CODES,
  PARAMS,
  ROLE_ASSIGNMENT_ROWS,
  ROUTES,
  TEMPLATES,
  TITLES,
} from '../constants';
import { pageFromQuery, pagination } from '../pagination';
import { render, type TemplateData } from '../render';

const MESSAGES: Record<string, string> = {
  [NOTICE_CODES.schoolCreated]: NOTICES.schoolCreated,
  [NOTICE_CODES.userInvited]: NOTICES.userInvited,
  [NOTICE_CODES.yearDefined]: NOTICES.yearDefined,
};

const ROLE_OPTIONS: readonly { value: Role; label: string }[] = ROLES.map((value) => ({
  value,
  label: IDENTITY_VOCABULARY.role[value],
}));

const PARTIALS = { partials: TEMPLATES.partials };
const SUFFIXES = { suffixes: ID_SUFFIXES };

export const networkRoutes = new Hono<{ Variables: Variables }>();

networkRoutes.use(requireRole(ROLE.networkAdmin));

const text = (body: FormBody, field: string): string => {
  const value = body[field];
  return typeof value === 'string' ? value.trim() : '';
};

const list = (body: FormBody, field: string): string[] => {
  const value = body[field];
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' ? item.trim() : ''));
  return typeof value === 'string' ? [value.trim()] : [];
};

const queryMessage = (c: Context): string | undefined =>
  MESSAGES[c.req.query(PARAMS.ok) ?? ''];

type NetworkCounts = { schools: number; users: number; classGroups: number; enrolled: number };

const countNetwork = async (
  networkId: string,
  academicYearId: string | null,
): Promise<NetworkCounts> => {
  const [{ schools, users }, classGroups] = await Promise.all([
    identity.countSchoolsAndUsers(networkId),
    academicYearId === null
      ? Promise.resolve<ClassGroup[]>([])
      : academics.listClassGroups(networkId, { academicYearId }),
  ]);
  const enrollments = await Promise.all(
    classGroups.map((classGroup) =>
      academics.activeEnrollmentsOfClassGroup(networkId, classGroup.id),
    ),
  );
  return {
    schools,
    users,
    classGroups: classGroups.length,
    enrolled: enrollments.reduce((total, ofClassGroup) => total + ofClassGroup.length, 0),
  };
};

networkRoutes.get(ROUTES.network.dashboard.pattern, async (c) => {
  const networkId = currentNetwork(c);
  const years = await academics.listAcademicYears(networkId);
  const academicYear = years[0] ?? null;
  const counts = await countNetwork(networkId, academicYear === null ? null : academicYear.id);
  return render(c, TEMPLATES.network.dashboard, {
    ...PARTIALS,
    title: TITLES.network.dashboard,
    counts,
    academicYear,
    definedYears: years.length,
  });
});

const schoolsScreen = async (c: Context, data: TemplateData = {}): Promise<Response> => {
  const page = await identity.schoolsPage(currentNetwork(c), pageFromQuery(c));
  return render(c, TEMPLATES.network.schools, {
    ...PARTIALS,
    title: TITLES.network.schools,
    statusLabel: IDENTITY_VOCABULARY.schoolActive,
    missing: MISSING_VALUE,
    schools: page.items,
    pagination: pagination(c, page),
    ...data,
  });
};

const schoolForm = (c: Context, data: TemplateData = {}): Response =>
  render(c, TEMPLATES.network.schoolNew, {
    ...SUFFIXES,
    title: TITLES.network.schoolNew,
    values: INITIAL_VALUES.school,
    nameLimit: IDENTITY_LIMITS.school.name,
    inepCodeLimit: IDENTITY_LIMITS.school.inepCode,
    errors: [],
    ...data,
  });

networkRoutes.get(ROUTES.network.schools.pattern, (c) =>
  schoolsScreen(c, { message: queryMessage(c) }),
);

networkRoutes.get(ROUTES.network.schoolNew.pattern, (c) => schoolForm(c));

networkRoutes.post(ROUTES.network.schools.pattern, async (c) => {
  const networkId = currentNetwork(c);
  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    name: text(body, FIELDS.school.name),
    inepCode: text(body, FIELDS.school.inepCode),
  };

  const result = await identity.createSchool({
    networkId,
    name: values.name,
    inepCode: values.inepCode,
  });
  if (!result.ok) return schoolForm(c, { values, errors: result.erros });

  logger.info({ network_id: networkId, school_id: result.valor.id }, LOG_EVENTS.schoolCreated);
  return c.redirect(
    `${ROUTES.network.schools()}?${PARAMS.ok}=${NOTICE_CODES.schoolCreated}`,
    303,
  );
});

const storeInvite = (c: Context, userId: string, password: string): Promise<void> =>
  setSignedCookie(
    c,
    INVITE_COOKIE.name,
    `${userId}${INVITE_COOKIE.separator}${password}`,
    config.sessionSecret,
    {
      path: ROUTES.network.users(),
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: INVITE_COOKIE.sameSite,
      maxAge: INVITE_COOKIE.maxAgeInSeconds,
    },
  );

const takeInvite = async (
  c: Context,
): Promise<{ userId: string; password: string } | null> => {
  const value = await getSignedCookie(c, config.sessionSecret, INVITE_COOKIE.name);
  if (typeof value !== 'string') return null;
  deleteCookie(c, INVITE_COOKIE.name, {
    path: ROUTES.network.users(),
    secure: config.secureCookie,
  });
  const cut = value.indexOf(INVITE_COOKIE.separator);
  if (cut <= 0) return null;
  return { userId: value.slice(0, cut), password: value.slice(cut + 1) };
};

type RoleAssignmentRow = { schoolId: string; role: string };

const isRole = (value: string): value is Role =>
  ROLE_OPTIONS.some((option) => option.value === value);

const formRows = (body: FormBody): RoleAssignmentRow[] => {
  const schools = list(body, FIELDS.user.schools);
  const roles = list(body, FIELDS.user.roles);
  const total = Math.max(schools.length, roles.length, ROLE_ASSIGNMENT_ROWS);
  return Array.from({ length: total }, (_, index) => ({
    schoolId: schools[index] ?? '',
    role: roles[index] ?? '',
  }));
};

const emptyRows = (): RoleAssignmentRow[] =>
  Array.from({ length: ROLE_ASSIGNMENT_ROWS }, () => ({ schoolId: '', role: '' }));

const usersScreen = async (c: Context, data: TemplateData = {}): Promise<Response> => {
  const page = await identity.usersPage(currentNetwork(c), pageFromQuery(c));
  return render(c, TEMPLATES.network.users, {
    ...PARTIALS,
    title: TITLES.network.users,
    statusLabel: IDENTITY_VOCABULARY.active,
    noRole: IDENTITY_VOCABULARY.noRole,
    users: page.items,
    pagination: pagination(c, page),
    roles: ROLE_OPTIONS,
    invite: null,
    ...data,
  });
};

const userForm = async (c: Context, data: TemplateData = {}): Promise<Response> => {
  const networkId = currentNetwork(c);
  const [schools, guardians] = await Promise.all([
    identity.listSchools(networkId),
    academics.listGuardians(networkId),
  ]);
  return render(c, TEMPLATES.network.userNew, {
    ...SUFFIXES,
    title: TITLES.network.userNew,
    schools,
    guardians,
    roles: ROLE_OPTIONS,
    values: INITIAL_VALUES.user,
    nameLimit: IDENTITY_LIMITS.user.name,
    cpfLength: MASKED_CPF_LENGTH,
    rows: emptyRows(),
    errors: [],
    ...data,
  });
};

networkRoutes.get(ROUTES.network.users.pattern, async (c) => {
  const invite = await takeInvite(c);
  return await usersScreen(c, { invite, message: queryMessage(c) });
});

networkRoutes.get(ROUTES.network.userNew.pattern, (c) => userForm(c));

networkRoutes.post(ROUTES.network.users.pattern, async (c) => {
  const networkId = currentNetwork(c);
  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    name: text(body, FIELDS.user.name),
    email: text(body, FIELDS.user.email),
    cpf: text(body, FIELDS.user.cpf),
    guardianId: text(body, FIELDS.user.guardianId),
  };
  const rows = formRows(body);

  const filled = rows.filter((row) => row.schoolId !== '' || row.role !== '');
  const roleAssignments = filled.flatMap((row) =>
    row.schoolId !== '' && isRole(row.role) ? [{ schoolId: row.schoolId, role: row.role }] : [],
  );
  if (roleAssignments.length !== filled.length) {
    return await userForm(c, {
      values,
      rows,
      errors: [FORM_ERRORS.incompleteRoleAssignment],
    });
  }

  const registered =
    values.guardianId === '' || !isUuid(values.guardianId)
      ? null
      : await academics.guardianById(networkId, values.guardianId);

  const result = await identity.inviteUser({
    networkId,
    name: values.name,
    email: values.email,
    cpf: values.cpf,
    registeredCpf: registered?.cpf ?? null,
    ...(registered === null ? {} : { registeredName: registered.name }),
    roleAssignments,
    guardianId: values.guardianId === '' ? null : values.guardianId,
  });
  if (!result.ok) return await userForm(c, { values, rows, errors: result.erros });

  logger.info(
    {
      network_id: networkId,
      user_id: result.valor.userId,
      role_assignments: roleAssignments.length,
    },
    LOG_EVENTS.userInvited,
  );
  await storeInvite(c, result.valor.userId, result.valor.temporaryPassword);
  return c.redirect(
    `${ROUTES.network.users()}?${PARAMS.ok}=${NOTICE_CODES.userInvited}`,
    303,
  );
});

const yearsScreen = async (c: Context, data: TemplateData = {}): Promise<Response> => {
  const page = await academics.academicYearsPage(currentNetwork(c), pageFromQuery(c));
  return render(c, TEMPLATES.network.years, {
    ...PARTIALS,
    title: TITLES.network.years,
    years: page.items,
    pagination: pagination(c, page),
    ...data,
  });
};

const yearForm = (c: Context, data: TemplateData = {}): Response =>
  render(c, TEMPLATES.network.yearNew, {
    ...SUFFIXES,
    title: TITLES.network.yearNew,
    values: INITIAL_VALUES.academicYear,
    minYear: ACADEMIC_LIMITS.academicYear.minYear,
    maxYear: ACADEMIC_LIMITS.academicYear.maxYear,
    errors: [],
    ...data,
  });

networkRoutes.get(ROUTES.network.academicYears.pattern, (c) =>
  yearsScreen(c, { message: queryMessage(c) }),
);

networkRoutes.get(ROUTES.network.academicYearNew.pattern, (c) => yearForm(c));

networkRoutes.post(ROUTES.network.academicYears.pattern, async (c) => {
  const networkId = currentNetwork(c);
  const body = c.get(CONTEXT_VARIABLES.body);
  const values = {
    year: text(body, FIELDS.academicYear.year),
    startDate: text(body, FIELDS.academicYear.startDate),
    endDate: text(body, FIELDS.academicYear.endDate),
  };

  if (!FOUR_DIGIT_YEAR.test(values.year)) {
    return yearForm(c, { values, errors: [FORM_ERRORS.invalidYear] });
  }

  const result = await academics.defineAcademicYear({
    networkId,
    year: Number(values.year),
    startDate: values.startDate,
    endDate: values.endDate,
  });
  if (!result.ok) return yearForm(c, { values, errors: result.erros });

  logger.info(
    { network_id: networkId, academic_year_id: result.valor.id },
    LOG_EVENTS.academicYearDefined,
  );
  return c.redirect(
    `${ROUTES.network.academicYears()}?${PARAMS.ok}=${NOTICE_CODES.yearDefined}`,
    303,
  );
});
