/*
 * CORS that does nothing while nobody needs it.
 *
 * `ALLOWED_ORIGINS` is empty at this stage — front and API on the same origin — and an empty list
 * means no header at all, not a permissive one. The cases below pin both halves: the inert default,
 * and what gets emitted the day somebody fills the variable in.
 *
 * Never `*`. A wildcard origin is incompatible with credentials, and this application's session is a
 * cookie.
 */

import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createCorsMiddleware } from '../../src/http/cors';
import { API } from '../../src/http/constants';
import { APPLICATION_MARK, CORS_HEADERS, HEADERS } from '../../src/shared/constants';
import { identity } from '../../src/identity';
import {
  cacheControlMiddleware,
  correlationMiddleware,
  createSessionMiddleware,
  errorsMiddleware,
  type Variables,
} from '../../src/shared/http';
import { fullScenario } from '../support/factories';
import { signIn } from './support';

const FRONT = 'https://app.escolaviva.test';
const STRANGER = 'https://intruso.test';

const appWith = (origins: readonly string[]): Hono => {
  const app = new Hono();
  app.use(createCorsMiddleware(origins));
  app.get('/x', (c) => c.text('ok'));
  app.post('/x', (c) => c.text('ok'));
  return app;
};

describe('with an empty list the middleware is inert', () => {
  test('no CORS header is emitted, not even a refusal', async () => {
    const response = await appWith([]).request('/x', { headers: { [HEADERS.origin]: STRANGER } });

    expect(response.headers.get(CORS_HEADERS.allowOrigin)).toBeNull();
    expect(response.headers.get(CORS_HEADERS.allowCredentials)).toBeNull();
    expect(response.status).toBe(200);
  });
});

describe('with a filled list the origin decides', () => {
  test('a known origin is echoed back, with credentials allowed', async () => {
    const response = await appWith([FRONT]).request('/x', { headers: { [HEADERS.origin]: FRONT } });

    expect(response.headers.get(CORS_HEADERS.allowOrigin)).toBe(FRONT);
    expect(response.headers.get(CORS_HEADERS.allowCredentials)).toBe('true');
  });

  /*
   * The response varies by `Origin`, so a shared cache that ignored it could hand one origin's
   * permission to another. The header has to be *appended*: `cacheControlMiddleware` already writes
   * `Vary: Cookie` on an authenticated response, and setting instead of appending would drop it —
   * trading one caching bug for a worse one, where a cache serves one person's page to another.
   *
   * That is why this case stacks the real cache middleware underneath, rather than testing the CORS
   * one in isolation. Alone, `set` and `append` are indistinguishable.
   */
  test('it declares Origin without dropping the Cookie the cache layer wrote', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const stacked = new Hono<{ Variables: Variables }>();
    stacked.use(errorsMiddleware);
    stacked.use(correlationMiddleware);
    stacked.use(cacheControlMiddleware);
    stacked.use(createSessionMiddleware(identity.validSession));
    stacked.use(createCorsMiddleware([FRONT]));
    stacked.get('/x', (c) => c.text('ok'));

    const response = await stacked.request('/x', {
      headers: { [HEADERS.origin]: FRONT, [HEADERS.cookie]: cookie },
    });
    const vary = response.headers.get(HEADERS.vary) ?? '';

    expect(vary).toContain('Cookie');
    expect(vary).toContain('Origin');
  });

  test('an unknown origin gets no echo at all', async () => {
    const response = await appWith([FRONT]).request('/x', {
      headers: { [HEADERS.origin]: STRANGER },
    });

    expect(response.headers.get(CORS_HEADERS.allowOrigin)).toBeNull();
  });

  /*
   * The wildcard is what a careless implementation reaches for, and it is precisely what breaks a
   * cookie session: a browser refuses `*` when credentials are involved.
   */
  test('the echo is never a wildcard', async () => {
    const response = await appWith([FRONT]).request('/x', { headers: { [HEADERS.origin]: FRONT } });

    expect(response.headers.get(CORS_HEADERS.allowOrigin)).not.toBe('*');
  });

  /*
   * A request with no `Origin` is the server itself, curl, or the suite — not a browser. It goes
   * through untouched rather than being refused, because CORS is a browser mechanism and refusing
   * here would break every non-browser caller for no gain.
   */
  test('a request with no Origin passes through untouched', async () => {
    const response = await appWith([FRONT]).request('/x');

    expect(response.status).toBe(200);
    expect(response.headers.get(CORS_HEADERS.allowOrigin)).toBeNull();
  });
});

describe('the preflight', () => {
  const preflight = async (origin: string): Promise<Response> =>
    await appWith([FRONT]).request('/x', {
      method: 'OPTIONS',
      headers: {
        [HEADERS.origin]: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, idempotency-key, x-requested-by',
      },
    });

  test('it answers 204 and declares the three headers a write sends', async () => {
    const response = await preflight(FRONT);
    const allowed = (response.headers.get(CORS_HEADERS.allowHeaders) ?? '').toLowerCase();

    expect(response.status).toBe(204);
    expect(allowed).toContain(HEADERS.contentType.toLowerCase());
    expect(allowed).toContain(HEADERS.idempotencyKey.toLowerCase());
    expect(allowed).toContain(HEADERS.requestedBy.toLowerCase());
  });

  test('it declares the write methods, not only GET', async () => {
    const response = await preflight(FRONT);
    const methods = response.headers.get(CORS_HEADERS.allowMethods) ?? '';

    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  test('a preflight from an unknown origin gets 204 with no permission attached', async () => {
    const response = await preflight(STRANGER);

    expect(response.status).toBe(204);
    expect(response.headers.get(CORS_HEADERS.allowOrigin)).toBeNull();
  });
});

/*
 * The exposed list is not decoration, and leaving it out fails in a way nothing reports. A
 * cross-origin browser hides every response header outside the CORS-safelisted six, so without this
 * the front cannot read the `Location` of the resource it just created — the whole `created(...)`
 * contract dies silently — nor the correlation code a person is meant to quote to support.
 */
describe('the headers the front is allowed to read back', () => {
  test('Location and the correlation code are exposed', async () => {
    const response = await appWith([FRONT]).request('/x', { headers: { [HEADERS.origin]: FRONT } });
    const exposed = response.headers.get(CORS_HEADERS.exposeHeaders) ?? '';

    expect(exposed).toContain(HEADERS.location);
    expect(exposed).toContain(HEADERS.correlation);
  });

  test('the mark the client sends is not among them: it travels one way', async () => {
    const response = await appWith([FRONT]).request('/x', { headers: { [HEADERS.origin]: FRONT } });
    const exposed = response.headers.get(CORS_HEADERS.exposeHeaders) ?? '';

    expect(exposed).not.toContain(APPLICATION_MARK);
    expect(exposed).not.toContain(API.mediaType);
  });
});
