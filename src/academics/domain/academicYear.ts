export type AnoLetivo = {
  id: string;
  redeId: string;
  ano: number;
  dataInicio: string;
  dataFim: string;
};

export function periodoCoerente(dataInicio: string, dataFim: string): boolean {
  return dataFim > dataInicio;
}
