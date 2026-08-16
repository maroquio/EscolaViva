import { APROVACAO, ARITMETICA } from '../constantes';
import { QUANTIDADE_DE_BIMESTRES } from './nota';

export const SITUACOES_FINAIS = {
  emCurso: 'in_progress',
  aprovado: 'passed',
  reprovado: 'failed',
} as const;

export type SituacaoFinal = (typeof SITUACOES_FINAIS)[keyof typeof SITUACOES_FINAIS];

export type LinhaDeBoletim = {
  disciplinaNome: string;
  notas: (number | null)[];
  media: number | null;
};

export type Boletim = {
  matriculaId: string;
  alunoNome: string;
  turmaNome: string;
  ano: number;
  linhas: LinhaDeBoletim[];
  mediasPorBimestre: (number | null)[];
  mediaGeral: number | null;
  percentualFrequencia: number;
  totalDias: number;
  presencas: number;
  situacao: SituacaoFinal;
};

const emCentesimos = (valor: number): number => {
  const bruto = valor * ARITMETICA.centesimos;
  const inteiro = Math.round(bruto);
  return Math.abs(bruto - inteiro) <= ARITMETICA.toleranciaDeRepresentacao
    ? inteiro
    : Math.floor(bruto);
};

const truncarEmCentesimos = (centesimos: number): number =>
  Math.floor(centesimos) / ARITMETICA.centesimos;

export function mediaDaDisciplina(notas: (number | null)[]): number | null {
  if (notas.length !== QUANTIDADE_DE_BIMESTRES) return null;
  let soma = 0;
  for (const nota of notas) {
    if (nota === null) return null;
    soma += emCentesimos(nota);
  }
  return truncarEmCentesimos(soma / QUANTIDADE_DE_BIMESTRES);
}

function mediaSimples(valores: readonly (number | null)[]): number | null {
  if (valores.length === 0) return null;
  let soma = 0;
  for (const valor of valores) {
    if (valor === null) return null;
    soma += emCentesimos(valor);
  }
  return truncarEmCentesimos(soma / valores.length);
}

export function mediaGeral(medias: (number | null)[]): number | null {
  return mediaSimples(medias);
}

export function mediasPorBimestre(linhas: readonly LinhaDeBoletim[]): (number | null)[] {
  return Array.from({ length: QUANTIDADE_DE_BIMESTRES }, (_, indice) =>
    mediaSimples(linhas.map((linha) => linha.notas[indice] ?? null)),
  );
}

export function percentualFrequencia(presencas: number, total: number): number {
  if (total <= 0) return 0;
  return truncarEmCentesimos((presencas * ARITMETICA.percentual * ARITMETICA.centesimos) / total);
}

export function situacaoFinal(
  media: number | null,
  frequencia: number,
  todosFechados: boolean,
): SituacaoFinal {
  if (!todosFechados || media === null) return SITUACOES_FINAIS.emCurso;
  const aprovado =
    emCentesimos(media) >= APROVACAO.mediaMinimaEmCentesimos &&
    emCentesimos(frequencia) >= APROVACAO.frequenciaMinimaEmCentesimos;
  return aprovado ? SITUACOES_FINAIS.aprovado : SITUACOES_FINAIS.reprovado;
}
