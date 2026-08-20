import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { renderWithProviders } from '../../testSupport';
import { PageHeader } from '../../../src/shared/ui/PageHeader';

describe('PageHeader', () => {
  test('the overline, the title and the summary all reach the screen', () => {
    renderWithProviders(
      <PageHeader
        overline="Secretaria"
        title="Alunos"
        summary="Cada aluno cadastrado aqui pode ser matriculado em uma turma."
      />,
    );

    expect(screen.getByText('Secretaria')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Alunos' })).toBeVisible();
    expect(
      screen.getByText('Cada aluno cadastrado aqui pode ser matriculado em uma turma.'),
    ).toBeVisible();
  });

  test('a header handed no action renders no link at all, so a screen with nothing to offer shows no button to press', () => {
    renderWithProviders(
      <PageHeader
        overline="Secretaria"
        title="Alunos"
        summary="Cada aluno cadastrado aqui pode ser matriculado em uma turma."
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
  });

  test('the primary action is a link to the address the screen handed it', () => {
    renderWithProviders(
      <PageHeader
        overline="Secretaria"
        title="Alunos"
        summary="Cada aluno cadastrado aqui pode ser matriculado em uma turma."
        action={{ href: '/registrar/students/new', text: 'Cadastrar aluno' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Cadastrar aluno' })).toHaveAttribute(
      'href',
      '/registrar/students/new',
    );
  });

  test('a header written without its summary does not compile, which is how it keeps being written with one — this case asserts nothing and green here proves nothing: the judge is `tsc`, and making `summary` optional turns `bunx tsc --noEmit -p apps/web/tsconfig.json` red with TS2578 on the directive below', () => {
    // @ts-expect-error the summary is teaching material, so the type refuses a header without one
    void (<PageHeader overline="Secretaria" title="Alunos" />);
  });
});
