/*
 * Everything every API suite needs to do with HTTP.
 *
 * Requests go in through Hono's `app.request`: that is the whole application — middleware and
 * routes — with no open port and no HTTP client in between. A session is obtained by doing a real
 * `POST /api/v1/session` and keeping the `Set-Cookie` the application emitted: no test here knows
 * how the cookie is signed, and changing the signature rewrites no test.
 *
 * Three things do not fit into `app.request` because they belong to the process, not to the
 * request: the boot that refuses incomplete configuration (I18), health with the database down
 * (I13) and the log of a whole flow (I17). Those three run in a separate Bun process, which is
 * where they actually happen.
 */

import { join } from 'node:path';
import { app } from '../../src/http/app';
import { API } from '../../src/http/constants';
import { APPLICATION_MARK, HEADERS } from '../../src/shared/constants';

export const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..', '..');

/** Port 1 with nobody listening: the connection is refused at once, with no timeout to wait out. */
const DATABASE_DOWN_URL = 'postgres://escolaviva:escolaviva@127.0.0.1:1/inexistente';

/* --- Requests --------------------------------------------------------------- */

const headers = (cookie: string, extras: Record<string, string> = {}): Record<string, string> =>
  cookie === '' ? { ...extras } : { ...extras, Cookie: cookie };

/** The `name=value` pair out of `Set-Cookie` — exactly what the browser sends back on the next trip. */
export function cookieFromResponse(response: Response): string {
  const raw = response.headers.get('Set-Cookie') ?? '';
  return raw.split(';')[0] ?? '';
}

export type Credentials = { networkSlug: string; cpf: string; password: string };

/* --- Separate processes ----------------------------------------------------- */

export type ProcessOutcome = { exitCode: number; stdout: string; stderr: string };

/**
 * Runs a Bun process with the environment the test dictates. The variables passed here beat the
 * project's `.env`, and that is what makes it possible to prove both a missing variable and a
 * database that is down.
 */
export async function runProcess(
  args: readonly string[],
  environment: Record<string, string>,
): Promise<ProcessOutcome> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: PROJECT_ROOT,
    env: { PATH: Bun.env.PATH ?? '', ...environment },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

const TEST_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

const defaultEnvironment = (extras: Record<string, string>): Record<string, string> => ({
  APP_ENV: 'test',
  SESSION_SECRET: TEST_SECRET,
  LOG_LEVEL: 'error',
  ...extras,
});

/** The last line of stdout that is a JSON object — the result the separate script printed. */
function lastJson(stdout: string): Record<string, unknown> {
  const rows = stdout.trim().split('\n').filter((row) => row.startsWith('{'));
  const last = rows.at(-1);
  if (last === undefined) throw new Error(`o processo separado não imprimiu resultado:\n${stdout}`);
  return JSON.parse(last) as Record<string, unknown>;
}

export type HealthResponse = {
  health: number;
  healthCache: string | null;
  live: number;
  liveCache: string | null;
  /** The lines pino wrote in that process — a database that never answers must leave a trail. */
  logged: Record<string, unknown>[];
};

/**
 * I13: boots the application in a process whose `DATABASE_URL` points where no database is, and
 * asks both health routes. No container is taken down and no dependency is doubled — the database
 * really is unreachable for that process.
 */
export async function healthWithDatabaseDown(): Promise<HealthResponse> {
  const script = `
    const { app } = await import('./apps/api/src/http/app.ts');
    const health = await app.request('/health');
    const live = await app.request('/health/live');
    console.log(JSON.stringify({
      health: health.status,
      healthCache: health.headers.get('Cache-Control'),
      live: live.status,
      liveCache: live.headers.get('Cache-Control'),
    }));
    process.exit(0);
  `;
  const { exitCode, stdout, stderr } = await runProcess(
    ['-e', script],
    defaultEnvironment({ DATABASE_URL: DATABASE_DOWN_URL }),
  );
  if (exitCode !== 0) throw new Error(`processo de saúde falhou (${exitCode}):\n${stderr}`);
  const logged = stdout
    .split('\n')
    .filter((row) => row.startsWith('{') && row.includes('"level"'))
    .map((row) => JSON.parse(row) as Record<string, unknown>);
  return { ...(lastJson(stdout) as unknown as HealthResponse), logged };
}

export type FlowScenario = {
  networkSlug: string;
  /** Only so the scenario can check the e-mail does not leak into the log — it no longer takes part in login. */
  email: string;
  cpf: string;
  password: string;
  classGroupSubjectId: string;
  enrollmentIds: readonly string[];
  term: number;
  grade: number;
};

export type CapturedLog = { raw: string; rows: Record<string, unknown>[] };

/**
 * I17: walks through a refused sign-in, an accepted sign-in and a grade entry in a separate
 * process, with the log at its lowest level, and hands back everything that came out on stdout.
 * Capturing here, rather than inside the test process, is what guarantees the line under
 * examination is the line pino actually wrote.
 */
export async function captureLogOfAFlow(scenario: FlowScenario): Promise<CapturedLog> {
  const script = `
    const data = ${JSON.stringify(scenario)};
    const { app } = await import('./apps/api/src/http/app.ts');
    const prefix = '${API.versionedPrefix}';

    const body = (payload) => ({
      method: 'POST',
      headers: {
        'Content-Type': '${API.mediaType}',
        '${HEADERS.requestedBy}': '${APPLICATION_MARK}',
        '${HEADERS.idempotencyKey}': crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    await app.request(prefix + '/session', body({
      networkSlug: data.networkSlug, cpf: data.cpf, password: 'senha-errada',
    }));

    const signedIn = await app.request(prefix + '/session', body({
      networkSlug: data.networkSlug, cpf: data.cpf, password: data.password,
    }));
    const cookie = (signedIn.headers.get('Set-Cookie') ?? '').split(';')[0];
    const withSession = (init = {}) => ({
      ...init, headers: { ...(init.headers ?? {}), Cookie: cookie },
    });

    await app.request(prefix + '/teacher/class-groups', withSession());

    const path = prefix + '/teacher/subjects/' + data.classGroupSubjectId + '/grades';
    const grades = data.enrollmentIds.map((id) => ({ enrollmentId: id, value: data.grade }));
    await app.request(path, withSession({ ...body({ term: data.term, grades }), method: 'PUT' }));
    await app.request(path + '?term=' + data.term, withSession());

    process.exit(0);
  `;
  const { exitCode, stdout, stderr } = await runProcess(
    ['-e', script],
    defaultEnvironment({ DATABASE_URL: Bun.env.DATABASE_URL ?? '', LOG_LEVEL: 'debug' }),
  );
  if (exitCode !== 0) throw new Error(`processo do fluxo falhou (${exitCode}):\n${stderr}`);

  const rows = stdout
    .split('\n')
    .filter((row) => row.startsWith('{'))
    .map((row) => JSON.parse(row) as Record<string, unknown>);
  return { raw: stdout, rows };
}

export type RepeatedSubmission = CapturedLog & {
  statuses: readonly number[];
  repeatBody: string;
};

/**
 * The guardian on bad 4G taps submit twice, in a separate process, with the log wide open.
 *
 * The repeat is the ordinary path of I4 — it is what the key exists for — so it must not be
 * recorded as a failure. The claim is made by throwing inside the write transaction, since that is
 * the only way to abort one, and Hono turns a throw from a handler into its error path: without a
 * gate, every double tap writes an `error` line with a stack trace, and Stage 11 would centralise
 * an alert for a case that works exactly as designed. Capturing the log in its own process is what
 * makes the line under examination the line pino actually wrote.
 */
export async function captureLogOfARepeatedSubmission(credentials: {
  networkSlug: string;
  cpf: string;
  password: string;
  subjectName: string;
}): Promise<RepeatedSubmission> {
  const script = `
    const data = ${JSON.stringify(credentials)};
    const { app } = await import('./apps/api/src/http/app.ts');
    const prefix = '${API.versionedPrefix}';
    const key = crypto.randomUUID();

    const signedIn = await app.request(prefix + '/session', {
      method: 'POST',
      headers: {
        'Content-Type': '${API.mediaType}',
        '${HEADERS.requestedBy}': '${APPLICATION_MARK}',
        '${HEADERS.idempotencyKey}': crypto.randomUUID(),
      },
      body: JSON.stringify({
        networkSlug: data.networkSlug, cpf: data.cpf, password: data.password,
      }),
    });
    const cookie = (signedIn.headers.get('Set-Cookie') ?? '').split(';')[0];

    const send = () => app.request(prefix + '/registrar/subjects', {
      method: 'POST',
      headers: {
        'Content-Type': '${API.mediaType}',
        '${HEADERS.requestedBy}': '${APPLICATION_MARK}',
        '${HEADERS.idempotencyKey}': key,
        Cookie: cookie,
      },
      body: JSON.stringify({ name: data.subjectName }),
    });

    const first = await send();
    const second = await send();
    console.log(JSON.stringify({
      outcome: { statuses: [first.status, second.status], repeatBody: await second.text() },
    }));
    process.exit(0);
  `;
  const { exitCode, stdout, stderr } = await runProcess(
    ['-e', script],
    defaultEnvironment({ DATABASE_URL: Bun.env.DATABASE_URL ?? '', LOG_LEVEL: 'debug' }),
  );
  if (exitCode !== 0) throw new Error(`processo da repetição falhou (${exitCode}):\n${stderr}`);

  const rows = stdout
    .split('\n')
    .filter((row) => row.startsWith('{'))
    .map((row) => JSON.parse(row) as Record<string, unknown>);
  const outcome = (lastJson(stdout).outcome ?? {}) as {
    statuses?: number[];
    repeatBody?: string;
  };
  return {
    raw: stdout,
    rows: rows.filter((row) => row.outcome === undefined),
    statuses: outcome.statuses ?? [],
    repeatBody: outcome.repeatBody ?? '',
  };
}

/** Every scalar value in a log line, at any depth. */
export function logValues(row: unknown): unknown[] {
  if (Array.isArray(row)) return row.flatMap(logValues);
  if (typeof row === 'object' && row !== null) {
    return Object.values(row as Record<string, unknown>).flatMap(logValues);
  }
  return [row];
}

/* --- The JSON edge ---------------------------------------------------------- */

/*
 * The form helpers above stay until the Eta routes go. These three talk to `/api/v1`, and they send
 * exactly what the browser sends: the mark that makes a cross-site write impossible, a JSON content
 * type, and a fresh idempotency key on every submission.
 */

const MARK: Record<string, string> = { [HEADERS.requestedBy]: APPLICATION_MARK };

export type WriteMethod = 'POST' | 'PUT' | 'DELETE';

/** A GET against the API, with or without a session. */
export async function read(path: string, cookie = ''): Promise<Response> {
  return await app.request(path, { headers: headers(cookie) });
}

/** A write with a fresh key on every call — what the browser does on every submission. */
export async function write(
  method: WriteMethod,
  path: string,
  body: unknown,
  cookie = '',
): Promise<Response> {
  return await writeWithKey(method, path, body, cookie, crypto.randomUUID());
}

/** A write with a dictated key: this is how the I4 resubmission gets proven. */
export async function writeWithKey(
  method: WriteMethod,
  path: string,
  body: unknown,
  cookie: string,
  key: string,
): Promise<Response> {
  return await app.request(path, {
    method,
    headers: headers(cookie, {
      ...MARK,
      [HEADERS.contentType]: API.mediaType,
      [HEADERS.idempotencyKey]: key,
    }),
    ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
  });
}

/*
 * The session a test needs, obtained the way the front will obtain it. `signInThroughForm` above
 * stays for the Eta suites, which are still alive and still post a form; everything under
 * `tests/api/` goes through here.
 */
export async function signIn(credentials: Credentials): Promise<string> {
  const response = await write('POST', `${API.versionedPrefix}/session`, {
    networkSlug: credentials.networkSlug,
    cpf: credentials.cpf,
    password: credentials.password,
  });
  if (response.status !== 201) {
    throw new Error(`login recusado com status ${response.status} — cenário mal montado`);
  }
  const cookie = cookieFromResponse(response);
  if (cookie === '') throw new Error('login sem Set-Cookie — cenário mal montado');
  return cookie;
}
