import type { SessionUser } from '../../shared/http';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';

export const userAsJson = (user: SessionUser): SessionUserAsJson => ({
  id: user.id,
  name: user.name,
  email: user.email,
  networkId: user.networkId,
  networkName: user.networkName,
  networkSlug: user.networkSlug,
  roles: user.roles.map((assignment) => ({
    schoolId: assignment.schoolId,
    schoolName: assignment.schoolName,
    role: assignment.role,
  })),
});
