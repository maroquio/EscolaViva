import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { APP_ROUTES } from '../constants';
import { onSessionExpired } from '../shared/api';
import { theme } from '../shared/theme/theme';
import { ErrorBoundary } from '../shared/ui/ErrorBoundary';
import { notices } from '../shared/ui/notices';
import { routes } from './routes';

type DataRouter = ReturnType<typeof createBrowserRouter>;

const REFUSALS_ARE_NOT_RETRIED = {
  queries: { retry: false },
  mutations: { retry: false },
} as const;

const SESSION_EXPIRED = 'Sua sessão expirou. Entre novamente para continuar.';

const queryCache = new QueryClient({ defaultOptions: REFUSALS_ARE_NOT_RETRIED });

const router = createBrowserRouter(routes);

const whereTheyWere = (): string => `${window.location.pathname}${window.location.search}`;

const discardEveryonesCachedData = (): void => queryCache.clear();

function returnToSignInWhenTheSessionExpires(dataRouter: DataRouter): void {
  onSessionExpired(() => {
    const cameFrom = whereTheyWere();
    discardEveryonesCachedData();
    notices.error(SESSION_EXPIRED);
    void dataRouter.navigate(APP_ROUTES.login, { state: { cameFrom }, replace: true });
  });
}

returnToSignInWhenTheSessionExpires(router);

export function App(): React.ReactElement {
  return (
    <MantineProvider theme={theme}>
      <Notifications />
      <QueryClientProvider client={queryCache}>
        <ErrorBoundary>
          <RouterProvider router={router} />
        </ErrorBoundary>
      </QueryClientProvider>
    </MantineProvider>
  );
}
