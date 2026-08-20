import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { baseUrl, client, onSessionExpired } from '../../../src/shared/api/client';
import { ApiError } from '../../../src/shared/api/error';

const ENDPOINT = '*/api/v1/x';
const SESSION = '*/api/v1/session';
const TYPESCRIPT_SOURCE = /\.tsx?$/;
const BUILDS_ITS_OWN_WAY_OUT = /axios\.create\(|(?<![.\w])fetch\(/;

beforeEach(() => {
  onSessionExpired(() => undefined);
});

test('with no VITE_API_URL the base is the same origin, and never the string undefined/api/v1 — a relative URL the browser resolves against whatever page is open, failing differently on every screen and never naming the variable that caused it', () => {
  expect(baseUrl).toBe('/api/v1');
});

test('no other file in the front creates an axios instance or calls fetch, because one instance is what makes the idempotency key, the internal-origin mark and the error translation happen everywhere instead of wherever somebody remembered', async () => {
  const source = resolve(process.cwd(), 'src');
  const entries = await readdir(source, { recursive: true });
  const reachingTheApiOnItsOwn: string[] = [];

  for (const entry of entries.filter((name) => TYPESCRIPT_SOURCE.test(name))) {
    const text = await readFile(resolve(source, entry), 'utf8');
    if (BUILDS_ITS_OWN_WAY_OUT.test(text)) reachingTheApiOnItsOwn.push(entry.replaceAll('\\', '/'));
  }

  expect(reachingTheApiOnItsOwn).toEqual(['shared/api/client.ts']);
});

test('the session cookie travels, which is the whole point of an API on another origin', () => {
  expect(client.defaults.withCredentials).toBe(true);
});

describe('what every write carries', () => {
  test('a key is minted only when the caller brought none, because the key identifies the submission and two taps on one form are two requests of one submission: whoever submits owns it (useSubmission) and the interceptor is only the fallback for a write that has not adopted it', async () => {
    const keys: string[] = [];
    server.use(
      http.post(ENDPOINT, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json({ id: '1' }, { status: 201 });
      }),
    );

    await client.post('/x', {});
    await client.post('/x', {});

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('a key the caller brought survives, and survives being sent twice', async () => {
    const keys: string[] = [];
    server.use(
      http.post(ENDPOINT, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json({ id: '1' }, { status: 201 });
      }),
    );
    const mine = crypto.randomUUID();
    const attempt = { headers: { 'Idempotency-Key': mine } };

    await client.post('/x', {}, attempt);
    await client.post('/x', {}, attempt);

    expect(keys).toEqual([mine, mine]);
  });

  test('the internal-origin mark, which is what makes a cross-site write impossible', async () => {
    let mark: string | null = null;
    server.use(
      http.post(ENDPOINT, ({ request }) => {
        mark = request.headers.get('X-Requested-By');
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await client.post('/x', {});

    expect(mark).toBe('escolaviva');
  });

  test('a PUT carries the mark and no key, because PUT is idempotent by method and the server charges it none — a key there would suggest it meant something, while the mark is charged on all four write verbs', async () => {
    let mark: string | null = null;
    let key: string | null = null;
    server.use(
      http.put(ENDPOINT, ({ request }) => {
        mark = request.headers.get('X-Requested-By');
        key = request.headers.get('Idempotency-Key');
        return HttpResponse.json({}, { status: 200 });
      }),
    );

    await client.put('/x', {});

    expect(mark).toBe('escolaviva');
    expect(key).toBeNull();
  });

  test('a write with no body still arrives as JSON, because axios strips Content-Type when there is no data and secureWriteMiddleware answers 415 while the interceptor appears to set the header', async () => {
    let contentType: string | null = null;
    let body: string | null = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        contentType = request.headers.get('Content-Type');
        body = await request.text();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await client.post('/x');

    expect(contentType).toContain('application/json');
    expect(body).toBe('{}');
  });

  test('a DELETE carries the mark and no body, because it is the exception the server itself makes: no media type is asked of it', async () => {
    let contentType: string | null = null;
    let body: string | null = null;
    let mark: string | null = null;
    server.use(
      http.delete(ENDPOINT, async ({ request }) => {
        mark = request.headers.get('X-Requested-By');
        contentType = request.headers.get('Content-Type');
        body = await request.text();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await client.delete('/x');

    expect(mark).toBe('escolaviva');
    expect(contentType).toBeNull();
    expect(body).toBe('');
  });

  test('a read is charged neither of them', async () => {
    let mark: string | null = null;
    let key: string | null = null;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        mark = request.headers.get('X-Requested-By');
        key = request.headers.get('Idempotency-Key');
        return HttpResponse.json({});
      }),
    );

    await client.get('/x');

    expect(mark).toBeNull();
    expect(key).toBeNull();
  });
});

describe('what a failure becomes', () => {
  test('an API refusal becomes an ApiError with the fields preserved', async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json(
          {
            errors: [{ field: 'name', code: 'obrigatorio', message: 'Informe o nome.' }],
            correlationId: 'abc',
          },
          { status: 422 },
        ),
      ),
    );

    const error = await client.post('/x', {}).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).errors[0]?.field).toBe('name');
    expect((error as ApiError).correlationId).toBe('abc');
  });

  test('a network failure also becomes an ApiError, not a raw Error, and carries status 0 — the one value no HTTP answer can carry — so a screen catching it never has to tell the two cases apart', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.error()));

    const error = await client.get('/x').catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).not.toBe('');
  });

  test('the correlation code is taken from the header when the body has none', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.json({ errors: [] }, { status: 500, headers: { 'X-Correlation-Id': 'do-header' } }),
      ),
    );

    const error = await client.get('/x').catch((failure: unknown) => failure);

    expect((error as ApiError).correlationId).toBe('do-header');
  });
});

describe('the session expiring', () => {
  test('a 401 fires the registered action once', async () => {
    let expired = 0;
    onSessionExpired(() => {
      expired += 1;
    });
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ errors: [] }, { status: 401 })));

    await client.get('/x').catch(() => undefined);

    expect(expired).toBe(1);
  });

  test('a 401 while asking who is signed in is not an expiry, because that is the answer the sign-in screen itself asked for: treating it as one clears the cache and navigates to the screen already showing, which refetches, answers 401 again, and never settles', async () => {
    let expired = 0;
    onSessionExpired(() => {
      expired += 1;
    });
    server.use(http.get(SESSION, () => HttpResponse.json({ errors: [] }, { status: 401 })));

    await client.get('/session').catch(() => undefined);

    expect(expired).toBe(0);
  });

  test('a 422 fires nothing', async () => {
    let expired = 0;
    onSessionExpired(() => {
      expired += 1;
    });
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ errors: [] }, { status: 422 })));

    await client.post('/x', {}).catch(() => undefined);

    expect(expired).toBe(0);
  });
});
