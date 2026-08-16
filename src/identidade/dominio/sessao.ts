import { TEMPO } from '../../shared/constants';

export type Sessao = {
  id: string;
  redeId: string;
  usuarioId: string;
  criadoEm: Date;
  expiraEm: Date;
  ip: string | null;
};

export function expiracaoDaSessao(agora: Date, duracaoHoras: number): Date {
  return new Date(agora.getTime() + duracaoHoras * TEMPO.msPorHora);
}

export function sessaoExpirou(sessao: Sessao, agora: Date): boolean {
  return sessao.expiraEm.getTime() <= agora.getTime();
}
