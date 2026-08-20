import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { renderRoutes, renderWithProviders } from '../../testSupport';
import NetworkRoutes from '../../../src/features/network/routes';
import { UserForm } from '../../../src/features/network/UserForm';

const USERS = '*/api/v1/network/users';
const SCHOOL_OPTIONS = '*/api/v1/options/schools';

const PASSWORD = 'Xk7-mQ2-vT9';
const NAME = 'Joana Ribeiro';
const CPF = '52998224725';
const EMAIL = 'joana@escolaviva.test';

const textboxNamed = (name: string): HTMLElement => screen.getByRole('textbox', { name });
const chooserNamed = (name: string): HTMLElement => screen.getByRole('combobox', { name });

const oneUserSoTheListIsNotTheEmptyState = {
  items: [
    {
      id: 'user-1',
      name: 'Alguém Existente',
      email: 'alguem@escolaviva.test',
      cpf: '52998224725',
      phone: null,
      active: true,
      roles: [],
    },
  ],
  page: 1,
  pages: 1,
  total: 1,
  size: 10,
};

const schools = [
  { id: 'school-1', name: 'Escola Central', active: true },
  { id: 'school-2', name: 'Escola do Bairro', active: true },
];

beforeEach(() => {
  server.use(http.get(SCHOOL_OPTIONS, () => HttpResponse.json(schools)));
});

const invitationSucceeds = (): void => {
  server.use(
    http.post(USERS, () =>
      HttpResponse.json({ userId: 'user-9', temporaryPassword: PASSWORD }, { status: 201 }),
    ),
  );
};

const fillIn = async (
  user: ReturnType<typeof renderWithProviders>['user'],
  { school = 'Escola Central' } = {},
): Promise<void> => {
  await user.type(textboxNamed('Nome'), NAME);
  await user.type(textboxNamed('CPF'), CPF);
  await user.type(textboxNamed('E-mail'), EMAIL);
  await waitFor(() => expect(chooserNamed('Escola 1')).toBeEnabled());
  await user.selectOptions(chooserNamed('Escola 1'), school);
  await user.click(screen.getByRole('button', { name: 'Convidar usuário' }));
};

describe('how the fields are reached', () => {
  test('a required field answers to its accessible name, not to the label text withAsterisk leaves behind', () => {
    renderWithProviders(<UserForm />);

    expect(textboxNamed('Nome')).toHaveAccessibleName('Nome');
    expect(() => screen.getByLabelText('Nome')).toThrow();
  });

  test('the school chooser is a real <select>, because Mantine’s Select never opens in jsdom', async () => {
    renderWithProviders(<UserForm />);

    await waitFor(() => expect(chooserNamed('Escola 1')).toBeEnabled());
    expect(chooserNamed('Escola 1').tagName).toBe('SELECT');
  });

  test('and offers every school the server sent, inactive ones included, because the server already narrowed the list to what this person may see', async () => {
    server.use(
      http.get(SCHOOL_OPTIONS, () =>
        HttpResponse.json([
          { id: 'school-1', name: 'Escola Central', active: true },
          { id: 'school-3', name: 'Escola Fechada', active: false },
        ]),
      ),
    );

    renderWithProviders(<UserForm />);

    await waitFor(() => expect(chooserNamed('Escola 1')).toBeEnabled());
    expect(
      within(chooserNamed('Escola 1')).getByRole('option', { name: 'Escola Fechada' }),
    ).toBeInTheDocument();
  });
});

describe('while the school list is still on its way', () => {
  test('the chooser says it is loading instead of standing empty and enabled, which would read as "this network has no schools"', async () => {
    let letTheSchoolsAnswer = (): void => {};
    const schoolsWereReleased = new Promise<void>((resolve) => {
      letTheSchoolsAnswer = resolve;
    });
    server.use(
      http.get(SCHOOL_OPTIONS, async () => {
        await schoolsWereReleased;
        return HttpResponse.json(schools);
      }),
    );

    renderWithProviders(<UserForm />);

    const chooser = chooserNamed('Escola 1');
    expect(chooser).toBeDisabled();
    expect(within(chooser).getByRole('option')).toHaveTextContent('Carregando escolas…');

    letTheSchoolsAnswer();
    await waitFor(() => expect(chooser).toBeEnabled());
  });

  test('and a list that failed to load stops the form, because a failure is not a network without schools', async () => {
    server.use(
      http.get(SCHOOL_OPTIONS, () =>
        HttpResponse.json({ errors: [{ code: 'x', message: 'Falha.' }], correlationId: 'zz9' }, { status: 500 }),
      ),
    );

    renderWithProviders(<UserForm />);

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Escola 1' })).toBeNull();
  });
});

describe('the temporary password', () => {
  test('appears once, after a successful invitation', async () => {
    invitationSucceeds();
    const { user } = renderWithProviders(<UserForm />);

    await fillIn(user);

    expect(await screen.findByText(PASSWORD)).toBeVisible();
    expect(screen.getByText(new RegExp(`senha provisória de ${NAME}`, 'i'))).toBeVisible();
  });

  test('does not appear again after navigating away and back', async () => {
    invitationSucceeds();
    server.use(http.get(USERS, () => HttpResponse.json(oneUserSoTheListIsNotTheEmptyState)));
    const { user } = renderRoutes(
      [{ path: '/network/*', element: <NetworkRoutes /> }],
      '/network/users/new',
    );

    await fillIn(user);
    await screen.findByText(PASSWORD);

    await user.click(screen.getByRole('link', { name: 'Ver a lista de usuários' }));
    await screen.findByRole('heading', { name: 'Usuários' });
    await user.click(screen.getByRole('link', { name: 'Convidar usuário' }));

    expect(await screen.findByRole('textbox', { name: 'Nome' })).toHaveValue('');
    expect(screen.queryByText(PASSWORD)).toBeNull();
  });

  test('and is nowhere in the document after leaving the screen', async () => {
    invitationSucceeds();
    server.use(http.get(USERS, () => HttpResponse.json(oneUserSoTheListIsNotTheEmptyState)));
    const { user } = renderRoutes(
      [{ path: '/network/*', element: <NetworkRoutes /> }],
      '/network/users/new',
    );

    await fillIn(user);
    await screen.findByText(PASSWORD);
    await user.click(screen.getByRole('link', { name: 'Ver a lista de usuários' }));
    await screen.findByRole('heading', { name: 'Usuários' });

    expect(document.body.innerHTML).not.toContain(PASSWORD);
  });
});

describe('a repeated invitation', () => {
  test('is reported as done, not as failed, because the user the first send created does exist', async () => {
    server.use(
      http.post(USERS, () =>
        HttpResponse.json({ repeated: true, location: '/api/v1/network/users' }),
      ),
    );
    const { user } = renderWithProviders(<UserForm />);

    await fillIn(user);

    expect(await screen.findByText(/já havia sido enviado/i)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('and says plainly that the password cannot be shown, because it was never kept anywhere', async () => {
    server.use(
      http.post(USERS, () =>
        HttpResponse.json({ repeated: true, location: '/api/v1/network/users' }),
      ),
    );
    const { user } = renderWithProviders(<UserForm />);

    await fillIn(user);

    expect(await screen.findByText(/não pode mais ser exibida/i)).toBeVisible();
  });
});

describe('when the server refuses', () => {
  test('a problem on the cpf field lands under that field', async () => {
    server.use(
      http.post(USERS, () =>
        HttpResponse.json(
          {
            errors: [{ field: 'cpf', code: 'cpf_invalido', message: 'CPF inválido.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );
    const { user } = renderWithProviders(<UserForm />);

    await fillIn(user);

    expect(await screen.findByText('CPF inválido.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a problem with no field becomes the warning at the top', async () => {
    server.use(
      http.post(USERS, () =>
        HttpResponse.json(
          {
            errors: [{ code: 'x', message: 'Já existe um usuário com este CPF nesta rede.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );
    const { user } = renderWithProviders(<UserForm />);

    await fillIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um usuário com este CPF nesta rede.',
    );
  });

  test('and the password never appears on a refusal', async () => {
    server.use(
      http.post(USERS, () =>
        HttpResponse.json({ errors: [{ code: 'x', message: 'Recusado.' }], correlationId: '' }, { status: 422 }),
      ),
    );
    const { user } = renderWithProviders(<UserForm />);

    await fillIn(user);
    await screen.findByRole('alert');

    expect(screen.queryByText(PASSWORD)).toBeNull();
    expect(textboxNamed('Nome')).toHaveValue(NAME);
  });
});

describe('the role assignments', () => {
  test('an assignment with no school is blocked here, because the server refusal names no row to put it on', async () => {
    let called = false;
    server.use(
      http.post(USERS, () => {
        called = true;
        return HttpResponse.json({ userId: 'x', temporaryPassword: PASSWORD }, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<UserForm />);

    await user.type(textboxNamed('Nome'), NAME);
    await user.type(textboxNamed('CPF'), CPF);
    await user.type(textboxNamed('E-mail'), EMAIL);
    await user.click(screen.getByRole('button', { name: 'Convidar usuário' }));

    expect(await screen.findByText('Escolha a escola.')).toBeVisible();
    expect(called).toBe(false);
  });

  test('a second assignment can be added and sent, because "one or more" is what the domain says', async () => {
    let sent: unknown = null;
    server.use(
      http.post(USERS, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ userId: 'x', temporaryPassword: PASSWORD }, { status: 201 });
      }),
    );
    const { user } = renderWithProviders(<UserForm />);

    await user.type(textboxNamed('Nome'), NAME);
    await user.type(textboxNamed('CPF'), CPF);
    await user.type(textboxNamed('E-mail'), EMAIL);

    await waitFor(() => expect(chooserNamed('Escola 1')).toBeEnabled());
    await user.selectOptions(chooserNamed('Escola 1'), 'Escola Central');

    await user.click(screen.getByRole('button', { name: 'Adicionar atribuição' }));
    await user.selectOptions(chooserNamed('Escola 2'), 'Escola do Bairro');

    await user.click(screen.getByRole('button', { name: 'Convidar usuário' }));

    await screen.findByText(PASSWORD);
    expect(sent).toMatchObject({
      roleAssignments: [
        { schoolId: 'school-1', role: 'registrar' },
        { schoolId: 'school-2', role: 'registrar' },
      ],
    });
  });

  test('the last assignment cannot be removed, because a button that produces an unsubmittable form is a button that lies', () => {
    renderWithProviders(<UserForm />);

    expect(screen.getByRole('button', { name: 'Remover a atribuição 1' })).toBeDisabled();
  });

  test('and a second one can', async () => {
    const { user } = renderWithProviders(<UserForm />);

    await user.click(screen.getByRole('button', { name: 'Adicionar atribuição' }));
    expect(screen.getByRole('button', { name: 'Remover a atribuição 2' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Remover a atribuição 2' }));
    expect(screen.queryByRole('combobox', { name: 'Escola 2' })).toBeNull();
  });
});
