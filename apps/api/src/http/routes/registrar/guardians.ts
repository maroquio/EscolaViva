import { Hono } from 'hono';
import { academics } from '../../../academics';
import { ROLE, identity } from '../../../identity';
import { CONTEXT_VARIABLES, STATUS } from '../../../shared/constants';
import { currentNetwork, errorBody, type Variables } from '../../../shared/http';
import { registrarSchools } from '../../registrarScope';
import { DEFAULT_PAGE_SIZE } from '../../../shared/pagination';
import { REGISTRAR_ROUTES } from '../../constants';
import { REGISTRAR_PREFIX } from './constants';
import { FORM_ERRORS } from '../constants';
import { pageFromQuery } from '../../pagination';
import type { InvitedGuardian, LinkedGuardian } from '@escolaviva/contracts/students';
import { pageAsJson } from '../../presenters/page';
import { guardianAsJson, guardianOptionAsJson } from '../../presenters/students';
import { created } from '../../response';
import { parse } from '../../schemas/parse';
import { guardianLinkSchema, guardianSchema } from '../../schemas/students';
import { studentLocation } from './studentRecords';
import { studentInScopeOrFail } from './studentScope';

const ROUTE_PARAMS = { id: 'id' } as const;

const GUARDIANS_LOCATION = `${REGISTRAR_PREFIX}${REGISTRAR_ROUTES.guardians}`;

export const registrarGuardianRoutes = new Hono<{ Variables: Variables }>();

registrarGuardianRoutes.get(REGISTRAR_ROUTES.studentAvailableGuardians, async (c) => {
  const student = await studentInScopeOrFail(c, c.req.param(ROUTE_PARAMS.id));
  const networkId = currentNetwork(c);

  const [guardians, linked] = await Promise.all([
    identity.listUsers(networkId, ROLE.guardian),
    academics.studentGuardians(networkId, student.id),
  ]);
  const alreadyLinked = new Set(linked.map((link) => link.userId));

  return c.json(
    guardians
      .filter((person) => !alreadyLinked.has(person.id))
      .map((person) => guardianOptionAsJson(person)),
  );
});

registrarGuardianRoutes.post(REGISTRAR_ROUTES.studentGuardians, async (c) => {
  const student = await studentInScopeOrFail(c, c.req.param(ROUTE_PARAMS.id));

  const input = parse(guardianLinkSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const result = await academics.linkGuardian({
    networkId: currentNetwork(c),
    studentId: student.id,
    userId: input.value.userId,
    relationship: input.value.relationship,
    financiallyResponsible: input.value.financiallyResponsible,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  const body: LinkedGuardian = { studentId: student.id, userId: input.value.userId };
  return created(c, studentLocation(student.id), body);
});

registrarGuardianRoutes.get(REGISTRAR_ROUTES.guardians, async (c) => {
  const page = await identity.usersPage(
    currentNetwork(c),
    pageFromQuery(c),
    DEFAULT_PAGE_SIZE,
    ROLE.guardian,
  );
  return c.json(pageAsJson(page, guardianAsJson));
});

registrarGuardianRoutes.post(REGISTRAR_ROUTES.guardians, async (c) => {
  const input = parse(guardianSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const schools = registrarSchools(c);
  const asked = input.value.schoolId ?? '';
  const onlySchool = schools.length === 1 ? schools[0]?.id ?? '' : '';
  const schoolId = asked === '' ? onlySchool : asked;
  if (!schools.some(({ id }) => id === schoolId)) {
    return c.json(errorBody([FORM_ERRORS.guardianSchoolRequired]), STATUS.refused);
  }

  const result = await identity.inviteUser({
    networkId: currentNetwork(c),
    name: input.value.name,
    email: input.value.email,
    phone: input.value.phone ?? '',
    cpf: input.value.cpf,
    roleAssignments: [{ schoolId, role: ROLE.guardian }],
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  const body: InvitedGuardian = {
    id: result.value.userId,
    temporaryPassword: result.value.temporaryPassword,
  };
  return created(c, GUARDIANS_LOCATION, body);
});
