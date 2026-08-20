import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithProviders } from '../../testSupport';
import { ErrorBoundary } from '../../../src/shared/ui/ErrorBoundary';

const Explodes = (): React.ReactElement => {
  throw new Error('componente quebrado');
};

const silenceTheTwoStackTracesADeliberateFailurePrints = (): void => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
};

beforeEach(silenceTheTwoStackTracesADeliberateFailurePrints);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary, which only something that actually throws can prove', () => {
  test('a child that throws becomes a message instead of a blank page', () => {
    renderWithProviders(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByText(/não pôde ser exibida/i)).toBeVisible();
  });

  test('a child that does not throw is left alone', () => {
    renderWithProviders(
      <ErrorBoundary>
        <span>conteúdo</span>
      </ErrorBoundary>,
    );

    expect(screen.getByText('conteúdo')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('the retry button clears the failure and renders the children again, and is not decoration: a chunk that failed to download because the connection dropped succeeds on the second try, and without it the only way back is the full page reload that a slow connection can least afford', async () => {
    let fails = true;
    const Sometimes = (): React.ReactElement => {
      if (fails) throw new Error('primeira tentativa');
      return <span>funcionou</span>;
    };

    const { user } = renderWithProviders(
      <ErrorBoundary>
        <Sometimes />
      </ErrorBoundary>,
    );

    fails = false;
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(screen.getByText('funcionou')).toBeVisible();
  });
});
