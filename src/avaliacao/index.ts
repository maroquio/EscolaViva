import {
  boletim,
  chamadaDoDia,
  estadoDeFechamento,
  frequenciaDaMatricula,
  notasDaTurmaDisciplina,
  paginaDeFrequencia,
} from './aplicacao/consultas';
import { fecharBimestre } from './aplicacao/fecharBimestre';
import { lancarNotas } from './aplicacao/lancarNotas';
import { registrarChamada } from './aplicacao/registrarChamada';

export type { Boletim, LinhaDeBoletim } from './dominio/boletim';
export type { EstadoDeFechamento } from './dominio/fechamentoBimestre';
export type { LinhaDeChamada, ResumoFrequencia } from './dominio/frequencia';
export type { Nota } from './dominio/nota';

export const avaliacao = {
  lancarNotas,
  notasDaTurmaDisciplina,
  registrarChamada,
  chamadaDoDia,
  fecharBimestre,
  estadoDeFechamento,
  boletim,
  frequenciaDaMatricula,
  paginaDeFrequencia,
};

export {
  APROVACAO,
  ARITMETICA,
  CAMPOS as CAMPOS_DA_AVALIACAO,
  LIMITES as LIMITES_DA_AVALIACAO,
  MEIA_NOITE_UTC,
  MEIO_DIA_UTC,
  ROTULO_DE_BIMESTRE,
  VOCABULARIO as VOCABULARIO_DA_AVALIACAO,
} from './constantes';

export { BIMESTRES } from './dominio/nota';
