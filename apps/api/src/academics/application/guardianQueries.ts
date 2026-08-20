import { reader } from '../../shared/db';
import type { GuardianLink } from '../domain/guardian';
import * as guardians from '../infra/guardianRepository';

export function studentGuardians(
  networkId: string,
  studentId: string,
): Promise<GuardianLink[]> {
  return guardians.ofStudent(reader(), networkId, studentId);
}

export function schoolGuardians(networkId: string, schoolId: string): Promise<string[]> {
  return guardians.ofSchool(reader(), networkId, schoolId);
}
