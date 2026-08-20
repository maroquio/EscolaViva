import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { renderWithProviders } from '../../testSupport';
import { ApiError } from '../../../src/shared/api';
import { LoadFailed } from '../../../src/shared/ui/LoadFailed';

describe('LoadFailed — what a failed screen tells the person, and the raw exception message it may never leak into a page a school secretary is reading', () => {
  test('shows the server message and the correlation code support will ask for', () => {
    const error = new ApiError(500, [{ code: 'x', message: 'Falha ao consultar as turmas.' }], 'abc123');

    renderWithProviders(<LoadFailed error={error} />);

    expect(screen.getByText('Falha ao consultar as turmas.')).toBeVisible();
    expect(screen.getByText('abc123')).toBeVisible();
  });

  test('a failure the API never shaped — a bug in a component, a TypeError during render — gets the readable sentence and not its own message, which nobody outside this repository should read', () => {
    renderWithProviders(<LoadFailed error={new Error('kaboom at line 42')} />);

    expect(screen.queryByText(/kaboom/)).toBeNull();
    expect(screen.getByRole('alert')).toBeVisible();
  });

  test('with no correlation code it shows no code block', () => {
    renderWithProviders(<LoadFailed error={new ApiError(0, [], '')} />);

    expect(screen.queryByText(/informe este código/i)).toBeNull();
  });

  test('the retry button only exists when there is something to retry', async () => {
    let retried = 0;
    const { user } = renderWithProviders(
      <LoadFailed error={new ApiError(500, [], '')} onRetry={() => (retried += 1)} />,
    );

    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(retried).toBe(1);
  });

  test('and is absent when no retry was offered', () => {
    renderWithProviders(<LoadFailed error={new ApiError(500, [], '')} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
