export const SITUACOES_DE_MATRICULA = [
  'ativa',
  'transferida',
  'cancelada',
  'concluida',
] as const;

export type SituacaoMatricula = (typeof SITUACOES_DE_MATRICULA)[number];

export const MATRICULA_ATIVA: SituacaoMatricula = SITUACOES_DE_MATRICULA[0];

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

export function situacaoValida(valor: string): valor is SituacaoMatricula {
  return SITUACOES_DE_MATRICULA.some((situacao) => situacao === valor);
}

export function podeTransferir(matricula: Matricula): boolean {
  return matricula.situacao === MATRICULA_ATIVA;
}
