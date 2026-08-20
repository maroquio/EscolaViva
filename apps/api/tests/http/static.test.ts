/*
 * Delivering the front, and the two caching rules that keep I10 standing after `build-assets.ts` is
 * gone.
 *
 * An asset under `/assets/` carries the content hash in its name, so changing the file changes the
 * name and keeping it forever is safe. `index.html` is the only thing that knows this build's bundle
 * names, so it must never be kept — a cached document asks for the previous version's bundle after
 * every deploy, and the browser has no way to notice.
 *
 * The fallback exists because React Router resolves the system's URLs: pressing F5 on a screen path
 * lands on the server, and has to receive the application rather than a 404.
 *
 * `apps/web/dist` does not exist yet, and `config` is resolved once at import time, so these cases
 * build a throwaway `dist` in a temporary folder and hand its path to `mountStatic` directly.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from '../../src/http/app';
import { API } from '../../src/http/constants';
import { mountStatic } from '../../src/http/static';
import { CACHE, HEADERS, HEALTH_PATHS } from '../../src/shared/constants';
import { identity } from '../../src/identity';
import {
  cacheControlMiddleware,
  createSessionMiddleware,
  type Variables,
} from '../../src/shared/http';
import { fullScenario } from '../support/factories';
import { signIn } from './support';

const DOCUMENT = '<!doctype html><html lang="pt-BR"><head></head><body><div id="root"></div></body></html>';
const STYLESHEET = ':root{--x:1}';
const HASHED_ASSET = 'app-a1b2c3.css';

/* A file that exists inside the dist root but outside `assets/`: the thing a traversal would reach. */
const OUTSIDE_FILE = 'segredo.txt';
const OUTSIDE_CONTENT = 'SESSION_SECRET=nao-deve-vazar';

let frontRoot = '';
let application: Hono<{ Variables: Variables }>;

beforeAll(async () => {
  frontRoot = await mkdtemp(join(tmpdir(), 'escolaviva-dist-'));
  await mkdir(join(frontRoot, 'assets'), { recursive: true });
  await writeFile(join(frontRoot, 'index.html'), DOCUMENT);
  await writeFile(join(frontRoot, 'assets', HASHED_ASSET), STYLESHEET);
  await writeFile(join(frontRoot, OUTSIDE_FILE), OUTSIDE_CONTENT);

  application = new Hono<{ Variables: Variables }>();
  application.use(cacheControlMiddleware);
  application.get(HEALTH_PATHS.liveness, (c) => c.json({ status: 'ok' }));
  application.get(`${API.versionedPrefix}/existe`, (c) => c.json({ ok: true }));
  mountStatic(application, frontRoot);
});

afterAll(async () => {
  await rm(frontRoot, { recursive: true, force: true });
});

const get = async (path: string): Promise<Response> => await application.request(path);

describe('the hashed assets', () => {
  test('an asset with a hash in its name may be kept forever', async () => {
    const response = await get(`/assets/${HASHED_ASSET}`);

    expect(response.status).toBe(200);
    expect(response.headers.get(HEADERS.cacheControl)).toBe(CACHE.asset);
  });

  test('the asset comes back with its own content type, not the document one', async () => {
    const response = await get(`/assets/${HASHED_ASSET}`);

    expect(response.headers.get(HEADERS.contentType)).toContain('text/css');
    expect(await response.text()).toBe(STYLESHEET);
  });

  test('an asset that is not there is a 404, never the document', async () => {
    const response = await get('/assets/nao-existe.css');
    const raw = await response.text();

    expect(response.status).toBe(404);
    expect(raw).not.toContain('<div id="root">');
  });

  /*
   * The name is matched against a regex admitting no slash, so anything that still looks like a path
   * when it reaches the handler is refused outright.
   */
  test.each(['..%2F..%2F.env', 'sub/dir.css'])(
    'a traversal attempt is refused: %s',
    async (name) => {
      const response = await get(`/assets/${name}`);

      expect(response.status).toBe(404);
    },
  );

  /*
   * The case that actually depends on the name check, and the reason it is written against a file
   * that really exists. An encoded `../` survives into the handler as part of the name, and
   * `join(root, 'assets', '../segredo.txt')` resolves to a real path one level up — so without the
   * regex this reads a file the caller chose. With `sub/dir.css` alone the case would pass either
   * way, because that file does not exist, and the guard would look tested while being absent.
   */
  test('an encoded traversal does not read a file that sits outside assets', async () => {
    const response = await get(`/assets/..%2F${OUTSIDE_FILE}`);
    const raw = await response.text();

    expect(response.status).toBe(404);
    expect(raw).not.toContain('SESSION_SECRET');
  });

  /*
   * A literal `../` never reaches the handler: the URL is normalised before routing, so
   * `/assets/../../.env` arrives as `/.env`, misses this route and lands on the SPA fallback.
   * Asserting a 404 there would assert the wrong thing — what matters is that no file is read.
   */
  test('a literal traversal is normalised away and never reads the file', async () => {
    const response = await get('/assets/../../.env');
    const raw = await response.text();

    expect(raw).toContain('<div id="root">');
    expect(raw).not.toContain('SESSION_SECRET');
  });
});

describe('the application document', () => {
  test('a screen path answers index.html', async () => {
    const response = await get('/registrar/students/01HZZZ');

    expect(response.status).toBe(200);
    expect(response.headers.get(HEADERS.contentType)).toContain('text/html');
    expect(await response.text()).toContain('<div id="root">');
  });

  /*
   * The rule with no exception. A kept `index.html` points at the previous build's bundle names, and
   * the deploy that replaced them is invisible to the browser.
   */
  test('the document never goes to cache', async () => {
    const response = await get('/registrar/students/01HZZZ');

    expect(response.headers.get(HEADERS.cacheControl)).toBe(CACHE.anonymous);
  });

  /*
   * The branch only earns its place for a signed-in caller. With no session the response would get
   * `no-store` anyway, from the anonymous rule, so a case without a cookie passes whether or not the
   * document branch exists — which is exactly how it stayed uncovered the first time this was
   * written. Signed in, the difference is real: `private, no-store` would let the browser keep the
   * document, and a kept document points at the previous build's bundle names forever.
   */
  test('a signed-in caller gets no-store on the document, not the authenticated policy', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const withSession = new Hono<{ Variables: Variables }>();
    withSession.use(cacheControlMiddleware);
    withSession.use(createSessionMiddleware(identity.validSession));
    mountStatic(withSession, frontRoot);

    const response = await withSession.request('/registrar/students/01HZZZ', {
      headers: { [HEADERS.cookie]: cookie },
    });

    expect(response.headers.get(HEADERS.cacheControl)).toBe(CACHE.anonymous);
    expect(response.headers.get(HEADERS.cacheControl)).not.toBe(CACHE.authenticated);
  });

  test('the root path answers the document too', async () => {
    const response = await get('/');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
  });

  /*
   * The rule above, aimed at the way it was actually broken.
   *
   * `cacheControlMiddleware` decides `immutable` by URL prefix, before anybody knows what the body
   * will be, and it kept `/public/` on that list long after `public/` stopped being served — so
   * `/public/qualquer-coisa` fell through to the fallback and left with the document *and*
   * `max-age=31536000, immutable`. A browser that ever loaded such a URL would hold this build's
   * document until the cache was cleared by hand. Every prefix on that list has to be a prefix
   * something actually serves under a hashed name, and this case is what says so.
   */
  test('a path that merely looks published is the document, and is not kept forever', async () => {
    const response = await get('/public/app.0b878f01.css');

    expect(await response.text()).toContain('<div id="root">');
    expect(response.headers.get(HEADERS.cacheControl)).toBe(CACHE.anonymous);
  });
});

describe('what the fallback must not swallow', () => {
  test('an unknown API path is a 404, not the document', async () => {
    const response = await get(`${API.versionedPrefix}/inexistente`);
    const raw = await response.text();

    expect(response.status).toBe(404);
    expect(raw).not.toContain('<div id="root">');
  });

  test('a known API path still answers its own JSON', async () => {
    const response = await get(`${API.versionedPrefix}/existe`);

    expect(response.status).toBe(200);
    expect(response.headers.get(HEADERS.contentType)).toContain(API.mediaType);
  });

  /*
   * Health is what an orchestrator polls. Handing it an HTML document would make a broken deploy look
   * alive, since the status line would stay 200 whatever happened underneath.
   */
  test('health stays outside the fallback', async () => {
    const response = await get(HEALTH_PATHS.liveness);

    expect(response.status).toBe(200);
    expect(response.headers.get(HEADERS.contentType)).not.toContain('text/html');
  });
});

/*
 * A deploy that shipped the API without the front's `dist` has nothing to serve, and it must say so.
 * A fallback that served a missing file as an empty 200 would hide that behind a blank page — the
 * application would look alive to anyone reading status lines while every screen was empty.
 */
describe('with no dist on disk', () => {
  test('the fallback declines instead of serving an empty document', async () => {
    const empty = new Hono<{ Variables: Variables }>();
    empty.notFound((c) => c.text('o 404 de antes', 404));
    mountStatic(empty, join(frontRoot, 'nao-existe'));

    const response = await empty.request('/registrar/students/01HZZZ');

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('o 404 de antes');
  });
});

/*
 * A response built with `new Response(...)` starts from nothing.
 *
 * Hono only carries the headers the middlewares prepared when the response goes through the context,
 * and `static.ts` was the one place in `src` that bypassed it. Everything set upstream was dropped on
 * the floor: the document came back without the `X-Correlation-Id` that the support desk asks for
 * first, and — worse — without the `Set-Cookie` that erases a session the server has already decided
 * is dead, so the browser kept presenting a cookie the server would keep rejecting.
 */
describe('the document keeps what the middlewares prepared for it', () => {
  test('the correlation id travels with the document, as it does with the JSON', async () => {
    const document = await app.request('/');
    const json = await app.request(`${API.versionedPrefix}/session`);

    expect(document.status).toBe(200);
    expect(document.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('and it still carries its own content type and cache policy', async () => {
    const document = await app.request('/');

    expect(document.headers.get('Content-Type')).toContain('text/html');
    expect(document.headers.get('Cache-Control')).toBe('no-store');
  });
});
