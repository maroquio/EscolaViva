import { ERROS_INTERNOS, REDE_ATIVA } from '../constants';

export const STATUS_DE_REDE = ['active', 'suspended', 'cancelled'] as const;

export type StatusDeRede = (typeof STATUS_DE_REDE)[number];

export type Rede = { id: string; nome: string; slug: string; status: StatusDeRede };

function ehStatusDeRede(valor: string): valor is StatusDeRede {
  return (STATUS_DE_REDE as readonly string[]).includes(valor);
}

export function paraStatusDeRede(valor: string): StatusDeRede {
  if (!ehStatusDeRede(valor)) throw new Error(ERROS_INTERNOS.statusDeRedeForaDoDominio(valor));
  return valor;
}

export function redeAtiva(rede: Rede): boolean {
  return rede.status === REDE_ATIVA;
}
