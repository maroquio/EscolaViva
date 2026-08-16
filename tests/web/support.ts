/*
 * O que toda suíte da camada web precisa fazer com o HTTP.
 *
 * As requisições entram pelo `app.request` do Hono: é a aplicação inteira — middlewares, rotas,
 * templates —, sem porta aberta e sem cliente HTTP no meio. Sessão se obtém fazendo `POST /login`
 * de verdade e devolvendo o `Set-Cookie` que a aplicação emitiu: nenhum teste daqui sabe como o
 * cookie é assinado, e trocar a assinatura não reescreve teste nenhum.
 *
 * Três coisas não cabem em `app.request` porque são do processo, e não da requisição: o boot que
 * recusa configuração incompleta (I18), a saúde com o banco fora do ar (I13) e o log de um fluxo
 * inteiro (I17). Essas três rodam em um processo Bun separado, que é onde elas de fato acontecem.
 */

import { join } from 'node:path';
import { app } from '../../src/web/app';

export const PROJECT_ROOT = join(import.meta.dir, '..', '..');

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

/** Porta 1 sem ninguém escutando: a conexão é recusada de imediato, sem esperar prazo nenhum. */
const DATABASE_DOWN_URL = 'postgres://escolaviva:escolaviva@127.0.0.1:1/inexistente';

export type FormFields = Record<string, string | readonly string[]>;

/* --- Requisições ------------------------------------------------------------ */

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

/** GET na aplicação, com ou sem sessão. */
export async function open(path: string, cookie = ''): Promise<Response> {
  return await app.request(path, { headers: headers(cookie) });
}

/** POST cru: quem chama diz exatamente quais campos vão no corpo, `_chave` inclusive. */
export async function post(path: string, fields: FormFields, cookie = ''): Promise<Response> {
  return await app.request(path, {
    method: 'POST',
    headers: headers(cookie, { 'Content-Type': FORM_CONTENT_TYPE }),
    body: formBody(fields),
  });
}

/**
 * O envio que o navegador faz: a chave de idempotência (I4) nasce no render, e um formulário
 * carregado duas vezes carrega duas chaves distintas.
 */
export function send(path: string, fields: FormFields, cookie = ''): Promise<Response> {
  return post(path, { _chave: crypto.randomUUID(), ...fields }, cookie);
}

/** O par `nome=valor` do `Set-Cookie` — exatamente o que o navegador devolve na próxima ida. */
export function cookieFromResponse(response: Response): string {
  const raw = response.headers.get('Set-Cookie') ?? '';
  return raw.split(';')[0] ?? '';
}

export type Credentials = { networkSlug: string; cpf: string; password: string };

/**
 * Entra de verdade e devolve o cookie assinado que a aplicação emitiu. Desde que a janela de
 * compatibilidade do CPF fechou (ADR 0004), `/login` só aceita o campo `cpf` — não há mais
 * tradução a fazer aqui, só repassar o que o cenário de teste já tem à mão.
 */
export async function signIn(credentials: Credentials): Promise<string> {
  const response = await send('/login', {
    redeSlug: credentials.networkSlug,
    cpf: credentials.cpf,
    senha: credentials.password,
  });
  if (response.status !== 303) {
    throw new Error(`login recusado com status ${response.status} — cenário mal montado`);
  }
  const cookie = cookieFromResponse(response);
  if (cookie === '') throw new Error('login sem Set-Cookie — cenário mal montado');
  return cookie;
}

/* --- Processos separados ---------------------------------------------------- */

export type ProcessOutcome = { exitCode: number; stdout: string; stderr: string };

/**
 * Roda um processo Bun com o ambiente que o teste dita. As variáveis passadas aqui vencem o `.env`
 * do projeto, e é isso que permite provar tanto a falta de uma variável quanto o banco fora do ar.
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

/** A última linha de stdout que é um objeto JSON — o resultado que o script separado imprimiu. */
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
 * I13: sobe a aplicação em um processo cujo `DATABASE_URL` aponta para onde não há banco e
 * pergunta pelas duas rotas de saúde. Nenhum contêiner é derrubado e nenhuma dependência é
 * dublada — o banco está mesmo inalcançável para aquele processo.
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
  /** Só para o cenário verificar que o e-mail não vaza no log — não entra mais no login (ADR 0004). */
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
 * I17: percorre login recusado, login aceito e lançamento de notas em um processo separado, com o
 * log no nível mais baixo, e devolve tudo o que saiu no stdout. Capturar aqui, e não dentro do
 * processo de teste, é o que garante que a linha examinada é a linha que o pino de fato escreveu.
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
      _chave: key(), redeSlug: data.networkSlug, cpf: data.cpf, senha: 'senha-errada',
    }));

    const signedIn = await app.request('/login', form({
      _chave: key(), redeSlug: data.networkSlug, cpf: data.cpf, senha: data.password,
    }));
    const cookie = (signedIn.headers.get('Set-Cookie') ?? '').split(';')[0];
    const withSession = (init = {}) => ({
      ...init, headers: { ...(init.headers ?? {}), Cookie: cookie },
    });

    await app.request('/dashboard', withSession());

    const path = '/teacher/subjects/' + data.classGroupSubjectId + '/grades';
    const grades = { _chave: key(), bimestre: String(data.term) };
    for (const id of data.enrollmentIds) grades['nota_' + id] = String(data.grade);
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

/** Todo valor escalar de uma linha de log, em qualquer profundidade. */
export function logValues(row: unknown): unknown[] {
  if (Array.isArray(row)) return row.flatMap(logValues);
  if (typeof row === 'object' && row !== null) {
    return Object.values(row as Record<string, unknown>).flatMap(logValues);
  }
  return [row];
}
