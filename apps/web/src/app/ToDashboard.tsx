import { Navigate } from 'react-router';
import { APP_ROUTES } from '../constants';
import { useSession } from '../features/session/queries';
import { Loading } from '../shared/ui/Loading';
import { initialDashboard } from './guards';

export function ToDashboard(): React.ReactElement {
  const { data: user, isPending } = useSession();
  if (isPending) return <Loading />;
  if (user === undefined) return <Navigate to={APP_ROUTES.login} replace />;
  return <Navigate to={initialDashboard(user)} replace />;
}
