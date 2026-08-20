import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '../../../testSetup';
import { renderRoutes } from '../../../testSupport';
import { GuardianLinkForm } from '../../../../src/features/registrar/students/GuardianLinkForm';

const AVAILABLE = '*/api/v1/registrar/students/:id/available-guardians';

const openLink = () =>
  renderRoutes(
    [
      { path: '/registrar/students/:id/guardians/new', element: <GuardianLinkForm /> },
      { path: '/registrar/students/:id', element: <p>ficha do aluno</p> },
    ],
    '/registrar/students/student-1/guardians/new',
  );

describe('the guardian who answers for the bills', () => {
  test('financial responsibility starts unchecked: not being the payer is the common case, and only one of several guardians answers for it', async () => {
    server.use(
      http.get(AVAILABLE, () => HttpResponse.json([{ id: 'user-2', name: 'Paulo Souza' }])),
    );

    openLink();

    expect(
      await screen.findByRole('checkbox', { name: 'Responsável financeiro' }),
    ).not.toBeChecked();
  });
});
