export const SITUACOES_DE_MATRICULA = [
  'ativa',
  'transferida',
  'cancelada',
  'concluida',
] as const;

export type SituacaoMatricula = (typeof SITUACOES_DE_MATRICULA)[number];

/**
 * A situação com que toda matrícula nasce, e a única que pode ser transferida.
 *
 * Derivada da lista, e não redigitada: `'ativa'` aparecia solto em `matricular.ts`, em
 * `transferir.ts` e aqui mesmo, três linhas abaixo da lista que já a declarava. Fora do domínio o
 * mesmo texto significa outra coisa — o status de uma REDE contratante também é `'ativa'` —, e é
 * essa colisão que torna a busca por texto inútil e a constante necessária.
 */
export const MATRICULA_ATIVA: SituacaoMatricula = SITUACOES_DE_MATRICULA[0];

/**
 * A matrícula amarra aluno, turma e ano letivo. Ela carrega o nome do aluno e o da turma porque
 * é assim que toda tela mostra uma matrícula — e porque nenhuma delas deve voltar ao banco só
 * para descobrir de quem é a linha que já tem em mãos.
 */
export type Matricula = {
  id: string;
  redeId: string;
  alunoId: string;
  alunoNome: string;
  turmaId: string;
  turmaNome: string;
  unidadeId: string;
  anoLetivoId: string;
  ano: number;
  dataMatricula: string;
  situacao: SituacaoMatricula;
};

/** O mesmo conjunto do CHECK `situacao_valida` no banco, aqui em forma de regra consultável. */
export function situacaoValida(valor: string): valor is SituacaoMatricula {
  return SITUACOES_DE_MATRICULA.some((situacao) => situacao === valor);
}

/** Transferir é encerrar uma matrícula ativa e abrir outra: só a ativa pode ser transferida. */
export function podeTransferir(matricula: Matricula): boolean {
  return matricula.situacao === MATRICULA_ATIVA;
}
