import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { renderRoutes, renderWithProviders, userWith } from '../../testSupport';
import { Dashboard } from '../../../src/features/registrar/Dashboard';
import { GuardianForm } from '../../../src/features/registrar/guardians/GuardianForm';
import { GuardianList } from '../../../src/features/registrar/guardians/GuardianList';
import { EnrollmentForm } from '../../../src/features/registrar/students/EnrollmentForm';
import { GuardianLinkForm } from '../../../src/features/registrar/students/GuardianLinkForm';
import { StudentForm } from '../../../src/features/registrar/students/StudentForm';
import { TransferForm } from '../../../src/features/registrar/students/TransferForm';
import { StatusTag } from '../../../src/features/registrar/StatusTag';
import RegistrarRoutes from '../../../src/features/registrar/routes';
import { registrarKeys, useStudentSearch } from '../../../src/features/registrar/queries';
import { useEnroll, useTransfer } from '../../../src/features/registrar/mutations';

const SESSION = '*/api/v1/session';
const DASHBOARD = '*/api/v1/registrar/dashboard';
const STUDENTS = '*/api/v1/registrar/students';
const GUARDIANS = '*/api/v1/registrar/guardians';
const ENROLLMENTS = '*/api/v1/registrar/enrollments';
const AVAILABLE = '*/api/v1/registrar/students/:id/available-guardians';
const LINK = '*/api/v1/registrar/students/:id/guardians';
const TRANSFER_VIEW = '*/api/v1/registrar/enrollments/:id/transfer';
const CLASS_GROUP_OPTIONS = '*/api/v1/options/class-groups';
const ACADEMIC_YEAR_OPTIONS = '*/api/v1/options/academic-years';

const PAGE_SIZE = 10;

const field = (name: string): HTMLElement => screen.getByRole('textbox', { name });
const chooser = (name: string): HTMLElement => screen.getByRole('combobox', { name });
const dateField = (label: RegExp): HTMLElement => screen.getByLabelText(label);

const classGroups = [
  {
    id: 'cg-1',
    name: '3º ano A',
    gradeLevel: '3º ano',
    shift: 'morning' as const,
    schoolId: 'school-1',
    schoolName: 'Escola Central',
    academicYearId: 'y1',
    year: 2026,
  },
];

const years = [{ id: 'y1', year: 2026 }];

describe('StudentForm', () => {
  test('registers a student and goes to the record it just created', async () => {
    let sent: unknown = null;
    server.use(
      http.post(STUDENTS, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: 'student-9' }, { status: 201 });
      }),
    );

    const { user } = renderRoutes(
      [
        { path: '/registrar/students/new', element: <StudentForm /> },
        { path: '/registrar/students/:id', element: <p>ficha do aluno</p> },
      ],
      '/registrar/students/new',
    );

    await user.type(field('Nome'), 'Ana Souza');
    await user.type(dateField(/^Data de nascimento/), '2015-03-14');
    await user.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));

    expect(await screen.findByText('ficha do aluno')).toBeVisible();
    expect(sent).toEqual({ name: 'Ana Souza', birthDate: '2015-03-14' });
  });

  test('a repeated registration lands on the search, because the `location` it comes back with is an API address and not a browser route', async () => {
    server.use(
      http.post(STUDENTS, () =>
        HttpResponse.json({ repeated: true, location: '/api/v1/registrar/students/student-9' }),
      ),
    );

    const { user } = renderRoutes(
      [
        { path: '/registrar/students/new', element: <StudentForm /> },
        { path: '/registrar/students', element: <p>busca de alunos</p> },
        { path: '/registrar/students/:id', element: <p>ficha do aluno</p> },
      ],
      '/registrar/students/new',
    );

    await user.type(field('Nome'), 'Ana Souza');
    await user.type(dateField(/^Data de nascimento/), '2015-03-14');
    await user.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));

    expect(await screen.findByText('busca de alunos')).toBeVisible();
  });

  test('a 422 that names the name field lands under that field, and not at the top', async () => {
    server.use(
      http.post(STUDENTS, () =>
        HttpResponse.json(
          {
            errors: [{ field: 'name', code: 'nome_invalido', message: 'Informe nome e sobrenome.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = renderWithProviders(<StudentForm />);

    await user.type(field('Nome'), 'Ana');
    await user.type(dateField(/^Data de nascimento/), '2015-03-14');
    await user.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));

    expect(await screen.findByText('Informe nome e sobrenome.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('an empty form asks the server nothing', async () => {
    let called = false;
    server.use(
      http.post(STUDENTS, () => {
        called = true;
        return HttpResponse.json({ id: 'x' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<StudentForm />);

    await user.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));

    expect(await screen.findByText('Informe o nome do aluno.')).toBeVisible();
    expect(called).toBe(false);
  });
});

describe('GuardianLinkForm', () => {
  const openLink = (address = '/registrar/students/student-1/guardians/new') =>
    renderRoutes(
      [
        { path: '/registrar/students/:id/guardians/new', element: <GuardianLinkForm /> },
        { path: '/registrar/students/:id', element: <p>ficha do aluno</p> },
      ],
      address,
    );

  test('a guardian already linked does not appear in the selector, because the server subtracts them: subtracting locally would show the name for the instant between the two answers', async () => {
    server.use(
      http.get(AVAILABLE, () =>
        HttpResponse.json([{ id: 'user-2', name: 'Paulo Souza' }]),
      ),
    );

    openLink();

    const select = await screen.findByRole('combobox', { name: 'Responsável' });
    expect(select).toHaveTextContent('Paulo Souza');
    expect(select).not.toHaveTextContent('Marina Souza');
  });

  test('nobody available becomes an explanation, not a selector with one blank option', async () => {
    server.use(http.get(AVAILABLE, () => HttpResponse.json([])));

    openLink();

    expect(await screen.findByText('Nenhum responsável disponível')).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Responsável' })).toBeNull();
  });

  test('links the guardian and returns to the record', async () => {
    let sent: unknown = null;
    server.use(
      http.get(AVAILABLE, () => HttpResponse.json([{ id: 'user-2', name: 'Paulo Souza' }])),
      http.post(LINK, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ studentId: 'student-1', userId: 'user-2' }, { status: 201 });
      }),
    );

    const { user } = openLink();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Responsável' }),
      'Paulo Souza',
    );
    await user.type(field('Parentesco'), 'Pai');
    await user.click(screen.getByRole('checkbox', { name: 'Responsável financeiro' }));
    await user.click(screen.getByRole('button', { name: 'Vincular responsável' }));

    expect(await screen.findByText('ficha do aluno')).toBeVisible();
    expect(sent).toEqual({
      userId: 'user-2',
      relationship: 'Pai',
      financiallyResponsible: true,
    });
  });

  test('choosing nobody is refused without a request', async () => {
    let called = false;
    server.use(
      http.get(AVAILABLE, () => HttpResponse.json([{ id: 'user-2', name: 'Paulo Souza' }])),
      http.post(LINK, () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    const { user } = openLink();

    await screen.findByRole('combobox', { name: 'Responsável' });
    await user.type(field('Parentesco'), 'Pai');
    await user.click(screen.getByRole('button', { name: 'Vincular responsável' }));

    expect(await screen.findByText('Escolha o responsável.')).toBeVisible();
    expect(called).toBe(false);
  });
});

describe('EnrollmentForm', () => {
  const openEnroll = () =>
    renderRoutes(
      [
        { path: '/registrar/students/:id/enroll', element: <EnrollmentForm /> },
        { path: '/registrar/students/:id', element: <p>ficha do aluno</p> },
      ],
      '/registrar/students/student-1/enroll',
    );

  beforeEach(() => {
    server.use(
      http.get(CLASS_GROUP_OPTIONS, () => HttpResponse.json(classGroups)),
      http.get(ACADEMIC_YEAR_OPTIONS, () => HttpResponse.json(years)),
    );
  });

  test('the class group selector names the shift and the school, because two groups can otherwise read as the same "3º ano A"', async () => {
    openEnroll();

    expect(await screen.findByRole('combobox', { name: 'Turma' })).toHaveTextContent(
      '3º ano A · Matutino · Escola Central',
    );
  });

  test('enrolls, carrying the student id from the address', async () => {
    let sent: unknown = null;
    server.use(
      http.post(ENROLLMENTS, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: 'enrollment-9' }, { status: 201 });
      }),
    );

    const { user } = openEnroll();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Turma' }),
      '3º ano A · Matutino · Escola Central',
    );
    await user.selectOptions(chooser('Ano letivo'), '2026');
    await user.type(dateField(/^Data da matrícula/), '2026-02-10');
    await user.click(screen.getByRole('button', { name: 'Matricular' }));

    expect(await screen.findByText('ficha do aluno')).toBeVisible();
    expect(sent).toEqual({
      studentId: 'student-1',
      classGroupId: 'cg-1',
      academicYearId: 'y1',
      enrollmentDate: '2026-02-10',
    });
  });

  test('one active enrollment per year is a rule `academics.enroll` owns: its refusal names no field, so it arrives at the top as a warning and never as a second copy of the rule', async () => {
    server.use(
      http.post(ENROLLMENTS, () =>
        HttpResponse.json(
          {
            errors: [{ code: 'ja_matriculado', message: 'O aluno já tem matrícula ativa neste ano.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = openEnroll();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Turma' }),
      '3º ano A · Matutino · Escola Central',
    );
    await user.selectOptions(chooser('Ano letivo'), '2026');
    await user.type(dateField(/^Data da matrícula/), '2026-02-10');
    await user.click(screen.getByRole('button', { name: 'Matricular' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O aluno já tem matrícula ativa neste ano.',
    );
  });

  test('with no class group at all it points at the missing step, instead of three controls that cannot produce a valid value', async () => {
    server.use(http.get(CLASS_GROUP_OPTIONS, () => HttpResponse.json([])));

    openEnroll();

    expect(await screen.findByText('Nenhuma turma disponível')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Matricular' })).toBeNull();
  });
});

describe('TransferForm', () => {
  const enrollment = {
    id: 'enrollment-9',
    studentId: 'student-1',
    studentName: 'Ana Souza',
    classGroupId: 'cg-1',
    classGroupName: '3º ano A',
    year: 2026,
    status: 'active' as const,
  };

  const openTransfer = () =>
    renderRoutes(
      [
        { path: '/registrar/enrollments/:id/transfer', element: <TransferForm /> },
        { path: '/registrar/students/:id', element: <p>ficha do aluno</p> },
      ],
      '/registrar/enrollments/enrollment-9/transfer',
    );

  test('the current class group is not offered as a destination, because transferring to where you already are is not a transfer', async () => {
    server.use(
      http.get(TRANSFER_VIEW, () =>
        HttpResponse.json({
          enrollment,
          student: { id: 'student-1', name: 'Ana Souza', birthDate: '2015-03-14' },
          classGroups: [
            {
              id: 'cg-2',
              name: '3º ano B',
              gradeLevel: '3º ano',
              shift: 'afternoon' as const,
              schoolId: 'school-1',
              schoolName: 'Escola Central',
              year: 2026,
            },
          ],
        }),
      ),
    );

    openTransfer();

    const select = await screen.findByRole('combobox', { name: 'Turma de destino' });
    expect(select).toHaveTextContent('3º ano B · Vespertino · Escola Central');
    expect(select).not.toHaveTextContent('3º ano A');
  });

  test('shows which enrollment is being moved, so nobody transfers the wrong one', async () => {
    server.use(
      http.get(TRANSFER_VIEW, () =>
        HttpResponse.json({
          enrollment,
          student: { id: 'student-1', name: 'Ana Souza', birthDate: '2015-03-14' },
          classGroups: [],
        }),
      ),
    );

    openTransfer();

    expect(await screen.findByText('Ana Souza')).toBeVisible();
    expect(screen.getByText('3º ano A · 2026')).toBeVisible();
  });

  test('with nowhere to transfer to, it says so instead of showing an unusable form', async () => {
    server.use(
      http.get(TRANSFER_VIEW, () =>
        HttpResponse.json({
          enrollment,
          student: { id: 'student-1', name: 'Ana Souza', birthDate: '2015-03-14' },
          classGroups: [],
        }),
      ),
    );

    openTransfer();

    expect(await screen.findByText('Nenhuma turma de destino')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Transferir' })).toBeNull();
  });
});

describe('GuardianForm', () => {
  test('one school means no selector at all, because a control with exactly one option presents a decision where there is none', async () => {
    server.use(http.get(SESSION, () => HttpResponse.json({ user: userWith(['registrar']) })));

    renderWithProviders(<GuardianForm />);

    await screen.findByRole('textbox', { name: 'Nome' });
    expect(screen.queryByRole('combobox', { name: 'Unidade' })).toBeNull();
  });

  test('two schools means the selector appears', async () => {
    server.use(
      http.get(SESSION, () =>
        HttpResponse.json({ user: userWith(['registrar', 'registrar']) }),
      ),
    );

    renderWithProviders(<GuardianForm />);

    expect(await screen.findByRole('combobox', { name: 'Unidade' })).toBeVisible();
  });

  test('a school outside the scope comes back as a field error on the selector, the one write in this front that answers that with a field error rather than a 404', async () => {
    server.use(
      http.get(SESSION, () =>
        HttpResponse.json({ user: userWith(['registrar', 'registrar']) }),
      ),
      http.post(GUARDIANS, () =>
        HttpResponse.json(
          {
            errors: [
              {
                field: 'schoolId',
                code: 'guardian_school_required',
                message: 'Selecione a unidade em que o responsável entra no portal.',
              },
            ],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = renderWithProviders(<GuardianForm />);

    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), 'Paulo Souza');
    await user.type(field('CPF'), '52998224725');
    await user.type(field('E-mail'), 'paulo@escolaviva.test');
    await user.selectOptions(chooser('Unidade'), 'Escola 1');
    await user.click(screen.getByRole('button', { name: 'Cadastrar responsável' }));

    expect(
      await screen.findByText('Selecione a unidade em que o responsável entra no portal.'),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('shows the temporary password once, and only after a real creation', async () => {
    server.use(
      http.get(SESSION, () => HttpResponse.json({ user: userWith(['registrar']) })),
      http.post(GUARDIANS, () =>
        HttpResponse.json({ id: 'user-9', temporaryPassword: 'Ab3-Cd7-Ef1' }, { status: 201 }),
      ),
    );

    const { user } = renderWithProviders(<GuardianForm />);

    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), 'Paulo Souza');
    await user.type(field('CPF'), '52998224725');
    await user.type(field('E-mail'), 'paulo@escolaviva.test');
    await user.click(screen.getByRole('button', { name: 'Cadastrar responsável' }));

    expect(await screen.findByText('Ab3-Cd7-Ef1')).toBeVisible();
  });

  test('an empty phone is omitted from the request, not sent blank: `phone` is optional, and a stored empty string prints as a blank cell rather than as the "—" that means not filled in', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.get(SESSION, () => HttpResponse.json({ user: userWith(['registrar']) })),
      http.post(GUARDIANS, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'user-9', temporaryPassword: 'x' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<GuardianForm />);

    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), 'Paulo Souza');
    await user.type(field('CPF'), '52998224725');
    await user.type(field('E-mail'), 'paulo@escolaviva.test');
    await user.click(screen.getByRole('button', { name: 'Cadastrar responsável' }));

    await waitFor(() => expect(screen.getByText('x')).toBeVisible());
    expect('phone' in sent).toBe(false);
    expect('schoolId' in sent).toBe(false);
  });
});

describe('GuardianList', () => {
  test('opens on the page the URL asks for and shows the CPF formatted', async () => {
    let asked: string | null = null;
    server.use(
      http.get(GUARDIANS, ({ request }) => {
        asked = new URL(request.url).searchParams.get('p');
        return HttpResponse.json({
          items: [
            {
              id: 'user-1',
              name: 'Marina Souza',
              email: 'marina@escolaviva.test',
              phone: null,
              cpf: '52998224725',
            },
          ],
          page: 2,
          pages: 3,
          total: 25,
          size: PAGE_SIZE,
        });
      }),
    );

    renderWithProviders(<GuardianList />, '/registrar/guardians?p=2');

    expect(await screen.findByText('529.982.247-25')).toBeVisible();
    expect(asked).toBe('2');
    expect(screen.getByText('—')).toBeVisible();
  });
});

describe('registrar Dashboard', () => {
  test('shows the totals and the units, with the year in force', async () => {
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({
          schools: {
            items: [
              {
                schoolId: 'school-1',
                schoolName: 'Escola Central',
                enrollments: 120,
                classGroups: 6,
                guardians: 98,
              },
            ],
            page: 1,
            pages: 1,
            total: 1,
            size: PAGE_SIZE,
          },
          currentYear: { id: 'y1', year: 2026, startDate: '2026-02-02', endDate: '2026-12-18' },
          totals: { classGroups: 6, enrollments: 120, guardians: 98, subjects: 11 },
        }),
      ),
    );

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Escola Central')).toBeVisible();
    expect(screen.getByText(/Ano letivo 2026, de 02\/02\/2026 a 18\/12\/2026/)).toBeVisible();
    expect(screen.getByText('11')).toBeVisible();
  });

  test('a registrar whose role was granted before any unit is told what is missing, rather than shown four zeroes', async () => {
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({
          schools: { items: [], page: 1, pages: 0, total: 0, size: PAGE_SIZE },
          currentYear: null,
          totals: { classGroups: 0, enrollments: 0, guardians: 0, subjects: 0 },
        }),
      ),
    );

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Nenhuma unidade atribuída')).toBeVisible();
    expect(screen.getByText('Nenhum ano letivo definido nesta rede.')).toBeVisible();
  });
});

describe('registrar Dashboard totals', () => {
  test('the totals count the whole scope, never the sum of the page on display', async () => {
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({
          schools: {
            items: [
              {
                schoolId: 'school-1',
                schoolName: 'Escola Central',
                enrollments: 120,
                classGroups: 6,
                guardians: 98,
              },
            ],
            page: 1,
            pages: 3,
            total: 21,
            size: PAGE_SIZE,
          },
          currentYear: null,
          totals: { classGroups: 44, enrollments: 900, guardians: 512, subjects: 11 },
        }),
      ),
    );

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('44')).toBeVisible();
    expect(screen.getByText('900')).toBeVisible();
    expect(screen.getByText('512')).toBeVisible();
    expect(screen.getByText('6')).toBeVisible();
  });
});

describe('StatusTag', () => {
  test('a student with no enrollment reads as absent, not as a status that failed to load', () => {
    renderWithProviders(<StatusTag status={null} />);

    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByText('Ativa')).toBeNull();
  });

  test('an enrollment reads as its Portuguese label, never as the contract value', () => {
    renderWithProviders(<StatusTag status="active" />);

    expect(screen.getByText('Ativa')).toBeVisible();
    expect(screen.queryByText('active')).toBeNull();
  });
});

describe('the registrar area', () => {
  const openArea = (address: string) =>
    renderRoutes([{ path: '/registrar/*', element: <RegistrarRoutes /> }], address);

  test('students/new opens the form, and never the record of a student called "new"', async () => {
    openArea('/registrar/students/new');

    expect(await screen.findByRole('button', { name: 'Cadastrar aluno' })).toBeVisible();
  });

  test('an address the area does not serve shows the not-found screen, not an empty page', async () => {
    openArea('/registrar/nao-existe');

    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  });
});

describe('the rules this front does not own', () => {
  test('a birth date in the future is refused by the server, never by the form', async () => {
    let sent: unknown = null;
    server.use(
      http.post(STUDENTS, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: 'student-9' }, { status: 201 });
      }),
    );

    const { user } = renderRoutes(
      [
        { path: '/registrar/students/new', element: <StudentForm /> },
        { path: '/registrar/students/:id', element: <p>ficha do aluno</p> },
      ],
      '/registrar/students/new',
    );

    await user.type(field('Nome'), 'Ana Souza');
    await user.type(dateField(/^Data de nascimento/), '2099-12-31');
    await user.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));

    expect(await screen.findByText('ficha do aluno')).toBeVisible();
    expect(sent).toEqual({ name: 'Ana Souza', birthDate: '2099-12-31' });
  });

  test('a CPF with a broken check digit still reaches the server, which owns that arithmetic', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.get(SESSION, () => HttpResponse.json({ user: userWith(['registrar']) })),
      http.post(GUARDIANS, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'user-9', temporaryPassword: 'Ab3-Cd7-Ef1' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<GuardianForm />);

    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), 'Paulo Souza');
    await user.type(field('CPF'), '11111111111');
    await user.type(field('E-mail'), 'paulo@escolaviva.test');
    await user.click(screen.getByRole('button', { name: 'Cadastrar responsável' }));

    expect(await screen.findByText('Ab3-Cd7-Ef1')).toBeVisible();
    expect(sent.cpf).toBe('11111111111');
  });

  test('the unit stays optional in the form, because a single-school registrar never chooses one', async () => {
    let called = false;
    server.use(
      http.get(SESSION, () => HttpResponse.json({ user: userWith(['registrar']) })),
      http.post(GUARDIANS, () => {
        called = true;
        return HttpResponse.json({ id: 'user-9', temporaryPassword: 'Ab3-Cd7-Ef1' }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<GuardianForm />);

    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), 'Paulo Souza');
    await user.type(field('CPF'), '52998224725');
    await user.type(field('E-mail'), 'paulo@escolaviva.test');
    await user.click(screen.getByRole('button', { name: 'Cadastrar responsável' }));

    expect(await screen.findByText('Ab3-Cd7-Ef1')).toBeVisible();
    expect(called).toBe(true);
  });
});

describe('what a write invalidates', () => {
  const SEARCH_TERM = 'ana';
  const FIRST = 1;
  const nothingFound = { items: [], page: FIRST, pages: 0, total: 0, size: PAGE_SIZE };

  function EnrollBesideASearch(): React.ReactElement {
    useStudentSearch(SEARCH_TERM, FIRST);
    const enroll = useEnroll('student-1');
    return (
      <button
        type="button"
        onClick={() =>
          enroll.mutate({
            classGroupId: 'cg-1',
            academicYearId: 'y1',
            enrollmentDate: '2026-02-10',
          })
        }
      >
        matricular
      </button>
    );
  }

  function TransferBesideASearch(): React.ReactElement {
    useStudentSearch(SEARCH_TERM, FIRST);
    const transfer = useTransfer('enrollment-9');
    return (
      <button
        type="button"
        onClick={() => transfer.mutate({ targetClassGroupId: 'cg-2', date: '2026-03-01' })}
      >
        transferir
      </button>
    );
  }

  test('enrolling refreshes the searches, because a search row carries the active enrollment', async () => {
    let searches = 0;
    server.use(
      http.get(STUDENTS, () => {
        searches += 1;
        return HttpResponse.json(nothingFound);
      }),
      http.post(ENROLLMENTS, () => HttpResponse.json({ id: 'enrollment-9' }, { status: 201 })),
    );

    const { user } = renderWithProviders(<EnrollBesideASearch />);

    await waitFor(() => expect(searches).toBe(1));
    await user.click(screen.getByRole('button', { name: 'matricular' }));

    await waitFor(() => expect(searches).toBeGreaterThan(1));
  });

  test('transferring refreshes them too, so no row keeps the class group the student left', async () => {
    let searches = 0;
    server.use(
      http.get(STUDENTS, () => {
        searches += 1;
        return HttpResponse.json(nothingFound);
      }),
      http.post(TRANSFER_VIEW, () => HttpResponse.json({ id: 'enrollment-10' }, { status: 201 })),
    );

    const { user } = renderWithProviders(<TransferBesideASearch />);

    await waitFor(() => expect(searches).toBe(1));
    await user.click(screen.getByRole('button', { name: 'transferir' }));

    await waitFor(() => expect(searches).toBeGreaterThan(1));
  });
});

describe('the record cache key', () => {
  test('drop the enrollments cursor and two different pages of enrollments share one cache entry', () => {
    expect(registrarKeys.studentRecord('student-1', 1, 1)).not.toEqual(
      registrarKeys.studentRecord('student-1', 1, 2),
    );
  });

  test('drop the guardians cursor and two different pages of guardians share one cache entry', () => {
    expect(registrarKeys.studentRecord('student-1', 1, 1)).not.toEqual(
      registrarKeys.studentRecord('student-1', 2, 1),
    );
  });
});
