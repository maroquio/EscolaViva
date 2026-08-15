import type { Context, MiddlewareHandler } from 'hono';
import { ENTIDADES_HTML, EVENTOS_DE_LOG_HTTP, TITULOS_DE_ERRO } from '../constantes';
import { logger, redigir } from '../log';
import { contextoAtual } from './correlacao';

/** Sessão ausente ou inválida. */
export class NaoAutorizado extends Error {}
/** Recurso inexistente — ou existente em outra rede, o que dá no mesmo para quem pergunta. */
export class NaoEncontrado extends Error {}
/** Usuário autenticado, papel insuficiente. */
export class Proibido extends Error {}
/** Entrada consistente, situação do domínio não permite a operação. */
export class RegraDeNegocio extends Error {}

export type StatusDeErro = 400 | 401 | 403 | 404 | 422 | 500;

export type RenderizadorDeErro = (status: StatusDeErro, correlacaoId: string) => string;

// A camada web injeta a página com layout no boot. Enquanto ninguém injeta, o HTML mínimo abaixo
// responde — um erro nunca fica sem resposta por falta de motor de template.
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

/**
 * A marcação da página de reserva: documento inteiro, sem folha de estilo e sem template.
 *
 * Recebe os dois valores JÁ ESCAPADOS — o escape é do chamador porque o título vem de uma tabela
 * e a correlação vem da requisição, e misturar as duas origens aqui dentro esconderia qual delas
 * precisa de cuidado. O idioma repete o `DOCUMENTO.idioma` da camada web por causa da fronteira
 * que impede este arquivo de olhar para cima — a mesma que levou `TITULOS_DE_ERRO` a ser declarado
 * em `shared/constantes.ts` — e não é o `LOCALE` de lá, que governa ordenação e formatação de
 * número no terminal.
 */
const PAGINA_DE_RESERVA = (titulo: string, correlacaoId: string): string =>
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  `<title>${titulo}</title></head><body><main><h1>${titulo}</h1>` +
  `<p>Informe este código ao pedir ajuda: <code>${correlacaoId}</code></p>` +
  '<p><a href="/">Voltar ao início</a></p></main></body></html>';

/**
 * Os títulos são os MESMOS que a camada web mostra, e vêm de `shared/constantes.ts` porque é o
 * lado da fronteira que os dois alcançam: `shared/` é infraestrutura e não enxerga a camada web,
 * a mesma razão pela qual `CAMINHOS_DE_ENTRADA` mora embaixo e `ROTAS.publicas` é montado a partir
 * dele. Declarar embaixo e reexportar em cima é o que mantém os seis textos existindo uma vez só.
 */
const paginaMinima = (status: StatusDeErro, correlacaoId: string): string =>
  PAGINA_DE_RESERVA(escaparHtml(TITULOS_DE_ERRO[status]), escaparHtml(correlacaoId));

/** Página de erro para o navegador: título, código de correlação e nada mais. */
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

/**
 * Detalhe de exceção é informação de operação, não de produto: fica no log, com a correlação que
 * permite achá-lo. O navegador recebe título genérico e o código — nunca pilha, SQL ou mensagem.
 */
export const middlewareErros: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (erro) {
    const status = statusDoErro(erro);
    registrarFalha(c, status, erro);
    return c.html(paginaDeErro(status), status);
  }
};
