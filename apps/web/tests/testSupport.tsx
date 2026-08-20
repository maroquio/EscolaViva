import { MantineProvider } from '@mantine/core';
import { Notifications as TheRegionNoticesLandIn } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { Suspense, type ReactNode } from 'react';
import {
  MemoryRouter,
  RouterProvider,
  createMemoryRouter,
  type RouteObject,
} from 'react-router';
import type { Role } from '@escolaviva/contracts/enumerations';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';
import { theme } from '../src/shared/theme/theme';
import { Loading } from '../src/shared/ui/Loading';

type Rendered = RenderResult & { user: UserEvent };

const aCacheNoOtherRenderShares = (): QueryClient =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const withProviders = (children: ReactNode): ReactNode => (
  <MantineProvider theme={theme}>
    <TheRegionNoticesLandIn />
    <QueryClientProvider client={aCacheNoOtherRenderShares()}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </QueryClientProvider>
  </MantineProvider>
);

export function userWith(roles: readonly Role[]): SessionUserAsJson {
  return {
    id: 'user-1',
    name: 'Ana Souza',
    email: 'ana@escolaviva.test',
    networkId: 'network-1',
    networkName: 'Rede Demonstração',
    networkSlug: 'demo',
    roles: roles.map((role, index) => ({
      schoolId: `school-${index + 1}`,
      schoolName: `Escola ${index + 1}`,
      role,
    })),
  };
}

export function renderWithProviders(element: ReactNode, initialRoute = '/'): Rendered {
  const user = userEvent.setup();
  return {
    user,
    ...render(withProviders(<MemoryRouter initialEntries={[initialRoute]}>{element}</MemoryRouter>)),
  };
}

export function renderRoutes(
  routes: RouteObject[],
  initialRoute: string | { pathname: string; state: unknown } = '/',
): Rendered {
  const user = userEvent.setup();
  const router = createMemoryRouter(routes, { initialEntries: [initialRoute] });
  return { user, ...render(withProviders(<RouterProvider router={router} />)) };
}
