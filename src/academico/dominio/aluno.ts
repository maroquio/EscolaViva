export type Aluno = {
  id: string;
  redeId: string;
  nome: string;
  dataNascimento: string;
};

type PartesDaData = { ano: number; mes: number; dia: number };

const INICIO_DO_ANO = 0;
const FIM_DO_ANO = 4;
const INICIO_DO_MES = 5;
const FIM_DO_MES = 7;
const INICIO_DO_DIA = 8;
const FIM_DO_DIA = 10;

function partesDaData(data: string): PartesDaData {
  return {
    ano: Number(data.slice(INICIO_DO_ANO, FIM_DO_ANO)),
    mes: Number(data.slice(INICIO_DO_MES, FIM_DO_MES)),
    dia: Number(data.slice(INICIO_DO_DIA, FIM_DO_DIA)),
  };
}

export function idadeEm(dataNascimento: string, data: string): number {
  const nascimento = partesDaData(dataNascimento);
  const referencia = partesDaData(data);
  const aniversarioJaOcorreu =
    referencia.mes > nascimento.mes ||
    (referencia.mes === nascimento.mes && referencia.dia >= nascimento.dia);
  return referencia.ano - nascimento.ano - (aniversarioJaOcorreu ? 0 : 1);
}
