import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '../../src/shared/api';
import { renderRoutes } from '../testSupport';
import { UnexpectedError } from '../../src/app/UnexpectedError';

const Throws = ({ what }: { what: unknown }): React.ReactElement => {
  throw what;
};

const routesThrowing = (what: unknown) => [
  { path: '/', element: <Throws what={what} />, errorElement: <UnexpectedError /> },
];

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the router's errorElement, reached by throwing from a route because useRouteError returns nothing outside a data router — rendering it by hand would prove only that the component compiles", () => {
  test('an API failure shows the correlation code support types into the log to find this exact occurrence', async () => {
    renderRoutes(routesThrowing(new ApiError(500, [{ code: 'x', message: 'Falhou.' }], 'abc123')));

    expect(await screen.findByText('abc123')).toBeVisible();
  });

  test('anything else still renders without inventing a code — a route can throw a TypeError, and it carries no correlation code to show', async () => {
    renderRoutes(routesThrowing(new TypeError('kaboom')));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText(/informe este código/i)).toBeNull();
  });

  test('including something that is not an Error at all', async () => {
    renderRoutes(routesThrowing('só uma string'));

    expect(await screen.findByRole('alert')).toBeVisible();
  });

  test('including a plain object whose own correlationId is truthy and not a string — only an ApiError carries a code the support log can find, so no field is read off anything else', async () => {
    renderRoutes(routesThrowing({ correlationId: 42 }));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText(/informe este código/i)).toBeNull();
    expect(screen.queryByText('42')).toBeNull();
  });

  test('and including nothing at all: a route can throw null, and reading .correlationId off whatever arrives would crash the error screen itself — the one shape for which that is true', async () => {
    renderRoutes(routesThrowing(null));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText(/informe este código/i)).toBeNull();
  });
});
