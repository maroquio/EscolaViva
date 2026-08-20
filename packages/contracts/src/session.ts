import type { Role } from './enumerations';

export type RoleAssignmentAsJson = {
  readonly schoolId: string;
  readonly schoolName: string;
  readonly role: Role;
};

export type SessionUserAsJson = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly networkId: string;
  readonly networkName: string;
  readonly networkSlug: string;
  readonly roles: readonly RoleAssignmentAsJson[];
};
