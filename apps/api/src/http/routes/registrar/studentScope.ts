import { academics, type Student } from '../../../academics';
import { NotFound, currentNetwork, isUuid } from '../../../shared/http';
import {
  RECORD_OUT_OF_SCOPE,
  idsOf,
  registrarSchools,
  type RegistrarContext,
} from '../../registrarScope';

const NO_ENROLLMENT_IN_SCOPE = 0;

export const studentInScope = async (
  c: RegistrarContext,
  studentId: string,
): Promise<Student | null> => {
  if (!isUuid(studentId)) return null;
  const networkId = currentNetwork(c);
  const schoolIds = idsOf(registrarSchools(c));

  const [student, inScope, hasEnrollment] = await Promise.all([
    academics.studentById(networkId, studentId),
    academics.countStudentEnrollmentsInSchools(networkId, studentId, schoolIds),
    academics.studentHasEnrollment(networkId, studentId),
  ]);
  if (student === null) return null;
  return hasEnrollment && inScope === NO_ENROLLMENT_IN_SCOPE ? null : student;
};

export const studentInScopeOrFail = async (
  c: RegistrarContext,
  studentId: string,
): Promise<Student> => {
  const student = await studentInScope(c, studentId);
  if (student === null) throw new NotFound(RECORD_OUT_OF_SCOPE);
  return student;
};
