import { LIMITES } from '../constantes';

/**
 * Nota de uma matrícula em uma disciplina da turma, num bimestre.
 *
 * As duas validações abaixo existem em dobro de propósito: aqui, para que o erro chegue ao
 * professor como mensagem de campo na própria tela; e no banco, como `bimestre_valido` e
 * `valor_valido`, para que nenhum caminho de escrita as contorne (I8).
 */
export type Nota = {
  matriculaId: string;
  turmaDisciplinaId: string;
  bimestre: number;
  valor: number;
};

/**
 * O ano letivo tem quatro bimestres. O número é fixo por decisão de escopo — não há rede com
 * trimestre nem semestre no EscolaViva, e tornar isso configurável arrastaria consigo média
 * ponderada, recuperação e conselho de classe.
 */
export const BIMESTRES: readonly number[] = [1, 2, 3, 4];

export const QUANTIDADE_DE_BIMESTRES = BIMESTRES.length;

export function bimestreValido(bimestre: number): boolean {
  return Number.isInteger(bimestre) && bimestre >= 1 && bimestre <= QUANTIDADE_DE_BIMESTRES;
}

/**
 * A escala vem de `LIMITES.nota`, e não de uma `const` privada daqui: o mesmo par mínimo/máximo
 * alimenta a mensagem `notaForaDaEscala` e o `min`/`max` do campo na tela do professor. Com duas
 * cópias, mudar a escala aceita a nota num lugar e a recusa no outro.
 */
export function valorDeNotaValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= LIMITES.nota.minimo && valor <= LIMITES.nota.maximo;
}
