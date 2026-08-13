export type Aluno = {
  id: string;
  redeId: string;
  nome: string;
  dataNascimento: string;
};

type PartesDaData = { ano: number; mes: number; dia: number };

/** As duas datas chegam no formato canônico 'AAAA-MM-DD', validado na borda pelo caso de uso. */
function partesDaData(data: string): PartesDaData {
  return {
    ano: Number(data.slice(0, 4)),
    mes: Number(data.slice(5, 7)),
    dia: Number(data.slice(8, 10)),
  };
}

/**
 * Idade em anos completos na data informada. Comparar ano, mês e dia como números evita
 * construir Date — que aplicaria o fuso da máquina e faria a idade mudar conforme o servidor.
 */
export function idadeEm(dataNascimento: string, data: string): number {
  const nascimento = partesDaData(dataNascimento);
  const referencia = partesDaData(data);
  const aniversarioJaOcorreu =
    referencia.mes > nascimento.mes ||
    (referencia.mes === nascimento.mes && referencia.dia >= nascimento.dia);
  return referencia.ano - nascimento.ano - (aniversarioJaOcorreu ? 0 : 1);
}
