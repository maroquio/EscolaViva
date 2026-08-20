import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '../testSetup';
import { renderRoutes, renderWithProviders, userWith } from '../testSupport';
import { DASHBOARD_BY_WIDEST_ROLE } from '../../src/app/constants';
import { RequireLogin, RequireRole, holdsAnyOf, initialDashboard } from '../../src/app/guards';

const SESSION = '*/api/v1/session';

const signedInAs = (...roles: Parameters<typeof userWith>[0]): void => {
  server.use(http.get(SESSION, () => HttpResponse.json({ user: userWith(roles) })));
};

const signedOut = (): void => {
  server.use(
    http.get(SESSION, () => HttpResponse.json({ errors: [], correlationId: '' }, { status: 401 })),
  );
};

describe('the guards are navigation convenience and not access control — every case here is about where a person lands, never about what they may read, which the API answers again for every single request', () => {
  describe('initialDashboard', () => {
    test("the widest scope, not the most senior role, decides the landing screen for someone holding several — the order is the server's DASHBOARD_BY_ROLE, and a registrar who is also a student's mother is taken to the screen that covers the whole school", () => {
      expect(initialDashboard(userWith(['registrar', 'guardian']))).toBe('/registrar');
      expect(initialDashboard(userWith(['guardian']))).toBe('/guardian');
    });

    test('the whole precedence order, and not only its two ends — the middle boundary is the one that decides for a secretary who also teaches, and it is the one the two ends jump over', () => {
      expect(initialDashboard(userWith(['registrar', 'network_admin']))).toBe('/network');
      expect(initialDashboard(userWith(['teacher', 'registrar']))).toBe('/registrar');
      expect(initialDashboard(userWith(['guardian', 'teacher']))).toBe('/teacher');
    });

    test('and it is the earlier row of the table that wins, for every adjacent pair, however many rows the table grows to — the case above pins which rows those are today, this one pins that the reading is top-down and does not fall behind a fifth role', () => {
      const adjacentPairs = DASHBOARD_BY_WIDEST_ROLE.flatMap((wider, index) => {
        const narrower = DASHBOARD_BY_WIDEST_ROLE[index + 1];
        return narrower === undefined ? [] : [{ wider, narrower }];
      });

      expect(adjacentPairs).toHaveLength(DASHBOARD_BY_WIDEST_ROLE.length - 1);

      for (const { wider, narrower } of adjacentPairs) {
        expect(initialDashboard(userWith([narrower.role, wider.role]))).toBe(wider.dashboard);
      }
    });

    test('an account with no role goes to the screen that explains it, not to a dashboard — the network administrator creates the person before deciding which school they answer for, and a dashboard would answer 403 to every request', () => {
      expect(initialDashboard(userWith([]))).toBe('/no-role');
    });
  });

  describe('holdsAnyOf', () => {
    test('a role name with a typo in it does not compile — the accepted list is a `readonly Role[]` and nothing widens it, so a route that guards a name the server never issues is a build failure and not a screen nobody can open', () => {
      // @ts-expect-error 'registrarr' is not a Role; the day this line compiles, the type widened
      const misspelled: Parameters<typeof holdsAnyOf>[1] = ['registrarr'];

      expect(holdsAnyOf(userWith(['registrar']), misspelled)).toBe(false);
    });
  });

  describe('RequireRole', () => {
    test('someone without the role sees the no-permission screen', async () => {
      signedInAs('guardian');

      renderWithProviders(
        <RequireRole role="registrar">
          <span>tela da secretaria</span>
        </RequireRole>,
      );

      expect(await screen.findByText(/não tem permissão/i)).toBeVisible();
      expect(screen.queryByText('tela da secretaria')).toBeNull();
    });

    test('someone holding the role goes through', async () => {
      signedInAs('registrar');

      renderWithProviders(
        <RequireRole role="registrar">
          <span>tela da secretaria</span>
        </RequireRole>,
      );

      expect(await screen.findByText('tela da secretaria')).toBeVisible();
    });

    test('a route open to two roles accepts either of them — /announcements is requireRole(registrar, network_admin) on the server, and a guard that could not say "either of these" would leave it the only unguarded route in the tree', async () => {
      signedInAs('network_admin');

      renderWithProviders(
        <RequireRole role={['registrar', 'network_admin']}>
          <span>mural</span>
        </RequireRole>,
      );

      expect(await screen.findByText('mural')).toBeVisible();
    });

    test('and still refuses a third role', async () => {
      signedInAs('teacher');

      renderWithProviders(
        <RequireRole role={['registrar', 'network_admin']}>
          <span>mural</span>
        </RequireRole>,
      );

      expect(await screen.findByText(/não tem permissão/i)).toBeVisible();
    });
  });

  describe('RequireLogin', () => {
    test('with no session, the guard leads to the login screen — through a real router, because inside a bare MemoryRouter the <Navigate> changes the URL and renders nothing, and the case would turn on whether anybody declared a route for /login', async () => {
      signedOut();

      renderRoutes(
        [
          { path: '/login', element: <span>Entrar</span> },
          {
            path: '/registrar',
            element: (
              <RequireLogin>
                <span>conteúdo</span>
              </RequireLogin>
            ),
          },
        ],
        '/registrar',
      );

      expect(await screen.findByText('Entrar')).toBeVisible();
      expect(screen.queryByText('conteúdo')).toBeNull();
    });

    test('with a session, the content renders', async () => {
      signedInAs('registrar');

      renderWithProviders(
        <RequireLogin>
          <span>conteúdo</span>
        </RequireLogin>,
      );

      expect(await screen.findByText('conteúdo')).toBeVisible();
    });

    test('while the answer is in flight it says so instead of guessing — showing the children would flash the screen and yank it away, and showing the login screen would flash a sign-in form at someone who is signed in', () => {
      signedInAs('registrar');

      renderWithProviders(
        <RequireLogin>
          <span>conteúdo</span>
        </RequireLogin>,
      );

      expect(screen.getByRole('status')).toBeVisible();
      expect(screen.queryByText('conteúdo')).toBeNull();
    });
  });

  describe('what the refusal says, and what it withholds', () => {
    test('the screen never names the role that was missing — naming it would map the system for somebody who may not see it', async () => {
      signedInAs('guardian');

      renderWithProviders(
        <RequireRole role="registrar">
          <span>conteúdo</span>
        </RequireRole>,
      );

      await screen.findByText(/não tem permissão/i);

      expect(screen.queryByText(/secretaria|registrar/i)).toBeNull();
    });
  });
});
