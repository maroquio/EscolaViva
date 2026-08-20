/*
 * The first concrete cost of the SPA decision.
 *
 * A form with POST-Redirect-GET could not be forged from another site in any useful way. A JSON
 * write carrying an automatic cookie can, so the edge charges two things no cross-site form is able
 * to produce: a `Content-Type` an HTML form cannot emit, and a header outside the browser's safe
 * list, which forces a preflight — and a preflight only passes for an allowed origin.
 *
 * With the origin list empty, which is this stage's deployment, the second requirement alone already
 * stops the submission: no external page can add that header.
 */

import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { API } from '../../src/http/constants';
import { secureWriteMiddleware } from '../../src/http/secureWrite';
import { APPLICATION_MARK, HEADERS } from '../../src/shared/constants';
import { correlationMiddleware, errorsMiddleware, type Variables } from '../../src/shared/http';

const WRITE_PATH = `${API.versionedPrefix}/registrar/subjects`;

type Refusal = { errors: { code: string; message: string }[]; correlationId: string };

const probe = (): Hono<{ Variables: Variables }> => {
  const app = new Hono<{ Variables: Variables }>();
  app.use(errorsMiddleware);
  app.use(correlationMiddleware);
  app.use(secureWriteMiddleware);
  app.get(WRITE_PATH, (c) => c.json({ items: [] }));
  app.post(WRITE_PATH, (c) => c.json({ created: true }));
  app.put(WRITE_PATH, (c) => c.json({ replaced: true }));
  app.delete(WRITE_PATH, (c) => c.json({ deleted: true }));
  return app;
};

const write = async (
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<Response> =>
  await probe().request(WRITE_PATH, { method, headers, ...(body === undefined ? {} : { body }) });

const MARKED_JSON = {
  [HEADERS.contentType]: API.mediaType,
  [HEADERS.requestedBy]: APPLICATION_MARK,
};

describe('a write has to carry the application mark', () => {
  test('without the mark it is refused with 403', async () => {
    const response = await write(
      'POST',
      { [HEADERS.contentType]: API.mediaType },
      JSON.stringify({ name: 'Filosofia' }),
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(403);
    expect(refusal.errors[0]?.code).toBe('write_without_mark');
    expect(refusal.correlationId).not.toBe('');
  });

  test('a mark with the wrong value is no better than none', async () => {
    const response = await write(
      'POST',
      { [HEADERS.contentType]: API.mediaType, [HEADERS.requestedBy]: 'outro-sistema' },
      JSON.stringify({ name: 'Filosofia' }),
    );

    expect(response.status).toBe(403);
  });

  /*
   * All four write verbs, not only POST. A forged `PUT` or `DELETE` is exactly as damaging, and a
   * guard that covers one verb reads as if it covered them all.
   */
  test.each(['POST', 'PUT', 'DELETE'])('%s is refused without the mark', async (method) => {
    const response = await write(method, {}, method === 'DELETE' ? undefined : '{}');

    expect(response.status).toBe(403);
  });

  test('with the mark and JSON, the write goes through', async () => {
    const response = await write('POST', MARKED_JSON, JSON.stringify({ name: 'Filosofia' }));

    expect(response.status).toBe(200);
  });
});

describe('a write has to arrive as JSON', () => {
  test('a form content type is refused with 415', async () => {
    const response = await write(
      'POST',
      {
        [HEADERS.contentType]: 'application/x-www-form-urlencoded',
        [HEADERS.requestedBy]: APPLICATION_MARK,
      },
      'name=Filosofia',
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(415);
    expect(refusal.errors[0]?.code).toBe('unsupported_media_type');
  });

  test('a missing content type is refused the same way', async () => {
    const response = await write('POST', { [HEADERS.requestedBy]: APPLICATION_MARK }, '{}');

    expect(response.status).toBe(415);
  });

  /*
   * A browser appends the charset, and refusing `application/json; charset=utf-8` would refuse the
   * very client this API is built for.
   */
  test('a charset parameter after the type is still JSON', async () => {
    const response = await write(
      'POST',
      {
        [HEADERS.contentType]: `${API.mediaType}; charset=utf-8`,
        [HEADERS.requestedBy]: APPLICATION_MARK,
      },
      '{}',
    );

    expect(response.status).toBe(200);
  });

  /*
   * `DELETE` carries no body, so charging it a content type charges for something that does not
   * exist. It still carries the mark: that is the part that stops the forgery.
   */
  test('DELETE needs the mark but not a content type', async () => {
    const response = await write('DELETE', { [HEADERS.requestedBy]: APPLICATION_MARK });

    expect(response.status).toBe(200);
  });
});

describe('a read is charged nothing', () => {
  test('a GET with neither header goes straight through', async () => {
    const response = await write('GET', {});

    expect(response.status).toBe(200);
  });
});
