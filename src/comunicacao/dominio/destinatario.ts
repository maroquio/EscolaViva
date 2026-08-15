export type ItemDoMural = {
  comunicadoId: string;
  titulo: string;
  publicadoEm: string;
  lidoEm: string | null;
};

export type ContagemDeLeitura = {
  comunicadoId: string;
  titulo: string;
  publicadoEm: string | null;
  destinatarios: number;
  leituras: number;
};

export type EstatisticaDeLeitura = ContagemDeLeitura & { taxa: number };

export function taxaDeLeitura(destinatarios: number, leituras: number): number {
  if (destinatarios <= 0) return 0;
  return Math.min(1, Math.max(0, leituras / destinatarios));
}
