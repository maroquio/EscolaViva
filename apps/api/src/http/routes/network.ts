import { Hono } from 'hono';
import { academics } from '../../academics';
import { ROLE, ROLES, identity, type Role } from '../../identity';
import { CONTEXT_VARIABLES, STATUS } from '../../shared/constants';
import { currentNetwork, errorBody, requireRole, type Variables } from '../../shared/http';
import { logger } from '../../shared/log';
import { API, API_ROUTES, NETWORK_ROUTES } from '../constants';
import { FORM_ERRORS, LOG_EVENTS } from './constants';
import { pageFromQuery } from '../pagination';
import type {
  AcceptedInvitation,
  CreatedResource,
  NetworkCounts,
  NetworkDashboard,
} from '@escolaviva/contracts/network';
import { academicYearAsJson, networkUserAsJson, schoolAsJson } from '../presenters/network';
import { pageAsJson } from '../presenters/page';
import { created } from '../response';
import { academicYearSchema, schoolSchema, userSchema } from '../schemas/network';
import { parse } from '../schemas/parse';

export const networkRoutes = new Hono<{ Variables: Variables }>();

const EMPTY = '';

const locationOf = (route: string): string =>
  `${API.versionedPrefix}${API_ROUTES.network}${route}`;

networkRoutes.use(requireRole(ROLE.networkAdmin));

const NOTHING_DEFINED = 0;

const countNetwork = async (
  networkId: string,
  academicYearId: string | null,
): Promise<NetworkCounts> => {
  const [{ schools, users }, classGroups, enrolled] = await Promise.all([
    identity.countSchoolsAndUsers(networkId),
    academicYearId === null
      ? Promise.resolve(NOTHING_DEFINED)
      : academics.countClassGroups(networkId, { academicYearId }),
    academicYearId === null
      ? Promise.resolve(NOTHING_DEFINED)
      : academics.countActiveEnrollmentsOfYear(networkId, academicYearId),
  ]);
  return { schools, users, classGroups, enrolled };
};

networkRoutes.get(NETWORK_ROUTES.dashboard, async (c) => {
  const networkId = currentNetwork(c);
  const years = await academics.listAcademicYears(networkId);
  const academicYear = years[0] ?? null;
  const counts = await countNetwork(networkId, academicYear === null ? null : academicYear.id);

  const dashboard: NetworkDashboard = {
    counts,
    academicYear: academicYear === null ? null : academicYearAsJson(academicYear),
    definedYears: years.length,
  };
  return c.json(dashboard);
});

networkRoutes.get(NETWORK_ROUTES.schools, async (c) => {
  const page = await identity.schoolsPage(currentNetwork(c), pageFromQuery(c));
  return c.json(pageAsJson(page, schoolAsJson));
});

networkRoutes.post(NETWORK_ROUTES.schools, async (c) => {
  const networkId = currentNetwork(c);

  const input = parse(schoolSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const result = await identity.createSchool({
    networkId,
    name: input.value.name,
    inepCode: input.value.inepCode ?? null,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  logger.info({ network_id: networkId, school_id: result.value.id }, LOG_EVENTS.schoolCreated);
  const body: CreatedResource = { id: result.value.id };
  return created(c, locationOf(NETWORK_ROUTES.schools), body);
});

networkRoutes.get(NETWORK_ROUTES.users, async (c) => {
  const page = await identity.usersPage(currentNetwork(c), pageFromQuery(c));
  return c.json(pageAsJson(page, networkUserAsJson));
});

type TypedRoleAssignment = { schoolId: string; role: Role };

type RequestedRoleAssignment = { schoolId: string; role: string };

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

const isMentioned = (assignment: RequestedRoleAssignment): boolean =>
  assignment.schoolId !== EMPTY || assignment.role !== EMPTY;

const asTyped = (assignment: RequestedRoleAssignment): TypedRoleAssignment[] =>
  assignment.schoolId !== EMPTY && isRole(assignment.role)
    ? [{ schoolId: assignment.schoolId, role: assignment.role }]
    : [];

networkRoutes.post(NETWORK_ROUTES.users, async (c) => {
  const networkId = currentNetwork(c);

  const input = parse(userSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const { name, email, cpf, phone, roleAssignments } = input.value;
  const mentioned = roleAssignments.filter(isMentioned);
  const typed = mentioned.flatMap(asTyped);
  if (typed.length !== mentioned.length) {
    return c.json(errorBody([FORM_ERRORS.incompleteRoleAssignment]), STATUS.refused);
  }

  const result = await identity.inviteUser({
    networkId,
    name,
    email,
    cpf,
    phone: phone ?? null,
    roleAssignments: typed,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  logger.info(
    { network_id: networkId, user_id: result.value.userId, role_assignments: typed.length },
    LOG_EVENTS.userInvited,
  );
  const body: AcceptedInvitation = {
    userId: result.value.userId,
    temporaryPassword: result.value.temporaryPassword,
  };
  return created(c, locationOf(NETWORK_ROUTES.users), body);
});

networkRoutes.get(NETWORK_ROUTES.academicYears, async (c) => {
  const page = await academics.academicYearsPage(currentNetwork(c), pageFromQuery(c));
  return c.json(pageAsJson(page, academicYearAsJson));
});

networkRoutes.post(NETWORK_ROUTES.academicYears, async (c) => {
  const networkId = currentNetwork(c);

  const input = parse(academicYearSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const { year, startDate, endDate } = input.value;
  const result = await academics.defineAcademicYear({ networkId, year, startDate, endDate });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  logger.info(
    { network_id: networkId, academic_year_id: result.value.id },
    LOG_EVENTS.academicYearDefined,
  );
  const body: CreatedResource = { id: result.value.id };
  return created(c, locationOf(NETWORK_ROUTES.academicYears), body);
});
