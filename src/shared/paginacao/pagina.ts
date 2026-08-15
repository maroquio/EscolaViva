import { TAMANHO_PADRAO } from '../constantes';

export { TAMANHO_PADRAO };

export type Faixa = {
  readonly limite: number;
  readonly deslocamento: number;
};

export type Pagina<T> = {
  readonly itens: readonly T[];
  readonly total: number;
  readonly pagina: number;
  readonly tamanho: number;
  readonly paginas: number;
};

export function paginaPedida(bruto: string | undefined | null): number {
  const numero = Number(bruto);
  if (!Number.isFinite(numero)) return 1;
  return Math.max(1, Math.trunc(numero));
}

export function faixaDe(pagina: number, tamanho: number = TAMANHO_PADRAO): Faixa {
  return { limite: tamanho, deslocamento: (Math.max(1, pagina) - 1) * tamanho };
}

export function recorte(faixa?: Faixa): { limite: number | null; deslocamento: number | null } {
  if (faixa === undefined) return { limite: null, deslocamento: null };
  return { limite: faixa.limite, deslocamento: faixa.deslocamento };
}

export function totalDePaginas(total: number, tamanho: number): number {
  return Math.max(1, Math.ceil(total / tamanho));
}

export function paginaVazia<T>(tamanho: number = TAMANHO_PADRAO): Pagina<T> {
  return { itens: [], total: 0, pagina: 1, tamanho, paginas: 1 };
}

export async function consultarPagina<T>(
  pagina: number,
  tamanho: number,
  contar: () => Promise<number>,
  buscar: (faixa: Faixa) => Promise<T[]>,
): Promise<Pagina<T>> {
  const pedida = Math.max(1, Math.trunc(pagina) || 1);
  const [total, itens] = await Promise.all([contar(), buscar(faixaDe(pedida, tamanho))]);
  const paginas = totalDePaginas(total, tamanho);
  if (pedida <= paginas) return { itens, total, pagina: pedida, tamanho, paginas };
  return {
    itens: await buscar(faixaDe(paginas, tamanho)),
    total,
    pagina: paginas,
    tamanho,
    paginas,
  };
}

export function fatiar<T>(
  itens: readonly T[],
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Pagina<T> {
  const total = itens.length;
  const paginas = totalDePaginas(total, tamanho);
  const atual = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas);
  const inicio = (atual - 1) * tamanho;
  return { itens: itens.slice(inicio, inicio + tamanho), total, pagina: atual, tamanho, paginas };
}
