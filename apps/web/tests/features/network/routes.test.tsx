import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { renderRoutes } from '../../testSupport';
import NetworkRoutes from '../../../src/features/network/routes';

describe('the network area shell', () => {
  test('is the module default export, because app/routes.tsx loads it with lazy() and a named export would arrive as nothing', async () => {
    const area = await import('../../../src/features/network/routes');

    expect(typeof area.default).toBe('function');
  });

  test('answers a typo with the not-found screen, because a splat area without a catch-all renders an empty page and no error', () => {
    renderRoutes([{ path: '/network/*', element: <NetworkRoutes /> }], '/network/nao-existe');

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  });
});
