/*
 * Everything every web-layer suite needs to do with HTTP.
 *
 * Requests go in through Hono's `app.request`: that is the whole application — middleware, routes,
 * templates — with no open port and no HTTP client in between. A session is obtained by doing a
 * real `POST /login` and keeping the `Set-Cookie` the application emitted: no test here knows how
 * the cookie is signed, and changing the signature rewrites no test.
 *
 * Three things do not fit into `app.request` because they belong to the process, not to the
 * request: the boot that refuses incomplete configuration (I18), health with the database down
 * (I13) and the log of a whole flow (I17). Those three run in a separate Bun process, which is
 * where they actually happen.
 */

import { join } from 'node:path';
import { app } from '../../src/web/app';

export const PROJECT_ROOT = join(import.meta.dir, '..', '..');

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

/** Port 1 with nobody listening: the connection is refused at once, with no timeout to wait out. */
const DATABASE_DOWN_URL = 'postgres://escolaviva:escolaviva@127.0.0.1:1/inexistente';

export type FormFields = Record<string, string | readonly string[]>;

/* --- Requests --------------------------------------------------------------- */

const headers = (cookie: string, extras: Record<string, string> = {}): Record<string, string> =>
  cookie === '' ? { ...extras } : { ...extras, Cookie: cookie };

const formBody = (fields: FormFields): string => {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') params.append(name, value);
    else for (const item of value) params.append(name, item);
  }
  return params.toString();
};

/** A GET against the application, with or without a session. */
export async function open(path: string, cookie = ''): Promise<Response> {
  return await app.request(path, { headers: headers(cookie) });
}

/** A raw POST: the caller states exactly which fields go in the body, `_key` included. */
export async function post(path: string, fields: FormFields, cookie = ''): Promise<Response> {
  return await app.request(path, {
    method: 'POST',
    headers: headers(cookie, { 'Content-Type': FORM_CONTENT_TYPE }),
    body: formBody(fields),
  });
}

/**
 * The submission a browser makes: the idempotency key (I4) is born at render time, and a form
 * loaded twice carries two distinct keys.
 */
export function send(path: string, fields: FormFields, cookie = ''): Promise<Response> {
  return post(path, { _key: crypto.randomUUID(), ...fields }, cookie);
}

/** The `name=value` pair out of `Set-Cookie` — exactly what the browser sends back on the next trip. */
export function cookieFromResponse(response: Response): string {
  const raw = response.headers.get('Set-Cookie') ?? '';
  return raw.split(';')[0] ?? '';
}

export type Credentials = { networkSlug: string; cpf: string; password: string };

/**
 * Signs in for real and hands back the signed cookie the application emitted. Ever since the CPF
 * compatibility window closed, `/login` accepts only the `cpf` field — there is no
 * translation left to do here, just passing along what the test scenario already has at hand.
 */
export async function signIn(credentials: Credentials): Promise<string> {
  const response = await send('/login', {
    networkSlug: credentials.networkSlug,
    cpf: credentials.cpf,
    password: credentials.password,
  });
  if (response.status !== 303) {
    throw new Error(`login recusado com status ${response.status} — cenário mal montado`);
  }
  const cookie = cookieFromResponse(response);
  if (cookie === '') throw new Error('login sem Set-Cookie — cenário mal montado');
  return cookie;
}

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
};

/**
 * I13: boots the application in a process whose `DATABASE_URL` points where no database is, and
 * asks both health routes. No container is taken down and no dependency is doubled — the database
 * really is unreachable for that process.
 */
export async function healthWithDatabaseDown(): Promise<HealthResponse> {
  const script = `
    const { app } = await import('./src/web/app.ts');
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
  return lastJson(stdout) as unknown as HealthResponse;
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
 * I17: walks through a refused login, an accepted login and a grade entry in a separate process,
 * with the log at its lowest level, and hands back everything that came out on stdout. Capturing
 * here, rather than inside the test process, is what guarantees the line under examination is the
 * line pino actually wrote.
 */
export async function captureLogOfAFlow(scenario: FlowScenario): Promise<CapturedLog> {
  const script = `
    const data = ${JSON.stringify(scenario)};
    const { app } = await import('./src/web/app.ts');

    const form = (fields) => {
      const body = new URLSearchParams();
      for (const [name, value] of Object.entries(fields)) body.append(name, String(value));
      return {
        method: 'POST',
        headers: { 'Content-Type': '${FORM_CONTENT_TYPE}' },
        body: body.toString(),
      };
    };
    const key = () => crypto.randomUUID();

    await app.request('/login', form({
      _key: key(), networkSlug: data.networkSlug, cpf: data.cpf, password: 'senha-errada',
    }));

    const signedIn = await app.request('/login', form({
      _key: key(), networkSlug: data.networkSlug, cpf: data.cpf, password: data.password,
    }));
    const cookie = (signedIn.headers.get('Set-Cookie') ?? '').split(';')[0];
    const withSession = (init = {}) => ({
      ...init, headers: { ...(init.headers ?? {}), Cookie: cookie },
    });

    await app.request('/dashboard', withSession());

    const path = '/teacher/subjects/' + data.classGroupSubjectId + '/grades';
    const grades = { _key: key(), term: String(data.term) };
    for (const id of data.enrollmentIds) grades['grade_' + id] = String(data.grade);
    await app.request(path, withSession(form(grades)));
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

/** Every scalar value in a log line, at any depth. */
export function logValues(row: unknown): unknown[] {
  if (Array.isArray(row)) return row.flatMap(logValues);
  if (typeof row === 'object' && row !== null) {
    return Object.values(row as Record<string, unknown>).flatMap(logValues);
  }
  return [row];
}
