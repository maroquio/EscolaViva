import { screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { renderWithProviders } from '../../testSupport';
import { Empty } from '../../../src/shared/ui/Empty';
import { Table, type Column } from '../../../src/shared/ui/Table';

type Student = { readonly id: string; readonly name: string; readonly absences: number };

const students: Student[] = [
  { id: 'a', name: 'Ana Souza', absences: 2 },
  { id: 'b', name: 'Bruno Lima', absences: 11 },
];

const columns: Column<Student>[] = [
  { header: 'Nome', cell: (student) => student.name },
  { header: 'Faltas', cell: (student) => student.absences, align: 'right' },
];

describe('Table — small, and the one twenty screens will use: what is worth guarding is what a screen reader gets and what a column is allowed to render', () => {
  test('renders one row per record, with the cell each column asked for', () => {
    renderWithProviders(
      <Table caption="Alunos" columns={columns} rows={students} rowKey={(row) => row.id} />,
    );

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(students.length + 1);
    expect(screen.getByText('Ana Souza')).toBeVisible();
    expect(screen.getByText('11')).toBeVisible();
  });

  test('the caption is what names the table to a screen reader, which without one announces table, two columns and nothing else — on screens that show more than one table a page', () => {
    renderWithProviders(
      <Table caption="Alunos" columns={columns} rows={students} rowKey={(row) => row.id} />,
    );

    expect(screen.getByRole('table', { name: 'Alunos' })).toBeVisible();
  });

  test('the headers are column headers, not plain cells', () => {
    renderWithProviders(
      <Table caption="Alunos" columns={columns} rows={students} rowKey={(row) => row.id} />,
    );

    expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Faltas' })).toBeVisible();
  });

  test('a column may render a node and not only text, because a cell is a function returning one, which is what lets a column show a link, a formatted CPF or a status tag without the table knowing any of those exist', () => {
    renderWithProviders(
      <Table
        caption="Alunos"
        columns={[{ header: 'Nome', cell: (student) => <strong>{student.name}</strong> }]}
        rows={students}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getByText('Ana Souza').tagName).toBe('STRONG');
  });

  test('no rows renders the head and no body rows', () => {
    renderWithProviders(
      <Table caption="Alunos" columns={columns} rows={[]} rowKey={(row) => row.id} />,
    );

    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(1);
  });
});

describe('Empty, the state that stands in for the table', () => {
  test('the title alone is enough', () => {
    renderWithProviders(<Empty title="Nenhum aluno cadastrado" />);

    expect(screen.getByText('Nenhum aluno cadastrado')).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
  });

  test('an action turns a dead end into the next step, which half the empty states in this system carry and collapsing the three props into one message would delete without anybody noticing until the screens were built', () => {
    renderWithProviders(
      <Empty
        title="Nenhum aluno matriculado"
        text="Esta turma ainda não tem matrículas."
        action={{ href: '/registrar/students/new', text: 'Cadastrar aluno' }}
      />,
    );

    expect(screen.getByText('Esta turma ainda não tem matrículas.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Cadastrar aluno' })).toHaveAttribute(
      'href',
      '/registrar/students/new',
    );
  });
});
