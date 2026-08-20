/*
 * The JSON edge answers errors, and it answers them the same way everywhere.
 *
 * While the Eta screens are still mounted the format is decided by the path: `/api/*` gets JSON and
 * everything else keeps getting a page. That split is the whole subject of this file — a wrapper
 * that only catches exceptions is not enough, because three of the four places an error response is
 * born never throw at all.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { app } from '../../src/http/app';
import { identity } from '../../src/identity';
import { clearDatabase } from '../support/database';
import { fullScenario } from '../support/factories';
import { read, signIn, write, writeWithKey } from './support';
import { API } from '../../src/http/constants';
import { HEALTH_PATHS } from '../../src/shared/constants';
import { created } from '../../src/http/response';
import {
  correlationMiddleware,
  createSessionMiddleware,
  errorResponse,
  errorsMiddleware,
  requireLogin,
  requireRole,
  type Variables,
} from '../../src/shared/http';

const jsonRequest = async (path: string, init: RequestInit = {}): Promise<Response> =>
  await app.request(path, init);

const MISSING_API_PATH = `${API.versionedPrefix}/rota-que-nao-existe`;

type ErrorBody = {
  errors: { field?: string; code: string; message: string }[];
  correlationId: string;
};

const bodyOf = async (response: Response): Promise<ErrorBody> =>
  (await response.json()) as ErrorBody;

describe('an error under /api answers JSON', () => {
  test('an unknown API route answers 404 as JSON, not as a page', async () => {
    const response = await jsonRequest(MISSING_API_PATH);

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain(API.mediaType);
  });

  test('the body carries one error and a correlation code that is not empty', async () => {
    const response = await jsonRequest(MISSING_API_PATH);

    const body = await bodyOf(response);

    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]?.code).toBe('not_found');
    expect(body.correlationId).not.toBe('');
  });

  /*
   * The correlation code is the only thing support has to find the trail, and it reaches the body
   * through the AsyncLocalStorage scope. That scope is still open inside the error path — measured,
   * not assumed — but it is a subtle property of how the middlewares nest, so it is asserted rather
   * than trusted.
   */
  test('the correlation code in the body is the one echoed on the header', async () => {
    const response = await jsonRequest(MISSING_API_PATH);

    const body = await bodyOf(response);

    expect(body.correlationId).toBe(response.headers.get('X-Correlation-Id') ?? '');
  });

  test('the error response leaks no stack, no SQL and no exception message', async () => {
    const response = await jsonRequest(MISSING_API_PATH);

    const raw = await response.text();

    expect(raw).not.toContain('at ');
    expect(raw).not.toContain('SELECT');
    expect(raw).not.toContain('<!doctype');
  });
});

/*
 * What the removal of the screens left behind, and the case that keeps it from creeping back.
 *
 * While the server rendered, an error had two shapes: JSON under `/api`, a page everywhere else.
 * There is no *everywhere else* any more. A path the server owns and does not have answers JSON —
 * the same body, the same code, the same correlation id as inside the API — and a path the server
 * does not own is the front's business, so it receives the application document and React Router
 * decides. Neither branch renders an error, and no request in the system receives HTML that says
 * something went wrong.
 */
describe('nothing outside /api renders an error page any more', () => {
  test('a path the server owns and does not have answers JSON, not a page', async () => {
    const response = await jsonRequest(`${HEALTH_PATHS.readiness}/nao-existe`);

    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain(API.mediaType);
    expect(body.errors[0]?.code).toBe('not_found');
  });

  test('a screen path is the application document, and carries no error at all', async () => {
    const response = await jsonRequest('/rota-que-nao-existe');

    const raw = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(raw).not.toContain('not_found');
  });
});

/*
 * The touchpoints that never throw.
 *
 * `errorsMiddleware` only sees exceptions, and the places an error response is born do not raise
 * one: `requireRole` refuses on its own, `rejectAnonymous` refuses on its own. Converting only the
 * middleware would leave a JSON API answering something else on the paths people actually hit.
 *
 * These cases mount a throwaway application with the production middleware stack and drive the
 * branches directly, on a path under `/api` and on a path outside it — the prefix is no longer a
 * fork in the road, and this is where that gets proven rather than assumed.
 */
describe('the paths that answer without throwing answer JSON, under /api and outside it', () => {
  const probeApp = (): Hono<{ Variables: Variables }> => {
    const probe = new Hono<{ Variables: Variables }>();
    probe.use(errorsMiddleware);
    probe.use(correlationMiddleware);
    probe.use(createSessionMiddleware(async () => null));
    probe.onError(async (error, c) => {
      const response = await errorsMiddleware(c, () => Promise.reject(error));
      return response ?? errorResponse(c, 500);
    });
    probe.get(`${API.versionedPrefix}/anonymous`, requireLogin(), (c) => c.text('nunca'));
    probe.get(`${API.versionedPrefix}/role`, requireRole('teacher'), (c) => c.text('nunca'));
    probe.get(`${API.versionedPrefix}/boom`, () => {
      throw new Error('falha proposital');
    });
    probe.get('/anonymous', requireLogin(), (c) => c.text('nunca'));
    return probe;
  };

  test('an anonymous GET under /api answers 401 JSON, never a redirect to the login screen', async () => {
    const response = await probeApp().request(`${API.versionedPrefix}/anonymous`);

    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(401);
    expect(body.errors[0]?.code).toBe('no_session');
  });

  test('the same anonymous GET outside /api is refused in JSON too, with no redirect', async () => {
    const response = await probeApp().request('/anonymous');

    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(401);
    expect(response.headers.get('Location')).toBeNull();
    expect(body.errors[0]?.code).toBe('no_session');
  });

  test('an anonymous caller is stopped at the session, before the role is even considered', async () => {
    const response = await probeApp().request(`${API.versionedPrefix}/role`);

    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(401);
    expect(body.errors[0]?.code).toBe('no_session');
  });

  test('an unexpected failure under /api answers 500 JSON with the correlation code', async () => {
    const response = await probeApp().request(`${API.versionedPrefix}/boom`);

    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(500);
    expect(body.errors[0]?.code).toBe('internal_failure');
    expect(body.correlationId).not.toBe('');
  });

  test('the 500 body carries neither the exception message nor a stack', async () => {
    const response = await probeApp().request(`${API.versionedPrefix}/boom`);

    const raw = await response.text();

    expect(raw).not.toContain('falha proposital');
    expect(raw).not.toContain('at ');
  });
});

/*
 * `created` has no caller until Task 9 registers the first write route, and a helper that ships
 * without ever running is a helper nobody has checked. The `Location` header is the part worth
 * pinning: the idempotency middleware reads it to fill `response_location`, so a `created` that
 * forgets the header breaks replay rather than the response anybody looks at.
 */
describe('a completed write answers 201 and says where the resource is', () => {
  test('the status, the body and the Location header all come back', async () => {
    const probe = new Hono<{ Variables: Variables }>();
    const location = `${API.versionedPrefix}/students/abc`;
    probe.post('/create', (c) => created(c, location, { id: 'abc' }));

    const response = await probe.request('/create', { method: 'POST' });
    const body = (await response.json()) as { id: string };

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(location);
    expect(body.id).toBe('abc');
  });
});

/*
 * The 403 needs a real session, which is why the anonymous probe above cannot reach it:
 * `requireRole` refuses a caller with no session first, and answers 401. The distinction is the
 * whole point of the rule this repository states as *wrong role → 403, wrong scope → 404* — collapse
 * 401 and 403 into one and the front cannot tell "sign in again" from "ask your administrator".
 *
 * The session here is a real one: a real `POST /api/v1/session` against the real application, and
 * the cookie it emitted. Nothing about how that cookie is signed is known here.
 */
describe('a signed-in caller without the role is refused in JSON', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const roleProbe = (): Hono<{ Variables: Variables }> => {
    const probe = new Hono<{ Variables: Variables }>();
    probe.use(errorsMiddleware);
    probe.use(correlationMiddleware);
    probe.use(createSessionMiddleware(identity.validSession));
    probe.get(`${API.versionedPrefix}/teacher-only`, requireRole('teacher'), (c) => c.text('nunca'));
    probe.get('/teacher-only', requireRole('teacher'), (c) => c.text('nunca'));
    return probe;
  };

  const registrarCookie = async (): Promise<string> => {
    const scenario = await fullScenario();
    return await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
  };

  test('the registrar asking for a teacher route gets 403 JSON, with the forbidden code', async () => {
    const cookie = await registrarCookie();

    const response = await roleProbe().request(`${API.versionedPrefix}/teacher-only`, {
      headers: { Cookie: cookie },
    });
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(403);
    expect(body.errors[0]?.code).toBe('forbidden');
    expect(body.correlationId).not.toBe('');
  });

  test('the refusal names no role, no user and no route in the body', async () => {
    const cookie = await registrarCookie();

    const response = await roleProbe().request(`${API.versionedPrefix}/teacher-only`, {
      headers: { Cookie: cookie },
    });
    const raw = await response.text();

    expect(raw).not.toContain('teacher');
    expect(raw).not.toContain('teacher-only');
  });

  test('the same refusal outside /api is JSON too, with the same code', async () => {
    const cookie = await registrarCookie();

    const response = await roleProbe().request('/teacher-only', { headers: { Cookie: cookie } });
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(403);
    expect(body.errors[0]?.code).toBe('forbidden');
  });
});

/*
 * Two things a refusal owes the person reading it: a sentence in their language, and a code the
 * front knows. A shape error used to give neither — Zod's own English text and `invalid_type`, which
 * is not in `ERROR_CODES`, so the screen showed the raw string.
 *
 * Only the default text is replaced. A schema that carries its own message wrote it for this person,
 * and that one survives untouched — which is the difference the second case holds.
 */
describe('a refusal about the shape of the body', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('speaks Portuguese and carries a code the front knows', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const response = await writeWithKey(
      'POST',
      `${API.versionedPrefix}/registrar/subjects`,
      { name: 12345 },
      cookie,
      crypto.randomUUID(),
    );
    const body = (await response.json()) as { errors: { code: string; message: string }[] };

    expect(response.status).toBe(400);
    expect(body.errors[0]?.code).toBe('invalid_request');
    expect(body.errors[0]?.message).not.toMatch(/Invalid/);
  }, 60_000);

  test('and a message the schema wrote itself is left alone', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const response = await writeWithKey(
      'POST',
      `${API.versionedPrefix}/registrar/subjects`,
      { name: '' },
      cookie,
      crypto.randomUUID(),
    );
    const body = (await response.json()) as { errors: { message: string }[] };

    expect(body.errors[0]?.message).toContain('Informe o nome');
  }, 60_000);
});

/*
 * A response to a request that ARRIVED with a session is an authenticated response, even when the
 * handler has just ended that session. The cache policy used to be decided after the handler ran, so
 * `closeSession` clearing the user made the logout look anonymous: it answered `no-store` without
 * `Vary: Cookie`, and I11 asks for both on anything a signed-in person receives.
 */
describe('the cache policy of a request that arrived signed in', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('survives the handler ending the session', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const signedOut = await write('DELETE', `${API.versionedPrefix}/session`, undefined, cookie);

    expect(signedOut.status).toBe(204);
    expect(signedOut.headers.get('Cache-Control')).toBe('private, no-store');
    expect(signedOut.headers.get('Vary')).toContain('Cookie');
  }, 60_000);

  test('and an anonymous request is still anonymous', async () => {
    const anonymous = await read(`${API.versionedPrefix}/session`);

    expect(anonymous.headers.get('Cache-Control')).toBe('no-store');
    expect(anonymous.headers.get('Vary')).toBeNull();
  }, 60_000);
});
