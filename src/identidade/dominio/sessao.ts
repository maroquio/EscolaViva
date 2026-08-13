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

const MILISSEGUNDOS_POR_HORA = 3_600_000;

/** A sessão morre pelo relógio: não há renovação por atividade no Estágio 01. */
export function expiracaoDaSessao(agora: Date, duracaoHoras: number): Date {
  return new Date(agora.getTime() + duracaoHoras * MILISSEGUNDOS_POR_HORA);
}

export function sessaoExpirou(sessao: Sessao, agora: Date): boolean {
  return sessao.expiraEm.getTime() <= agora.getTime();
}
