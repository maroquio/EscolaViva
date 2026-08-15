export type Aluno = {
  id: string;
  redeId: string;
  nome: string;
  dataNascimento: string;
};

type PartesDaData = { ano: number; mes: number; dia: number };

/**
 * Onde 'AAAA-MM-DD' corta. Estes números ficam NESTE arquivo, e não em `constantes.ts`: eles não
 * são política do produto — são a posição de cada campo dentro do formato ISO, e mudá-los não é
 * "ajustar um limite", é passar a ler outra notação de data. Os pares saltam o separador, e é por
 * isso que o fim de um não é o início do seguinte.
 */
const INICIO_DO_ANO = 0;
const FIM_DO_ANO = 4;
const INICIO_DO_MES = 5;
const FIM_DO_MES = 7;
const INICIO_DO_DIA = 8;
const FIM_DO_DIA = 10;

/** As duas datas chegam no formato canônico 'AAAA-MM-DD', validado na borda pelo caso de uso. */
function partesDaData(data: string): PartesDaData {
  return {
    ano: Number(data.slice(INICIO_DO_ANO, FIM_DO_ANO)),
    mes: Number(data.slice(INICIO_DO_MES, FIM_DO_MES)),
    dia: Number(data.slice(INICIO_DO_DIA, FIM_DO_DIA)),
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
