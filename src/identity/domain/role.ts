import { INTERNAL_ERRORS, ROLE } from '../constants';

export const ROLES = [ROLE.networkAdmin, ROLE.registrar, ROLE.teacher, ROLE.guardian] as const;

export type Role = (typeof ROLES)[number];

export type RoleInSchool = { schoolId: string; schoolName: string; role: Role };

export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function toRole(value: string): Role {
  if (!isValidRole(value)) throw new Error(INTERNAL_ERRORS.roleOutOfDomain(value));
  return value;
}
