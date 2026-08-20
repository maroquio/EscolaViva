import { screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { renderWithProviders } from '../../testSupport';
import { Pagination } from '../../../src/shared/ui/Pagination';

const PAGE_SIZE = 10;

const numbers = (): string[] =>
  within(screen.getByRole('navigation'))
    .getAllByRole('listitem')
    .map((listItem) => listItem.textContent?.trim() ?? '')
    .filter((text) => /^\d+$/.test(text));

describe('the seven-number window, one case per thing partials/_pagination.eta did and a rewrite silently drops', () => {
  test('fewer pages than the window shows them all', () => {
    renderWithProviders(
      <Pagination param="p" page={1} pages={4} total={35} shown={PAGE_SIZE} size={PAGE_SIZE} />,
    );

    expect(numbers()).toEqual(['1', '2', '3', '4']);
  });

  test('more pages than the window shows exactly seven, sliding around the current one, because seven is the server PAGINATION.window and is not arbitrary: it is what fits on one phone line, the exact device most guardians use', () => {
    renderWithProviders(
      <Pagination param="p" page={10} pages={30} total={295} shown={PAGE_SIZE} size={PAGE_SIZE} />,
    );

    expect(numbers()).toEqual(['7', '8', '9', '10', '11', '12', '13']);
  });

  test('and clamps at the start instead of running below page one', () => {
    renderWithProviders(
      <Pagination param="p" page={2} pages={30} total={295} shown={PAGE_SIZE} size={PAGE_SIZE} />,
    );

    expect(numbers()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  test('and at the end instead of running past the last page', () => {
    renderWithProviders(
      <Pagination param="p" page={30} pages={30} total={295} shown={5} size={PAGE_SIZE} />,
    );

    expect(numbers()).toEqual(['24', '25', '26', '27', '28', '29', '30']);
  });
});

describe('the addresses it builds', () => {
  test('a page turn keeps every filter that was on the URL', () => {
    renderWithProviders(
      <Pagination param="p" page={1} pages={3} total={25} shown={PAGE_SIZE} size={PAGE_SIZE} />,
      '/registrar/students?q=ana',
    );

    expect(screen.getByRole('link', { name: 'Página 2' })).toHaveAttribute(
      'href',
      '/registrar/students?q=ana&p=2',
    );
  });

  test('and page one is written by deleting the parameter', () => {
    renderWithProviders(
      <Pagination param="p" page={2} pages={3} total={25} shown={PAGE_SIZE} size={PAGE_SIZE} />,
      '/registrar/students?q=ana&p=2',
    );

    expect(screen.getByRole('link', { name: 'Página 1' })).toHaveAttribute(
      'href',
      '/registrar/students?q=ana',
    );
  });

  test('a named cursor moves alone, which is precisely why the parameter is a prop: on a student page, turning the guardians cursor may not move the enrollments one', () => {
    renderWithProviders(
      <Pagination
        param="pGuardians"
        page={1}
        pages={3}
        total={25}
        shown={PAGE_SIZE}
        size={PAGE_SIZE}
      />,
      '/registrar/students/abc?pEnrollments=4',
    );

    expect(screen.getByRole('link', { name: 'Página 2' })).toHaveAttribute(
      'href',
      '/registrar/students/abc?pEnrollments=4&pGuardians=2',
    );
  });
});

describe('what it announces, which is the markup a screen reader depends on', () => {
  test('the count line, with the range this page actually shows', () => {
    renderWithProviders(
      <Pagination
        param="p"
        page={3}
        pages={5}
        total={43}
        shown={PAGE_SIZE}
        size={PAGE_SIZE}
        label="alunos"
      />,
    );

    expect(screen.getByText('21–30 de 43 alunos')).toBeVisible();
  });

  test('and the last page ends where the data ends, not where the page size would, because the last page is shorter than the others and computing its end from size prints 41–50 de 43', () => {
    renderWithProviders(
      <Pagination
        param="p"
        page={5}
        pages={5}
        total={43}
        shown={3}
        size={PAGE_SIZE}
        label="alunos"
      />,
    );

    expect(screen.getByText('41–43 de 43 alunos')).toBeVisible();
  });

  test('the current page is marked for a screen reader and is not a link', () => {
    renderWithProviders(
      <Pagination param="p" page={2} pages={5} total={43} shown={PAGE_SIZE} size={PAGE_SIZE} />,
    );

    expect(screen.getByText('2')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Página 2' })).toBeNull();
  });

  test('the two steps say which way the sequence runs', () => {
    renderWithProviders(
      <Pagination param="p" page={2} pages={5} total={43} shown={PAGE_SIZE} size={PAGE_SIZE} />,
    );

    expect(screen.getByRole('link', { name: /anterior/i })).toHaveAttribute('rel', 'prev');
    expect(screen.getByRole('link', { name: /próxima/i })).toHaveAttribute('rel', 'next');
  });

  test('at the first page the previous step is present and inert, a span that stays in the layout, because a link that vanishes shifts every number sideways under the finger between page one and page two', () => {
    renderWithProviders(
      <Pagination param="p" page={1} pages={5} total={43} shown={PAGE_SIZE} size={PAGE_SIZE} />,
    );

    expect(screen.queryByRole('link', { name: /anterior/i })).toBeNull();
    expect(screen.getByText(/anterior/i)).toBeVisible();
  });

  test('an empty list renders no pagination at all', () => {
    renderWithProviders(
      <Pagination param="p" page={1} pages={0} total={0} shown={0} size={PAGE_SIZE} />,
    );

    expect(screen.queryByRole('navigation')).toBeNull();
  });

  test('a single page keeps the count line and drops the number list', () => {
    renderWithProviders(
      <Pagination param="p" page={1} pages={1} total={4} shown={4} size={PAGE_SIZE} label="turmas" />,
    );

    expect(screen.getByText('1–4 de 4 turmas')).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
