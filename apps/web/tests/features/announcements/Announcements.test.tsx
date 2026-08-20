import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { renderRoutes, renderWithProviders } from '../../testSupport';
import { AnnouncementForm } from '../../../src/features/announcements/AnnouncementForm';
import { AnnouncementList } from '../../../src/features/announcements/AnnouncementList';
import { usePublishAnnouncement } from '../../../src/features/announcements/mutations';
import type { AnnouncementBoard, AnnouncementInList } from '@escolaviva/contracts/announcements';
import type { SchoolOption } from '@escolaviva/contracts/options';
import type { SimpleOption } from '@escolaviva/contracts/shared';

const ANNOUNCEMENTS = '*/api/v1/announcements';
const RECIPIENTS = '*/api/v1/announcements/recipients';
const SCHOOL_OPTIONS = '*/api/v1/options/schools';

const PAGE_SIZE = 10;

const schools: readonly SchoolOption[] = [
  { id: 'school-1', name: 'Escola Central', active: true },
  { id: 'school-2', name: 'Escola do Bairro', active: true },
];

const board = (over: Partial<AnnouncementBoard> = {}): AnnouncementBoard => ({
  announcements: {
    items: [
      {
        id: 'a-1',
        title: 'Reunião de pais',
        publishedAt: '2026-03-01T12:00:00.000Z',
        recipients: 81,
        reads: 10,
        rate: 0.123,
      },
    ],
    page: 1,
    pages: 3,
    total: 25,
    size: PAGE_SIZE,
  },
  summary: { recipients: 81, reads: 10, rate: 0.123 },
  currentSchool: '',
  seesWholeNetwork: true,
  ...over,
});

beforeEach(() => {
  server.use(http.get(SCHOOL_OPTIONS, () => HttpResponse.json(schools)));
});

const aFullyReadAnnouncement = (asked: string | null): AnnouncementInList => ({
  id: `a-${asked}`,
  title: `Comunicado da página ${asked}`,
  publishedAt: '2026-03-01T12:00:00.000Z',
  recipients: 81,
  reads: 81,
  rate: 1,
});

describe('the read rate, which arrives as a fraction and is shown as a percentage', () => {
  test('a rate of 0.123 reads as 12,3 %, and never as 0,1 %', async () => {
    server.use(http.get(ANNOUNCEMENTS, () => HttpResponse.json(board())));

    renderWithProviders(<AnnouncementList />, '/announcements');

    expect(await screen.findAllByText('12,3 %')).not.toHaveLength(0);
    expect(screen.queryByText('0,1 %')).toBeNull();
  });

  test('going to ?p=2 does not change the rate, because the summary measures the whole slice and not the page on screen', async () => {
    server.use(
      http.get(ANNOUNCEMENTS, ({ request }) => {
        const asked = new URL(request.url).searchParams.get('p');
        return HttpResponse.json(
          board({
            announcements: {
              items: [aFullyReadAnnouncement(asked)],
              page: Number(asked),
              pages: 3,
              total: 25,
              size: PAGE_SIZE,
            },
          }),
        );
      }),
    );

    renderWithProviders(<AnnouncementList />, '/announcements?p=2');

    await screen.findByText('Comunicado da página 2');
    const card = screen.getByText('Taxa de leitura').closest('div') as HTMLElement;
    expect(within(card).getByText('12,3 %')).toBeVisible();
  });

  test('and the two counts are beside it, so the number cannot be misread', async () => {
    server.use(http.get(ANNOUNCEMENTS, () => HttpResponse.json(board())));

    renderWithProviders(<AnnouncementList />, '/announcements');

    expect(await screen.findByText('10 leitura(s) de 81 destinatário(s)')).toBeVisible();
  });
});

describe('AnnouncementList', () => {
  test('the school filter lives in ?schoolId= and drops the page', async () => {
    let asked: string | null = null;
    server.use(
      http.get(ANNOUNCEMENTS, ({ request }) => {
        asked = new URL(request.url).searchParams.get('schoolId');
        return HttpResponse.json(board());
      }),
    );

    renderWithProviders(<AnnouncementList />, '/announcements?schoolId=school-1');

    await screen.findByText('Reunião de pais');
    expect(asked).toBe('school-1');
  });

  test('somebody who does not see the whole network gets no filter, because a selector with one option is a decision that does not exist', async () => {
    server.use(
      http.get(ANNOUNCEMENTS, () => HttpResponse.json(board({ seesWholeNetwork: false }))),
    );

    renderWithProviders(<AnnouncementList />, '/announcements');

    await screen.findByText('Reunião de pais');
    expect(screen.queryByRole('combobox', { name: 'Unidade' })).toBeNull();
  });

  test('an unsent announcement shows no date rather than an empty cell', async () => {
    server.use(
      http.get(ANNOUNCEMENTS, () =>
        HttpResponse.json(
          board({
            announcements: {
              items: [
                { id: 'a-2', title: 'Rascunho', publishedAt: null, recipients: 0, reads: 0, rate: 0 },
              ],
              page: 1,
              pages: 1,
              total: 1,
              size: PAGE_SIZE,
            },
          }),
        ),
      ),
    );

    renderWithProviders(<AnnouncementList />, '/announcements');

    const row = (await screen.findByText('Rascunho')).closest('tr') as HTMLElement;
    expect(within(row).getByText('—')).toBeVisible();
  });
});

describe('AnnouncementForm', () => {
  const openForm = () =>
    renderRoutes(
      [
        { path: '/announcements/new', element: <AnnouncementForm /> },
        { path: '/announcements', element: <p>lista de comunicados</p> },
      ],
      '/announcements/new',
    );

  const fillInBasics = async (user: ReturnType<typeof renderWithProviders>['user']) => {
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Unidade' }),
      'Escola Central',
    );
    await user.type(screen.getByRole('textbox', { name: 'Título' }), 'Reunião de pais');
    await user.type(screen.getByRole('textbox', { name: 'Comunicado' }), 'Na quinta-feira.');
  };

  test('choosing a school fetches its recipients on the same screen', async () => {
    const asked: string[] = [];
    server.use(
      http.get(RECIPIENTS, ({ request }) => {
        const schoolId = new URL(request.url).searchParams.get('schoolId') ?? '';
        asked.push(schoolId);
        return HttpResponse.json(
          schoolId === 'school-1'
            ? [{ id: 'g-1', name: 'Marina Souza' }]
            : [{ id: 'g-2', name: 'Paulo Lima' }],
        );
      }),
    );

    const { user } = openForm();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Unidade' }),
      'Escola Central',
    );
    await user.click(screen.getByRole('radio', { name: 'Responsáveis selecionados' }));

    expect(await screen.findByRole('checkbox', { name: 'Marina Souza' })).toBeVisible();
    expect(asked).toEqual(['school-1']);
  });

  test('changing the school clears what was ticked and asks again, instead of sending ids of a unit the person is no longer looking at', async () => {
    const asked: string[] = [];
    const bothSchoolsOfferTheSameGuardian = (schoolId: string): readonly SimpleOption[] =>
      schoolId === 'school-1'
        ? [{ id: 'g-1', name: 'Marina Souza' }]
        : [
            { id: 'g-1', name: 'Marina Souza' },
            { id: 'g-2', name: 'Paulo Lima' },
          ];
    server.use(
      http.get(RECIPIENTS, ({ request }) => {
        const schoolId = new URL(request.url).searchParams.get('schoolId') ?? '';
        asked.push(schoolId);
        return HttpResponse.json(bothSchoolsOfferTheSameGuardian(schoolId));
      }),
    );

    const { user } = openForm();

    const school = await screen.findByRole('combobox', { name: 'Unidade' });
    await user.selectOptions(school, 'Escola Central');
    await user.click(screen.getByRole('radio', { name: 'Responsáveis selecionados' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Marina Souza' }));
    expect(screen.getByRole('checkbox', { name: 'Marina Souza' })).toBeChecked();

    await user.selectOptions(school, 'Escola do Bairro');

    await waitFor(() => expect(asked).toEqual(['school-1', 'school-2']));
    await screen.findByRole('checkbox', { name: 'Paulo Lima' });
    expect(screen.getByRole('checkbox', { name: 'Marina Souza' })).not.toBeChecked();
  });

  test('the whole-school audience sends recipients as an empty array, and not as a missing key', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.get(RECIPIENTS, () => HttpResponse.json([{ id: 'g-1', name: 'Marina Souza' }])),
      http.post(ANNOUNCEMENTS, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'a-9' }, { status: 201 });
      }),
    );

    const { user } = openForm();

    await fillInBasics(user);
    await user.click(screen.getByRole('button', { name: 'Enviar comunicado' }));

    expect(await screen.findByText('lista de comunicados')).toBeVisible();
    expect(sent).toEqual({
      schoolId: 'school-1',
      title: 'Reunião de pais',
      body: 'Na quinta-feira.',
      audience: 'unidade',
      recipients: [],
    });
  });

  test('going back to the whole school discards what had been ticked, so no announcement reaches the whole school and names recipients too', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.get(RECIPIENTS, () => HttpResponse.json([{ id: 'g-1', name: 'Marina Souza' }])),
      http.post(ANNOUNCEMENTS, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'a-9' }, { status: 201 });
      }),
    );

    const { user } = openForm();

    await fillInBasics(user);
    await user.click(screen.getByRole('radio', { name: 'Responsáveis selecionados' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Marina Souza' }));
    await user.click(screen.getByRole('radio', { name: 'Toda a unidade' }));
    await user.click(screen.getByRole('button', { name: 'Enviar comunicado' }));

    await waitFor(() => expect(sent.recipients).toEqual([]));
    expect(sent.audience).toBe('unidade');
  });

  test('and coming back to the selected audience shows nothing ticked, not the selection somebody believed they had discarded', async () => {
    server.use(http.get(RECIPIENTS, () => HttpResponse.json([{ id: 'g-1', name: 'Marina Souza' }])));

    const { user } = openForm();

    await fillInBasics(user);
    await user.click(screen.getByRole('radio', { name: 'Responsáveis selecionados' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Marina Souza' }));
    await user.click(screen.getByRole('radio', { name: 'Toda a unidade' }));
    await user.click(screen.getByRole('radio', { name: 'Responsáveis selecionados' }));

    expect(await screen.findByRole('checkbox', { name: 'Marina Souza' })).not.toBeChecked();
  });

  test('the selected audience with nobody ticked is refused without a request, because it cannot mean anything', async () => {
    let called = false;
    server.use(
      http.get(RECIPIENTS, () => HttpResponse.json([{ id: 'g-1', name: 'Marina Souza' }])),
      http.post(ANNOUNCEMENTS, () => {
        called = true;
        return HttpResponse.json({ id: 'a-9' }, { status: 201 });
      }),
    );

    const { user } = openForm();

    await fillInBasics(user);
    await user.click(screen.getByRole('radio', { name: 'Responsáveis selecionados' }));
    await user.click(screen.getByRole('button', { name: 'Enviar comunicado' }));

    expect(await screen.findByText('Escolha ao menos um responsável.')).toBeVisible();
    expect(called).toBe(false);
  });

  test('a 422 on recipients lands next to the list, on the same key the form sent', async () => {
    server.use(
      http.get(RECIPIENTS, () => HttpResponse.json([{ id: 'g-1', name: 'Marina Souza' }])),
      http.post(ANNOUNCEMENTS, () =>
        HttpResponse.json(
          {
            errors: [
              {
                field: 'recipients',
                code: 'no_selection',
                message: 'Escolha ao menos um responsável da unidade.',
              },
            ],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = openForm();

    await fillInBasics(user);
    await user.click(screen.getByRole('radio', { name: 'Responsáveis selecionados' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Marina Souza' }));
    await user.click(screen.getByRole('button', { name: 'Enviar comunicado' }));

    expect(await screen.findByText('Escolha ao menos um responsável da unidade.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a school with no guardian says so, instead of an empty list', async () => {
    server.use(http.get(RECIPIENTS, () => HttpResponse.json([])));

    const { user } = openForm();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Unidade' }),
      'Escola Central',
    );
    await user.click(screen.getByRole('radio', { name: 'Responsáveis selecionados' }));

    expect(await screen.findByText(/Nenhum responsável vinculado/)).toBeVisible();
  });

  test('an empty form names each missing field without asking the server', async () => {
    let called = false;
    server.use(
      http.post(ANNOUNCEMENTS, () => {
        called = true;
        return HttpResponse.json({ id: 'a-9' }, { status: 201 });
      }),
    );

    const { user } = openForm();

    await user.click(await screen.findByRole('button', { name: 'Enviar comunicado' }));

    expect(await screen.findByText('Escolha a unidade.')).toBeVisible();
    expect(screen.getByText('Informe o título.')).toBeVisible();
    expect(called).toBe(false);
  });

  test('with no unit chosen, no recipient is asked for at all', async () => {
    let asked = 0;
    server.use(
      http.get(RECIPIENTS, () => {
        asked += 1;
        return HttpResponse.json([]);
      }),
    );

    const { user } = openForm();

    await user.click(await screen.findByRole('radio', { name: 'Responsáveis selecionados' }));

    expect(await screen.findByText('Escolha a unidade para ver os responsáveis.')).toBeVisible();
    expect(asked).toBe(0);
  });
});

describe('usePublishAnnouncement', () => {
  const cacheAndWrapper = () => {
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queries}>{children}</QueryClientProvider>
    );
    return { queries, wrapper };
  };

  const announcement = {
    schoolId: 'school-1',
    title: 'Reunião de pais',
    body: 'Na quinta-feira.',
  };

  test('the whole-unit audience sends an empty list, whatever had been ticked before', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.post(ANNOUNCEMENTS, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'a-9' }, { status: 201 });
      }),
    );
    const { wrapper } = cacheAndWrapper();
    const { result } = renderHook(() => usePublishAnnouncement(), { wrapper });

    act(() => {
      result.current.mutate({ ...announcement, audience: 'unidade', recipients: ['g-1'] });
    });

    await waitFor(() => expect(sent.recipients).toEqual([]));
  });

  test('and a sent announcement leaves the guardian board stale, not only the list of sent ones', async () => {
    server.use(http.post(ANNOUNCEMENTS, () => HttpResponse.json({ id: 'a-9' }, { status: 201 })));
    const { queries, wrapper } = cacheAndWrapper();
    queries.setQueryData(['guardian', 'board', 1, 1], { unread: [], read: [] });
    const { result } = renderHook(() => usePublishAnnouncement(), { wrapper });

    act(() => {
      result.current.mutate({ ...announcement, audience: 'unidade', recipients: [] });
    });

    await waitFor(() =>
      expect(queries.getQueryState(['guardian', 'board', 1, 1])?.isInvalidated).toBe(true),
    );
  });
});
