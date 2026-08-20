import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { routes } from '../../../src/app/routes';
import { server } from '../../testSetup';
import { renderRoutes, renderWithProviders, userWith } from '../../testSupport';
import { SignInScreen } from '../../../src/features/session/SignInScreen';
import { useSignOut } from '../../../src/features/session/mutations';
import { sessionKey } from '../../../src/features/session/queries';

const SESSION = '*/api/v1/session';

const NETWORK = 'demo';
const CPF = '529.982.247-25';
const PASSWORD = 'escolaviva';

const sessionIsRefusedUntilSigningInAs = (user: ReturnType<typeof userWith>): void => {
  let signedIn = false;
  server.use(
    http.get(SESSION, () =>
      signedIn
        ? HttpResponse.json({ user })
        : HttpResponse.json({ errors: [], correlationId: '' }, { status: 401 }),
    ),
    http.post(SESSION, () => {
      signedIn = true;
      return HttpResponse.json({ user }, { status: 201 });
    }),
  );
};

const sessionIsAlwaysRefused = (): void => {
  server.use(
    http.get(SESSION, () => HttpResponse.json({ errors: [], correlationId: '' }, { status: 401 })),
  );
};

const theLazilyLoadedNetworkField = (): Promise<HTMLElement> => screen.findByLabelText('Rede');

const fillIn = async (
  user: Awaited<ReturnType<typeof renderWithProviders>>['user'],
  password = PASSWORD,
): Promise<void> => {
  await user.type(await theLazilyLoadedNetworkField(), NETWORK);
  await user.type(screen.getByLabelText('CPF'), CPF);
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
};

describe('signing in', () => {
  test('leads through the real route table to the dashboard of the widest role, and marks only that one as the current page', async () => {
    sessionIsRefusedUntilSigningInAs(userWith(['registrar', 'guardian']));
    const { user } = renderRoutes(routes, '/login');

    await fillIn(user);

    expect(await screen.findByRole('link', { name: 'Painel da secretaria' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Painel do responsável' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  test('returns to the page the session expired on, and not to the dashboard this person would land on by default — and only the route comes back, never what was being typed, which no draft is kept of at this stage', async () => {
    sessionIsRefusedUntilSigningInAs(userWith(['registrar', 'guardian']));
    const { user } = renderRoutes(routes, {
      pathname: '/login',
      state: { cameFrom: '/guardian' },
    });

    await fillIn(user);

    expect(await screen.findByRole('link', { name: 'Painel do responsável' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('and to the guardian screen for somebody who is only a guardian', async () => {
    sessionIsRefusedUntilSigningInAs(userWith(['guardian']));
    const { user } = renderRoutes(routes, '/login');

    await fillIn(user);

    expect(await screen.findByRole('link', { name: 'Painel do responsável' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('link', { name: 'Alunos' })).toBeNull();
  });
});

describe('somebody who is already signed in', () => {
  test('never sees the form, and lands on their dashboard, because POST /session with a live session answers with the current user and ignores what was typed', async () => {
    server.use(http.get(SESSION, () => HttpResponse.json({ user: userWith(['registrar']) })));

    renderRoutes(routes, '/login');

    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull();
  });

  test('and the redirect follows role precedence, like every other landing', async () => {
    server.use(
      http.get(SESSION, () => HttpResponse.json({ user: userWith(['teacher', 'guardian']) })),
    );

    renderRoutes(routes, '/login');

    expect(await screen.findByRole('link', { name: 'Minhas turmas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('when the credential is refused', () => {
  const refuses = (): void => {
    sessionIsAlwaysRefused();
    server.use(
      http.post(SESSION, () =>
        HttpResponse.json(
          {
            errors: [{ code: 'credenciais_invalidas', message: 'CPF ou senha inválidos' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );
  };

  test('the server message is what the person reads', async () => {
    refuses();
    const { user } = renderWithProviders(<SignInScreen />);

    await fillIn(user, 'errada');

    expect(await screen.findByText('CPF ou senha inválidos')).toBeVisible();
  });

  test('what was typed survives, except the password, so one wrong field does not cost three', async () => {
    refuses();
    const { user } = renderWithProviders(<SignInScreen />);

    await fillIn(user, 'errada');
    await screen.findByText('CPF ou senha inválidos');

    expect(screen.getByLabelText('Rede')).toHaveValue(NETWORK);
    expect(screen.getByLabelText('CPF')).toHaveValue(CPF);
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  test('the message does not say which of the three was wrong, so the form cannot be used to find out which networks or which people exist', async () => {
    refuses();
    const { user } = renderWithProviders(<SignInScreen />);

    await fillIn(user, 'errada');
    await screen.findByText('CPF ou senha inválidos');

    expect(screen.queryByText(/rede não encontrada/i)).toBeNull();
    expect(screen.queryByText(/usuário não encontrado/i)).toBeNull();
  });
});

describe('reaching the form without a mouse', () => {
  test('the reveal toggle says what it does, because Mantine ships it as an icon a screen reader would announce only as "button"', () => {
    sessionIsAlwaysRefused();
    renderWithProviders(<SignInScreen />);

    expect(screen.getByRole('button', { name: /mostrar ou ocultar a senha/i })).toBeVisible();
  });

  test('every field has a label a screen reader can announce', () => {
    sessionIsAlwaysRefused();
    renderWithProviders(<SignInScreen />);

    expect(screen.getByLabelText('Rede')).toBeVisible();
    expect(screen.getByLabelText('CPF')).toBeVisible();
    expect(screen.getByLabelText('Senha')).toBeVisible();
  });
});

describe('what never leaves the screen', () => {
  test('the typed password appears in no URL and in no document attribute, because a form with no submit handling would put every field in the query string', async () => {
    sessionIsAlwaysRefused();
    const { user } = renderWithProviders(<SignInScreen />);

    await user.type(screen.getByLabelText('Senha'), 'segredo123');

    expect(window.location.search).not.toContain('segredo123');
    expect(document.body.innerHTML).not.toContain('segredo123');
  });
});

describe('the comfort validation', () => {
  test('an empty form says what is missing without asking the server', async () => {
    let called = false;
    sessionIsAlwaysRefused();
    server.use(
      http.post(SESSION, () => {
        called = true;
        return HttpResponse.json({ user: userWith(['registrar']) }, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<SignInScreen />);

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe a rede.')).toBeVisible();
    expect(screen.getByText('Informe seu CPF.')).toBeVisible();
    expect(screen.getByText('Informe a senha.')).toBeVisible();
    expect(called).toBe(false);
  });

  test('a password made only of spaces is sent, not rejected as empty — it is the one field that is never trimmed, and the proof lands on the request rather than on a control, because a successful sign-in redirects and the button is gone by then', async () => {
    let sent: unknown = null;
    sessionIsAlwaysRefused();
    server.use(
      http.post(SESSION, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ user: userWith(['registrar']) }, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<SignInScreen />);

    await fillIn(user, '   ');

    await waitFor(() => expect(sent).toMatchObject({ password: '   ' }));
  });

  test('and the network is trimmed, because a space there is always a slip', async () => {
    let sent: unknown = null;
    sessionIsAlwaysRefused();
    server.use(
      http.post(SESSION, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ user: userWith(['registrar']) }, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<SignInScreen />);

    await user.type(screen.getByLabelText('Rede'), '  demo  ');
    await user.type(screen.getByLabelText('CPF'), CPF);
    await user.type(screen.getByLabelText('Senha'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(sent).toMatchObject({ networkSlug: 'demo' }));
  });
});

describe('the screen a signed-out person is given', () => {
  test('the form is there before the server answers, and no spinner stands in for it', () => {
    sessionIsAlwaysRefused();
    renderWithProviders(<SignInScreen />);

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByText(/carregando/i)).toBeNull();
  });

  test('and it carries no application navigation, because there is nowhere to go yet', async () => {
    sessionIsAlwaysRefused();
    renderRoutes(routes, '/login');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  test('the answer to signing in is the session itself, so no second round trip decides it', async () => {
    sessionIsAlwaysRefused();
    server.use(
      http.post(SESSION, () =>
        HttpResponse.json({ user: userWith(['registrar']) }, { status: 201 }),
      ),
    );
    const { user } = renderWithProviders(<SignInScreen />);

    await fillIn(user);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull());
  });

  test('a CPF the check digits would refuse is still sent, because this screen judges no CPF', async () => {
    let sent: unknown = null;
    sessionIsAlwaysRefused();
    server.use(
      http.post(SESSION, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ user: userWith(['registrar']) }, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<SignInScreen />);

    await user.type(screen.getByLabelText('Rede'), NETWORK);
    await user.type(screen.getByLabelText('CPF'), '111.111.111-11');
    await user.type(screen.getByLabelText('Senha'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(sent).toMatchObject({ cpf: '111.111.111-11' }));
  });
});

describe('signing out', () => {
  const cacheAndWrapper = () => {
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queries}>{children}</QueryClientProvider>
    );
    return { queries, wrapper };
  };

  test('a sign-out the server refused still empties this browser of that session', async () => {
    server.use(
      http.delete(SESSION, () =>
        HttpResponse.json({ errors: [], correlationId: 'abc' }, { status: 500 }),
      ),
    );
    const { queries, wrapper } = cacheAndWrapper();
    queries.setQueryData(sessionKey, userWith(['registrar']));
    const { result } = renderHook(() => useSignOut(), { wrapper });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(queries.getQueryData(sessionKey)).toBeUndefined());
  });

  test('and it drops every list that session had read, not only the session itself', async () => {
    server.use(http.delete(SESSION, () => new HttpResponse(null, { status: 204 })));
    const { queries, wrapper } = cacheAndWrapper();
    queries.setQueryData(sessionKey, userWith(['registrar']));
    queries.setQueryData(['guardian', 'dashboard', 1], { totalUnread: 3 });
    const { result } = renderHook(() => useSignOut(), { wrapper });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() =>
      expect(queries.getQueryData(['guardian', 'dashboard', 1])).toBeUndefined(),
    );
  });
});
