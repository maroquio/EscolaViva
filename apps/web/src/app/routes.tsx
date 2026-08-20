import { Suspense, lazy, type ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import type { Role } from '@escolaviva/contracts/enumerations';
import { APP_ROUTES, AREA_ROUTES, WILDCARD_ROUTE } from '../constants';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { Loading } from '../shared/ui/Loading';
import { NotFound } from '../shared/ui/NotFound';
import { AccountWithoutRole } from './AccountWithoutRole';
import { Layout } from './Layout';
import { ToDashboard } from './ToDashboard';
import { UnexpectedError } from './UnexpectedError';
import { RequireLogin, RequireRole } from './guards';

const SignInScreen = lazy(() =>
  import('../features/session/SignInScreen').then((module) => ({ default: module.SignInScreen })),
);
const PasswordChange = lazy(() =>
  import('../features/account/PasswordChange').then((module) => ({
    default: module.PasswordChange,
  })),
);

const NetworkArea = lazy(() => import('../features/network/routes'));
const RegistrarArea = lazy(() => import('../features/registrar/routes'));
const TeacherArea = lazy(() => import('../features/teacher/routes'));
const GuardianArea = lazy(() => import('../features/guardian/routes'));
const AnnouncementsArea = lazy(() => import('../features/announcements/routes'));

const ANNOUNCEMENT_ROLES: readonly Role[] = ['registrar', 'network_admin'];

const underItsOwnBoundary = (loadedOnDemand: ReactNode): ReactNode => (
  <ErrorBoundary>
    <Suspense fallback={<Loading />}>{loadedOnDemand}</Suspense>
  </ErrorBoundary>
);

export const routes: RouteObject[] = [
  { path: APP_ROUTES.login, element: underItsOwnBoundary(<SignInScreen />) },
  {
    element: (
      <RequireLogin>
        <Layout />
      </RequireLogin>
    ),
    errorElement: <UnexpectedError />,
    children: [
      { path: APP_ROUTES.root, element: <ToDashboard /> },
      { path: APP_ROUTES.dashboard, element: <ToDashboard /> },
      { path: APP_ROUTES.accountPassword, element: underItsOwnBoundary(<PasswordChange />) },
      { path: APP_ROUTES.noRole, element: <AccountWithoutRole /> },
      {
        path: AREA_ROUTES.network,
        element: <RequireRole role="network_admin">{underItsOwnBoundary(<NetworkArea />)}</RequireRole>,
      },
      {
        path: AREA_ROUTES.registrar,
        element: <RequireRole role="registrar">{underItsOwnBoundary(<RegistrarArea />)}</RequireRole>,
      },
      {
        path: AREA_ROUTES.teacher,
        element: <RequireRole role="teacher">{underItsOwnBoundary(<TeacherArea />)}</RequireRole>,
      },
      {
        path: AREA_ROUTES.guardian,
        element: <RequireRole role="guardian">{underItsOwnBoundary(<GuardianArea />)}</RequireRole>,
      },
      {
        path: AREA_ROUTES.announcements,
        element: (
          <RequireRole role={ANNOUNCEMENT_ROLES}>
            {underItsOwnBoundary(<AnnouncementsArea />)}
          </RequireRole>
        ),
      },
      { path: WILDCARD_ROUTE, element: <NotFound /> },
    ],
  },
];
