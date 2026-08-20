import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../../testSupport';
import { notices, useNotices } from '../../../src/shared/ui/notices';

const LONGER_THAN_ANY_COUNTDOWN_THE_REGION_MAY_BE_RUNNING = 30_000;

const letEveryCountdownFireAndItsExitTransitionFinish = (): void => {
  act(() => {
    vi.advanceTimersByTime(LONGER_THAN_ANY_COUNTDOWN_THE_REGION_MAY_BE_RUNNING);
  });
  act(() => {
    vi.advanceTimersByTime(LONGER_THAN_ANY_COUNTDOWN_THE_REGION_MAY_BE_RUNNING);
  });
};

afterEach(() => {
  vi.useRealTimers();
});

const Fires = ({ kind, message }: { kind: 'success' | 'error'; message: string }): React.ReactElement => {
  const notices = useNotices();
  return (
    <button
      type="button"
      onClick={() => {
        notices[kind](message);
      }}
    >
      disparar
    </button>
  );
};

describe('useNotices — the wrapper whose case that matters is the one about time: a success message may go away on its own, a refusal may not', () => {
  test('a success message reaches the region mounted by the providers', async () => {
    const { user } = renderWithProviders(<Fires kind="success" message="Aluno cadastrado." />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));

    expect(await screen.findByText('Aluno cadastrado.')).toBeVisible();
  });

  test('a refusal stays put, while a success fired beside it is gone by the time the clock catches up — the one behavioural difference between the two, and not a cosmetic one: auto-dismissing a refusal is how somebody loses the single sentence explaining why their form did not go through, while they are still looking at the form', () => {
    vi.useFakeTimers();
    renderWithProviders(<></>);

    act(() => {
      notices.success('Aluno cadastrado.');
      notices.error('Não foi possível concluir.');
    });

    expect(screen.getByText('Aluno cadastrado.')).toBeVisible();
    expect(screen.getByText('Não foi possível concluir.')).toBeVisible();

    letEveryCountdownFireAndItsExitTransitionFinish();

    expect(screen.queryByText('Aluno cadastrado.')).toBeNull();
    expect(screen.getByText('Não foi possível concluir.')).toBeVisible();
  });

  test('the dismiss button says what it does, because it is the only way out of a refusal that never auto-closes, and announced as button alone it is a control somebody has to guess at right where they have just been told something went wrong', async () => {
    const { user } = renderWithProviders(<Fires kind="error" message="Não foi possível concluir." />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));
    await screen.findByText('Não foi possível concluir.');

    expect(screen.getByRole('button', { name: 'Fechar aviso' })).toBeVisible();
  });

  test('a notice fired from outside React reaches the same region, which is what the 401 handler needs', async () => {
    renderWithProviders(<Fires kind="success" message="Aluno cadastrado." />);

    notices.error('Sua sessão expirou. Entre de novo.');

    expect(await screen.findByText('Sua sessão expirou. Entre de novo.')).toBeVisible();
  });

  test('clear() empties the region', async () => {
    const { user } = renderWithProviders(<Fires kind="success" message="Aluno cadastrado." />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));
    await screen.findByText('Aluno cadastrado.');

    useNotices().clear();

    await waitFor(() => expect(screen.queryByText('Aluno cadastrado.')).toBeNull());
  });
});
