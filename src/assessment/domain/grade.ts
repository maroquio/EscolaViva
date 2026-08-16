import { LIMITES } from '../constants';

export type Nota = {
  matriculaId: string;
  turmaDisciplinaId: string;
  bimestre: number;
  valor: number;
};

export const BIMESTRES: readonly number[] = [1, 2, 3, 4];

export const QUANTIDADE_DE_BIMESTRES = BIMESTRES.length;

export function bimestreValido(bimestre: number): boolean {
  return Number.isInteger(bimestre) && bimestre >= 1 && bimestre <= QUANTIDADE_DE_BIMESTRES;
}

export function valorDeNotaValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= LIMITES.nota.minimo && valor <= LIMITES.nota.maximo;
}
