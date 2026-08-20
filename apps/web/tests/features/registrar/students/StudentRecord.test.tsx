import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '../../../testSetup';
import { renderRoutes } from '../../../testSupport';
import { StudentRecord } from '../../../../src/features/registrar/students/StudentRecord';
import type { Page } from '@escolaviva/contracts/page';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';
import type { StudentRecord as StudentRecordAsJson } from '@escolaviva/contracts/students';

const RECORD = '*/api/v1/registrar/students/:id';
const PAGE_SIZE = 10;

const openRecordWithTheIdInTheRoute = (address: string) =>
  renderRoutes(
    [
      { path: '/registrar/students/:id', element: <StudentRecord /> },
      { path: '/registrar/students', element: <p>busca de alunos</p> },
    ],
    address,
  );

const student = { id: 'student-1', name: 'Ana Souza', birthDate: '2015-03-14' };

const activeEnrollment: EnrollmentInList = {
  id: 'enrollment-9',
  studentId: student.id,
  studentName: student.name,
  classGroupId: 'cg-1',
  classGroupName: '3º ano A',
  year: 2026,
  status: 'active',
};

const page = <T,>(items: readonly T[], number = 1, total = items.length): Page<T> => ({
  items,
  page: number,
  pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  total,
  size: PAGE_SIZE,
});

const record = (over: Partial<StudentRecordAsJson> = {}): StudentRecordAsJson => ({
  ...fullRecord(),
  ...over,
});

function fullRecord(): StudentRecordAsJson {
  return {
    student,
    guardians: page([
      {
        userId: 'user-1',
        name: 'Marina Souza',
        email: 'marina@escolaviva.test',
        relationship: 'Mãe',
        financiallyResponsible: true,
      },
    ]),
    enrollments: page([activeEnrollment]),
    active: activeEnrollment,
  };
}

describe('what the record shows', () => {
  test('the student, their guardians and their enrollments', async () => {
    server.use(http.get(RECORD, () => HttpResponse.json(record())));

    openRecordWithTheIdInTheRoute('/registrar/students/student-1');

    expect(await screen.findByRole('heading', { name: 'Ana Souza', level: 1 })).toBeVisible();
    expect(screen.getByText('14/03/2015')).toBeVisible();
    expect(screen.getByText('Marina Souza')).toBeVisible();
    expect(screen.getByText('Mãe')).toBeVisible();
  });

  test('every action on the record carries this student in the address, not the last one opened', async () => {
    server.use(http.get(RECORD, () => HttpResponse.json(record())));

    openRecordWithTheIdInTheRoute('/registrar/students/student-1');

    expect(await screen.findByRole('link', { name: 'Matricular' })).toHaveAttribute(
      'href',
      '/registrar/students/student-1/enroll',
    );
    expect(screen.getByRole('link', { name: 'Vincular responsável' })).toHaveAttribute(
      'href',
      '/registrar/students/student-1/guardians/new',
    );
  });

  test('the transfer button comes from `active`, which the server sends apart from the history, so it survives paging the history past the page the active enrollment is on', async () => {
    server.use(
      http.get(RECORD, () =>
        HttpResponse.json(
          record({
            enrollments: page(
              [
                {
                  ...activeEnrollment,
                  id: 'enrollment-1',
                  classGroupName: '2º ano B',
                  year: 2025,
                  status: 'transferred',
                },
              ],
              2,
              14,
            ),
          }),
        ),
      ),
    );

    openRecordWithTheIdInTheRoute('/registrar/students/student-1?pEnrollments=2');

    expect(await screen.findByRole('link', { name: 'Transferir' })).toHaveAttribute(
      'href',
      '/registrar/enrollments/enrollment-9/transfer',
    );
    expect(screen.queryByText('3º ano A')).toBeNull();
  });

  test('a student with no active enrollment is offered no transfer', async () => {
    server.use(
      http.get(RECORD, () => HttpResponse.json(record({ active: null, enrollments: page([]) }))),
    );

    openRecordWithTheIdInTheRoute('/registrar/students/student-1');

    expect(await screen.findByText('Nenhuma matrícula')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Transferir' })).toBeNull();
  });

  test('a student with no guardian is told what that costs', async () => {
    server.use(http.get(RECORD, () => HttpResponse.json(record({ guardians: page([]) }))));

    openRecordWithTheIdInTheRoute('/registrar/students/student-1');

    expect(await screen.findByText('Nenhum responsável vinculado')).toBeVisible();
    expect(screen.getByText(/ninguém acompanha este aluno pelo portal/i)).toBeVisible();
  });
});

describe('the two cursors', () => {
  test('?pEnrollments=2 advances only the enrollments table, because one shared ?p= would page past the end of one table to reach the second page of the other', async () => {
    let guardians: string | null = null;
    let enrollments: string | null = null;
    server.use(
      http.get(RECORD, ({ request }) => {
        const url = new URL(request.url);
        guardians = url.searchParams.get('pGuardians');
        enrollments = url.searchParams.get('pEnrollments');
        return HttpResponse.json(record());
      }),
    );

    openRecordWithTheIdInTheRoute('/registrar/students/student-1?pEnrollments=2');

    await screen.findByRole('heading', { name: 'Ana Souza', level: 1 });
    expect(enrollments).toBe('2');
    expect(guardians).toBe('1');
  });

  test('and each pagination writes only its own parameter into the links', async () => {
    server.use(
      http.get(RECORD, () =>
        HttpResponse.json(
          record({
            guardians: page(
              [
                {
                  userId: 'user-1',
                  name: 'Marina Souza',
                  email: 'marina@escolaviva.test',
                  relationship: 'Mãe',
                  financiallyResponsible: true,
                },
              ],
              1,
              25,
            ),
            enrollments: page([activeEnrollment], 1, 25),
          }),
        ),
      ),
    );

    openRecordWithTheIdInTheRoute('/registrar/students/student-1');

    const navigations = await screen.findAllByRole('navigation');
    const guardiansNav = navigations.find((nav) =>
      (nav.getAttribute('aria-label') ?? '').includes('responsáveis'),
    ) as HTMLElement;
    const enrollmentsNav = navigations.find((nav) =>
      (nav.getAttribute('aria-label') ?? '').includes('matrículas'),
    ) as HTMLElement;

    expect(within(guardiansNav).getByRole('link', { name: 'Página 2' })).toHaveAttribute(
      'href',
      '/registrar/students/student-1?pGuardians=2',
    );
    expect(within(enrollmentsNav).getByRole('link', { name: 'Página 2' })).toHaveAttribute(
      'href',
      '/registrar/students/student-1?pEnrollments=2',
    );
  });

  test('turning one cursor while the other is already off page one keeps the other where it is', async () => {
    server.use(
      http.get(RECORD, () =>
        HttpResponse.json(
          record({
            guardians: page(
              [
                {
                  userId: 'user-1',
                  name: 'Marina Souza',
                  email: 'marina@escolaviva.test',
                  relationship: 'Mãe',
                  financiallyResponsible: true,
                },
              ],
              1,
              25,
            ),
          }),
        ),
      ),
    );

    openRecordWithTheIdInTheRoute('/registrar/students/student-1?pEnrollments=3');

    const guardiansNav = (await screen.findAllByRole('navigation')).find((nav) =>
      (nav.getAttribute('aria-label') ?? '').includes('responsáveis'),
    ) as HTMLElement;

    expect(within(guardiansNav).getByRole('link', { name: 'Página 2' })).toHaveAttribute(
      'href',
      '/registrar/students/student-1?pEnrollments=3&pGuardians=2',
    );
  });
});

describe('a record outside the scope, which the server answers with a 404 rather than a 403 that would confirm the student exists somewhere in the network', () => {
  test('the 404 becomes a screen that explains it, not a blank page and not an error card about a failure that is really an answer', async () => {
    server.use(
      http.get(RECORD, () =>
        HttpResponse.json(
          { errors: [{ code: 'not_found', message: 'Não encontrado.' }], correlationId: 'abc' },
          { status: 404 },
        ),
      ),
    );

    const { user } = openRecordWithTheIdInTheRoute('/registrar/students/student-1');

    expect(await screen.findByRole('heading', { name: 'Aluno não encontrado' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Voltar para a busca' }));
    expect(await screen.findByText('busca de alunos')).toBeVisible();
  });

  test('any other failure is still an error card, carrying the correlation code support asks for', async () => {
    server.use(
      http.get(RECORD, () =>
        HttpResponse.json(
          { errors: [{ code: 'x', message: 'Falhou.' }], correlationId: 'zz9' },
          { status: 500 },
        ),
      ),
    );

    openRecordWithTheIdInTheRoute('/registrar/students/student-1');

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(screen.getByText('zz9')).toBeVisible();
  });
});
