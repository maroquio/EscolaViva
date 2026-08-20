import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { renderRoutes, renderWithProviders } from '../../testSupport';
import { Announcement } from '../../../src/features/guardian/Announcement';
import { Attendance } from '../../../src/features/guardian/Attendance';
import { Board } from '../../../src/features/guardian/Board';
import { MyStudents } from '../../../src/features/guardian/MyStudents';
import { useMarkAsRead } from '../../../src/features/guardian/mutations';
import { guardianKeys } from '../../../src/features/guardian/queries';
import { ReportCard } from '../../../src/features/guardian/ReportCard';
import type {
  AttendanceDay,
  GuardianReportCard,
  OpenAnnouncement,
  ReportCardAsJson,
} from '@escolaviva/contracts/guardian';
import type { Page } from '@escolaviva/contracts/page';
import type { EnrollmentInList } from '@escolaviva/contracts/shared';

const DASHBOARD = '*/api/v1/guardian/dashboard';
const REPORT_CARD = '*/api/v1/guardian/enrollments/:id/report-card';
const ATTENDANCE = '*/api/v1/guardian/enrollments/:id/attendance';
const BOARD = '*/api/v1/guardian/board';
const ANNOUNCEMENT = '*/api/v1/guardian/board/:announcementId';
const MARK_READ = '*/api/v1/guardian/board/:announcementId/read';

const PAGE_SIZE = 10;

const page = <T,>(items: readonly T[], number = 1, total = items.length): Page<T> => ({
  items,
  page: number,
  pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  total,
  size: PAGE_SIZE,
});

const enrollment: EnrollmentInList = {
  id: 'e-1',
  studentId: 'student-1',
  studentName: 'Ana Souza',
  classGroupId: 'cg-1',
  classGroupName: '3º ano A',
  year: 2026,
  status: 'active' as const,
};

const announcement: OpenAnnouncement = {
  id: 'a-1',
  title: 'Reunião de pais',
  body: 'A reunião acontece na quinta-feira.\n\nCompareçam.',
  authorName: 'Secretaria',
  publishedAt: '2026-03-01T12:00:00.000Z',
};

const openAnnouncement = (address = '/guardian/board/a-1') =>
  renderRoutes(
    [
      { path: '/guardian/board/:announcementId', element: <Announcement /> },
      { path: '/guardian/board', element: <p>mural</p> },
    ],
    address,
  );

const longEnoughForAnEffectToHaveFired = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

describe('opening an announcement does not mark it read', () => {
  test('no POST is fired by opening it, because an effect that marked every opened announcement read would push the read rate towards 100 % and destroy the measurement', async () => {
    let writes = 0;
    server.use(
      http.get(ANNOUNCEMENT, () => HttpResponse.json({ announcement, readAt: null })),
      http.post(MARK_READ, () => {
        writes += 1;
        return new HttpResponse(null, { status: 201 });
      }),
    );

    openAnnouncement();

    expect(await screen.findByText(/A reunião acontece na quinta-feira/)).toBeVisible();
    await longEnoughForAnEffectToHaveFired();
    expect(writes).toBe(0);
  });

  test('and the button is still there to be pressed', async () => {
    server.use(http.get(ANNOUNCEMENT, () => HttpResponse.json({ announcement, readAt: null })));

    openAnnouncement();

    expect(await screen.findByRole('button', { name: 'Marcar como lido' })).toBeVisible();
  });

  test('pressing the button writes exactly one read, and it is the only thing that writes', async () => {
    let writes = 0;
    server.use(
      http.get(ANNOUNCEMENT, () => HttpResponse.json({ announcement, readAt: null })),
      http.post(MARK_READ, () => {
        writes += 1;
        return new HttpResponse(null, { status: 201 });
      }),
    );

    const { user } = openAnnouncement();

    await user.click(await screen.findByRole('button', { name: 'Marcar como lido' }));

    await waitFor(() => expect(writes).toBe(1));
    expect(await screen.findByText('Comunicado marcado como lido.')).toBeVisible();
  });

  test('two quick taps are one write, because the button disables itself on the first, and what a second tap would cost is not a refused write — the server tolerates it — but a second confirmation', async () => {
    let writes = 0;
    server.use(
      http.get(ANNOUNCEMENT, () => HttpResponse.json({ announcement, readAt: null })),
      http.post(MARK_READ, async () => {
        writes += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new HttpResponse(null, { status: 201 });
      }),
    );

    const { user } = openAnnouncement();

    const button = await screen.findByRole('button', { name: 'Marcar como lido' });
    await user.click(button);
    await user.click(button).catch(() => undefined);

    await waitFor(() => expect(button).toBeDisabled());
    expect(writes).toBe(1);
  });

  test('and the board, when the guardian goes back to it, shows the item moved instead of still offering it as unread — proved on what the remount shows and not on a request count, because an invalidated inactive query refetches only when it comes back', async () => {
    let read = false;
    server.use(
      http.get(BOARD, () =>
        HttpResponse.json(
          read
            ? {
                unread: page([]),
                read: page([
                  {
                    announcementId: 'a-1',
                    title: 'Reunião de pais',
                    publishedAt: '2026-03-01',
                    readAt: '2026-03-02',
                  },
                ]),
              }
            : {
                unread: page([
                  {
                    announcementId: 'a-1',
                    title: 'Reunião de pais',
                    publishedAt: '2026-03-01',
                    readAt: null,
                  },
                ]),
                read: page([]),
              },
        ),
      ),
      http.get(ANNOUNCEMENT, () => HttpResponse.json({ announcement, readAt: null })),
      http.post(MARK_READ, () => {
        read = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );

    const { user } = renderRoutes(
      [
        { path: '/guardian/board', element: <Board /> },
        { path: '/guardian/board/:announcementId', element: <Announcement /> },
      ],
      '/guardian/board',
    );

    await user.click(await screen.findByRole('link', { name: 'Reunião de pais' }));
    await user.click(await screen.findByRole('button', { name: 'Marcar como lido' }));
    await screen.findByText('Comunicado marcado como lido.');
    await user.click(screen.getByRole('link', { name: 'Voltar para o mural' }));

    await waitFor(() => expect(screen.getByText('Nenhum comunicado não lido')).toBeVisible());
    expect(screen.queryAllByText('Não lido')).toHaveLength(0);
  });

  test('an announcement already read offers no button and says when it was read', async () => {
    server.use(
      http.get(ANNOUNCEMENT, () =>
        HttpResponse.json({ announcement, readAt: '2026-03-02T10:15:00.000Z' }),
      ),
    );

    openAnnouncement();

    expect(await screen.findByText(/marcou este comunicado como lido/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Marcar como lido' })).toBeNull();
  });

  test('the body somebody typed is shown as text, not interpreted as markup', async () => {
    server.use(
      http.get(ANNOUNCEMENT, () =>
        HttpResponse.json({
          announcement: { ...announcement, body: '<b>negrito</b> e <script>alert(1)</script>' },
          readAt: null,
        }),
      ),
    );

    openAnnouncement();

    expect(await screen.findByText(/<b>negrito<\/b>/)).toBeVisible();
    expect(document.querySelector('main b')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  test('an announcement outside this board becomes a screen that explains it', async () => {
    server.use(
      http.get(ANNOUNCEMENT, () =>
        HttpResponse.json(
          { errors: [{ code: 'not_found', message: 'Não encontrado.' }], correlationId: 'abc' },
          { status: 404 },
        ),
      ),
    );

    openAnnouncement();

    expect(await screen.findByRole('heading', { name: 'Comunicado não encontrado' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('MyStudents', () => {
  test('an account with no linked student gets an explanation, not an error, because being unlinked is the normal state between the access being created and the link being made', async () => {
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({
          enrollments: page([]),
          unread: [],
          totalUnread: 0,
          totalOnBoard: 0,
        }),
      ),
    );

    renderWithProviders(<MyStudents />);

    expect(await screen.findByText('Nenhum aluno vinculado')).toBeVisible();
    expect(screen.getByText(/secretaria da escola/i)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('lists the students with links to the report card and the attendance', async () => {
    server.use(
      http.get(DASHBOARD, () =>
        HttpResponse.json({
          enrollments: page([enrollment]),
          unread: [
            { announcementId: 'a-1', title: 'Reunião de pais', publishedAt: '2026-03-01', readAt: null },
          ],
          totalUnread: 1,
          totalOnBoard: 4,
        }),
      ),
    );

    renderWithProviders(<MyStudents />);

    expect(await screen.findByText('Ana Souza')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Boletim' })).toHaveAttribute(
      'href',
      '/guardian/enrollments/e-1/report-card',
    );
    expect(screen.getByText('1 não lido(s) de 4 comunicado(s).')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Reunião de pais' })).toBeVisible();
  });
});

describe('ReportCard', () => {
  const AVERAGE_NO_MEAN_OF_THESE_GRADES_WOULD_GIVE = 8.2;
  const ATTENDANCE_RATE_ALREADY_AS_A_PERCENTAGE = 93.33;

  const reportCard = (over: Partial<ReportCardAsJson> = {}): GuardianReportCard => ({
    reportCard: {
      enrollmentId: 'e-1',
      studentName: 'Ana Souza',
      classGroupName: '3º ano A',
      year: 2026,
      rows: [
        {
          subjectName: 'Matemática',
          grades: [5.99, 7, null, null],
          average: AVERAGE_NO_MEAN_OF_THESE_GRADES_WOULD_GIVE,
        },
      ],
      termAverages: [5.99, 7, null, null],
      overallAverage: AVERAGE_NO_MEAN_OF_THESE_GRADES_WOULD_GIVE,
      attendanceRate: ATTENDANCE_RATE_ALREADY_AS_A_PERCENTAGE,
      totalDays: 30,
      presentDays: 28,
      status: 'in_progress' as const,
      ...over,
    },
    terms: [1, 2, 3, 4],
  });

  const openCard = () =>
    renderRoutes(
      [
        { path: '/guardian/enrollments/:id/report-card', element: <ReportCard /> },
        { path: '/guardian', element: <p>meus alunos</p> },
      ],
      '/guardian/enrollments/e-1/report-card',
    );

  test('a 5.99 is shown as 5,9 and never as 6,0, because a grade rounded up beside a status computed from the raw one contradicts the record', async () => {
    server.use(http.get(REPORT_CARD, () => HttpResponse.json(reportCard())));

    openCard();

    await screen.findByText('Matemática');
    expect(screen.getAllByText('5,9').length).toBeGreaterThan(0);
    expect(screen.queryByText('6,0')).toBeNull();
  });

  test('the averages come from the server and are not recomputed, which the fixture proves by carrying an average that is not the mean of its grades', async () => {
    server.use(http.get(REPORT_CARD, () => HttpResponse.json(reportCard())));

    openCard();

    expect(await screen.findAllByText('8,2')).not.toHaveLength(0);
    expect(screen.queryByText('6,4')).toBeNull();
  });

  test('a missing grade reads as absent, not as a zero', async () => {
    server.use(http.get(REPORT_CARD, () => HttpResponse.json(reportCard())));

    openCard();

    const row = (await screen.findByText('Matemática')).closest('tr') as HTMLElement;
    expect(within(row).getAllByText('—').length).toBe(2);
    expect(within(row).queryByText('0,0')).toBeNull();
  });

  test('the attendance rate is printed as it arrives, not multiplied again into the 9333,0 % a browser once showed', async () => {
    server.use(http.get(REPORT_CARD, () => HttpResponse.json(reportCard())));

    openCard();

    expect(await screen.findByText(/93,3 %/)).toBeVisible();
    expect(screen.queryByText(/9333/)).toBeNull();
  });

  test('a 404 becomes a not-found screen, not an error card', async () => {
    server.use(
      http.get(REPORT_CARD, () =>
        HttpResponse.json(
          { errors: [{ code: 'not_found', message: 'Não encontrado.' }], correlationId: 'abc' },
          { status: 404 },
        ),
      ),
    );

    openCard();

    expect(await screen.findByRole('heading', { name: 'Boletim não encontrado' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Attendance', () => {
  const anAbsentDay: AttendanceDay = { date: '2026-03-10', present: false, excuse: null };

  const openAttendanceThroughItsRoute = (address: string) =>
    renderRoutes(
      [
        { path: '/guardian/enrollments/:id/attendance', element: <Attendance /> },
        { path: '/guardian', element: <p>meus alunos</p> },
      ],
      address,
    );

  test('?p=2 asks for the second page of days', async () => {
    let asked: string | null = null;
    server.use(
      http.get(ATTENDANCE, ({ request }) => {
        asked = new URL(request.url).searchParams.get('p');
        return HttpResponse.json({
          enrollment,
          reportCard: {
            enrollmentId: 'e-1',
            studentName: 'Ana Souza',
            classGroupName: '3º ano A',
            year: 2026,
            rows: [],
            termAverages: [],
            overallAverage: null,
            attendanceRate: 90,
            totalDays: 30,
            presentDays: 27,
            status: 'in_progress',
          },
          days: page(
            [{ date: '2026-03-10', present: false, excuse: 'Consulta médica' }],
            2,
            25,
          ),
        });
      }),
    );

    openAttendanceThroughItsRoute('/guardian/enrollments/e-1/attendance?p=2');

    expect(await screen.findByText('10/03/2026')).toBeVisible();
    expect(asked).toBe('2');
  });

  test('the rate at the top is the whole year, not the page on screen, so paging never moves it', async () => {
    server.use(
      http.get(ATTENDANCE, () =>
        HttpResponse.json({
          enrollment,
          reportCard: {
            enrollmentId: 'e-1',
            studentName: 'Ana Souza',
            classGroupName: '3º ano A',
            year: 2026,
            rows: [],
            termAverages: [],
            overallAverage: null,
            attendanceRate: 90,
            totalDays: 30,
            presentDays: 27,
            status: 'in_progress',
          },
          days: page([anAbsentDay], 1, 30),
        }),
      ),
    );

    openAttendanceThroughItsRoute('/guardian/enrollments/e-1/attendance');

    expect(await screen.findByText('90,0 %')).toBeVisible();
    expect(screen.getByText('27 de 30 dias')).toBeVisible();
  });
});

describe('Board', () => {
  test('the two lists have their own cursors, because a single ?p= would page both at once', async () => {
    let unread: string | null = null;
    let read: string | null = null;
    server.use(
      http.get(BOARD, ({ request }) => {
        const url = new URL(request.url);
        unread = url.searchParams.get('pUnread');
        read = url.searchParams.get('pRead');
        return HttpResponse.json({
          unread: page(
            [{ announcementId: 'a-1', title: 'Reunião de pais', publishedAt: '2026-03-01', readAt: null }],
            2,
            25,
          ),
          read: page(
            [{ announcementId: 'a-2', title: 'Feriado', publishedAt: '2026-02-01', readAt: '2026-02-02' }],
            1,
            25,
          ),
        });
      }),
    );

    renderWithProviders(<Board />, '/guardian/board?pUnread=2');

    await screen.findByRole('link', { name: 'Reunião de pais' });
    expect(unread).toBe('2');
    expect(read).toBe('1');
  });

  test('and each pagination writes only its own parameter', async () => {
    server.use(
      http.get(BOARD, () =>
        HttpResponse.json({
          unread: page(
            [{ announcementId: 'a-1', title: 'Reunião de pais', publishedAt: '2026-03-01', readAt: null }],
            1,
            25,
          ),
          read: page(
            [{ announcementId: 'a-2', title: 'Feriado', publishedAt: '2026-02-01', readAt: '2026-02-02' }],
            1,
            25,
          ),
        }),
      ),
    );

    renderWithProviders(<Board />, '/guardian/board');

    const navigations = await screen.findAllByRole('navigation');
    const unreadNav = navigations.find((nav) =>
      (nav.getAttribute('aria-label') ?? '').includes('não lidos'),
    ) as HTMLElement;

    expect(within(unreadNav).getByRole('link', { name: 'Página 2' })).toHaveAttribute(
      'href',
      '/guardian/board?pUnread=2',
    );
  });

  test('an unread item is marked as such, and a read one is not', async () => {
    server.use(
      http.get(BOARD, () =>
        HttpResponse.json({
          unread: page([
            { announcementId: 'a-1', title: 'Reunião de pais', publishedAt: '2026-03-01', readAt: null },
          ]),
          read: page([
            { announcementId: 'a-2', title: 'Feriado', publishedAt: '2026-02-01', readAt: '2026-02-02' },
          ]),
        }),
      ),
    );

    renderWithProviders(<Board />, '/guardian/board');

    await screen.findByRole('link', { name: 'Reunião de pais' });
    expect(screen.getAllByText('Não lido')).toHaveLength(1);
  });

  test('coming back without reading anything does not ask the server again, because nothing on the board changes on its own', async () => {
    let boardRequests = 0;
    server.use(
      http.get(BOARD, () => {
        boardRequests += 1;
        return HttpResponse.json({
          unread: page([
            { announcementId: 'a-1', title: 'Reunião de pais', publishedAt: '2026-03-01', readAt: null },
          ]),
          read: page([]),
        });
      }),
      http.get(ANNOUNCEMENT, () => HttpResponse.json({ announcement, readAt: null })),
    );

    const { user } = renderRoutes(
      [
        { path: '/guardian/board', element: <Board /> },
        { path: '/guardian/board/:announcementId', element: <Announcement /> },
      ],
      '/guardian/board',
    );

    await user.click(await screen.findByRole('link', { name: 'Reunião de pais' }));
    await screen.findByRole('button', { name: 'Marcar como lido' });
    await user.click(screen.getByRole('link', { name: 'Voltar para o mural' }));
    await screen.findByRole('link', { name: 'Reunião de pais' });

    expect(boardRequests).toBe(1);
  });

  test('a board with nothing unread says so without looking like a failure', async () => {
    server.use(
      http.get(BOARD, () => HttpResponse.json({ unread: page([]), read: page([]) })),
    );

    renderWithProviders(<Board />, '/guardian/board');

    expect(await screen.findByText('Nenhum comunicado não lido')).toBeVisible();
    expect(screen.getByText('Você está em dia com o mural.')).toBeVisible();
  });
});

describe('the board cache key', () => {
  test('drop the read cursor and two different pages of read items share one cache entry', () => {
    expect(guardianKeys.board(1, 1)).not.toEqual(guardianKeys.board(1, 2));
  });

  test('drop the unread cursor and two different pages of unread items share one cache entry', () => {
    expect(guardianKeys.board(1, 1)).not.toEqual(guardianKeys.board(2, 1));
  });
});

describe('useMarkAsRead', () => {
  test('one read leaves the dashboard stale as well, not only the two lists of the board', async () => {
    server.use(http.post(MARK_READ, () => new HttpResponse(null, { status: 201 })));
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queries}>{children}</QueryClientProvider>
    );
    queries.setQueryData(['guardian', 'dashboard', 1], { totalUnread: 3 });
    const { result } = renderHook(() => useMarkAsRead('a-1'), { wrapper });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() =>
      expect(queries.getQueryState(['guardian', 'dashboard', 1])?.isInvalidated).toBe(true),
    );
  });
});
