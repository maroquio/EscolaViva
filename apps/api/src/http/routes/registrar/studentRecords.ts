import { Hono } from 'hono';
import { academics, type GuardianLink, type Student } from '../../../academics';
import { identity } from '../../../identity';
import { CONTEXT_VARIABLES, LOCALE, MISSING_VALUE, STATUS } from '../../../shared/constants';
import {
  NotFound,
  currentNetwork,
  errorBody,
  isUuid,
  type Variables,
} from '../../../shared/http';
import {
  RECORD_OUT_OF_SCOPE,
  idsOf,
  registrarSchools,
  type RegistrarContext,
} from '../../registrarScope';
import { sliceItems } from '../../../shared/pagination';
import { PARAMS, REGISTRAR_ROUTES } from '../../constants';
import { REGISTRAR_PREFIX } from './constants';
import { pageFromQuery } from '../../pagination';
import type { CreatedRecord, StudentRecord } from '@escolaviva/contracts/students';
import { pageAsJson } from '../../presenters/page';
import {
  enrollmentAsJson,
  guardianLinkAsJson,
  studentAsJson,
  studentInListAsJson,
  type GuardianLinkRow,
} from '../../presenters/students';
import { created } from '../../response';
import { parse } from '../../schemas/parse';
import { studentSchema } from '../../schemas/students';

const ROUTE_PARAMS = { id: 'id' } as const;

export const studentLocation = (id: string): string =>
  `${REGISTRAR_PREFIX}${REGISTRAR_ROUTES.students}/${id}`;

const withContacts = async (
  networkId: string,
  links: readonly GuardianLink[],
): Promise<GuardianLinkRow[]> => {
  const contacts = await identity.userContacts(
    networkId,
    links.map((link) => link.userId),
  );
  return links
    .map((link) => {
      const contact = contacts.get(link.userId);
      return {
        ...link,
        name: contact?.name ?? MISSING_VALUE,
        email: contact?.email ?? MISSING_VALUE,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, LOCALE));
};

const studentRecord = async (
  c: RegistrarContext,
  studentId: string,
): Promise<StudentRecord | null> => {
  if (!isUuid(studentId)) return null;
  const networkId = currentNetwork(c);
  const schoolIds = idsOf(registrarSchools(c));

  const [student, links, history, active, hasEnrollment] = await Promise.all([
    academics.studentById(networkId, studentId),
    academics.studentGuardians(networkId, studentId),
    academics.studentEnrollmentsPage(
      networkId,
      studentId,
      schoolIds,
      pageFromQuery(c, PARAMS.enrollmentsPage),
    ),
    academics.activeEnrollmentsOfStudents(networkId, [studentId], schoolIds),
    academics.studentHasEnrollment(networkId, studentId),
  ]);
  if (student === null) return null;
  if (hasEnrollment && history.total === 0) return null;

  const guardians = sliceItems(
    await withContacts(networkId, links),
    pageFromQuery(c, PARAMS.guardiansPage),
  );
  const current = active[0];

  return {
    student: studentAsJson(student),
    guardians: pageAsJson(guardians, guardianLinkAsJson),
    enrollments: pageAsJson(history, enrollmentAsJson),
    active: current === undefined ? null : enrollmentAsJson(current),
  };
};

export const studentRecordRoutes = new Hono<{ Variables: Variables }>();

studentRecordRoutes.get(REGISTRAR_ROUTES.students, async (c) => {
  const networkId = currentNetwork(c);
  const term = (c.req.query(PARAMS.search) ?? '').trim();
  const page =
    term === ''
      ? sliceItems<Student>([], 1)
      : await academics.studentsPage(networkId, term, pageFromQuery(c));

  const active = await academics.activeEnrollmentsOfStudents(
    networkId,
    page.items.map((student) => student.id),
    idsOf(registrarSchools(c)),
  );
  const activeByStudent = new Map(active.map((enrollment) => [enrollment.studentId, enrollment]));

  return c.json(
    pageAsJson(page, (student) =>
      studentInListAsJson(student, activeByStudent.get(student.id) ?? null),
    ),
  );
});

studentRecordRoutes.post(REGISTRAR_ROUTES.students, async (c) => {
  const input = parse(studentSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const result = await academics.registerStudent({
    networkId: currentNetwork(c),
    name: input.value.name,
    birthDate: input.value.birthDate,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  const body: CreatedRecord = { id: result.value.id };
  return created(c, studentLocation(result.value.id), body);
});

studentRecordRoutes.get(REGISTRAR_ROUTES.student, async (c) => {
  const record = await studentRecord(c, c.req.param(ROUTE_PARAMS.id));
  if (record === null) throw new NotFound(RECORD_OUT_OF_SCOPE);
  return c.json(record);
});
