import type { RoleInSchool } from './role';
import type { Network } from './network';

export const MINIMUM_PASSWORD_LENGTH = 10;

export type User = {
  id: string;
  networkId: string;
  name: string;
  email: string;
  cpf: string;
  active: boolean;
  guardianId: string | null;
};

export type AuthenticatedUser = {
  id: string;
  networkId: string;
  networkName: string;
  networkSlug: string;
  name: string;
  email: string;
  roles: RoleInSchool[];
  guardianId: string | null;
};

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  active: boolean;
  roles: RoleInSchool[];
};

export function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toAuthenticatedUser(
  user: User,
  network: Network,
  roles: RoleInSchool[],
): AuthenticatedUser {
  return {
    id: user.id,
    networkId: network.id,
    networkName: network.name,
    networkSlug: network.slug,
    name: user.name,
    email: user.email,
    roles,
    guardianId: user.guardianId,
  };
}
