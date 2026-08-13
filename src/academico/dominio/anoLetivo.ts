/** O calendário que amarra turma e matrícula: no acadêmico nada existe fora de um ano letivo. */
export type AnoLetivo = {
  id: string;
  redeId: string;
  ano: number;
  dataInicio: string;
  dataFim: string;
};

/**
 * Datas trafegam como texto 'AAAA-MM-DD'. Nesse formato a ordem lexicográfica é a ordem
 * cronológica, então a comparação não precisa de fuso horário nem de objeto Date — o domínio
 * fica puro e o resultado não muda conforme o relógio da máquina.
 */
export function periodoCoerente(dataInicio: string, dataFim: string): boolean {
  return dataFim > dataInicio;
}
