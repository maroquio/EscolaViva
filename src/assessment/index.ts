import {
  boletim,
  chamadaDoDia,
  estadoDeFechamento,
  frequenciaDaMatricula,
  notasDaTurmaDisciplina,
  paginaDeFrequencia,
} from './application/queries';
import { fecharBimestre } from './application/closeTerm';
import { lancarNotas } from './application/postGrades';
import { registrarChamada } from './application/recordRollCall';

export type { Boletim, LinhaDeBoletim } from './domain/reportCard';
export type { EstadoDeFechamento } from './domain/termClosing';
export type { LinhaDeChamada, ResumoFrequencia } from './domain/attendance';
export type { Nota } from './domain/grade';

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
} from './constants';

export { BIMESTRES } from './domain/grade';
