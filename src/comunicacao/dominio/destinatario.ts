/**
 * Destinatário é o responsável que recebeu um comunicado. `lidoEm` é a instrumentação da taxa de
 * leitura do mural: é o número que tira "ninguém lê o mural" do campo da opinião.
 */

/** Uma linha do mural do responsável: só entra aqui o que já foi publicado. */
export type ItemDoMural = {
  comunicadoId: string;
  titulo: string;
  publicadoEm: string;
  lidoEm: string | null;
};

/** O que o banco agrega por comunicado. A taxa não é coluna: é derivada na leitura (I5). */
export type ContagemDeLeitura = {
  comunicadoId: string;
  titulo: string;
  publicadoEm: string | null;
  destinatarios: number;
  leituras: number;
};

export type EstatisticaDeLeitura = ContagemDeLeitura & { taxa: number };

/**
 * Fração de 0 a 1. Comunicado sem destinatário tem taxa 0 — divisão por zero não é uma resposta,
 * e a tela que mostra a medição não pode receber `NaN`.
 */
export function taxaDeLeitura(destinatarios: number, leituras: number): number {
  if (destinatarios <= 0) return 0;
  return Math.min(1, Math.max(0, leituras / destinatarios));
}
