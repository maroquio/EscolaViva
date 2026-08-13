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

export const RAIZ_DO_PROJETO = join(import.meta.dir, '..', '..');

const TIPO_DE_FORMULARIO = 'application/x-www-form-urlencoded';

/** Porta 1 sem ninguém escutando: a conexão é recusada de imediato, sem esperar prazo nenhum. */
const BANCO_FORA_DO_AR = 'postgres://escolaviva:escolaviva@127.0.0.1:1/inexistente';

export type Campos = Record<string, string | readonly string[]>;

/* --- Requisições ------------------------------------------------------------ */

const cabecalhos = (cookie: string, extras: Record<string, string> = {}): Record<string, string> =>
  cookie === '' ? { ...extras } : { ...extras, Cookie: cookie };

const corpoDeFormulario = (campos: Campos): string => {
  const parametros = new URLSearchParams();
  for (const [nome, valor] of Object.entries(campos)) {
    if (typeof valor === 'string') parametros.append(nome, valor);
    else for (const item of valor) parametros.append(nome, item);
  }
  return parametros.toString();
};

/** GET na aplicação, com ou sem sessão. */
export async function abrir(caminho: string, cookie = ''): Promise<Response> {
  return await app.request(caminho, { headers: cabecalhos(cookie) });
}

/** POST cru: quem chama diz exatamente quais campos vão no corpo, `_chave` inclusive. */
export async function postar(caminho: string, campos: Campos, cookie = ''): Promise<Response> {
  return await app.request(caminho, {
    method: 'POST',
    headers: cabecalhos(cookie, { 'Content-Type': TIPO_DE_FORMULARIO }),
    body: corpoDeFormulario(campos),
  });
}

/**
 * O envio que o navegador faz: a chave de idempotência (I4) nasce no render, e um formulário
 * carregado duas vezes carrega duas chaves distintas.
 */
export function enviar(caminho: string, campos: Campos, cookie = ''): Promise<Response> {
  return postar(caminho, { _chave: crypto.randomUUID(), ...campos }, cookie);
}

/** O par `nome=valor` do `Set-Cookie` — exatamente o que o navegador devolve na próxima ida. */
export function cookieDaResposta(resposta: Response): string {
  const bruto = resposta.headers.get('Set-Cookie') ?? '';
  return bruto.split(';')[0] ?? '';
}

export type Credenciais = { redeSlug: string; email: string; senha: string };

/** Entra de verdade e devolve o cookie assinado que a aplicação emitiu. */
export async function entrar(credenciais: Credenciais): Promise<string> {
  const resposta = await enviar('/login', { ...credenciais });
  if (resposta.status !== 303) {
    throw new Error(`login recusado com status ${resposta.status} — cenário mal montado`);
  }
  const cookie = cookieDaResposta(resposta);
  if (cookie === '') throw new Error('login sem Set-Cookie — cenário mal montado');
  return cookie;
}

/* --- Processos separados ---------------------------------------------------- */

export type Encerramento = { codigo: number; saida: string; erro: string };

/**
 * Roda um processo Bun com o ambiente que o teste dita. As variáveis passadas aqui vencem o `.env`
 * do projeto, e é isso que permite provar tanto a falta de uma variável quanto o banco fora do ar.
 */
export async function rodarProcesso(
  argumentos: readonly string[],
  ambiente: Record<string, string>,
): Promise<Encerramento> {
  const processo = Bun.spawn([process.execPath, ...argumentos], {
    cwd: RAIZ_DO_PROJETO,
    env: { PATH: Bun.env.PATH ?? '', ...ambiente },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [saida, erro, codigo] = await Promise.all([
    new Response(processo.stdout).text(),
    new Response(processo.stderr).text(),
    processo.exited,
  ]);
  return { codigo, saida, erro };
}

const SEGREDO_DE_TESTE = 'segredo-de-teste-com-mais-de-32-caracteres';

const ambientePadrao = (extras: Record<string, string>): Record<string, string> => ({
  APP_ENV: 'test',
  SESSION_SECRET: SEGREDO_DE_TESTE,
  LOG_LEVEL: 'error',
  ...extras,
});

/** A última linha de stdout que é um objeto JSON — o resultado que o script separado imprimiu. */
function ultimoJson(saida: string): Record<string, unknown> {
  const linhas = saida.trim().split('\n').filter((linha) => linha.startsWith('{'));
  const ultima = linhas.at(-1);
  if (ultima === undefined) throw new Error(`o processo separado não imprimiu resultado:\n${saida}`);
  return JSON.parse(ultima) as Record<string, unknown>;
}

export type RespostaDeSaude = {
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
export async function saudeComBancoForaDoAr(): Promise<RespostaDeSaude> {
  const script = `
    const { app } = await import('./src/web/app.ts');
    const saude = await app.request('/health');
    const vivo = await app.request('/health/live');
    console.log(JSON.stringify({
      health: saude.status,
      healthCache: saude.headers.get('Cache-Control'),
      live: vivo.status,
      liveCache: vivo.headers.get('Cache-Control'),
    }));
    process.exit(0);
  `;
  const { codigo, saida, erro } = await rodarProcesso(
    ['-e', script],
    ambientePadrao({ DATABASE_URL: BANCO_FORA_DO_AR }),
  );
  if (codigo !== 0) throw new Error(`processo de saúde falhou (${codigo}):\n${erro}`);
  return ultimoJson(saida) as unknown as RespostaDeSaude;
}

export type CenarioDeFluxo = {
  redeSlug: string;
  email: string;
  senha: string;
  turmaDisciplinaId: string;
  matriculaIds: readonly string[];
  bimestre: number;
  nota: number;
};

export type LogCapturado = { bruto: string; linhas: Record<string, unknown>[] };

/**
 * I17: percorre login recusado, login aceito e lançamento de notas em um processo separado, com o
 * log no nível mais baixo, e devolve tudo o que saiu no stdout. Capturar aqui, e não dentro do
 * processo de teste, é o que garante que a linha examinada é a linha que o pino de fato escreveu.
 */
export async function capturarLogDeUmFluxo(cenario: CenarioDeFluxo): Promise<LogCapturado> {
  const script = `
    const dados = ${JSON.stringify(cenario)};
    const { app } = await import('./src/web/app.ts');

    const formulario = (campos) => {
      const corpo = new URLSearchParams();
      for (const [nome, valor] of Object.entries(campos)) corpo.append(nome, String(valor));
      return {
        method: 'POST',
        headers: { 'Content-Type': '${TIPO_DE_FORMULARIO}' },
        body: corpo.toString(),
      };
    };
    const chave = () => crypto.randomUUID();

    await app.request('/login', formulario({
      _chave: chave(), redeSlug: dados.redeSlug, email: dados.email, senha: 'senha-errada',
    }));

    const entrada = await app.request('/login', formulario({
      _chave: chave(), redeSlug: dados.redeSlug, email: dados.email, senha: dados.senha,
    }));
    const cookie = (entrada.headers.get('Set-Cookie') ?? '').split(';')[0];
    const comSessao = (init = {}) => ({
      ...init, headers: { ...(init.headers ?? {}), Cookie: cookie },
    });

    await app.request('/painel', comSessao());

    const caminho = '/professor/disciplinas/' + dados.turmaDisciplinaId + '/notas';
    const notas = { _chave: chave(), bimestre: String(dados.bimestre) };
    for (const id of dados.matriculaIds) notas['nota_' + id] = String(dados.nota);
    await app.request(caminho, comSessao(formulario(notas)));
    await app.request(caminho + '?bimestre=' + dados.bimestre, comSessao());

    process.exit(0);
  `;
  const { codigo, saida, erro } = await rodarProcesso(
    ['-e', script],
    ambientePadrao({ DATABASE_URL: Bun.env.DATABASE_URL ?? '', LOG_LEVEL: 'debug' }),
  );
  if (codigo !== 0) throw new Error(`processo do fluxo falhou (${codigo}):\n${erro}`);

  const linhas = saida
    .split('\n')
    .filter((linha) => linha.startsWith('{'))
    .map((linha) => JSON.parse(linha) as Record<string, unknown>);
  return { bruto: saida, linhas };
}

/** Todo valor escalar de uma linha de log, em qualquer profundidade. */
export function valoresDoLog(linha: unknown): unknown[] {
  if (Array.isArray(linha)) return linha.flatMap(valoresDoLog);
  if (typeof linha === 'object' && linha !== null) {
    return Object.values(linha as Record<string, unknown>).flatMap(valoresDoLog);
  }
  return [linha];
}
