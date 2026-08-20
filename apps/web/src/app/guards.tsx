import { Navigate } from 'react-router';
import type { ReactNode } from 'react';
import type { Role } from '@escolaviva/contracts/enumerations';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';
import { APP_ROUTES } from '../constants';
import { useSession } from '../features/session/queries';
import { Loading } from '../shared/ui/Loading';
import { NoPermission } from './NoPermission';
import { DASHBOARD_BY_WIDEST_ROLE } from './constants';

export const holdsAnyOf = (user: SessionUserAsJson, accepted: Role | readonly Role[]): boolean => {
  const roles: readonly Role[] = typeof accepted === 'string' ? [accepted] : accepted;
  return user.roles.some((assignment) => roles.includes(assignment.role));
};

export const initialDashboard = (user: SessionUserAsJson): string =>
  DASHBOARD_BY_WIDEST_ROLE.find(({ role }) => holdsAnyOf(user, role))?.dashboard ??
  APP_ROUTES.noRole;

export function RequireLogin({ children }: { readonly children: ReactNode }): ReactNode {
  const { data: user, isPending } = useSession();
  if (isPending) return <Loading />;
  if (user === undefined) return <Navigate to={APP_ROUTES.login} replace />;
  return children;
}

export function RequireRole({
  role,
  children,
}: {
  readonly role: Role | readonly Role[];
  readonly children: ReactNode;
}): ReactNode {
  const { data: user, isPending } = useSession();
  if (isPending) return <Loading />;
  if (user === undefined) return <Navigate to={APP_ROUTES.login} replace />;
  if (!holdsAnyOf(user, role)) return <NoPermission />;
  return children;
}
