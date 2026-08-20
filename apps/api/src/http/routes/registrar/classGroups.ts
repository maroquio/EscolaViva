import { Hono } from 'hono';
import { academics, type AcademicYear } from '../../../academics';
import { ROLE, identity } from '../../../identity';
import { CONTEXT_VARIABLES, STATUS } from '../../../shared/constants';
import {
  NotFound,
  currentNetwork,
  errorBody,
  requireRole,
  type Variables,
} from '../../../shared/http';
import {
  RECORD_OUT_OF_SCOPE,
  classGroupInScope,
  idsOf,
  namesOf,
  registrarSchools,
  type RegistrarContext,
} from '../../registrarScope';
import { PARAMS, REGISTRAR_ROUTES } from '../../constants';
import { REGISTRAR_PREFIX } from './constants';
import { pageFromQuery } from '../../pagination';
import type { ClassGroupRecord } from '@escolaviva/contracts/classGroups';
import {
  assignmentAsJson,
  classGroupAsJson,
  classGroupEnrollmentAsJson,
  subjectAsJson,
} from '../../presenters/classGroups';
import { pageAsJson } from '../../presenters/page';
import { created } from '../../response';
import { assignmentSchema, classGroupSchema, subjectSchema } from '../../schemas/classGroups';
import { parse } from '../../schemas/parse';

const ROUTE_PARAMS = { id: 'id' } as const;

const CLASS_GROUPS_LOCATION = `${REGISTRAR_PREFIX}${REGISTRAR_ROUTES.classGroups}`;
const SUBJECTS_LOCATION = `${REGISTRAR_PREFIX}${REGISTRAR_ROUTES.subjects}`;

const classGroupLocation = (classGroupId: string): string =>
  `${CLASS_GROUPS_LOCATION}/${classGroupId}`;

const outOfScope = (): NotFound => new NotFound(RECORD_OUT_OF_SCOPE);

const inScopeOrNull = (value: string | undefined, allowed: readonly string[]): string | null =>
  value !== undefined && allowed.includes(value) ? value : null;

const yearsOf = (academicYears: readonly AcademicYear[]): ReadonlyMap<string, number> =>
  new Map(academicYears.map((academicYear) => [academicYear.id, academicYear.year]));

const chosenAndOutOfScope = (c: RegistrarContext, schoolId: string): boolean =>
  schoolId !== '' && !registrarSchools(c).some(({ id }) => id === schoolId);

export const classGroupRoutes = new Hono<{ Variables: Variables }>();

classGroupRoutes.use(requireRole(ROLE.registrar));

classGroupRoutes.get(REGISTRAR_ROUTES.classGroups, async (c) => {
  const networkId = currentNetwork(c);
  const schools = registrarSchools(c);
  const academicYears = await academics.listAcademicYears(networkId);

  const schoolId = inScopeOrNull(c.req.query(PARAMS.school), idsOf(schools));
  const academicYearId = inScopeOrNull(
    c.req.query(PARAMS.year),
    academicYears.map(({ id }) => id),
  );
  const target = schoolId === null ? schools : schools.filter(({ id }) => id === schoolId);

  const page = await academics.classGroupsPage(
    networkId,
    {
      schoolIds: idsOf(target),
      ...(academicYearId === null ? {} : { academicYearId }),
    },
    pageFromQuery(c),
  );

  const schoolNames = namesOf(schools);
  const years = yearsOf(academicYears);
  return c.json(
    pageAsJson(page, (classGroup) => classGroupAsJson(classGroup, schoolNames, years)),
  );
});

classGroupRoutes.post(REGISTRAR_ROUTES.classGroups, async (c) => {
  const input = parse(classGroupSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  if (chosenAndOutOfScope(c, input.value.schoolId)) throw outOfScope();

  const result = await academics.registerClassGroup({
    networkId: currentNetwork(c),
    ...input.value,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  return created(c, classGroupLocation(result.value.id), { id: result.value.id });
});

classGroupRoutes.get(REGISTRAR_ROUTES.classGroup, async (c) => {
  const networkId = currentNetwork(c);
  const classGroup = await classGroupInScope(c, c.req.param(ROUTE_PARAMS.id));
  if (classGroup === null) throw outOfScope();

  const [assignments, enrollments, academicYears] = await Promise.all([
    academics.classGroupSubjectsPage(
      networkId,
      classGroup.id,
      pageFromQuery(c, PARAMS.subjectsPage),
    ),
    academics.activeEnrollmentsOfClassGroupPage(
      networkId,
      classGroup.id,
      pageFromQuery(c, PARAMS.enrollmentsPage),
    ),
    academics.listAcademicYears(networkId),
  ]);

  const teacherNames = await identity.userNames(
    networkId,
    assignments.items.map((assignment) => assignment.teacherUserId),
  );

  const record: ClassGroupRecord = {
    classGroup: classGroupAsJson(classGroup, namesOf(registrarSchools(c)), yearsOf(academicYears)),
    assignments: pageAsJson(assignments, (assignment) =>
      assignmentAsJson(assignment, teacherNames),
    ),
    enrollments: pageAsJson(enrollments, classGroupEnrollmentAsJson),
  };
  return c.json(record);
});

classGroupRoutes.post(REGISTRAR_ROUTES.classGroupSubjects, async (c) => {
  const classGroup = await classGroupInScope(c, c.req.param(ROUTE_PARAMS.id));
  if (classGroup === null) throw outOfScope();

  const input = parse(assignmentSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const result = await academics.assignTeacher({
    networkId: currentNetwork(c),
    classGroupId: classGroup.id,
    ...input.value,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  return created(c, classGroupLocation(classGroup.id), { id: result.value.id });
});

classGroupRoutes.get(REGISTRAR_ROUTES.subjects, async (c) => {
  const page = await academics.subjectsPage(currentNetwork(c), pageFromQuery(c));
  return c.json(pageAsJson(page, subjectAsJson));
});

classGroupRoutes.post(REGISTRAR_ROUTES.subjects, async (c) => {
  const input = parse(subjectSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const result = await academics.registerSubject({
    networkId: currentNetwork(c),
    ...input.value,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  return created(c, SUBJECTS_LOCATION, { id: result.value.id });
});
