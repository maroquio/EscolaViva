/**
 * Paginação — a régua que impede uma tela de crescer junto com a tabela.
 *
 * Uma lista sem recorte é uma promessa que o banco não pode cumprir: a tela de responsáveis abre
 * em 40 ms com trinta linhas e derruba a requisição com trinta mil. O recorte não é enfeite de
 * interface, é o que mantém o custo de uma tela constante enquanto a rede cresce.
 *
 * Este módulo não conhece banco nem HTTP. Ele descreve o recorte (`Faixa`), o resultado
 * (`Pagina`) e a ordem em que as duas consultas acontecem — quem sabe consultar é o repositório,
 * e é ele que chega aqui como função.
 */

/** Dez linhas: a tabela inteira cabe na tela sem rolagem interna e a contagem segue legível. */
export const TAMANHO_PADRAO = 10;

/** O recorte como o SQL o entende. `deslocamento` já vem calculado a partir da página. */
export type Faixa = {
  readonly limite: number;
  readonly deslocamento: number;
};

/**
 * O que a tela recebe. `total` é o tamanho da lista inteira, não o da página — sem ele não há
 * como dizer "20 de 137" nem como saber que existe uma próxima página.
 */
export type Pagina<T> = {
  readonly itens: readonly T[];
  readonly total: number;
  readonly pagina: number;
  readonly tamanho: number;
  readonly paginas: number;
};

/** Número de página que veio de fora: texto, zero, negativo e fração viram a primeira. */
export function paginaPedida(bruto: string | undefined | null): number {
  const numero = Number(bruto);
  if (!Number.isFinite(numero)) return 1;
  return Math.max(1, Math.trunc(numero));
}

export function faixaDe(pagina: number, tamanho: number = TAMANHO_PADRAO): Faixa {
  return { limite: tamanho, deslocamento: (Math.max(1, pagina) - 1) * tamanho };
}

/**
 * A faixa como parâmetro de consulta. Ausente vira `null` nos dois campos porque `LIMIT NULL` e
 * `OFFSET NULL` são, para o PostgreSQL, o mesmo que não escrever a cláusula: uma consulta só
 * atende a lista inteira e o recorte, sem SQL montado por concatenação.
 */
export function recorte(faixa?: Faixa): { limite: number | null; deslocamento: number | null } {
  if (faixa === undefined) return { limite: null, deslocamento: null };
  return { limite: faixa.limite, deslocamento: faixa.deslocamento };
}

/** Lista vazia continua tendo uma página: a tela mostra "1 de 1", e não "1 de 0". */
export function totalDePaginas(total: number, tamanho: number): number {
  return Math.max(1, Math.ceil(total / tamanho));
}

export function paginaVazia<T>(tamanho: number = TAMANHO_PADRAO): Pagina<T> {
  return { itens: [], total: 0, pagina: 1, tamanho, paginas: 1 };
}

/**
 * Monta a página consultando contagem e recorte.
 *
 * As duas consultas partem juntas porque o caminho comum é a página existir — esperar a contagem
 * para só então pedir as linhas dobraria a latência de toda tela do sistema. A segunda busca só
 * acontece quando a página pedida passou do fim (URL digitada à mão, ou lista que encolheu entre
 * dois cliques): nesse caso a última página é servida no lugar de uma tela vazia que não explica
 * a si mesma.
 */
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

/**
 * O recorte de uma lista que já está inteira em memória.
 *
 * Existe para as poucas listas que não nascem de uma consulta — as unidades em que a pessoa tem
 * papel vêm da sessão, e não há SQL onde pendurar um LIMIT. Fora desses casos, paginar em memória
 * é enganoso: a tela encurta e o banco continua lendo tudo.
 */
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
