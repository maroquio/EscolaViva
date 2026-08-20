import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Loading } from '../src/shared/ui/Loading';
import { renderRoutes, renderWithProviders } from './testSupport';

const HELPERS = [
  ['renderWithProviders', (element: ReactElement) => renderWithProviders(element)],
  ['renderRoutes', (element: ReactElement) => renderRoutes([{ path: '/', element }])],
] as const;

const Explodes = (): ReactElement => {
  throw new Error('estourou');
};

const ONE_ROUTER_INSIDE_ANOTHER = /cannot render a <Router> inside another <Router>/;

describe('the two helpers every front test stands on, exercised so that a broken jsdom, a missing Mantine stylesheet, a misconfigured setupFiles or a router that cannot mount fails here instead of in a screen test', () => {
  test('renders a component through the same providers main.tsx mounts', () => {
    renderWithProviders(<p>oi</p>);

    expect(screen.getByText('oi')).toBeInTheDocument();
  });

  test('the jest-dom matchers are loaded, which is what setupFiles is for — a wrong entry there makes the assertion above throw "not a function" rather than fail, which is a different bug wearing the same red', () => {
    renderWithProviders(<button type="button">enviar</button>);

    expect(screen.getByRole('button', { name: 'enviar' })).toBeEnabled();
  });

  test('the data router mounts and resolves the initial route', async () => {
    renderRoutes(
      [
        { path: '/', element: <p>raiz</p> },
        { path: '/turmas', element: <p>turmas</p> },
      ],
      '/turmas',
    );

    expect(await screen.findByText('turmas')).toBeInTheDocument();
  });

  test.each(HELPERS)(
    '%s hands back a session and not the imported `userEvent`: a modifier held down in one call is still held in the next, which is why a test takes the `user` these return and never calls `userEvent.type` and friends, each of those being a throwaway session that starts with nothing pressed',
    async (_helper, mount) => {
      const pressedWhileShiftWasDown: string[] = [];

      const { user } = mount(
        <input
          aria-label="nome"
          onKeyDown={(event) => {
            if (event.shiftKey) pressedWhileShiftWasDown.push(event.key);
          }}
        />,
      );

      await user.click(await screen.findByRole('textbox', { name: 'nome' }));
      await user.keyboard('{Shift>}');
      await user.keyboard('a');

      expect(pressedWhileShiftWasDown).toContain('a');
    },
  );

  test('the loading fallback announces itself to assistive technology', () => {
    renderWithProviders(<Loading />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('why the two are two, and not one that takes routes when it feels like it', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a data router does not nest inside the router `renderWithProviders` mounts: react-router refuses it by name, so a test that reaches for one from there fails on the mount rather than on what it meant to prove', () => {
    const nested = createMemoryRouter([{ path: '/', element: <p>dentro</p> }]);

    expect(() => renderWithProviders(<RouterProvider router={nested} />)).toThrow(
      ONE_ROUTER_INSIDE_ANOTHER,
    );
  });

  test('`renderRoutes` mounts the data router itself, which is the only place a route-level `errorElement` is honoured — the reason anything exercising one comes here', async () => {
    renderRoutes([{ path: '/', element: <Explodes />, errorElement: <p>o erro apareceu</p> }]);

    expect(await screen.findByText('o erro apareceu')).toBeInTheDocument();
  });
});
