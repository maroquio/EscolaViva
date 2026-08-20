import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { Link, useNavigate } from 'react-router';
import { describe, expect, test } from 'vitest';
import { server } from '../testSetup';
import { renderRoutes, userWith } from '../testSupport';
import { ToDashboard } from '../../src/app/ToDashboard';

const SESSION = '*/api/v1/session';

const signedInAs = (...roles: Parameters<typeof userWith>[0]): void => {
  server.use(http.get(SESSION, () => HttpResponse.json({ user: userWith(roles) })));
};

const landing = [
  { path: '/', element: <ToDashboard /> },
  { path: '/dashboard', element: <ToDashboard /> },
  { path: '/network', element: <span>Painel da rede</span> },
  { path: '/registrar', element: <span>Painel da secretaria</span> },
  { path: '/teacher', element: <span>Minhas turmas</span> },
  { path: '/guardian', element: <span>Painel do responsável</span> },
  { path: '/no-role', element: <span>Conta sem unidade</span> },
  { path: '/login', element: <span>Entrar</span> },
];

describe('ToDashboard, which is what GET /dashboard used to do on the server', () => {
  test('takes someone to the dashboard their widest role earns', async () => {
    signedInAs('registrar', 'guardian');

    renderRoutes(landing, '/');

    expect(await screen.findByText('Painel da secretaria')).toBeVisible();
  });

  test('and does the same from the old /dashboard address, which is the one printed in the teaching material', async () => {
    signedInAs('guardian');

    renderRoutes(landing, '/dashboard');

    expect(await screen.findByText('Painel do responsável')).toBeVisible();
  });

  test('an account with no assignment gets the screen that explains it, not a dashboard where every request would be refused', async () => {
    signedInAs();

    renderRoutes(landing, '/');

    expect(await screen.findByText('Conta sem unidade')).toBeVisible();
  });

  test('and no session at all leads to the login screen', async () => {
    server.use(
      http.get(SESSION, () => HttpResponse.json({ errors: [], correlationId: '' }, { status: 401 })),
    );

    renderRoutes(landing, '/');

    expect(await screen.findByText('Entrar')).toBeVisible();
  });
});

const GoesBack = ({ children }: { readonly children: string }): React.ReactElement => {
  const navigate = useNavigate();
  return (
    <>
      <span>{children}</span>
      <button type="button" onClick={() => void navigate(-1)}>
        voltar
      </button>
    </>
  );
};

describe('the back button, after the redirect', () => {
  test('the redirect replaces the address it left, so going back does not land here and get bounced forward again', async () => {
    signedInAs('guardian');

    const { user } = renderRoutes(
      [
        { path: '/antes', element: <Link to="/">ir ao painel</Link> },
        { path: '/', element: <ToDashboard /> },
        { path: '/guardian', element: <GoesBack>Painel do responsável</GoesBack> },
      ],
      '/antes',
    );

    await user.click(screen.getByRole('link', { name: 'ir ao painel' }));
    await screen.findByText('Painel do responsável');

    await user.click(screen.getByRole('button', { name: 'voltar' }));

    expect(await screen.findByRole('link', { name: 'ir ao painel' })).toBeVisible();
  });
});
