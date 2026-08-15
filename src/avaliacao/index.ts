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

/**
 * As constantes do módulo que alguém de fora precisa ler, com o sufixo do dono para a travessia.
 *
 * `APROVACAO` e `ARITMETICA` saem porque o boletim IMPRIME o critério — a tela promete mostrar a
 * regra que decidiu a situação, e os dois pisos precisam chegar lá sem serem redigitados.
 * `CODIGOS` e `MENSAGENS` ficam dentro: viajam no `Resultado` e ninguém os alcança pelo nome.
 *
 * `MEIO_DIA_UTC` sai pela mesma razão que `MEIA_NOITE_UTC`: a tela de chamada NAVEGA entre datas
 * do diário, e o sufixo que ela anexa é o do módulo que decide o que é um dia de chamada.
 */
export {
  APROVACAO,
  ARITMETICA,
  CAMPOS as CAMPOS_DA_AVALIACAO,
  LIMITES as LIMITES_DA_AVALIACAO,
  MEIA_NOITE_UTC,
  MEIO_DIA_UTC,
  VOCABULARIO as VOCABULARIO_DA_AVALIACAO,
} from './constantes';

/** O conjunto de bimestres é fonte de tipo e de regra: sai de `dominio/nota.ts`. */
export { BIMESTRES } from './dominio/nota';
