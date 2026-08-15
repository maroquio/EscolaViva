import { CHAVES_PROIBIDAS, LOG } from '../constantes';

export type CamposDeLog = Record<string, unknown>;

export { CHAVES_PROIBIDAS } from '../constantes';

const PROIBIDAS = new Set(CHAVES_PROIBIDAS.map((chave) => chave.toLowerCase()));

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
  if (profundidade >= LOG.profundidadeMaxima) return LOG.valorRedigido;
  if (visitados.has(valor)) return LOG.valorRedigido;

  visitados.add(valor);
  const redigido = ehLista(valor)
    ? valor.map((item) => redigirValor(item, profundidade + 1, visitados))
    : redigirRamo(valor, profundidade + 1, visitados);
  visitados.delete(valor);
  return redigido;
}

function ehLista(valor: unknown): valor is readonly unknown[] {
  return Array.isArray(valor);
}

function ehObjetoSimples(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null) return false;
  const prototipo: unknown = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}
