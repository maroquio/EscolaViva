import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { renderRoutes, renderWithProviders, userWith } from '../../testSupport';
import {
  CLASS_GROUPS_LABEL,
  ENROLLED_LABEL,
  SCHOOLS_LABEL,
  USERS_LABEL,
} from '../../../src/shared/labels/constants';
import { AcademicYearForm } from '../../../src/features/network/AcademicYearForm';
import { AcademicYearList } from '../../../src/features/network/AcademicYearList';
import { Dashboard } from '../../../src/features/network/Dashboard';
import { SchoolForm } from '../../../src/features/network/SchoolForm';
import { SchoolList } from '../../../src/features/network/SchoolList';
import { UserList } from '../../../src/features/network/UserList';

const SESSION = '*/api/v1/session';
const DASHBOARD = '*/api/v1/network/dashboard';
const SCHOOLS = '*/api/v1/network/schools';
const USERS = '*/api/v1/network/users';
const ACADEMIC_YEARS = '*/api/v1/network/academic-years';

const PAGE_SIZE = 10;
const PAGE_PARAM = 'p';

const dateFieldLabelled = (labelPrefix: RegExp): HTMLElement => screen.getByLabelText(labelPrefix);

const signedIn = (): void => {
  server.use(http.get(SESSION, () => HttpResponse.json({ user: userWith(['network_admin']) })));
};

const schoolsPage = (page: number) => ({
  items: Array.from({ length: PAGE_SIZE }, (_, index) => ({
    id: `school-${page}-${index}`,
    name: `Escola ${page}-${index}`,
    inepCode: index === 0 ? null : `1234567${index}`,
    active: index % 2 === 0,
  })),
  page,
  pages: 5,
  total: 43,
  size: PAGE_SIZE,
});

describe('Dashboard', () => {
  const counts = { schools: 3, users: 12, classGroups: 7, enrolled: 154 };

  const yearInForce = {
    id: 'y1',
    year: 2026,
    startDate: '2026-02-02',
    endDate: '2026-12-18',
  };

  const counterNamed = (label: string): HTMLElement =>
    screen.getByText(label).parentElement as HTMLElement;

  const counterShows = (label: string, value: string): void => {
    expect(within(counterNamed(label)).getByText(value)).toBeVisible();
  };

  test('shows the four counters and the year in force', async () => {
    signedIn();
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({ counts, academicYear: yearInForce, definedYears: 2 }),
      ),
    );

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText(ENROLLED_LABEL)).toBeVisible();
    counterShows(SCHOOLS_LABEL, '3');
    counterShows(USERS_LABEL, '12');
    counterShows(CLASS_GROUPS_LABEL, '7');
    counterShows(ENROLLED_LABEL, '154');
    expect(screen.getByText('2026')).toBeVisible();
    expect(screen.getByText('02/02/2026')).toBeVisible();
  });

  test('the class group and enrolment counters are not links, because those screens belong to the registrar', async () => {
    signedIn();
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({ counts, academicYear: yearInForce, definedYears: 2 }),
      ),
    );

    renderWithProviders(<Dashboard />);

    expect(await screen.findByRole('link', { name: /Escolas/ })).toHaveAttribute(
      'href',
      '/network/schools',
    );
    expect(screen.getByRole('link', { name: /Usuários/ })).toHaveAttribute('href', '/network/users');
    expect(screen.queryByRole('link', { name: /Turmas/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Matriculados/ })).toBeNull();
  });

  test('with no academic year it offers the step that unblocks everything else', async () => {
    signedIn();
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({ counts, academicYear: null, definedYears: 0 }),
      ),
    );

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Nenhum ano letivo definido')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Definir ano letivo' })).toHaveAttribute(
      'href',
      '/network/academic-years/new',
    );
  });

  test('a failure says so and offers a retry, instead of showing empty counters', async () => {
    signedIn();
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({ errors: [{ code: 'x', message: 'Falha.' }], correlationId: 'zz9' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Dashboard />);

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByText('zz9')).toBeVisible();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeVisible();
    expect(screen.queryByText(SCHOOLS_LABEL)).toBeNull();
    expect(screen.queryByText(CLASS_GROUPS_LABEL)).toBeNull();
    expect(screen.queryByText(ENROLLED_LABEL)).toBeNull();
  });
});

describe('SchoolList', () => {
  test('opens on the page the URL asks for, because a dropped ?p=3 reads as data that changed', async () => {
    let asked: string | null = null;
    server.use(
      http.get(SCHOOLS, ({ request }) => {
        asked = new URL(request.url).searchParams.get(PAGE_PARAM);
        return HttpResponse.json(schoolsPage(3));
      }),
    );

    renderWithProviders(<SchoolList />, '/network/schools?p=3');

    expect(await screen.findByText('Escola 3-0')).toBeVisible();
    expect(asked).toBe('3');
    expect(screen.getByText('21–30 de 43 escolas')).toBeVisible();
  });

  test('the rows of the page being left stay on screen until the next page arrives', async () => {
    let letPageTwoAnswer = (): void => {};
    const pageTwoWasReleased = new Promise<void>((resolve) => {
      letPageTwoAnswer = resolve;
    });
    server.use(
      http.get(SCHOOLS, async ({ request }) => {
        const asked = new URL(request.url).searchParams.get(PAGE_PARAM);
        if (asked === '2') await pageTwoWasReleased;
        return HttpResponse.json(schoolsPage(asked === '2' ? 2 : 1));
      }),
    );

    const { user } = renderWithProviders(<SchoolList />, '/network/schools');
    expect(await screen.findByText('Escola 1-0')).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'Próxima' }));

    expect(screen.getByText('Escola 1-0')).toBeVisible();
    expect(screen.queryByText('Carregando…')).toBeNull();

    letPageTwoAnswer();
    expect(await screen.findByText('Escola 2-0')).toBeVisible();
  });

  test('is only the table, because a form sharing the page would reload it on every refusal', async () => {
    server.use(http.get(SCHOOLS, () => HttpResponse.json(schoolsPage(1))));

    renderWithProviders(<SchoolList />);

    await screen.findByRole('table');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('link', { name: 'Nova escola' })).toHaveAttribute(
      'href',
      '/network/schools/new',
    );
  });

  test('a missing INEP code reads as absent, not as blank', async () => {
    server.use(http.get(SCHOOLS, () => HttpResponse.json(schoolsPage(1))));

    renderWithProviders(<SchoolList />);

    const table = await screen.findByRole('table');
    const firstRow = within(table).getAllByRole('row')[1] as HTMLElement;
    expect(within(firstRow).getByText('—')).toBeVisible();
  });

  test('an empty network offers the first unit instead of an empty table', async () => {
    server.use(
      http.get(SCHOOLS, () =>
        HttpResponse.json({ items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE }),
      ),
    );

    renderWithProviders(<SchoolList />);

    expect(await screen.findByText('Nenhuma unidade criada')).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  test('and shows no pagination, because "0–0 de 0" next to an empty state explains the same nothing twice', async () => {
    server.use(
      http.get(SCHOOLS, () =>
        HttpResponse.json({ items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE }),
      ),
    );

    renderWithProviders(<SchoolList />);

    await screen.findByText('Nenhuma unidade criada');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('UserList', () => {
  test('shows each role with the school it exists in, because the same person can be a registrar in one unit and a guardian in another', async () => {
    server.use(
      http.get(USERS, () =>
        HttpResponse.json({
          items: [
            {
              id: 'user-1',
              name: 'Joana Ribeiro',
              email: 'joana@escolaviva.test',
              cpf: '52998224725',
              phone: null,
              active: true,
              roles: [
                { schoolId: 'school-1', schoolName: 'Escola Central', role: 'registrar' },
                { schoolId: 'school-2', schoolName: 'Escola do Bairro', role: 'guardian' },
              ],
            },
          ],
          page: 1,
          pages: 1,
          total: 1,
          size: PAGE_SIZE,
        }),
      ),
    );

    renderWithProviders(<UserList />);

    expect(await screen.findByText('Secretaria · Escola Central')).toBeVisible();
    expect(screen.getByText('Responsável · Escola do Bairro')).toBeVisible();
  });
});

describe('AcademicYearList', () => {
  test('shows the dates formatted the way the rest of the system shows them', async () => {
    server.use(
      http.get(ACADEMIC_YEARS, () =>
        HttpResponse.json({
          items: [{ id: 'y1', year: 2026, startDate: '2026-02-02', endDate: '2026-12-18' }],
          page: 1,
          pages: 1,
          total: 1,
          size: PAGE_SIZE,
        }),
      ),
    );

    renderWithProviders(<AcademicYearList />);

    expect(await screen.findByText('02/02/2026')).toBeVisible();
    expect(screen.getByText('18/12/2026')).toBeVisible();
  });

  test('keeps the order the server sent, newest first, because the year in force is the row they came to see', async () => {
    server.use(
      http.get(ACADEMIC_YEARS, () =>
        HttpResponse.json({
          items: [
            { id: 'y2', year: 2026, startDate: '2026-02-02', endDate: '2026-12-18' },
            { id: 'y1', year: 2025, startDate: '2025-02-03', endDate: '2025-12-19' },
          ],
          page: 1,
          pages: 1,
          total: 2,
          size: PAGE_SIZE,
        }),
      ),
    );

    renderWithProviders(<AcademicYearList />);

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1] as HTMLElement).getByText('2026')).toBeVisible();
    expect(within(rows[2] as HTMLElement).getByText('2025')).toBeVisible();
  });
});

describe('SchoolForm', () => {
  test('creates a school and goes back to the list', async () => {
    let sent: unknown = null;
    server.use(
      http.post(SCHOOLS, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: 'new' }, { status: 201 });
      }),
      http.get(SCHOOLS, () =>
        HttpResponse.json({ items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE }),
      ),
    );

    const { user } = renderRoutes(
      [
        { path: '/network/schools/new', element: <SchoolForm /> },
        { path: '/network/schools', element: <SchoolList /> },
      ],
      '/network/schools/new',
    );

    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Escola Nova');
    await user.click(screen.getByRole('button', { name: 'Criar escola' }));

    expect(await screen.findByText('Nenhuma unidade criada')).toBeVisible();
    expect(sent).toEqual({ name: 'Escola Nova', inepCode: null });
  });

  test('a repeated send still reports the school as created, because it exists either way', async () => {
    server.use(
      http.post(SCHOOLS, () =>
        HttpResponse.json({ repeated: true, location: '/api/v1/network/schools' }),
      ),
      http.get(SCHOOLS, () =>
        HttpResponse.json({ items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE }),
      ),
    );

    const { user } = renderRoutes(
      [
        { path: '/network/schools/new', element: <SchoolForm /> },
        { path: '/network/schools', element: <SchoolList /> },
      ],
      '/network/schools/new',
    );

    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Escola Nova');
    await user.click(screen.getByRole('button', { name: 'Criar escola' }));

    expect(await screen.findByText('Nenhuma unidade criada')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('an empty INEP code is sent as absent, not as an empty string', async () => {
    let sent: { inepCode?: unknown } = {};
    server.use(
      http.post(SCHOOLS, async ({ request }) => {
        sent = (await request.json()) as { inepCode?: unknown };
        return HttpResponse.json({ id: 'new' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<SchoolForm />);

    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Escola Nova');
    await user.click(screen.getByRole('button', { name: 'Criar escola' }));

    await waitFor(() => expect(sent.inepCode).toBeNull());
  });

  test('a name that is only spaces is refused before the request', async () => {
    let called = false;
    server.use(
      http.post(SCHOOLS, () => {
        called = true;
        return HttpResponse.json({ id: 'new' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<SchoolForm />);

    await user.type(screen.getByRole('textbox', { name: 'Nome' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Criar escola' }));

    expect(await screen.findByText('Informe o nome da escola.')).toBeVisible();
    expect(called).toBe(false);
  });

  test('a refusal naming a field lands next to that field', async () => {
    server.use(
      http.post(SCHOOLS, () =>
        HttpResponse.json(
          {
            errors: [{ field: 'name', code: 'nome_duplicado', message: 'Já existe uma escola com este nome.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = renderWithProviders(<SchoolForm />);

    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Escola Central');
    await user.click(screen.getByRole('button', { name: 'Criar escola' }));

    expect(await screen.findByText('Já existe uma escola com este nome.')).toBeVisible();
  });
});

describe('AcademicYearForm', () => {
  test('sends the year as a number, not as the string the input holds', async () => {
    let sent: { year?: unknown } = {};
    server.use(
      http.post(ACADEMIC_YEARS, async ({ request }) => {
        sent = (await request.json()) as { year?: unknown };
        return HttpResponse.json({ id: 'y2' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<AcademicYearForm />);

    await user.type(screen.getByRole('spinbutton', { name: 'Ano' }), '2026');
    await user.type(dateFieldLabelled(/^Início/), '2026-02-02');
    await user.type(dateFieldLabelled(/^Término/), '2026-12-18');
    await user.click(screen.getByRole('button', { name: 'Definir ano letivo' }));

    await waitFor(() => expect(sent.year).toBe(2026));
  });

  test('asks the browser for its own date picker, and puts no second date implementation in front of the ISO string the server parses', () => {
    renderWithProviders(<AcademicYearForm />);

    expect(dateFieldLabelled(/^Início/)).toHaveAttribute('type', 'date');
    expect(dateFieldLabelled(/^Término/)).toHaveAttribute('type', 'date');
  });

  test('an empty form names each missing field without asking the server', async () => {
    let called = false;
    server.use(
      http.post(ACADEMIC_YEARS, () => {
        called = true;
        return HttpResponse.json({ id: 'y2' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<AcademicYearForm />);

    await user.click(screen.getByRole('button', { name: 'Definir ano letivo' }));

    expect(await screen.findByText('Informe o ano.')).toBeVisible();
    expect(screen.getByText('Informe a data de início.')).toBeVisible();
    expect(called).toBe(false);
  });

  test('a rule the server owns arrives as a warning, not as a second copy of the rule', async () => {
    server.use(
      http.post(ACADEMIC_YEARS, () =>
        HttpResponse.json(
          {
            errors: [{ code: 'periodo_invalido', message: 'O término precisa ser depois do início.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = renderWithProviders(<AcademicYearForm />);

    await user.type(screen.getByRole('spinbutton', { name: 'Ano' }), '2026');
    await user.type(dateFieldLabelled(/^Início/), '2026-12-18');
    await user.type(dateFieldLabelled(/^Término/), '2026-02-02');
    await user.click(screen.getByRole('button', { name: 'Definir ano letivo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O término precisa ser depois do início.',
    );
  });
});
