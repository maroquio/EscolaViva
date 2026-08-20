import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { useLocation } from 'react-router';
import { server } from '../../../testSetup';
import { renderRoutes, renderWithProviders } from '../../../testSupport';
import { AssignmentForm } from '../../../../src/features/registrar/class-groups/AssignmentForm';
import { ClassGroupForm } from '../../../../src/features/registrar/class-groups/ClassGroupForm';
import { ClassGroupList } from '../../../../src/features/registrar/class-groups/ClassGroupList';
import { ClassGroupRecord } from '../../../../src/features/registrar/class-groups/ClassGroupRecord';
import { SubjectForm } from '../../../../src/features/registrar/subjects/SubjectForm';
import { SubjectList } from '../../../../src/features/registrar/subjects/SubjectList';

const CLASS_GROUPS = '*/api/v1/registrar/class-groups';
const CLASS_GROUP = '*/api/v1/registrar/class-groups/:id';
const ASSIGN = '*/api/v1/registrar/class-groups/:id/subjects';
const SUBJECTS = '*/api/v1/registrar/subjects';
const SCHOOL_OPTIONS = '*/api/v1/options/schools';
const YEAR_OPTIONS = '*/api/v1/options/academic-years';
const SUBJECT_OPTIONS = '*/api/v1/options/subjects';
const TEACHER_OPTIONS = '*/api/v1/options/teachers';

const PAGE_SIZE = 10;

const chooser = (name: string): HTMLElement => screen.getByRole('combobox', { name });

const TheAddressTheMemoryRouterKeepsToItself = (): React.ReactElement => {
  const { search } = useLocation();
  return <p data-testid="endereco">{search}</p>;
};

const schools = [
  { id: 'school-1', name: 'Escola Central', active: true },
  { id: 'school-2', name: 'Escola do Bairro', active: true },
];

const years = [
  { id: 'y1', year: 2026 },
  { id: 'y2', year: 2025 },
];

const classGroup = {
  id: 'cg-1',
  name: '3º ano A',
  gradeLevel: '3º ano',
  shift: 'morning' as const,
  schoolId: 'school-1',
  schoolName: 'Escola Central',
  academicYearId: 'y1',
  year: 2026,
};

const listOf = (items: (typeof classGroup)[], page = 1, total = items.length) => ({
  items,
  page,
  pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  total,
  size: PAGE_SIZE,
});

beforeEach(() => {
  server.use(
    http.get(SCHOOL_OPTIONS, () => HttpResponse.json(schools)),
    http.get(YEAR_OPTIONS, () => HttpResponse.json(years)),
  );
});

describe('ClassGroupList', () => {
  test('the shift is shown as a Portuguese label, never as the raw contract value on a table somebody reads', async () => {
    server.use(http.get(CLASS_GROUPS, () => HttpResponse.json(listOf([classGroup]))));

    renderWithProviders(<ClassGroupList />, '/registrar/class-groups');

    expect(await screen.findByText('Matutino')).toBeVisible();
    expect(screen.queryByText('morning')).toBeNull();
  });

  test('?school= and ?year= both travel to the server, or one of them silently does nothing', async () => {
    const askedOnEachRequest: URLSearchParams[] = [];
    server.use(
      http.get(CLASS_GROUPS, ({ request }) => {
        askedOnEachRequest.push(new URL(request.url).searchParams);
        return HttpResponse.json(listOf([classGroup]));
      }),
    );

    renderWithProviders(
      <ClassGroupList />,
      '/registrar/class-groups?school=school-1&year=y1',
    );

    await screen.findByText('3º ano A');
    expect(askedOnEachRequest.at(-1)?.get('school')).toBe('school-1');
    expect(askedOnEachRequest.at(-1)?.get('year')).toBe('y1');
  });

  test('an unset filter is omitted from the request, not sent empty: the server tolerates `?school=` and answers the same page either way, so what this guards is that the request says what the person asked for', async () => {
    const askedOnEachRequest: URLSearchParams[] = [];
    server.use(
      http.get(CLASS_GROUPS, ({ request }) => {
        askedOnEachRequest.push(new URL(request.url).searchParams);
        return HttpResponse.json(listOf([classGroup]));
      }),
    );

    renderWithProviders(<ClassGroupList />, '/registrar/class-groups');

    await screen.findByText('3º ano A');
    expect(askedOnEachRequest.at(-1)?.has('school')).toBe(false);
    expect(askedOnEachRequest.at(-1)?.has('year')).toBe(false);
  });

  test('changing the school filter while on ?p=3 drops the page from the address, because the third page of "todas as escolas" may not exist in "Escola Central" and the clamped answer makes a filter that has results look like one that found nothing', async () => {
    server.use(http.get(CLASS_GROUPS, () => HttpResponse.json(listOf([classGroup], 3, 43))));

    const { user } = renderRoutes(
      [
        {
          path: '/registrar/class-groups',
          element: (
            <>
              <ClassGroupList />
              <TheAddressTheMemoryRouterKeepsToItself />
            </>
          ),
        },
      ],
      '/registrar/class-groups?p=3',
    );

    await screen.findByText('3º ano A');
    await user.selectOptions(chooser('Escola'), 'Escola Central');

    await waitFor(() =>
      expect(screen.getByTestId('endereco')).toHaveTextContent('school=school-1'),
    );
    expect(screen.getByTestId('endereco').textContent).not.toContain('p=');
  });

  test('changing the year filter drops the page too, and keeps the school filter', async () => {
    server.use(http.get(CLASS_GROUPS, () => HttpResponse.json(listOf([classGroup], 3, 43))));

    const { user } = renderRoutes(
      [
        {
          path: '/registrar/class-groups',
          element: (
            <>
              <ClassGroupList />
              <TheAddressTheMemoryRouterKeepsToItself />
            </>
          ),
        },
      ],
      '/registrar/class-groups?p=3&school=school-1',
    );

    await screen.findByText('3º ano A');
    await user.selectOptions(chooser('Ano letivo'), '2026');

    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('year=y1'));
    const address = screen.getByTestId('endereco').textContent ?? '';
    expect(address).not.toContain('p=');
    expect(address).toContain('school=school-1');
  });

  test('choosing "todas as escolas" removes the filter instead of sending an empty one', async () => {
    server.use(http.get(CLASS_GROUPS, () => HttpResponse.json(listOf([classGroup]))));

    const { user } = renderRoutes(
      [
        {
          path: '/registrar/class-groups',
          element: (
            <>
              <ClassGroupList />
              <TheAddressTheMemoryRouterKeepsToItself />
            </>
          ),
        },
      ],
      '/registrar/class-groups?school=school-1',
    );

    await screen.findByText('3º ano A');
    await user.selectOptions(chooser('Escola'), 'Todas as escolas');

    await waitFor(() =>
      expect(screen.getByTestId('endereco').textContent).not.toContain('school='),
    );
  });

  test('a filter that matches nothing offers a way out of it', async () => {
    server.use(http.get(CLASS_GROUPS, () => HttpResponse.json(listOf([], 1, 0))));

    renderWithProviders(<ClassGroupList />, '/registrar/class-groups?school=school-2');

    expect(await screen.findByText('Nenhuma turma encontrada')).toBeVisible();
    expect(screen.getByText(/Limpe os filtros/)).toBeVisible();
  });
});

describe('ClassGroupForm', () => {
  test('a 422 that names the name field lands under that field, and not at the top', async () => {
    server.use(
      http.post(CLASS_GROUPS, () =>
        HttpResponse.json(
          {
            errors: [
              { field: 'name', code: 'nome_duplicado', message: 'Já existe uma turma com este nome.' },
            ],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = renderWithProviders(<ClassGroupForm />);

    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), '3º ano A');
    await user.type(screen.getByRole('textbox', { name: 'Série' }), '3º ano');
    await user.selectOptions(chooser('Escola'), 'Escola Central');
    await user.selectOptions(chooser('Ano letivo'), '2026');
    await user.click(screen.getByRole('button', { name: 'Criar turma' }));

    expect(await screen.findByText('Já existe uma turma com este nome.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('creates the class group with the shift as its contract value', async () => {
    let sent: unknown = null;
    server.use(
      http.post(CLASS_GROUPS, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: 'cg-9' }, { status: 201 });
      }),
      http.get(CLASS_GROUPS, () => HttpResponse.json(listOf([]))),
    );

    const { user } = renderRoutes(
      [
        { path: '/registrar/class-groups/new', element: <ClassGroupForm /> },
        { path: '/registrar/class-groups', element: <p>lista de turmas</p> },
      ],
      '/registrar/class-groups/new',
    );

    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), '3º ano A');
    await user.type(screen.getByRole('textbox', { name: 'Série' }), '3º ano');
    await user.selectOptions(chooser('Turno'), 'Vespertino');
    await user.selectOptions(chooser('Escola'), 'Escola Central');
    await user.selectOptions(chooser('Ano letivo'), '2026');
    await user.click(screen.getByRole('button', { name: 'Criar turma' }));

    expect(await screen.findByText('lista de turmas')).toBeVisible();
    expect(sent).toEqual({
      name: '3º ano A',
      gradeLevel: '3º ano',
      shift: 'afternoon',
      schoolId: 'school-1',
      academicYearId: 'y1',
    });
  });

  test('an unchosen school is refused without a request', async () => {
    let called = false;
    server.use(
      http.post(CLASS_GROUPS, () => {
        called = true;
        return HttpResponse.json({ id: 'x' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<ClassGroupForm />);

    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), '3º ano A');
    await user.type(screen.getByRole('textbox', { name: 'Série' }), '3º ano');
    await user.click(screen.getByRole('button', { name: 'Criar turma' }));

    expect(await screen.findByText('Escolha a escola.')).toBeVisible();
    expect(called).toBe(false);
  });
});

describe('ClassGroupRecord', () => {
  const record = (over: Record<string, unknown> = {}) => ({
    classGroup,
    assignments: {
      items: [{ id: 'a-1', subjectName: 'Matemática', teacherName: 'Carlos Nunes' }],
      page: 1,
      pages: 1,
      total: 1,
      size: PAGE_SIZE,
    },
    enrollments: {
      items: [
        {
          id: 'e-1',
          studentId: 'student-1',
          studentName: 'Ana Souza',
          classGroupId: 'cg-1',
          classGroupName: '3º ano A',
          year: 2026,
          status: 'active' as const,
        },
      ],
      page: 1,
      pages: 1,
      total: 1,
      size: PAGE_SIZE,
    },
    ...over,
  });

  const openRecord = (address = '/registrar/class-groups/cg-1') =>
    renderRoutes(
      [
        { path: '/registrar/class-groups/:id', element: <ClassGroupRecord /> },
        { path: '/registrar/class-groups', element: <p>lista de turmas</p> },
      ],
      address,
    );

  test('shows what the class group is, its subjects and who is enrolled', async () => {
    server.use(http.get(CLASS_GROUP, () => HttpResponse.json(record())));

    openRecord();

    expect(await screen.findByRole('heading', { name: '3º ano A', level: 1 })).toBeVisible();
    expect(screen.getByText('Matutino')).toBeVisible();
    expect(screen.getByText('Matemática')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ana Souza' })).toHaveAttribute(
      'href',
      '/registrar/students/student-1',
    );
  });

  test('?pSubjects=2 advances only the subjects table, leaving the enrollments cursor on page one', async () => {
    let subjects: string | null = null;
    let enrollments: string | null = null;
    server.use(
      http.get(CLASS_GROUP, ({ request }) => {
        const url = new URL(request.url);
        subjects = url.searchParams.get('pSubjects');
        enrollments = url.searchParams.get('pEnrollments');
        return HttpResponse.json(record());
      }),
    );

    openRecord('/registrar/class-groups/cg-1?pSubjects=2');

    await screen.findByRole('heading', { name: '3º ano A', level: 1 });
    expect(subjects).toBe('2');
    expect(enrollments).toBe('1');
  });

  test('a class group with no subject says what that costs', async () => {
    server.use(
      http.get(CLASS_GROUP, () =>
        HttpResponse.json(
          record({ assignments: { items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE } }),
        ),
      ),
    );

    openRecord();

    expect(await screen.findByText('Nenhuma disciplina atribuída')).toBeVisible();
    expect(screen.getByText(/nenhum professor vê esta turma/i)).toBeVisible();
  });

  test('a 404 becomes a screen that explains it, not an error card', async () => {
    server.use(
      http.get(CLASS_GROUP, () =>
        HttpResponse.json(
          { errors: [{ code: 'not_found', message: 'Não encontrado.' }], correlationId: 'abc' },
          { status: 404 },
        ),
      ),
    );

    openRecord();

    expect(await screen.findByRole('heading', { name: 'Turma não encontrada' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('AssignmentForm', () => {
  const openAssign = () =>
    renderRoutes(
      [
        { path: '/registrar/class-groups/:id/subjects/new', element: <AssignmentForm /> },
        { path: '/registrar/class-groups/:id', element: <p>ficha da turma</p> },
      ],
      '/registrar/class-groups/cg-1/subjects/new',
    );

  const recordAnswers = (): void => {
    server.use(
      http.get(CLASS_GROUP, () =>
        HttpResponse.json({
          classGroup,
          assignments: { items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE },
          enrollments: { items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE },
        }),
      ),
    );
  };

  test('the teachers asked for are the ones of the class group school, which no control on this screen chooses, because offering a teacher of another unit would offer a choice the server refuses', async () => {
    let askedSchool: string | null = null;
    recordAnswers();
    server.use(
      http.get(SUBJECT_OPTIONS, () => HttpResponse.json([{ id: 'sub-1', name: 'Matemática' }])),
      http.get(TEACHER_OPTIONS, ({ request }) => {
        askedSchool = new URL(request.url).searchParams.get('schoolId');
        return HttpResponse.json([{ id: 'teacher-1', name: 'Carlos Nunes' }]);
      }),
    );

    openAssign();

    await screen.findByRole('combobox', { name: 'Professor' });
    expect(askedSchool).toBe('school-1');
  });

  test('a school where nobody holds the teacher role is a state the registrar can reach: it gets a sentence naming the missing step on another screen, not an error', async () => {
    recordAnswers();
    server.use(
      http.get(SUBJECT_OPTIONS, () => HttpResponse.json([{ id: 'sub-1', name: 'Matemática' }])),
      http.get(TEACHER_OPTIONS, () => HttpResponse.json([])),
    );

    openAssign();

    expect(await screen.findByText('Nenhum professor nesta escola')).toBeVisible();
    expect(screen.getByText(/Escola Central/)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Professor' })).toBeNull();
  });

  test('the teachers are not asked for until the record says which school', async () => {
    const askedSchools: (string | null)[] = [];
    recordAnswers();
    server.use(
      http.get(SUBJECT_OPTIONS, () => HttpResponse.json([{ id: 'sub-1', name: 'Matemática' }])),
      http.get(TEACHER_OPTIONS, ({ request }) => {
        askedSchools.push(new URL(request.url).searchParams.get('schoolId'));
        return HttpResponse.json([{ id: 'teacher-1', name: 'Carlos Nunes' }]);
      }),
    );

    openAssign();

    await screen.findByRole('combobox', { name: 'Professor' });
    expect(askedSchools).toEqual(['school-1']);
  });

  test('with no subject registered it points at the subject form', async () => {
    recordAnswers();
    server.use(
      http.get(SUBJECT_OPTIONS, () => HttpResponse.json([])),
      http.get(TEACHER_OPTIONS, () => HttpResponse.json([{ id: 'teacher-1', name: 'Carlos Nunes' }])),
    );

    openAssign();

    expect(await screen.findByText('Nenhuma disciplina cadastrada')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Cadastrar disciplina' })).toHaveAttribute(
      'href',
      '/registrar/subjects/new',
    );
  });

  test('assigns and returns to the class group', async () => {
    let sent: unknown = null;
    recordAnswers();
    server.use(
      http.get(SUBJECT_OPTIONS, () => HttpResponse.json([{ id: 'sub-1', name: 'Matemática' }])),
      http.get(TEACHER_OPTIONS, () => HttpResponse.json([{ id: 'teacher-1', name: 'Carlos Nunes' }])),
      http.post(ASSIGN, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: 'a-9' }, { status: 201 });
      }),
    );

    const { user } = openAssign();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Disciplina' }),
      'Matemática',
    );
    await user.selectOptions(chooser('Professor'), 'Carlos Nunes');
    await user.click(screen.getByRole('button', { name: 'Atribuir disciplina' }));

    expect(await screen.findByText('ficha da turma')).toBeVisible();
    expect(sent).toEqual({ subjectId: 'sub-1', teacherUserId: 'teacher-1' });
  });
});

describe('subjects', () => {
  test('the list shows the subjects and pages them', async () => {
    let asked: string | null = null;
    server.use(
      http.get(SUBJECTS, ({ request }) => {
        asked = new URL(request.url).searchParams.get('p');
        return HttpResponse.json({
          items: [{ id: 'sub-1', name: 'Matemática' }],
          page: 2,
          pages: 3,
          total: 25,
          size: PAGE_SIZE,
        });
      }),
    );

    renderWithProviders(<SubjectList />, '/registrar/subjects?p=2');

    expect(await screen.findByText('Matemática')).toBeVisible();
    expect(asked).toBe('2');
  });

  test('an empty network says why subjects matter', async () => {
    server.use(
      http.get(SUBJECTS, () =>
        HttpResponse.json({ items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE }),
      ),
    );

    renderWithProviders(<SubjectList />);

    expect(await screen.findByText('Nenhuma disciplina cadastrada')).toBeVisible();
  });

  test('the form creates one and a duplicate name comes back on the field', async () => {
    server.use(
      http.post(SUBJECTS, () =>
        HttpResponse.json(
          {
            errors: [
              { field: 'name', code: 'duplicada', message: 'Já existe uma disciplina com este nome.' },
            ],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = renderWithProviders(<SubjectForm />);

    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Matemática');
    await user.click(screen.getByRole('button', { name: 'Cadastrar disciplina' }));

    expect(await screen.findByText('Já existe uma disciplina com este nome.')).toBeVisible();
  });
});
