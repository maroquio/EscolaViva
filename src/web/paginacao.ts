import type { Context } from 'hono';
import { paginaPedida, type Pagina } from '../shared/paginacao';
import { PAGINACAO, PARAMETROS } from './constantes';

const METADE_DA_JANELA = Math.floor(PAGINACAO.janela / 2);

export type LinkDePagina = { numero: number; href: string; atual: boolean };

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

export function paginaDaQuery(c: Context, parametro: string = PARAMETROS.paginaPadrao): number {
  return paginaPedida(c.req.query(parametro));
}

const enderecoDaPagina = (c: Context, parametro: string, numero: number): string => {
  const parametros = new URLSearchParams(c.req.query());
  if (numero <= 1) parametros.delete(parametro);
  else parametros.set(parametro, String(numero));
  const consulta = parametros.toString();
  return consulta === '' ? c.req.path : `${c.req.path}?${consulta}`;
};

const janelaDe = (atual: number, paginas: number): number[] => {
  if (paginas <= PAGINACAO.janela) return Array.from({ length: paginas }, (_, i) => i + 1);
  const inicio = Math.min(Math.max(1, atual - METADE_DA_JANELA), paginas - PAGINACAO.janela + 1);
  return Array.from({ length: PAGINACAO.janela }, (_, i) => inicio + i);
};

export function navegacao(
  c: Context,
  pagina: Pagina<unknown>,
  parametro: string = PARAMETROS.paginaPadrao,
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
