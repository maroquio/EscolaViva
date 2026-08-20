import { Hono, type Context } from 'hono';
import { academics } from '../../academics';
import { ROLE, identity } from '../../identity';
import {
  NotFound,
  currentNetwork,
  currentUser,
  hasRole,
  requireLogin,
  requireRole,
  type Variables,
} from '../../shared/http';
import { namesOf, registrarSchools } from '../registrarScope';
import { OPTIONS_ROUTES, PARAMS } from '../constants';
import { DIAGNOSTICS } from './constants';
import {
  academicYearOptionAsJson,
  classGroupOptionAsJson,
  guardianOptionAsJson,
  schoolOptionAsJson,
  subjectOptionAsJson,
  teacherOptionAsJson,
} from '../presenters/options';

export const optionsRoutes = new Hono<{ Variables: Variables }>();

const schoolIdsInSession = (c: Context): ReadonlySet<string> =>
  new Set(currentUser(c).roles.map((assignment) => assignment.schoolId));

const schoolNamesAsRegistrar = (c: Context): ReadonlyMap<string, string> =>
  namesOf(registrarSchools(c));

optionsRoutes.use(requireLogin());

optionsRoutes.get(OPTIONS_ROUTES.schools, async (c) => {
  const schools = await identity.listSchools(currentNetwork(c));
  if (hasRole(currentUser(c), ROLE.networkAdmin)) return c.json(schools.map(schoolOptionAsJson));

  const reachable = schoolIdsInSession(c);
  return c.json(schools.filter((school) => reachable.has(school.id)).map(schoolOptionAsJson));
});

optionsRoutes.get(
  OPTIONS_ROUTES.academicYears,
  requireRole(ROLE.networkAdmin, ROLE.registrar),
  async (c) => {
    const academicYears = await academics.listAcademicYears(currentNetwork(c));
    return c.json(academicYears.map(academicYearOptionAsJson));
  },
);

optionsRoutes.get(
  OPTIONS_ROUTES.guardians,
  requireRole(ROLE.networkAdmin, ROLE.registrar),
  async (c) => {
    const guardians = await identity.listUsers(currentNetwork(c), ROLE.guardian);
    return c.json(guardians.map(guardianOptionAsJson));
  },
);

optionsRoutes.get(OPTIONS_ROUTES.classGroups, requireRole(ROLE.registrar), async (c) => {
  const networkId = currentNetwork(c);
  const nameBySchoolId = schoolNamesAsRegistrar(c);
  const [classGroups, academicYears] = await Promise.all([
    academics.listClassGroups(networkId, { schoolIds: [...nameBySchoolId.keys()] }),
    academics.listAcademicYears(networkId),
  ]);
  const yearByAcademicYearId = new Map(
    academicYears.map((academicYear) => [academicYear.id, academicYear.year]),
  );

  return c.json(classGroups.map(classGroupOptionAsJson(yearByAcademicYearId, nameBySchoolId)));
});

optionsRoutes.get(OPTIONS_ROUTES.subjects, requireRole(ROLE.registrar), async (c) => {
  const subjects = await academics.listSubjects(currentNetwork(c));
  return c.json(subjects.map(subjectOptionAsJson));
});

optionsRoutes.get(OPTIONS_ROUTES.teachers, requireRole(ROLE.registrar), async (c) => {
  const schoolId = c.req.query(PARAMS.schoolId);
  if (schoolId === undefined || !schoolNamesAsRegistrar(c).has(schoolId)) {
    throw new NotFound(DIAGNOSTICS.schoolOutOfScope);
  }

  const teachers = await identity.schoolTeachers(currentNetwork(c), schoolId);
  return c.json(teachers.map(teacherOptionAsJson));
});
