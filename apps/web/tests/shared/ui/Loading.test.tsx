import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { renderWithProviders } from '../../testSupport';
import { Loading } from '../../../src/shared/ui/Loading';

describe('Loading', () => {
  test('the wait is announced in words, because a bare spinner announces nothing', () => {
    renderWithProviders(<Loading />);

    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
  });
});
