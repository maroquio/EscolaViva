import { useQueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { useLocation } from 'react-router';
import { describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { renderRoutes, renderWithProviders } from '../../testSupport';
import { AREA_ROUTES } from '../../../src/constants';
import { Closing } from '../../../src/features/teacher/Closing';
import { Grades } from '../../../src/features/teacher/Grades';
import { MyClassGroups } from '../../../src/features/teacher/MyClassGroups';
import { RollCall } from '../../../src/features/teacher/RollCall';
import TeacherRoutes from '../../../src/features/teacher/routes';
import { useCloseTerm, usePostGrades } from '../../../src/features/teacher/mutations';
import { teacherKeys, useGrades } from '../../../src/features/teacher/queries';

const CLASS_GROUPS = '*/api/v1/teacher/class-groups';
const GRADES = '*/api/v1/teacher/subjects/:id/grades';
const ROLL_CALL = '*/api/v1/teacher/class-groups/:id/roll-call';
const CLOSING = '*/api/v1/teacher/class-groups/:id/closing';

const ShowsTheAddress = (): React.ReactElement => {
  const { search } = useLocation();
  return <p data-testid="endereco">{search}</p>;
};

const gradeRows = [
  { enrollmentId: 'e-1', studentName: 'Ana Souza', value: 7.5 },
  { enrollmentId: 'e-2', studentName: 'Bruno Lima', value: null },
];

const gradesScreen = (over: Record<string, unknown> = {}) => ({
  assignment: {
    id: 'cgs-1',
    subjectName: 'Matemática',
    classGroupId: 'cg-1',
    classGroupName: '3º ano A',
  },
  term: 1,
  closed: false,
  rows: gradeRows,
  ...over,
});

const rollCallScreen = (over: Record<string, unknown> = {}) => ({
  date: '2026-03-10',
  rows: [
    { enrollmentId: 'e-1', studentName: 'Ana Souza', present: true, excuse: null },
    { enrollmentId: 'e-2', studentName: 'Bruno Lima', present: true, excuse: null },
  ],
  ...over,
});

const closingStates = [
  { term: 1, closed: true, closedAt: '2026-04-20T14:30:00.000Z' },
  { term: 2, closed: false, closedAt: null },
];

const openGrades = (address = '/teacher/subjects/cgs-1/grades', showsTheAddress = false) =>
  renderRoutes(
    [
      {
        path: '/teacher/subjects/:classGroupSubjectId/grades',
        element: showsTheAddress ? (
          <>
            <Grades />
            <ShowsTheAddress />
          </>
        ) : (
          <Grades />
        ),
      },
      { path: '/teacher', element: <p>minhas turmas</p> },
    ],
    address,
  );

const openRollCall = (
  address = '/teacher/class-groups/cg-1/roll-call',
  showsTheAddress = false,
) =>
  renderRoutes(
    [
      {
        path: '/teacher/class-groups/:classGroupId/roll-call',
        element: showsTheAddress ? (
          <>
            <RollCall />
            <ShowsTheAddress />
          </>
        ) : (
          <RollCall />
        ),
      },
    ],
    address,
  );

const openClosing = () =>
  renderRoutes(
    [{ path: '/teacher/class-groups/:classGroupId/closing', element: <Closing /> }],
    '/teacher/class-groups/cg-1/closing',
  );

const SomebodyElsePostsToTheSameTerm = (): React.ReactElement => {
  const queries = useQueryClient();
  return (
    <button
      type="button"
      onClick={() => void queries.invalidateQueries({ queryKey: teacherKeys.everyGradeGrid })}
    >
      outro lançamento chega
    </button>
  );
};

const openGradesWhileAnotherPostingLands = () =>
  renderRoutes(
    [
      {
        path: '/teacher/subjects/:classGroupSubjectId/grades',
        element: (
          <>
            <Grades />
            <SomebodyElsePostsToTheSameTerm />
          </>
        ),
      },
    ],
    '/teacher/subjects/cgs-1/grades',
  );

describe('the addresses of the teaching area', () => {
  test.each([
    ['/teacher/subjects/cgs-1/grades', 'cgs-1'],
    ['/teacher/class-groups/cg-1/roll-call', 'cg-1'],
    ['/teacher/class-groups/cg-1/closing', 'cg-1'],
  ])(
    '%s reaches the server with the id in it: a path parameter renamed reads undefined',
    async (address, id) => {
      const asked: string[] = [];
      server.use(
        http.get(GRADES, ({ params }) => {
          asked.push(String(params.id));
          return HttpResponse.json(gradesScreen());
        }),
        http.get(ROLL_CALL, ({ params }) => {
          asked.push(String(params.id));
          return HttpResponse.json(rollCallScreen());
        }),
        http.get(CLOSING, ({ params }) => {
          asked.push(String(params.id));
          return HttpResponse.json(closingStates);
        }),
      );

      renderRoutes([{ path: AREA_ROUTES.teacher, element: <TeacherRoutes /> }], address);

      await waitFor(() => expect(asked).toEqual([id]));
    },
  );
});

describe('MyClassGroups', () => {
  test('lists the groups with their subjects, and the two group-level actions', async () => {
    server.use(
      http.get(CLASS_GROUPS, () =>
        HttpResponse.json([
          {
            classGroupId: 'cg-1',
            classGroupName: '3º ano A',
            gradeLevel: '3º ano',
            shift: 'morning',
            subjects: [{ id: 'cgs-1', subjectName: 'Matemática' }],
          },
        ]),
      ),
    );

    renderWithProviders(<MyClassGroups />);

    expect(await screen.findByText('3º ano A')).toBeVisible();
    expect(screen.getByText('3º ano · Matutino')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Notas de Matemática' })).toHaveAttribute(
      'href',
      '/teacher/subjects/cgs-1/grades',
    );
    expect(screen.getByRole('link', { name: 'Frequência' })).toHaveAttribute(
      'href',
      '/teacher/class-groups/cg-1/roll-call',
    );
  });

  test('a class group with no subject of yours says so, instead of a card that explains nothing', async () => {
    server.use(
      http.get(CLASS_GROUPS, () =>
        HttpResponse.json([
          {
            classGroupId: 'cg-1',
            classGroupName: '3º ano A',
            gradeLevel: '3º ano',
            shift: 'morning',
            subjects: [],
          },
        ]),
      ),
    );

    renderWithProviders(<MyClassGroups />);

    expect(await screen.findByText('Nenhuma disciplina sua nesta turma.')).toBeVisible();
  });

  test('a teacher with no assignment is told who makes them', async () => {
    server.use(http.get(CLASS_GROUPS, () => HttpResponse.json([])));

    renderWithProviders(<MyClassGroups />);

    expect(await screen.findByText('Nenhuma turma atribuída')).toBeVisible();
    expect(screen.getByText(/secretaria da escola/i)).toBeVisible();
  });
});

describe('Grades — the term', () => {
  test('?term=9 opens the first term quietly, because this is navigation and not a write', async () => {
    let asked: string | null = null;
    server.use(
      http.get(GRADES, ({ request }) => {
        asked = new URL(request.url).searchParams.get('term');
        return HttpResponse.json(gradesScreen());
      }),
    );

    openGrades('/teacher/subjects/cgs-1/grades?term=9');

    await screen.findByText('Ana Souza');
    expect(asked).toBe('1');
  });

  test('and so does a term that is not a number at all', async () => {
    let asked: string | null = null;
    server.use(
      http.get(GRADES, ({ request }) => {
        asked = new URL(request.url).searchParams.get('term');
        return HttpResponse.json(gradesScreen());
      }),
    );

    openGrades('/teacher/subjects/cgs-1/grades?term=lixo');

    await screen.findByText('Ana Souza');
    expect(asked).toBe('1');
  });

  test('choosing a term writes it into the address and asks the server again', async () => {
    const asked: string[] = [];
    server.use(
      http.get(GRADES, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('term') ?? '');
        return HttpResponse.json(gradesScreen({ term: 3 }));
      }),
    );

    const { user } = openGrades('/teacher/subjects/cgs-1/grades', true);

    await screen.findByText('Ana Souza');
    await user.click(screen.getByRole('button', { name: '3º bimestre' }));

    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('term=3'));
    await waitFor(() => expect(asked.at(-1)).toBe('3'));
  });

  test('the first term is the absence of the parameter, so one screen is not two addresses', async () => {
    server.use(http.get(GRADES, () => HttpResponse.json(gradesScreen())));

    const { user } = openGrades('/teacher/subjects/cgs-1/grades?term=3', true);

    await screen.findByText('Ana Souza');
    await user.click(screen.getByRole('button', { name: '1º bimestre' }));

    await waitFor(() =>
      expect(screen.getByTestId('endereco').textContent).not.toContain('term='),
    );
  });
});

describe('Grades — typing', () => {
  test('a stored grade appears with the separator this country writes', async () => {
    server.use(http.get(GRADES, () => HttpResponse.json(gradesScreen())));

    openGrades();

    expect(await screen.findByRole('textbox', { name: 'Nota de Ana Souza' })).toHaveValue('7,5');
    expect(screen.getByRole('textbox', { name: 'Nota de Bruno Lima' })).toHaveValue('');
  });

  test('a grade outside the scale stays in the cell after the refusal, so the teacher corrects what is there instead of typing it again', async () => {
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen())),
      http.put(GRADES, () => HttpResponse.json({ saved: 2 })),
    );

    const { user } = openGrades();

    const cell = await screen.findByRole('textbox', { name: 'Nota de Ana Souza' });
    await user.clear(cell);
    await user.type(cell, '11');
    expect(cell).toHaveValue('11');

    await user.click(screen.getByRole('button', { name: 'Lançar notas' }));

    expect(await screen.findByText('Nota entre 0 e 10.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Nota de Ana Souza' })).toHaveValue('11');
  });

  test('an answer arriving on its own does not wipe the column the teacher is still typing, which would lose grades with no warning', async () => {
    let answers = 0;
    server.use(
      http.get(GRADES, () => {
        answers += 1;
        return HttpResponse.json(
          answers === 1
            ? gradesScreen()
            : gradesScreen({
                assignment: {
                  id: 'cgs-1',
                  subjectName: 'Matemática II',
                  classGroupId: 'cg-1',
                  classGroupName: '3º ano A',
                },
                rows: [
                  { enrollmentId: 'e-1', studentName: 'Ana Souza', value: 2 },
                  { enrollmentId: 'e-2', studentName: 'Bruno Lima', value: 3 },
                ],
              }),
        );
      }),
    );

    const { user } = openGradesWhileAnotherPostingLands();

    const cell = await screen.findByRole('textbox', { name: 'Nota de Ana Souza' });
    await user.clear(cell);
    await user.type(cell, '9,5');

    await user.click(screen.getByRole('button', { name: 'outro lançamento chega' }));

    expect(await screen.findByText('Notas de Matemática II')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Nota de Ana Souza' })).toHaveValue('9,5');
    expect(screen.getByRole('textbox', { name: 'Nota de Bruno Lima' })).toHaveValue('');
  });

  test('a grade of 11 lights the cell and sends nothing, instead of clearing that grade', async () => {
    let posted = false;
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen())),
      http.put(GRADES, () => {
        posted = true;
        return HttpResponse.json({ saved: 2 });
      }),
    );

    const { user } = openGrades();

    const cell = await screen.findByRole('textbox', { name: 'Nota de Ana Souza' });
    await user.clear(cell);
    await user.type(cell, '11');
    await user.click(screen.getByRole('button', { name: 'Lançar notas' }));

    expect(await screen.findByText('Nota entre 0 e 10.')).toBeVisible();
    expect(posted).toBe(false);
  });

  test('and so does something that is not a number', async () => {
    let posted = false;
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen())),
      http.put(GRADES, () => {
        posted = true;
        return HttpResponse.json({ saved: 2 });
      }),
    );

    const { user } = openGrades();

    const cell = await screen.findByRole('textbox', { name: 'Nota de Ana Souza' });
    await user.clear(cell);
    await user.type(cell, 'abc');
    await user.click(screen.getByRole('button', { name: 'Lançar notas' }));

    expect(await screen.findByText('Nota entre 0 e 10.')).toBeVisible();
    expect(posted).toBe(false);
  });

  test('a cleared grade is a real intention and sends null for that enrollment', async () => {
    let sent: { grades?: { enrollmentId: string; value: number | null }[] } = {};
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen())),
      http.put(GRADES, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json({ saved: 2 });
      }),
    );

    const { user } = openGrades();

    await user.clear(await screen.findByRole('textbox', { name: 'Nota de Ana Souza' }));
    await user.click(screen.getByRole('button', { name: 'Lançar notas' }));

    await waitFor(() =>
      expect(sent.grades).toEqual([
        { enrollmentId: 'e-1', value: null },
        { enrollmentId: 'e-2', value: null },
      ]),
    );
  });

  test('a comma and a dot reach the server as the same number', async () => {
    let sent: { grades?: { enrollmentId: string; value: number | null }[] } = {};
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen())),
      http.put(GRADES, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json({ saved: 2 });
      }),
    );

    const { user } = openGrades();

    const cell = await screen.findByRole('textbox', { name: 'Nota de Bruno Lima' });
    await user.type(cell, '9,25');
    await user.click(screen.getByRole('button', { name: 'Lançar notas' }));

    await waitFor(() => expect(sent.grades?.[1]?.value).toBe(9.25));
  });
});

describe('Grades — what the server refuses', () => {
  test('a 422 naming an enrollment lights that cell: an error on an unregistered path renders nothing', async () => {
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen())),
      http.put(GRADES, () =>
        HttpResponse.json(
          {
            errors: [
              { field: 'e-2', code: 'nota_fora_da_escala', message: 'Nota fora da escala.' },
            ],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = openGrades();

    await user.type(await screen.findByRole('textbox', { name: 'Nota de Bruno Lima' }), '8');
    await user.click(screen.getByRole('button', { name: 'Lançar notas' }));

    const row = (await screen.findByText('Bruno Lima')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Nota fora da escala.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a 422 naming an enrollment that is not on screen goes to the top, never nowhere', async () => {
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen())),
      http.put(GRADES, () =>
        HttpResponse.json(
          {
            errors: [{ field: 'e-99', code: 'x', message: 'Matrícula não encontrada.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = openGrades();

    await user.type(await screen.findByRole('textbox', { name: 'Nota de Bruno Lima' }), '8');
    await user.click(screen.getByRole('button', { name: 'Lançar notas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Matrícula não encontrada.');
  });

  test('a refusal with no field at all goes to the top too', async () => {
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen())),
      http.put(GRADES, () =>
        HttpResponse.json(
          { errors: [{ code: 'x', message: 'Bimestre já fechado.' }], correlationId: 'abc' },
          { status: 422 },
        ),
      ),
    );

    const { user } = openGrades();

    await user.type(await screen.findByRole('textbox', { name: 'Nota de Bruno Lima' }), '8');
    await user.click(screen.getByRole('button', { name: 'Lançar notas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bimestre já fechado.');
  });
});

describe('Grades — a closed term', () => {
  test('the fields are disabled and the reason is on screen, not only on submit', async () => {
    server.use(http.get(GRADES, () => HttpResponse.json(gradesScreen({ closed: true }))));

    openGrades();

    expect(await screen.findByRole('textbox', { name: 'Nota de Ana Souza' })).toBeDisabled();
    expect(screen.getByText(/já foi fechado/i)).toBeVisible();
  });

  test('and there is nothing to press', async () => {
    server.use(http.get(GRADES, () => HttpResponse.json(gradesScreen({ closed: true }))));

    openGrades();

    await screen.findByText('Ana Souza');
    expect(screen.queryByRole('button', { name: 'Lançar notas' })).toBeNull();
  });
});

describe('RollCall', () => {
  test('the register opens with everybody present, because an absence is the exception', async () => {
    server.use(http.get(ROLL_CALL, () => HttpResponse.json(rollCallScreen())));

    openRollCall();

    expect(await screen.findByRole('checkbox', { name: 'Ana Souza presente' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bruno Lima presente' })).toBeChecked();
  });

  test('the excuse is offered only to whoever is absent, so nobody explains an absence that did not happen', async () => {
    server.use(http.get(ROLL_CALL, () => HttpResponse.json(rollCallScreen())));

    const { user } = openRollCall();

    const excuse = await screen.findByRole('textbox', { name: 'Justificativa de Ana Souza' });
    expect(excuse).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Ana Souza presente' }));
    expect(excuse).toBeEnabled();
  });

  test('every row is sent, because a row the server never hears about is recorded as absent', async () => {
    let sent: { date?: string; rows?: unknown[] } = {};
    server.use(
      http.get(ROLL_CALL, () => HttpResponse.json(rollCallScreen())),
      http.put(ROLL_CALL, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { user } = openRollCall();

    await user.click(await screen.findByRole('checkbox', { name: 'Ana Souza presente' }));
    await user.type(screen.getByRole('textbox', { name: 'Justificativa de Ana Souza' }), 'Consulta médica');
    await user.click(screen.getByRole('button', { name: 'Registrar frequência' }));

    await waitFor(() =>
      expect(sent.rows).toEqual([
        { enrollmentId: 'e-1', present: false, excuse: 'Consulta médica' },
        { enrollmentId: 'e-2', present: true, excuse: null },
      ]),
    );
    expect(sent.date).toBe('2026-03-10');
  });

  test('an empty note is no note: it reaches the server as null, never as an empty string', async () => {
    let sent: { rows?: { excuse: string | null }[] } = {};
    server.use(
      http.get(ROLL_CALL, () => HttpResponse.json(rollCallScreen())),
      http.put(ROLL_CALL, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { user } = openRollCall();

    await user.click(await screen.findByRole('checkbox', { name: 'Ana Souza presente' }));
    await user.click(screen.getByRole('button', { name: 'Registrar frequência' }));

    await waitFor(() => expect(sent.rows?.[0]?.excuse).toBeNull());
  });

  test('the day lives in the address, so a register filled in yesterday survives a reload', async () => {
    server.use(http.get(ROLL_CALL, () => HttpResponse.json(rollCallScreen())));

    const { user } = openRollCall('/teacher/class-groups/cg-1/roll-call?date=2026-03-10', true);

    await screen.findByText('10/03/2026');
    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));

    await waitFor(() =>
      expect(screen.getByTestId('endereco')).toHaveTextContent('date=2026-03-09'),
    );
  });

  test('and the next-day button goes the other way', async () => {
    server.use(http.get(ROLL_CALL, () => HttpResponse.json(rollCallScreen())));

    const { user } = openRollCall('/teacher/class-groups/cg-1/roll-call?date=2026-03-10', true);

    await screen.findByText('10/03/2026');
    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));

    await waitFor(() =>
      expect(screen.getByTestId('endereco')).toHaveTextContent('date=2026-03-11'),
    );
  });

  test('stepping back from the first of a month lands on the last day of the previous one', async () => {
    server.use(
      http.get(ROLL_CALL, ({ request }) =>
        HttpResponse.json(
          rollCallScreen({ date: new URL(request.url).searchParams.get('date') ?? '2026-03-01' }),
        ),
      ),
    );

    const { user } = openRollCall('/teacher/class-groups/cg-1/roll-call?date=2026-03-01', true);

    await screen.findByText('01/03/2026');
    await user.click(screen.getByRole('button', { name: 'Dia anterior' }));

    await waitFor(() =>
      expect(screen.getByTestId('endereco')).toHaveTextContent('date=2026-02-28'),
    );
  });

  test('a new day shows nothing until it answers, never the ticks of the day before', async () => {
    let releaseTheNextDay = (): void => {};
    const theNextDayIsHeld = new Promise<void>((resolve) => {
      releaseTheNextDay = resolve;
    });
    server.use(
      http.get(ROLL_CALL, async ({ request }) => {
        const day = new URL(request.url).searchParams.get('date') ?? '2026-03-10';
        if (day === '2026-03-11') await theNextDayIsHeld;
        return HttpResponse.json(rollCallScreen({ date: day }));
      }),
    );

    const { user } = openRollCall('/teacher/class-groups/cg-1/roll-call?date=2026-03-10');

    await screen.findByRole('checkbox', { name: 'Ana Souza presente' });
    await user.click(screen.getByRole('button', { name: 'Próximo dia' }));

    expect(await screen.findByText('Carregando…')).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Ana Souza presente' })).toBeNull();

    releaseTheNextDay();
    expect(await screen.findByText('11/03/2026')).toBeVisible();
  });

  test('with no day in the address it asks for none: the browser clock may not be today', async () => {
    let asked: string | null = 'unset';
    server.use(
      http.get(ROLL_CALL, ({ request }) => {
        asked = new URL(request.url).searchParams.get('date');
        return HttpResponse.json(rollCallScreen());
      }),
    );

    openRollCall();

    await screen.findByText('Ana Souza');
    expect(asked).toBeNull();
  });
});

describe('Closing', () => {
  test('shows each term, and offers to close only the open ones', async () => {
    server.use(http.get(CLOSING, () => HttpResponse.json(closingStates)));

    openClosing();

    expect(await screen.findByText('Fechado')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Fechar 2º bimestre' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fechar 1º bimestre' })).toBeNull();
  });

  test('a refusal lists everything that is missing, one sentence per thing', async () => {
    server.use(
      http.get(CLOSING, () => HttpResponse.json(closingStates)),
      http.post(CLOSING, () =>
        HttpResponse.json(
          {
            errors: [
              { code: 'sem_notas', message: 'Matemática não tem notas lançadas.' },
              { code: 'sem_chamada', message: 'Nenhuma chamada registrada no bimestre.' },
            ],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const { user } = openClosing();

    await user.click(await screen.findByRole('button', { name: 'Fechar 2º bimestre' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Matemática não tem notas lançadas.')).toBeVisible();
    expect(within(alert).getByText('Nenhuma chamada registrada no bimestre.')).toBeVisible();
  });

  test('the wait is shown and not hidden: the button disables and says what is happening', async () => {
    let closings = 0;
    server.use(
      http.get(CLOSING, () => HttpResponse.json(closingStates)),
      http.post(CLOSING, async () => {
        closings += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ term: 2 }, { status: 201 });
      }),
    );

    const { user } = openClosing();

    const button = await screen.findByRole('button', { name: 'Fechar 2º bimestre' });
    await user.click(button);

    expect(await screen.findByText(/pode levar alguns segundos/i)).toBeVisible();
    await waitFor(() => expect(button).toBeDisabled());

    await user.click(button).catch(() => undefined);
    expect(closings).toBe(1);
  });

  test('while one term is closing, the button of every other term is disabled too', async () => {
    server.use(
      http.get(CLOSING, () =>
        HttpResponse.json([
          { term: 1, closed: false, closedAt: null },
          { term: 2, closed: false, closedAt: null },
        ]),
      ),
      http.post(CLOSING, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ term: 1 }, { status: 201 });
      }),
    );

    const { user } = openClosing();

    await user.click(await screen.findByRole('button', { name: 'Fechar 1º bimestre' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fechar 2º bimestre' })).toBeDisabled(),
    );
  });

  test('a successful closing says so', async () => {
    server.use(
      http.get(CLOSING, () => HttpResponse.json(closingStates)),
      http.post(CLOSING, () => HttpResponse.json({ term: 2 }, { status: 201 })),
    );

    const { user } = openClosing();

    await user.click(await screen.findByRole('button', { name: 'Fechar 2º bimestre' }));

    expect(await screen.findByText('2º bimestre fechado.')).toBeVisible();
  });
});

describe('what a closed term freezes', () => {
  const ClosingAndGrades = (): React.ReactElement => {
    const grades = useGrades('cgs-1', 1);
    const close = useCloseTerm('cg-1');

    return (
      <>
        <p data-testid="bimestre">
          {grades.data === undefined ? 'carregando' : String(grades.data.closed)}
        </p>
        <button type="button" onClick={() => close.mutate({ term: 1 })}>
          fechar
        </button>
      </>
    );
  };

  test('closing a term refreshes the grade grid, so nobody types into fields already read-only', async () => {
    let closed = false;
    server.use(
      http.get(GRADES, () => HttpResponse.json(gradesScreen({ closed }))),
      http.post(CLOSING, () => {
        closed = true;
        return HttpResponse.json({ term: 1 }, { status: 201 });
      }),
    );

    const { user } = renderWithProviders(<ClosingAndGrades />);

    await waitFor(() => expect(screen.getByTestId('bimestre')).toHaveTextContent('false'));
    await user.click(screen.getByRole('button', { name: 'fechar' }));

    await waitFor(() => expect(screen.getByTestId('bimestre')).toHaveTextContent('true'));
  });
});

describe('the two mutations the button at the top of this file stands in for', () => {
  const PostingAndGrades = (): React.ReactElement => {
    const grades = useGrades('cgs-1', 1);
    const post = usePostGrades('cgs-1');

    return (
      <>
        <p data-testid="nota">
          {grades.data === undefined ? 'carregando' : String(grades.data.rows[0]?.value)}
        </p>
        <button
          type="button"
          onClick={() => post.mutate({ term: 1, grades: [{ enrollmentId: 'e-1', value: 9 }] })}
        >
          lançar
        </button>
      </>
    );
  };

  test('posting grades refreshes the grid: let `usePostGrades` stop invalidating and `SomebodyElsePostsToTheSameTerm` goes on invalidating anyway, so every case built on it would keep proving a browser that no longer exists', async () => {
    let stored = 7.5;
    server.use(
      http.get(GRADES, () =>
        HttpResponse.json(
          gradesScreen({ rows: [{ enrollmentId: 'e-1', studentName: 'Ana Souza', value: stored }] }),
        ),
      ),
      http.put(GRADES, () => {
        stored = 9;
        return HttpResponse.json({ saved: 1 });
      }),
    );

    const { user } = renderWithProviders(<PostingAndGrades />);

    await waitFor(() => expect(screen.getByTestId('nota')).toHaveTextContent('7.5'));
    await user.click(screen.getByRole('button', { name: 'lançar' }));

    await waitFor(() => expect(screen.getByTestId('nota')).toHaveTextContent('9'));
  });

  test('and the sweeping key the button uses contains the narrow one `usePostGrades` invalidates, which is what lets one press stand for either mutation instead of only for the closing', () => {
    const oneGrid = teacherKeys.grades('cgs-1', 1);

    expect(oneGrid.slice(0, teacherKeys.everyGradeGrid.length)).toEqual([
      ...teacherKeys.everyGradeGrid,
    ]);
    expect(oneGrid.length).toBeGreaterThan(teacherKeys.everyGradeGrid.length);
  });
});
