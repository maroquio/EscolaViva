/**
 * A paginação como a camada web a enxerga: um número que vem da URL e uma barra de navegação que
 * volta pronta para o template.
 *
 * O estado da página mora na query, e não em sessão nem em cookie. É o que faz a terceira página
 * da lista de responsáveis ser um endereço — copiável, marcável, e igual para quem abrir depois.
 * O botão "voltar" do navegador funciona sem que ninguém precise programá-lo.
 *
 * Cada tabela tem seu próprio parâmetro. A ficha do aluno mostra responsáveis e matrículas lado a
 * lado, e um `?p=2` só saberia dizer qual das duas avançou.
 */

import type { Context } from 'hono';
import { paginaPedida, type Pagina } from '../shared/paginacao';

/** O nome do parâmetro para a tela de uma tabela só. */
export const PARAMETRO_PADRAO = 'p';

/** Sete números cabem na barra sem quebrar a linha no celular. */
const JANELA = 7;

export type LinkDePagina = { numero: number; href: string; atual: boolean };

/**
 * Tudo o que a barra precisa, já resolvido. O template não calcula intervalo, não monta URL e não
 * decide o que desabilitar — a tela desenha o que recebe.
 */
export type Navegacao = {
  readonly parametro: string;
  readonly pagina: number;
  readonly paginas: number;
  readonly total: number;
  readonly primeiro: number;
  readonly ultimo: number;
  readonly anterior: string | null;
  readonly proxima: string | null;
  readonly links: readonly LinkDePagina[];
  readonly varias: boolean;
};

export function paginaDaQuery(c: Context, parametro: string = PARAMETRO_PADRAO): number {
  return paginaPedida(c.req.query(parametro));
}

/**
 * O endereço da página `numero` preservando o resto da query — filtro de unidade, ano letivo,
 * termo de busca e a página das outras tabelas da mesma tela continuam onde estavam.
 */
const enderecoDaPagina = (c: Context, parametro: string, numero: number): string => {
  const parametros = new URLSearchParams(c.req.query());
  if (numero <= 1) parametros.delete(parametro);
  else parametros.set(parametro, String(numero));
  const consulta = parametros.toString();
  return consulta === '' ? c.req.path : `${c.req.path}?${consulta}`;
};

/** A janela desliza para manter a página atual no meio, sem passar das pontas. */
const janelaDe = (atual: number, paginas: number): number[] => {
  if (paginas <= JANELA) return Array.from({ length: paginas }, (_, i) => i + 1);
  const metade = Math.floor(JANELA / 2);
  const inicio = Math.min(Math.max(1, atual - metade), paginas - JANELA + 1);
  return Array.from({ length: JANELA }, (_, i) => inicio + i);
};

export function navegacao(
  c: Context,
  pagina: Pagina<unknown>,
  parametro: string = PARAMETRO_PADRAO,
): Navegacao {
  const { pagina: atual, paginas, total, tamanho, itens } = pagina;
  const primeiro = total === 0 ? 0 : (atual - 1) * tamanho + 1;
  return {
    parametro,
    pagina: atual,
    paginas,
    total,
    primeiro,
    ultimo: total === 0 ? 0 : primeiro + itens.length - 1,
    anterior: atual > 1 ? enderecoDaPagina(c, parametro, atual - 1) : null,
    proxima: atual < paginas ? enderecoDaPagina(c, parametro, atual + 1) : null,
    links: janelaDe(atual, paginas).map((numero) => ({
      numero,
      href: enderecoDaPagina(c, parametro, numero),
      atual: numero === atual,
    })),
    varias: paginas > 1,
  };
}
