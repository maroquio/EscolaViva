import { CHAVES_PROIBIDAS, LOG } from '../constantes';

export type CamposDeLog = Record<string, unknown>;

/**
 * A lista mora em `shared/constantes.ts` (I17) e continua saindo por aqui: `shared/log/index.ts`
 * é a porta pública do log, e quem consome a redação não precisa saber onde ela é declarada.
 */
export { CHAVES_PROIBIDAS } from '../constantes';

const PROIBIDAS = new Set(CHAVES_PROIBIDAS.map((chave) => chave.toLowerCase()));

/** Devolve uma cópia com os valores proibidos trocados, preservando chaves e estrutura. */
export function redigir(campos: CamposDeLog): CamposDeLog {
  return redigirRamo(campos, 1, new WeakSet<object>());
}

function redigirRamo(
  objeto: Record<string, unknown>,
  profundidade: number,
  visitados: WeakSet<object>,
): CamposDeLog {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    saida[chave] = PROIBIDAS.has(chave.toLowerCase())
      ? LOG.valorRedigido
      : redigirValor(valor, profundidade, visitados);
  }
  return saida;
}

function redigirValor(valor: unknown, profundidade: number, visitados: WeakSet<object>): unknown {
  if (!ehLista(valor) && !ehObjetoSimples(valor)) return valor;
  // Passado o limite não há como garantir a redação do ramo, então ele é cortado inteiro.
  if (profundidade >= LOG.profundidadeMaxima) return LOG.valorRedigido;
  if (visitados.has(valor)) return LOG.valorRedigido;

  visitados.add(valor);
  const redigido = ehLista(valor)
    ? valor.map((item) => redigirValor(item, profundidade + 1, visitados))
    : redigirRamo(valor, profundidade + 1, visitados);
  // Sai do caminho atual: o mesmo objeto repetido em ramos irmãos não é ciclo.
  visitados.delete(valor);
  return redigido;
}

function ehLista(valor: unknown): valor is readonly unknown[] {
  return Array.isArray(valor);
}

/** Só objeto literal é percorrido; Date, Error e afins são folhas e passam inteiros. */
function ehObjetoSimples(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null) return false;
  const prototipo: unknown = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}
