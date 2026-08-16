/*
 * I13 — the two health routes say different things on purpose.
 *
 * `/health` claims the system is serving: it answers 200 only if the database answers.
 * `/health/live` claims the process exists, and nothing more — it is what keeps answering while the
 * database is down and while in-flight requests drain during shutdown.
 *
 * Neither of them may be held by any proxy: a cached health response is a lie with a shelf life.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { prepareDatabase } from '../support/database';
import { open, healthWithDatabaseDown } from './support';

const PROCESS_DEADLINE_MS = 30_000;

describe('the health routes', () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  test('/health answers 200 while the database is up', async () => {
    const response = await open('/health');

    const body = (await response.json()) as { status: string; database: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', database: 'ok' });
  });

  test('/health/live answers 200 without touching the database', async () => {
    const withDatabaseUp = await open('/health/live');

    const withoutDatabase = await healthWithDatabaseDown();

    expect(withDatabaseUp.status).toBe(200);
    expect(withoutDatabase.live).toBe(200);
    expect(withoutDatabase.health).toBe(503);
  }, PROCESS_DEADLINE_MS);

  test('both health routes refuse to be cached', async () => {
    const health = await open('/health');
    const live = await open('/health/live');

    const headers = [health.headers.get('Cache-Control'), live.headers.get('Cache-Control')];

    expect(headers).toEqual(['no-store', 'no-store']);
  });

  test('/health is no authenticated route: it answers with no session at all', async () => {
    const response = await open('/health');

    const kind = response.headers.get('Content-Type') ?? '';

    expect(response.status).toBe(200);
    expect(kind).toContain('application/json');
  });
});
