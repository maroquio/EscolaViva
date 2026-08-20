import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { renderRoutes, renderWithProviders } from '../../testSupport';
import { PasswordChange } from '../../../src/features/account/PasswordChange';

const PASSWORD_ENDPOINT = '*/api/v1/account/password';

const fillIn = async (
  user: ReturnType<typeof renderWithProviders>['user'],
  { current = 'antiga', next = 'nova-senha-longa', repeat = 'nova-senha-longa' } = {},
): Promise<void> => {
  await user.type(screen.getByLabelText('Senha atual'), current);
  await user.type(screen.getByLabelText('Senha nova'), next);
  await user.type(screen.getByLabelText('Confirme a senha nova'), repeat);
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
};

describe('the comfort validation, which the server does again', () => {
  test('a mismatched confirmation is refused in Portuguese, before it reaches the server', async () => {
    let called = false;
    server.use(
      http.put(PASSWORD_ENDPOINT, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderWithProviders(<PasswordChange />);

    await fillIn(user, { repeat: 'outra-coisa' });

    expect(await screen.findByText(/não confere/i)).toBeVisible();
    expect(screen.queryByText(/invalid input/i)).toBeNull();
    expect(called).toBe(false);
  });

  test('an empty form names each missing field', async () => {
    const { user } = renderWithProviders(<PasswordChange />);

    await user.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(await screen.findByText('Informe a senha atual.')).toBeVisible();
    expect(screen.getByText('Informe a senha nova.')).toBeVisible();
    expect(screen.getByText('Repita a senha nova.')).toBeVisible();
  });

  test('a password made only of spaces is sent as it was typed, and never trimmed', async () => {
    let sent: unknown = null;
    server.use(
      http.put(PASSWORD_ENDPOINT, async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderWithProviders(<PasswordChange />);

    await fillIn(user, { current: '   ', next: ' nova ', repeat: ' nova ' });

    await waitFor(() =>
      expect(sent).toMatchObject({ currentPassword: '   ', newPassword: ' nova ' }),
    );
  });
});

describe('a successful change', () => {
  const succeeds = (): void => {
    server.use(http.put(PASSWORD_ENDPOINT, () => new HttpResponse(null, { status: 204 })));
  };

  test('says so', async () => {
    succeeds();
    const { user } = renderWithProviders(<PasswordChange />);

    await fillIn(user);

    expect(await screen.findByText('Senha alterada.')).toBeVisible();
  });

  test('and leaves no password behind in the form — not even the current one, on a machine that may be shared', async () => {
    succeeds();
    const { user } = renderWithProviders(<PasswordChange />);

    await fillIn(user);
    await screen.findByText('Senha alterada.');

    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Senha nova')).toHaveValue('');
    expect(screen.getByLabelText('Confirme a senha nova')).toHaveValue('');
  });

  test('and leaves the person where they were, because a password change is not a journey', async () => {
    succeeds();
    const { user } = renderRoutes(
      [
        { path: '/account/password', element: <PasswordChange /> },
        { path: '/dashboard', element: <p>painel</p> },
      ],
      '/account/password',
    );

    await fillIn(user);
    await screen.findByText('Senha alterada.');

    expect(screen.getByRole('heading', { name: 'Trocar senha' })).toBeVisible();
    expect(screen.queryByText('painel')).toBeNull();
  });
});

describe('when the server refuses', () => {
  test('a refusal naming a field lands next to that field, and not in a banner that leaves the person hunting among the three', async () => {
    server.use(
      http.put(PASSWORD_ENDPOINT, () =>
        HttpResponse.json(
          {
            errors: [
              { field: 'currentPassword', code: 'senha_incorreta', message: 'Senha atual incorreta.' },
            ],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );
    const { user } = renderWithProviders(<PasswordChange />);

    await fillIn(user);

    expect(await screen.findByText('Senha atual incorreta.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a refusal naming no field becomes the warning at the top', async () => {
    server.use(
      http.put(PASSWORD_ENDPOINT, () =>
        HttpResponse.json(
          { errors: [{ code: 'x', message: 'A nova senha é curta demais.' }], correlationId: 'abc' },
          { status: 422 },
        ),
      ),
    );
    const { user } = renderWithProviders(<PasswordChange />);

    await fillIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('A nova senha é curta demais.');
  });

  test('a refusal naming a field this form does not have still reaches the person, instead of a submit that appears to do nothing', async () => {
    server.use(
      http.put(PASSWORD_ENDPOINT, () =>
        HttpResponse.json(
          {
            errors: [{ field: 'inventado', code: 'x', message: 'Algo inesperado no cadastro.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );
    const { user } = renderWithProviders(<PasswordChange />);

    await fillIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo inesperado no cadastro.');
  });
});
