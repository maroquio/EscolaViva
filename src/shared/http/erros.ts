import type { Context, MiddlewareHandler } from 'hono';
import { ENTIDADES_HTML, EVENTOS_DE_LOG_HTTP, TITULOS_DE_ERRO } from '../constantes';
import { logger, redigir } from '../log';
import { contextoAtual } from './correlacao';

export class NaoAutorizado extends Error {}
export class NaoEncontrado extends Error {}
export class Proibido extends Error {}
export class RegraDeNegocio extends Error {}

export type StatusDeErro = 400 | 401 | 403 | 404 | 422 | 500;

export type RenderizadorDeErro = (status: StatusDeErro, correlacaoId: string) => string;

let renderizador: RenderizadorDeErro | null = null;

export function registrarRenderizadorDeErro(f: RenderizadorDeErro): void {
  renderizador = f;
}

const escaparHtml = (texto: string): string =>
  texto
    .replace(/&/g, ENTIDADES_HTML.ecomercial)
    .replace(/</g, ENTIDADES_HTML.menorQue)
    .replace(/>/g, ENTIDADES_HTML.maiorQue)
    .replace(/"/g, ENTIDADES_HTML.aspasDuplas);

const PAGINA_DE_RESERVA = (titulo: string, correlacaoId: string): string =>
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  `<title>${titulo}</title></head><body><main><h1>${titulo}</h1>` +
  `<p>Informe este código ao pedir ajuda: <code>${correlacaoId}</code></p>` +
  '<p><a href="/">Voltar ao início</a></p></main></body></html>';

const paginaMinima = (status: StatusDeErro, correlacaoId: string): string =>
  PAGINA_DE_RESERVA(escaparHtml(TITULOS_DE_ERRO[status]), escaparHtml(correlacaoId));

export function paginaDeErro(status: StatusDeErro): string {
  const correlacaoId = contextoAtual()?.correlacaoId ?? '';
  if (renderizador === null) return paginaMinima(status, correlacaoId);
  return renderizador(status, correlacaoId);
}

const statusDoErro = (erro: unknown): StatusDeErro => {
  if (erro instanceof NaoAutorizado) return 401;
  if (erro instanceof Proibido) return 403;
  if (erro instanceof NaoEncontrado) return 404;
  if (erro instanceof RegraDeNegocio) return 422;
  return 500;
};

const registrarFalha = (c: Context, status: StatusDeErro, erro: unknown): void => {
  const base = {
    status,
    metodo: c.req.method,
    rota: c.req.path,
    tipo: erro instanceof Error ? erro.constructor.name : typeof erro,
    mensagem: erro instanceof Error ? erro.message : String(erro),
  };
  const campos = redigir(status === 500 && erro instanceof Error ? { ...base, pilha: erro.stack } : base);
  if (status === 500) {
    logger.error(campos, EVENTOS_DE_LOG_HTTP.falhaAoAtender);
    return;
  }
  logger.warn(campos, EVENTOS_DE_LOG_HTTP.requisicaoRecusada);
};

export const middlewareErros: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (erro) {
    const status = statusDoErro(erro);
    registrarFalha(c, status, erro);
    return c.html(paginaDeErro(status), status);
  }
};
