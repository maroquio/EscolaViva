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

/**
 * I1: única porta de entrada de `avaliacao`. Nota, frequência e fechamento só existem para quem
 * importa este arquivo — `dominio/`, `aplicacao/` e `infra/` são privados do módulo.
 *
 * O que muda estado devolve `Resultado`; consulta devolve o valor direto. Nada aqui devolve linha
 * de banco crua.
 */
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
