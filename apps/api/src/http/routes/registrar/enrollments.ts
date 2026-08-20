import { Hono } from 'hono';
import { academics, type Enrollment, type Student } from '../../../academics';
import { CONTEXT_VARIABLES, MISSING_VALUE, STATUS } from '../../../shared/constants';
import {
  NotFound,
  currentNetwork,
  errorBody,
  isUuid,
  type Variables,
} from '../../../shared/http';
import {
  RECORD_OUT_OF_SCOPE,
  classGroupInScope,
  idsOf,
  registrarSchools,
  type RegistrarContext,
} from '../../registrarScope';
import { REGISTRAR_ROUTES } from '../../constants';
import type {
  ClassGroupInTransfer,
  CreatedRecord,
  TransferView,
} from '@escolaviva/contracts/students';
import {
  classGroupInTransferAsJson,
  enrollmentAsJson,
  studentAsJson,
} from '../../presenters/students';
import { created } from '../../response';
import { parse } from '../../schemas/parse';
import { enrollmentSchema, transferSchema } from '../../schemas/students';
import { studentLocation } from './studentRecords';
import { studentInScope, studentInScopeOrFail } from './studentScope';

const ROUTE_PARAMS = { id: 'id' } as const;

const transferInScope = async (
  c: RegistrarContext,
  enrollmentId: string,
): Promise<{ enrollment: Enrollment; student: Student } | null> => {
  if (!isUuid(enrollmentId)) return null;
  const enrollment = await academics.enrollmentById(currentNetwork(c), enrollmentId);
  if (enrollment === null) return null;
  if (!registrarSchools(c).some(({ id }) => id === enrollment.schoolId)) return null;
  const student = await studentInScope(c, enrollment.studentId);
  return student === null ? null : { enrollment, student };
};

const classGroupOptions = async (c: RegistrarContext): Promise<ClassGroupInTransfer[]> => {
  const networkId = currentNetwork(c);
  const schools = registrarSchools(c);
  const [classGroups, academicYears] = await Promise.all([
    academics.listClassGroups(networkId, { schoolIds: idsOf(schools) }),
    academics.listAcademicYears(networkId),
  ]);
  const yearById = new Map(
    academicYears.map((academicYear) => [academicYear.id, academicYear.year]),
  );
  const schoolNameById = new Map(schools.map(({ id, name }) => [id, name]));

  return classGroups.map((classGroup) =>
    classGroupInTransferAsJson(
      classGroup,
      schoolNameById.get(classGroup.schoolId) ?? MISSING_VALUE,
      yearById.get(classGroup.academicYearId) ?? null,
    ),
  );
};

export const enrollmentRoutes = new Hono<{ Variables: Variables }>();

enrollmentRoutes.post(REGISTRAR_ROUTES.enrollments, async (c) => {
  const input = parse(enrollmentSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const student = await studentInScopeOrFail(c, input.value.studentId);
  const { classGroupId, academicYearId, enrollmentDate } = input.value;
  if (classGroupId !== '' && (await classGroupInScope(c, classGroupId)) === null) {
    throw new NotFound(RECORD_OUT_OF_SCOPE);
  }

  const result = await academics.enroll({
    networkId: currentNetwork(c),
    studentId: student.id,
    classGroupId,
    academicYearId,
    enrollmentDate,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  const body: CreatedRecord = { id: result.value.id };
  return created(c, studentLocation(student.id), body);
});

enrollmentRoutes.get(REGISTRAR_ROUTES.enrollmentTransfer, async (c) => {
  const target = await transferInScope(c, c.req.param(ROUTE_PARAMS.id));
  if (target === null) throw new NotFound(RECORD_OUT_OF_SCOPE);

  const classGroups = await classGroupOptions(c);
  const view: TransferView = {
    enrollment: enrollmentAsJson(target.enrollment),
    student: studentAsJson(target.student),
    classGroups: classGroups.filter(
      (classGroup) => classGroup.id !== target.enrollment.classGroupId,
    ),
  };
  return c.json(view);
});

enrollmentRoutes.post(REGISTRAR_ROUTES.enrollmentTransfer, async (c) => {
  const enrollmentId = c.req.param(ROUTE_PARAMS.id);
  const target = await transferInScope(c, enrollmentId);
  if (target === null) throw new NotFound(RECORD_OUT_OF_SCOPE);

  const input = parse(transferSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const { targetClassGroupId, date } = input.value;
  if (targetClassGroupId !== '' && (await classGroupInScope(c, targetClassGroupId)) === null) {
    throw new NotFound(RECORD_OUT_OF_SCOPE);
  }

  const result = await academics.transfer({
    networkId: currentNetwork(c),
    enrollmentId,
    targetClassGroupId,
    date,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  const body: CreatedRecord = { id: result.value.id };
  return created(c, studentLocation(target.student.id), body);
});
