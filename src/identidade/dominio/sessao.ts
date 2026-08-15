import { TEMPO } from '../../shared/constantes';

/**
 * A sessão vive em tabela, não em memória do processo (I2): derrubar um container e subir outro
 * não desloga ninguém, e o cookie assinado carrega apenas este `id`.
 */
export type Sessao = {
  id: string;
  redeId: string;
  usuarioId: string;
  criadoEm: Date;
  expiraEm: Date;
  ip: string | null;
};

/** A sessão morre pelo relógio: não há renovação por atividade no Estágio 01. */
export function expiracaoDaSessao(agora: Date, duracaoHoras: number): Date {
  return new Date(agora.getTime() + duracaoHoras * TEMPO.msPorHora);
}

export function sessaoExpirou(sessao: Sessao, agora: Date): boolean {
  return sessao.expiraEm.getTime() <= agora.getTime();
}
