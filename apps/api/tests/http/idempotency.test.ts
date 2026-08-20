/*
 * I4 through a header instead of a hidden field.
 *
 * The browser is external input, and a guardian on bad 4G taps "submit" twice. What changes on the
 * JSON edge is where the key travels and what a repeat answers: no longer a 303 to a page, but a 200
 * carrying the path of the resource the first attempt created.
 *
 * The `/api/v1` routes arrive in Tasks 12 and 14, so there is nothing yet to POST against. That is
 * not a reason to defer the cases: the middleware is the subject, and mounting it on a throwaway app
 * exercises it exactly as a real route will — same session, same table, same connection.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { identity } from '../../src/identity';
import { API } from '../../src/http/constants';
import { created } from '../../src/http/response';
import {
  correlationMiddleware,
  createSessionMiddleware,
  errorsMiddleware,
  jsonIdempotencyMiddleware,
  type Variables,
} from '../../src/shared/http';
import { CONTEXT_VARIABLES } from '../../src/shared/constants';
import { unitOfWork } from '../../src/shared/db';
import { clearDatabase, testSql } from '../support/database';
import { fullScenario } from '../support/factories';
import { captureLogOfARepeatedSubmission, read, signIn, write, writeWithKey } from './support';

const SUBJECTS = `${API.versionedPrefix}/registrar/subjects`;
const ROLL_CALL = `${API.versionedPrefix}/teacher/roll-call`;
const ECHO = `${API.versionedPrefix}/echo`;

type Repeated = { repeated: boolean; location: string };
type Refusal = { errors: { code: string; message: string }[]; correlationId: string };

/*
 * `created` is what a real write route answers, and the `Location` it sets is the only thing the
 * table keeps.
 *
 * The write goes through `unitOfWork` because that is where the key is claimed, and a probe that
 * skipped it would be exercising a route shape this API does not have — every one of the fourteen
 * POSTs opens a transaction. The refusing branch returns 422 before opening one, which is why no
 * key is ever spent on a refusal: there is nothing to release, because nothing was claimed.
 */
const probe = (): Hono<{ Variables: Variables }> => {
  const app = new Hono<{ Variables: Variables }>();
  app.use(errorsMiddleware);
  app.use(correlationMiddleware);
  app.use(createSessionMiddleware(identity.validSession));
  app.use(jsonIdempotencyMiddleware);

  let sequence = 0;
  app.post(SUBJECTS, async (c) => {
    const body = c.get(CONTEXT_VARIABLES.jsonBody) as { name?: string };
    if (body.name === undefined || body.name === '') {
      return c.json({ errors: [{ field: 'name', code: 'required', message: 'Informe o nome.' }] }, 422);
    }
    const identifier = await unitOfWork(async () => {
      sequence += 1;
      return String(sequence);
    });
    return created(c, `${SUBJECTS}/${identifier}`, { id: identifier });
  });

  app.put(ROLL_CALL, (c) => c.json({ received: c.get(CONTEXT_VARIABLES.jsonBody) }));
  app.delete(ECHO, (c) => c.json({ deleted: true }));
  return app;
};

const jsonHeaders = (cookie: string, key?: string): Record<string, string> => ({
  'Content-Type': API.mediaType,
  Cookie: cookie,
  ...(key === undefined ? {} : { 'Idempotency-Key': key }),
});

describe('idempotency through the Idempotency-Key header', () => {
  let cookie = '';
  let application = probe();

  /*
   * One application per case, not one per request. The write route counts what it created, and a
   * fresh app per call would restart that counter — two distinct keys would then hand back the same
   * `Location` and the case below would pass while proving nothing.
   */
  beforeEach(async () => {
    await clearDatabase();
    application = probe();
    const scenario = await fullScenario();
    cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
  });

  const post = async (body: unknown, key?: string): Promise<Response> =>
    await application.request(SUBJECTS, {
      method: 'POST',
      headers: jsonHeaders(cookie, key),
      body: JSON.stringify(body),
    });

  test('a POST without the header is refused with 400 and a code the front can read', async () => {
    const response = await post({ name: 'Filosofia' });
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.code).toBe('missing_idempotency_key');
    expect(refusal.correlationId).not.toBe('');
  });

  test('a key that is not a UUID is refused just like a missing one', async () => {
    const response = await post({ name: 'Filosofia' }, 'chave-inventada');

    expect(response.status).toBe(400);
  });

  /*
   * The pair is the whole feature. Asserting only the second status would pass against a middleware
   * that refuses every repeat blindly; what has to hold is that exactly one record exists and that
   * the repeat hands back where the first one went.
   */
  test('two POSTs under the same key create one record, and the second says where the first is', async () => {
    const key = crypto.randomUUID();

    const first = await post({ name: 'Sociologia' }, key);
    const second = await post({ name: 'Sociologia' }, key);
    const repeated = (await second.json()) as Repeated;

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(repeated.repeated).toBe(true);
    expect(repeated.location).toBe(first.headers.get('Location') ?? '');
  });

  test('two POSTs under distinct keys create two records', async () => {
    const one = await post({ name: 'Sociologia' }, crypto.randomUUID());
    const two = await post({ name: 'Sociologia' }, crypto.randomUUID());

    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    expect(one.headers.get('Location')).not.toBe(two.headers.get('Location'));
  });

  test('a refusal spends no key, and the correction goes through under the same key', async () => {
    const key = crypto.randomUUID();

    const refused = await post({ name: '' }, key);
    const fixed = await post({ name: 'Artes Cênicas' }, key);

    expect(refused.status).toBe(422);
    expect(fixed.status).toBe(201);
  });

  test('a key a refusal never claimed leaves no row behind in the table', async () => {
    const key = crypto.randomUUID();

    await post({ name: '' }, key);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM idempotent_request WHERE idempotency_key = ${key}`;

    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });

  test('a completed write keeps the row, holding the location and nothing of the body', async () => {
    const key = crypto.randomUUID();

    const response = await post({ name: 'Sociologia' }, key);
    const rows = await testSql()<{ response_location: string; response_hash: string }[]>`
      SELECT response_location, response_hash FROM idempotent_request WHERE idempotency_key = ${key}`;

    expect(rows[0]?.response_location).toBe(response.headers.get('Location') ?? '');
    expect(rows[0]?.response_hash).not.toBe('');
  });
});

/*
 * Two method gates, not one. Everything past the first — POST, PUT, PATCH — gets its body parsed and
 * left on the context; only what is past the second, which is POST alone, is charged a key. A PUT is
 * idempotent by method, and charging it a key would be rent without pain.
 */
describe('the two method gates', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const signedIn = async (): Promise<string> => {
    const scenario = await fullScenario();
    return await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
  };

  test('a PUT needs no key and still finds its body on the context', async () => {
    const cookie = await signedIn();

    const response = await probe().request(ROLL_CALL, {
      method: 'PUT',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ date: '2026-03-10', rows: [] }),
    });
    const body = (await response.json()) as { received: { date: string } };

    expect(response.status).toBe(200);
    expect(body.received.date).toBe('2026-03-10');
  });

  test('a DELETE is never asked for a body it does not have', async () => {
    const cookie = await signedIn();

    const response = await probe().request(ECHO, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
  });

  test('a body that is not JSON is refused with 400 before anything else happens', async () => {
    const cookie = await signedIn();

    const response = await probe().request(SUBJECTS, {
      method: 'POST',
      headers: jsonHeaders(cookie, crypto.randomUUID()),
      body: 'isto não é json',
    });
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.code).toBe('malformed_body');
  });
});

/*
 * Signing in is the one write with no key, and that is deliberate rather than an oversight: the row
 * requires a `user_id`, and an anonymous caller has none. Repeating a login only opens a second
 * session, so there is no record to protect.
 */
describe('the anonymous write is let through', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('an anonymous POST with no key reaches the handler instead of being refused', async () => {
    const response = await probe().request(SUBJECTS, {
      method: 'POST',
      headers: { 'Content-Type': API.mediaType },
      body: JSON.stringify({ name: 'Filosofia' }),
    });

    expect(response.status).toBe(201);
  });
});

/*
 * A write that completes without a `Location` must keep its key.
 *
 * The middleware used to take the presence of that header as the signal that the write had
 * completed, which conflates two independent things: where the client can go next, and whether the
 * operation happened. Not every write creates an addressable resource — marking a communication as
 * read answers 204 and has nowhere to point — and for those the key was released, so a second tap
 * ran the operation again. The status is the signal; the header is navigation.
 */
describe('a completed write with nothing to point at still consumes its key', () => {
  const NOTHING_TO_POINT_AT = `${API.versionedPrefix}/silent`;

  const silentProbe = (): Hono<{ Variables: Variables }> => {
    const app = new Hono<{ Variables: Variables }>();
    app.use(errorsMiddleware);
    app.use(correlationMiddleware);
    app.use(createSessionMiddleware(identity.validSession));
    app.use(jsonIdempotencyMiddleware);

    let performed = 0;
    app.post(NOTHING_TO_POINT_AT, async (c) => {
      await unitOfWork(async () => {
        performed += 1;
      });
      return c.body(null, 204);
    });
    app.get(NOTHING_TO_POINT_AT, (c) => c.json({ performed }));
    return app;
  };

  test('the repeat is recognised instead of running the operation twice', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const application = silentProbe();
    const key = crypto.randomUUID();
    const send = async (): Promise<Response> =>
      await application.request(NOTHING_TO_POINT_AT, {
        method: 'POST',
        headers: jsonHeaders(cookie, key),
        body: JSON.stringify({}),
      });

    const first = await send();
    const second = await send();
    const counted = (await (await application.request(NOTHING_TO_POINT_AT)).json()) as {
      performed: number;
    };

    expect(first.status).toBe(204);
    expect(second.status).toBe(200);
    expect(counted.performed).toBe(1);
  });

  test('and a refusal still releases the key, so the correction can be resubmitted', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const application = new Hono<{ Variables: Variables }>();
    application.use(errorsMiddleware);
    application.use(correlationMiddleware);
    application.use(createSessionMiddleware(identity.validSession));
    application.use(jsonIdempotencyMiddleware);
    let attempt = 0;
    application.post(NOTHING_TO_POINT_AT, async (c) => {
      attempt += 1;
      if (attempt === 1) return c.json({ errors: [] }, 422);
      await unitOfWork(async () => undefined);
      return c.body(null, 204);
    });
    const key = crypto.randomUUID();
    const send = async (): Promise<Response> =>
      await application.request(NOTHING_TO_POINT_AT, {
        method: 'POST',
        headers: jsonHeaders(cookie, key),
        body: JSON.stringify({}),
      });

    const refused = await send();
    const accepted = await send();

    expect(refused.status).toBe(422);
    expect(accepted.status).toBe(204);
  });
});

/*
 * A refusal spends no key, and the proof has to come from a real route.
 *
 * `unitOfWork` rolls back when the use case hands back a refusal, which is what frees the key. It
 * recognises a refusal by its shape — an object with `ok: false` — so a use case that returned a
 * bare boolean from inside the transaction and turned it into a `fieldFailure` outside slipped
 * through: the transaction committed, the key stayed claimed, and the retry was told `repeated`
 * with an empty location for a write that had never happened. Two use cases were written that way.
 *
 * The probe app above cannot catch this, because its handler refuses before opening a transaction
 * at all. Only a real route can.
 */
describe('a refusal on a real route leaves the key free', () => {
  test('the duplicate subject is refused twice, and claims nothing', async () => {
    await clearDatabase();
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const taken = scenario.subjects[0];
    expect(taken).toBeDefined();
    const key = crypto.randomUUID();
    const path = `${API.versionedPrefix}/registrar/subjects`;

    const first = await writeWithKey('POST', path, { name: taken?.name }, cookie, key);
    const second = await writeWithKey('POST', path, { name: taken?.name }, cookie, key);
    const claimed = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM idempotent_request WHERE idempotency_key = ${key}`;

    expect([first.status, second.status]).toEqual([422, 422]);
    expect(Number(claimed[0]?.total ?? '0')).toBe(0);
  }, 60_000);
});

/*
 * The claim and the write are one commit, and this is the case that tells the two designs apart.
 *
 * While the key was claimed by the edge, before the handler ran, a write that died halfway left the
 * key held and the work undone — and the retry, finding the key taken, answered `repeated` for
 * something that had never happened. Claiming inside the transaction removes the state that made
 * that possible: the row that says "handled" is written by the same commit as the rows it refers
 * to, so a rollback takes both, and the retry finds nothing and does the work.
 */
describe('a write that dies halfway leaves neither the record nor the key', () => {
  const HALFWAY = `${API.versionedPrefix}/halfway`;

  test('the retry under the same key does the work instead of being told it is repeated', async () => {
    await clearDatabase();
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    let attempt = 0;
    const application = new Hono<{ Variables: Variables }>();
    application.use(errorsMiddleware);
    application.use(correlationMiddleware);
    application.use(createSessionMiddleware(identity.validSession));
    application.use(jsonIdempotencyMiddleware);
    application.post(HALFWAY, async (c) => {
      attempt += 1;
      const dies = attempt === 1;
      await unitOfWork(async ({ sql }) => {
        await sql`
          INSERT INTO subject (id, network_id, name)
          VALUES (${crypto.randomUUID()}, ${scenario.network.id}, ${'Química'})`;
        if (dies) throw new Error('a conexão caiu no meio da escrita');
      });
      return c.body(null, 204);
    });

    const key = crypto.randomUUID();
    const send = async (): Promise<Response> =>
      await application.request(HALFWAY, {
        method: 'POST',
        headers: jsonHeaders(cookie, key),
        body: JSON.stringify({}),
      });

    const died = await send();
    const retried = await send();

    const keys = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM idempotent_request WHERE idempotency_key = ${key}`;
    const subjects = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM subject WHERE name = ${'Química'}`;

    expect(died.status).toBe(500);
    expect(retried.status).toBe(204);
    expect(Number(subjects[0]?.total ?? '0')).toBe(1);
    expect(Number(keys[0]?.total ?? '0')).toBe(1);
  });
});

/*
 * A repeat is the ordinary path, so the log must not call it a failure.
 *
 * The claim aborts its transaction by throwing, because throwing is the only way to abort one, and
 * Hono routes a throw from a handler into its error path. Left alone, the guardian's second tap on
 * bad 4G — the exact case I4 exists for — writes an `error` line at 500 with a stack trace, while
 * answering the browser a perfectly correct 200. The response is right and the log is wrong, which
 * is the worst of the two: at Stage 11 that line becomes an alert about a case that works.
 */
describe('the repeat is answered without being recorded as a failure', () => {
  const SUBJECT = 'Filosofia da Repetição';

  /** pino's numeric level for `error`. */
  const ERROR_LEVEL = 50;

  test('the second submission answers 200, creates nothing, and writes no error line', async () => {
    await clearDatabase();
    const scenario = await fullScenario();

    const captured = await captureLogOfARepeatedSubmission({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
      subjectName: SUBJECT,
    });
    const created = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM subject WHERE name = ${SUBJECT}`;

    expect(captured.statuses).toEqual([201, 200]);
    expect(JSON.parse(captured.repeatBody)).toMatchObject({ repeated: true });
    expect(Number(created[0]?.total ?? '0')).toBe(1);
    expect(captured.rows.filter((row) => Number(row.level) >= ERROR_LEVEL)).toEqual([]);
    expect(captured.raw).not.toContain('RepeatedWrite');
  }, 60_000);
});

/*
 * Whatever a 201 puts in `Location`, a client can follow.
 *
 * This is a contract about the whole API rather than about one route, and it is written here
 * because the header exists for the idempotency replay: a repeat answers `{ repeated, location }`
 * and the front navigates there. A `Location` that answers 404 sends it nowhere, and no per-front
 * suite catches that — each of them asserts the string it expects, which is the same string the
 * route produced.
 *
 * Not every write creates an addressable resource: this API exposes no `GET /network/schools/:id`
 * and no individual enrolment, by decision of the plan. Those point at the collection the record
 * joined, or at the record that owns it, which is where it can actually be found.
 */
describe('every Location a creation emits resolves', () => {
  test('following the Location of each 201 answers 200', async () => {
    const scenario = await fullScenario();
    const registrar = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const admin = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.admin.cpf,
      password: scenario.password,
    });
    const prefix = API.versionedPrefix;

    const creations: { path: string; body: unknown; cookie: string }[] = [
      { path: `${prefix}/registrar/students`, body: { name: 'Ana Localizada', birthDate: '2015-03-11' }, cookie: registrar },
      { path: `${prefix}/registrar/subjects`, body: { name: 'Geografia Local' }, cookie: registrar },
      { path: `${prefix}/network/schools`, body: { name: 'Escola do Location' }, cookie: admin },
      { path: `${prefix}/network/academic-years`, body: { year: 2027, startsOn: '2027-02-01', endsOn: '2027-12-15' }, cookie: admin },
      {
        path: `${prefix}/announcements`,
        body: {
          schoolId: scenario.schools[0]?.id,
          title: 'Aviso do Location',
          body: 'Corpo do aviso.',
          audience: 'unidade',
          recipients: [],
        },
        cookie: registrar,
      },
    ];

    const followed: { path: string; location: string; status: number }[] = [];
    for (const creation of creations) {
      const response = await write('POST', creation.path, creation.body, creation.cookie);
      if (response.status !== 201) continue;
      const location = response.headers.get('Location') ?? '';
      const followUp = await read(location, creation.cookie);
      followed.push({ path: creation.path, location, status: followUp.status });
    }

    expect(followed.length).toBeGreaterThan(0);
    expect(followed.filter((entry) => entry.status !== 200)).toEqual([]);
  }, 60_000);
});
