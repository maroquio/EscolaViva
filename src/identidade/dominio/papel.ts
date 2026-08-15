import { ERROS_INTERNOS } from '../constantes';

export const PAPEIS = ['admin_rede', 'secretaria', 'professor', 'responsavel'] as const;

export type Papel = (typeof PAPEIS)[number];

export type PapelEmUnidade = { unidadeId: string; unidadeNome: string; papel: Papel };

export function papelValido(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor);
}

export function paraPapel(valor: string): Papel {
  if (!papelValido(valor)) throw new Error(ERROS_INTERNOS.papelForaDoDominio(valor));
  return valor;
}
