/*
 * A regra pedagógica do EscolaViva é código, e não configuração.
 *
 * Média final é a média aritmética simples dos quatro bimestres; aprovado com média ≥ 6,0 **e**
 * frequência ≥ 75 %. Não há peso por avaliação, recuperação, conselho de classe nem arredondamento
 * escolhido pela rede.
 *
 * O motivo é de escopo e é deliberado: parametrizar a regra troca quatro funções puras por um
 * motor de fórmulas, com tela de configuração, versão por ano letivo e histórico de qual regra
 * valia quando cada boletim foi emitido. Isso consome o semestre inteiro, é a parte do produto que
 * menos ensina sobre arquitetura, e transforma o teste de aprovação — hoje três linhas sem banco —
 * em um teste que depende de dados de configuração. Uma rede que peça outra regra é uma decisão de
 * produto, tomada uma vez, e não uma opção de tela.
 *
 * Todas as contas correm em centésimos inteiros, e média e percentual são TRUNCADOS na segunda
 * casa — nunca arredondados para cima. 5,995 vale 5,99 e reprova. Arredondar aqui aprovaria aluno
 * por artefato de ponto flutuante, e faria o número impresso no boletim divergir do número que
 * decidiu a situação.
 */

import { APROVACAO, ARITMETICA } from '../constantes';
import { QUANTIDADE_DE_BIMESTRES } from './nota';

/**
 * Os três estados possíveis do ano do aluno. Moram aqui, e não em `constantes.ts`, pela mesma razão
 * de `BIMESTRES`: são a fonte do tipo `SituacaoFinal`, e quem decide qual deles vale é a função no
 * fim deste arquivo. `VOCABULARIO.situacaoFinal` traduz cada código destes para a etiqueta que o
 * boletim imprime — são duas coisas, e é o código que atravessa o banco e a URL.
 */
export const SITUACOES_FINAIS = {
  emCurso: 'em_curso',
  aprovado: 'aprovado',
  reprovado: 'reprovado',
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

/**
 * Leva um valor para centésimos inteiros, cortando da terceira casa em diante. O arredondamento
 * só é aceito dentro da tolerância, e é essa distinção que decide a aprovação: 7,45 chega do banco
 * como 744,9999999999 e vale 745; 5,995 chega como 599,5000000001 e vale 599 — reprova.
 */
const emCentesimos = (valor: number): number => {
  const bruto = valor * ARITMETICA.centesimos;
  const inteiro = Math.round(bruto);
  return Math.abs(bruto - inteiro) <= ARITMETICA.toleranciaDeRepresentacao
    ? inteiro
    : Math.floor(bruto);
};

/**
 * Corta os centésimos fracionários de uma divisão exata entre inteiros: 599,75 vira 5,99, jamais
 * 6,00.
 */
const truncarEmCentesimos = (centesimos: number): number =>
  Math.floor(centesimos) / ARITMETICA.centesimos;

/**
 * Média de uma disciplina no ano. Bimestre sem nota devolve `null`: enquanto falta lançamento não
 * existe média, e mostrar a média dos bimestres já entregues seria inventar um número que ninguém
 * calculou.
 */
export function mediaDaDisciplina(notas: (number | null)[]): number | null {
  if (notas.length !== QUANTIDADE_DE_BIMESTRES) return null;
  let soma = 0;
  for (const nota of notas) {
    if (nota === null) return null;
    soma += emCentesimos(nota);
  }
  return truncarEmCentesimos(soma / QUANTIDADE_DE_BIMESTRES);
}

/**
 * Média aritmética simples de um conjunto já apurado, na mesma aritmética de centésimos truncados
 * do resto do arquivo. Qualquer lacuna devolve `null`: média de conjunto incompleto é número que
 * ninguém calculou.
 */
function mediaSimples(valores: readonly (number | null)[]): number | null {
  if (valores.length === 0) return null;
  let soma = 0;
  for (const valor of valores) {
    if (valor === null) return null;
    soma += emCentesimos(valor);
  }
  return truncarEmCentesimos(soma / valores.length);
}

/** Média do aluno no ano: média aritmética simples das médias das disciplinas que ele cursa. */
export function mediaGeral(medias: (number | null)[]): number | null {
  return mediaSimples(medias);
}

/**
 * Média do aluno em cada bimestre: média simples das notas de todas as disciplinas naquele
 * bimestre. Bimestre com disciplina sem nota devolve `null` pela mesma razão da média da
 * disciplina — o travessão na tabela é a lacuna, não um zero.
 *
 * Este número é de leitura, e não decide aprovação: a situação continua saindo de `mediaGeral`,
 * que é a média das médias das disciplinas. Com todas as notas lançadas os dois caminhos dão o
 * mesmo valor a menos do corte de centésimos, e é `mediaGeral` que o boletim imprime no ano.
 */
export function mediasPorBimestre(linhas: readonly LinhaDeBoletim[]): (number | null)[] {
  return Array.from({ length: QUANTIDADE_DE_BIMESTRES }, (_, indice) =>
    mediaSimples(linhas.map((linha) => linha.notas[indice] ?? null)),
  );
}

export function percentualFrequencia(presencas: number, total: number): number {
  // Sem dia de chamada registrado não há frequência apurada. Devolver 0 mantém a conta honesta —
  // o boletim mostra `presencas` e `totalDias` ao lado, então "0 de 0 dias" se lê sem ambiguidade
  // — e evita inventar presença que a escola nunca registrou.
  if (total <= 0) return 0;
  return truncarEmCentesimos((presencas * ARITMETICA.percentual * ARITMETICA.centesimos) / total);
}

export function situacaoFinal(
  media: number | null,
  frequencia: number,
  todosFechados: boolean,
): SituacaoFinal {
  // Com bimestre aberto ou disciplina sem média o ano ainda está em curso: ninguém é reprovado
  // por nota que o professor ainda não lançou.
  if (!todosFechados || media === null) return SITUACOES_FINAIS.emCurso;
  const aprovado =
    emCentesimos(media) >= APROVACAO.mediaMinimaEmCentesimos &&
    emCentesimos(frequencia) >= APROVACAO.frequenciaMinimaEmCentesimos;
  return aprovado ? SITUACOES_FINAIS.aprovado : SITUACOES_FINAIS.reprovado;
}
