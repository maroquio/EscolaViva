export type CamposDeLog = Record<string, unknown>;

/**
 * I17: o log carrega identificador, nunca conteúdo. Aluno é menor de idade — nome, nascimento,
 * nota e contato do responsável não podem existir em linha de log, e segredo nenhum tampouco.
 */
export const CHAVES_PROIBIDAS: readonly string[] = [
  'nome',
  'nome_completo',
  'aluno_nome',
  'email',
  'senha',
  'senha_hash',
  'senha_provisoria',
  'cpf',
  'telefone',
  'valor',
  'nota',
  'notas',
  'justificativa',
  'titulo',
  'corpo',
  'data_nascimento',
  'authorization',
  'cookie',
  'set-cookie',
  'session_secret',
  'database_url',
];

const VALOR_REDIGIDO = '[redigido]';
const PROFUNDIDADE_MAXIMA = 6;
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
      ? VALOR_REDIGIDO
      : redigirValor(valor, profundidade, visitados);
  }
  return saida;
}

function redigirValor(valor: unknown, profundidade: number, visitados: WeakSet<object>): unknown {
  if (!ehLista(valor) && !ehObjetoSimples(valor)) return valor;
  // Passado o limite não há como garantir a redação do ramo, então ele é cortado inteiro.
  if (profundidade >= PROFUNDIDADE_MAXIMA) return VALOR_REDIGIDO;
  if (visitados.has(valor)) return VALOR_REDIGIDO;

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
