import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { useLocation } from 'react-router';
import { describe, expect, test } from 'vitest';
import { server } from '../../../testSetup';
import { renderRoutes, renderWithProviders } from '../../../testSupport';
import { StudentSearch } from '../../../../src/features/registrar/students/StudentSearch';

const STUDENTS = '*/api/v1/registrar/students';
const PAGE_SIZE = 10;

const TheAddressTheMemoryRouterKeepsToItself = (): React.ReactElement => {
  const { search } = useLocation();
  return <p data-testid="endereco">{search}</p>;
};

const found = (names: string[], page = 1, total = names.length) => ({
  items: names.map((name, index) => ({
    id: `student-${page}-${index}`,
    name,
    birthDate: '2015-03-14',
    classGroupName: index === 0 ? '3º ano A' : null,
    year: index === 0 ? 2026 : null,
    status: index === 0 ? ('active' as const) : null,
  })),
  page,
  pages: Math.ceil(total / PAGE_SIZE),
  total,
  size: PAGE_SIZE,
});

describe('opening the screen', () => {
  test('with no ?q= it asks the server nothing, instead of listing the first ten students in the network on every visit', async () => {
    let called = 0;
    server.use(
      http.get(STUDENTS, () => {
        called += 1;
        return HttpResponse.json(found([]));
      }),
    );

    renderWithProviders(<StudentSearch />, '/registrar/students');

    expect(await screen.findByText('Comece pela busca')).toBeVisible();
    expect(called).toBe(0);
  });

  test('with a ?q= already in the address it searches straight away', async () => {
    let asked: string | null = null;
    server.use(
      http.get(STUDENTS, ({ request }) => {
        asked = new URL(request.url).searchParams.get('q');
        return HttpResponse.json(found(['Ana Souza']));
      }),
    );

    renderWithProviders(<StudentSearch />, '/registrar/students?q=ana');

    expect(await screen.findByText('Ana Souza')).toBeVisible();
    expect(asked).toBe('ana');
  });

  test('a bookmark of page three reopens page three, not page one of the same term', async () => {
    let askedPage: string | null = null;
    server.use(
      http.get(STUDENTS, ({ request }) => {
        askedPage = new URL(request.url).searchParams.get('p');
        return HttpResponse.json(found(['Ana Souza'], 3, 43));
      }),
    );

    renderWithProviders(<StudentSearch />, '/registrar/students?q=ana&p=3');

    expect(await screen.findByText('Ana Souza')).toBeVisible();
    expect(askedPage).toBe('3');
  });
});

describe('searching', () => {
  test('typing and submitting puts the term in the URL as well as in the request, so a search can be bookmarked or sent to a colleague instead of described over the phone', async () => {
    let asked: string | null = null;
    server.use(
      http.get(STUDENTS, ({ request }) => {
        asked = new URL(request.url).searchParams.get('q');
        return HttpResponse.json(found(['Ana Souza']));
      }),
    );

    const { user } = renderRoutes(
      [{ path: '/registrar/students', element: <StudentSearch /> }],
      '/registrar/students',
    );

    await user.type(screen.getByRole('textbox', { name: 'Buscar por nome' }), 'ana');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Ana Souza')).toBeVisible();
    await waitFor(() => expect(asked).toBe('ana'));
  });

  test('a new search drops the page from the address, where a bookmarkable `p=4` would make a search that found something read as a search that found nothing', async () => {
    server.use(http.get(STUDENTS, () => HttpResponse.json(found(['Ana Souza']))));

    const { user } = renderRoutes(
      [
        {
          path: '/registrar/students',
          element: (
            <>
              <StudentSearch />
              <TheAddressTheMemoryRouterKeepsToItself />
            </>
          ),
        },
      ],
      '/registrar/students?q=bruno&p=4',
    );

    await screen.findByText('Ana Souza');
    await user.clear(screen.getByRole('textbox', { name: 'Buscar por nome' }));
    await user.type(screen.getByRole('textbox', { name: 'Buscar por nome' }), 'ana');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('?q=ana'));
    expect(screen.getByTestId('endereco').textContent).not.toContain('p=');
  });

  test('a search that matches nothing says so, naming the term', async () => {
    server.use(http.get(STUDENTS, () => HttpResponse.json(found([]))));

    renderWithProviders(<StudentSearch />, '/registrar/students?q=zzz');

    expect(await screen.findByText(/Nenhum aluno encontrado para "zzz"/)).toBeVisible();
  });

  test('a student registered but not yet enrolled shows the three columns as absent, not as empty cells that might be a rendering failure', async () => {
    server.use(http.get(STUDENTS, () => HttpResponse.json(found(['Ana Souza', 'Bruno Lima']))));

    renderWithProviders(<StudentSearch />, '/registrar/students?q=a');

    await screen.findByText('Bruno Lima');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  test('each row links to the record', async () => {
    server.use(http.get(STUDENTS, () => HttpResponse.json(found(['Ana Souza']))));

    renderWithProviders(<StudentSearch />, '/registrar/students?q=ana');

    expect(await screen.findByRole('link', { name: 'Ana Souza' })).toHaveAttribute(
      'href',
      '/registrar/students/student-1-0',
    );
  });
});
