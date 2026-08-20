import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { Suspense, type ReactElement, type ReactNode } from 'react';
import { Outlet, Route, Routes, type RouteObject } from 'react-router';
import { describe, expect, test } from 'vitest';
import {
  ANNOUNCEMENT_CHILD_ROUTES,
  ANNOUNCEMENT_ROUTES,
  APP_ROUTES,
  AREA_ROUTES,
  GUARDIAN_CHILD_ROUTES,
  GUARDIAN_ROUTES,
  NETWORK_CHILD_ROUTES,
  NETWORK_ROUTES,
  REGISTRAR_CHILD_ROUTES,
  REGISTRAR_ROUTES,
  TEACHER_CHILD_ROUTES,
  TEACHER_ROUTES,
} from '../../src/constants';
import { ErrorBoundary } from '../../src/shared/ui/ErrorBoundary';
import AnnouncementsRoutes from '../../src/features/announcements/routes';
import GuardianRoutes from '../../src/features/guardian/routes';
import NetworkRoutes from '../../src/features/network/routes';
import RegistrarRoutes from '../../src/features/registrar/routes';
import TeacherRoutes from '../../src/features/teacher/routes';
import { server } from '../testSetup';
import { renderRoutes, userWith } from '../testSupport';
import { routes } from '../../src/app/routes';

const SESSION = '*/api/v1/session';

const signedInAs = (...roles: Parameters<typeof userWith>[0]): void => {
  server.use(http.get(SESSION, () => HttpResponse.json({ user: userWith(roles) })));
};

const signedOut = (): void => {
  server.use(
    http.get(SESSION, () => HttpResponse.json({ errors: [], correlationId: '' }, { status: 401 })),
  );
};

describe('the addresses the SSR version served, each of them possibly bookmarked and each of them in a screenshot in the stage material — a route that silently stopped resolving would be found by a student, mid-class, with no way to tell a broken link from a broken application', () => {
  test.each([
    ['/registrar', 'registrar' as const],
    ['/network', 'network_admin' as const],
    ['/teacher', 'teacher' as const],
    ['/guardian', 'guardian' as const],
  ])(
    '%s resolves for the role that owns it — the area shell renders nothing of its own until phase 4, so what proves the route resolved is the layout around it, and that neither the not-found nor the no-permission screen took over',
    async (path, role) => {
      signedInAs(role);

      renderRoutes(routes, path);

      expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
      expect(screen.queryByText(/não encontrada/i)).toBeNull();
      expect(screen.queryByText(/não tem permissão/i)).toBeNull();
    },
  );

  test('a deep address inside an area resolves too, and does not fall through to not-found', async () => {
    signedInAs('registrar');

    renderRoutes(routes, '/registrar/students/abc');

    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    expect(screen.queryByText(/não encontrada/i)).toBeNull();
  });

  test('/announcements is reachable by a registrar', async () => {
    signedInAs('registrar');

    renderRoutes(routes, '/announcements');

    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    expect(screen.queryByText(/não tem permissão/i)).toBeNull();
  });

  test('and refused to a teacher, exactly as the server refuses it', async () => {
    signedInAs('teacher');

    renderRoutes(routes, '/announcements');

    expect(await screen.findByText(/não tem permissão/i)).toBeVisible();
  });

  test("an area is refused to somebody who does not hold its role", async () => {
    signedInAs('guardian');

    renderRoutes(routes, '/registrar');

    expect(await screen.findByText(/não tem permissão/i)).toBeVisible();
  });

  test('/account/password is open to any signed-in person, whatever their role — asked by role, because "Trocar senha" is also the navigation link that leads here', async () => {
    signedInAs('guardian');

    renderRoutes(routes, '/account/password');

    expect(await screen.findByRole('heading', { name: 'Trocar senha' })).toBeVisible();
  });

  test('an address that matches nothing lands on the not-found screen, not on a blank page', async () => {
    signedInAs('registrar');

    renderRoutes(routes, '/inventado');

    expect(await screen.findByText(/não encontrada/i)).toBeVisible();
  });

  test.each([
    ['/network/inventado', 'network_admin' as const],
    ['/registrar/inventado', 'registrar' as const],
    ['/teacher/inventado', 'teacher' as const],
    ['/guardian/inventado', 'guardian' as const],
    ['/announcements/inventado', 'registrar' as const],
  ])(
    '%s, inside an area, lands on the not-found screen too — the area prefix matches, so the catch-all never runs and the area has a <Routes> of its own that decides, and a <Routes> that matches nothing renders null: a shell with an empty main and no error anywhere',
    async (path, role) => {
      signedInAs(role);

      renderRoutes(routes, path);

      expect(await screen.findByText(/não encontrada/i)).toBeVisible();
    },
  );

  test('/login renders without a session and without the application shell — asked by role, because "Entrar" is both the heading and the submit button on that screen', async () => {
    signedOut();

    renderRoutes(routes, '/login');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull();
  });
});

type Area = {
  readonly name: 'network' | 'registrar' | 'teacher' | 'guardian' | 'announcements';
  readonly apiTable: string;
  readonly absolute: Readonly<Record<string, string>>;
  readonly child: Readonly<Record<string, string>>;
};

const AREAS: readonly Area[] = [
  {
    name: 'network',
    apiTable: 'NETWORK_ROUTES',
    absolute: NETWORK_ROUTES,
    child: NETWORK_CHILD_ROUTES,
  },
  {
    name: 'registrar',
    apiTable: 'REGISTRAR_ROUTES',
    absolute: REGISTRAR_ROUTES,
    child: REGISTRAR_CHILD_ROUTES,
  },
  {
    name: 'teacher',
    apiTable: 'TEACHER_ROUTES',
    absolute: TEACHER_ROUTES,
    child: TEACHER_CHILD_ROUTES,
  },
  {
    name: 'guardian',
    apiTable: 'GUARDIAN_ROUTES',
    absolute: GUARDIAN_ROUTES,
    child: GUARDIAN_CHILD_ROUTES,
  },
  {
    name: 'announcements',
    apiTable: 'ANNOUNCEMENT_ROUTES',
    absolute: ANNOUNCEMENT_ROUTES,
    child: ANNOUNCEMENT_CHILD_ROUTES,
  },
];

const DeepScreen = ({ path }: { readonly path: string }): ReactElement => (
  <Routes>
    <Route path={path} element={<span>tela profunda</span>} />
  </Routes>
);

describe('the two shapes every area declares, and why one cannot stand in for the other', () => {
  test.each(AREAS)(
    '$name: every child route is the absolute one with the area prefix cut off',
    ({ name, absolute, child }) => {
      const prefix = APP_ROUTES[name];

      expect(Object.keys(child)).toEqual(Object.keys(absolute));
      for (const [key, path] of Object.entries(absolute)) {
        expect(`${key}: ${path.slice(0, prefix.length + 1)}`).toBe(`${key}: ${prefix}/`);
        expect(`${key}: ${child[key]}`).toBe(`${key}: ${path.slice(prefix.length + 1)}`);
      }
    },
  );

  test('a descendant <Routes> given the absolute route renders nothing, and never says why', () => {
    renderRoutes(
      [{ path: AREA_ROUTES.network, element: <DeepScreen path={NETWORK_ROUTES.schools} /> }],
      NETWORK_ROUTES.schools,
    );

    expect(screen.queryByText('tela profunda')).toBeNull();
  });

  test('while the child route — the same address, prefix cut off — renders the screen', () => {
    renderRoutes(
      [{ path: AREA_ROUTES.network, element: <DeepScreen path={NETWORK_CHILD_ROUTES.schools} /> }],
      NETWORK_ROUTES.schools,
    );

    expect(screen.getByText('tela profunda')).toBeVisible();
  });
});

const API_CONSTANTS_ON_DISK = resolve(process.cwd(), '..', 'api', 'src', 'http', 'constants.ts');

const DECLARED_ENTRY = /(\w+):\s*'([^']*)'/g;

const SHARED_WITH_THE_API_TODAY = 17;

const tableServedBy = (source: string, name: string): Readonly<Record<string, string>> => {
  const declared = new RegExp(`export const ${name} = \\{([^}]*)\\}`).exec(source)?.[1];
  if (declared === undefined) throw new Error(`a API não declara ${name}`);

  const served: Record<string, string> = {};
  for (const [, key, value] of declared.matchAll(DECLARED_ENTRY)) {
    if (key !== undefined && value !== undefined) served[key] = value;
  }
  return served;
};

describe('the table of addresses the front declares is the one the API serves', () => {
  test('the five areas are spelled the same on both sides', async () => {
    const served = tableServedBy(await readFile(API_CONSTANTS_ON_DISK, 'utf8'), 'API_ROUTES');

    expect(AREAS.map(({ name }) => `${name}: ${APP_ROUTES[name]}`)).toEqual(
      AREAS.map(({ name }) => `${name}: ${served[name]}`),
    );
  });

  test('and every route both sides name is the API route under the area prefix', async () => {
    const source = await readFile(API_CONSTANTS_ON_DISK, 'utf8');
    const compared: string[] = [];

    for (const { name, apiTable, absolute } of AREAS) {
      const served = tableServedBy(source, apiTable);
      for (const [key, path] of Object.entries(absolute)) {
        if (!(key in served)) continue;
        compared.push(`${name}.${key}`);
        const here = `${name}.${key} → ${path}`;
        const there = `${name}.${key} → ${APP_ROUTES[name]}${served[key]}`;

        expect(here).toBe(there);
      }
    }

    expect(compared.length).toBeGreaterThanOrEqual(SHARED_WITH_THE_API_TODAY);
  });
});

const AREA_SPLAT = '/area/*';
const AREA_CHILD = 'qualquer';
const AREA_ADDRESS = '/area/qualquer';
const AREA_SCREEN = 'tela da área';

const mountedTheWayTheTableMountsAnArea = (shell: ReactElement): RouteObject[] => [
  { path: AREA_SPLAT, element: shell },
];

const routeAt = (path: string): RouteObject => {
  const declared = routes.flatMap((route) => route.children ?? [route]);
  const found = declared.find((route) => route.path === path);
  if (found === undefined) throw new Error(`a tabela de rotas não declara ${path}`);
  return found;
};

describe('the shape an area shell has to have, which is why each features/<role>/routes.tsx exports a <Routes> and not a bare <Outlet /> — the table mounts an area as a splat with nothing under it, so an outlet put there renders null and does it silently', () => {
  test.each(Object.values(AREA_ROUTES))(
    '%s is mounted as a splat with no children of its own, so there is nothing in the table an outlet could show',
    (path) => {
      expect(routeAt(path).children).toBeUndefined();
    },
  );

  test.each([
    ['network', NetworkRoutes],
    ['registrar', RegistrarRoutes],
    ['teacher', TeacherRoutes],
    ['guardian', GuardianRoutes],
    ['announcements', AnnouncementsRoutes],
  ])(
    'the %s shell renders Routes, never an Outlet — these shells take no props and call no hooks, so reading the element they return is honest',
    (_area, Shell) => {
      const boundary = Shell() as ReactElement<{
        children: ReactElement<{ children: ReactElement }>;
      }>;
      const suspense = boundary.props.children;
      const inner = suspense.props.children;

      expect(inner.type).toBe(Routes);
      expect(inner.type).not.toBe(Outlet);
    },
  );

  test('and an Outlet mounted that same way shows nothing for an address inside the area', () => {
    const Bare = (): ReactElement => <Outlet />;

    renderRoutes(mountedTheWayTheTableMountsAnArea(<Bare />), AREA_ADDRESS);

    expect(screen.queryByText(AREA_SCREEN)).toBeNull();
  });

  test('while a nested Routes, mounted that same way and asked for that same address, shows the screen', () => {
    const Shell = (): ReactElement => (
      <Routes>
        <Route path={AREA_CHILD} element={<span>{AREA_SCREEN}</span>} />
      </Routes>
    );

    renderRoutes(mountedTheWayTheTableMountsAnArea(<Shell />), AREA_ADDRESS);

    expect(screen.getByText(AREA_SCREEN)).toBeVisible();
  });
});

const FRONT_ON_DISK = process.cwd();

const FRONT_TREES = ['src', 'tests'];

const APP_MODULES_ON_DISK = resolve(FRONT_ON_DISK, 'src', 'app');

const TABLE_MODULE = 'routes.tsx';

const TYPESCRIPT_SOURCE = /\.tsx?$/;

const BUILDS_THE_BROWSER_ROUTER = 'createBrowserRouter';

const IMPORTS_THE_MODULE_THAT_BUILDS_IT = /from '[^']*\/App'/;

const modulesUnder = async (
  directory: string,
  saying: (source: string) => boolean,
): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true });
  const found: string[] = [];

  for (const entry of entries.filter((name) => TYPESCRIPT_SOURCE.test(name))) {
    const source = await readFile(resolve(directory, entry), 'utf8');
    if (saying(source)) found.push(entry.replaceAll('\\', '/'));
  }
  return found;
};

const modulesInTheFront = async (saying: (source: string) => boolean): Promise<string[]> => {
  const found: string[] = [];

  for (const tree of FRONT_TREES) {
    const under = await modulesUnder(resolve(FRONT_ON_DISK, tree), saying);
    found.push(...under.map((entry) => `${tree}/${entry}`));
  }
  return found;
};

describe('which module builds the browser router, and why it is not the one that declares the table', () => {
  test('the table module builds none — it is imported by every test that wants the table, this one included, and each of those imports would build a router of its own', async () => {
    const source = await readFile(resolve(APP_MODULES_ON_DISK, TABLE_MODULE), 'utf8');

    expect(source).not.toContain(BUILDS_THE_BROWSER_ROUTER);
  });

  test('exactly one module under src/app builds it, and it is App.tsx', async () => {
    const building = await modulesUnder(APP_MODULES_ON_DISK, (source) =>
      source.includes(BUILDS_THE_BROWSER_ROUTER),
    );

    expect(building).toEqual(['App.tsx']);
  });

  test('and exactly one module in the front imports App.tsx — src and tests alike, because testSupport.tsx is imported by nearly every test file and an import of App.tsx there would build a second router per test file — so the router it builds is built once', async () => {
    const importing = await modulesInTheFront((source) =>
      IMPORTS_THE_MODULE_THAT_BUILDS_IT.test(source),
    );

    expect(importing).toEqual(['src/main.tsx']);
  });
});

const AREAS_ON_DEMAND = [
  AREA_ROUTES.network,
  AREA_ROUTES.registrar,
  AREA_ROUTES.teacher,
  AREA_ROUTES.guardian,
  AREA_ROUTES.announcements,
];

const FORMS_ON_DEMAND = [APP_ROUTES.login, APP_ROUTES.accountPassword];

const LAZY = Symbol.for('react.lazy');

type Wrapping = {
  readonly children: ReactElement;
  readonly fallback?: ReactNode;
  readonly role?: unknown;
};

const pastTheRoleGuard = (element: ReactElement<Wrapping>): ReactElement<Wrapping> =>
  element.props.role === undefined ? element : (element.props.children as ReactElement<Wrapping>);

const chainAt = (
  path: string,
): {
  readonly boundary: ReactElement<Wrapping>;
  readonly suspense: ReactElement<Wrapping>;
  readonly loaded: ReactElement;
} => {
  const boundary = pastTheRoleGuard(routeAt(path).element as ReactElement<Wrapping>);
  const suspense = boundary.props.children as ReactElement<Wrapping>;
  return { boundary, suspense, loaded: suspense.props.children };
};

const isLoadedOnDemand = (element: ReactElement): boolean =>
  (element.type as unknown as { readonly $$typeof?: symbol }).$$typeof === LAZY;

describe('what reaching a screen costs to download', () => {
  test.each(AREAS_ON_DEMAND)(
    '%s is loaded on demand, so whoever signs in as a guardian never downloads the registrar',
    (path) => {
      expect(isLoadedOnDemand(chainAt(path).loaded)).toBe(true);
    },
  );

  test.each(FORMS_ON_DEMAND)(
    '%s is loaded on demand too, so the guardian portal — which has no form at all — downloads no form library',
    (path) => {
      expect(isLoadedOnDemand(chainAt(path).loaded)).toBe(true);
    },
  );

  test.each([...AREAS_ON_DEMAND, ...FORMS_ON_DEMAND])(
    '%s waits inside a Suspense, without which the first navigation to it throws',
    (path) => {
      const { suspense } = chainAt(path);

      expect(suspense.type).toBe(Suspense);
      expect(suspense.props.fallback).toBeDefined();
    },
  );

  test.each([...AREAS_ON_DEMAND, ...FORMS_ON_DEMAND])(
    '%s has an error boundary of its own, so a chunk that fails to download does not blank the whole application',
    (path) => {
      expect(chainAt(path).boundary.type).toBe(ErrorBoundary);
    },
  );
});
