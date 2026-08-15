import { alocarProfessor } from './aplicacao/alocarProfessor';
import { cadastrarAluno } from './aplicacao/cadastrarAluno';
import { cadastrarDisciplina } from './aplicacao/cadastrarDisciplina';
import { cadastrarResponsavel } from './aplicacao/cadastrarResponsavel';
import { cadastrarTurma } from './aplicacao/cadastrarTurma';
import {
  alunoPorId,
  alunoTemMatricula,
  buscarAlunos,
  contagensPorUnidade,
  listarAnosLetivos,
  listarDisciplinas,
  listarResponsaveis,
  listarTurmaDisciplinas,
  listarTurmas,
  matriculaPorId,
  matriculasAtivasDaTurma,
  matriculasAtivasDosAlunos,
  matriculasDoResponsavel,
  paginaDeAlunos,
  paginaDeAnosLetivos,
  paginaDeDisciplinas,
  paginaDeMatriculasAtivasDaTurma,
  paginaDeMatriculasDoAluno,
  paginaDeMatriculasDoResponsavel,
  paginaDeResponsaveis,
  paginaDeResponsaveisDoAluno,
  paginaDeTurmaDisciplinas,
  paginaDeTurmas,
  responsaveisDaUnidade,
  responsaveisDoAluno,
  responsavelPorId,
  totaisDoAlcance,
  turmaDisciplinaPorId,
  turmaDisciplinasDoProfessor,
  turmaPorId,
  turmasDoProfessor,
} from './aplicacao/consultas';
import { definirAnoLetivo } from './aplicacao/definirAnoLetivo';
import { matricular } from './aplicacao/matricular';
import { transferir } from './aplicacao/transferir';
import { vincularResponsavel } from './aplicacao/vincularResponsavel';

export type { Aluno } from './dominio/aluno';
export type { AnoLetivo } from './dominio/anoLetivo';
export type { Disciplina } from './dominio/disciplina';
export type { Matricula, SituacaoMatricula } from './dominio/matricula';
export type { Responsavel, VinculoResponsavel } from './dominio/responsavel';
export type { Turma, TurmaDisciplina } from './dominio/turma';
export type { ContagemDaUnidade, FiltroDeTurma } from './aplicacao/consultas';

export const academico = {
  definirAnoLetivo,
  listarAnosLetivos,
  paginaDeAnosLetivos,
  cadastrarDisciplina,
  listarDisciplinas,
  paginaDeDisciplinas,
  cadastrarTurma,
  listarTurmas,
  paginaDeTurmas,
  contagensPorUnidade,
  totaisDoAlcance,
  turmaPorId,
  alocarProfessor,
  listarTurmaDisciplinas,
  paginaDeTurmaDisciplinas,
  turmaDisciplinaPorId,
  turmaDisciplinasDoProfessor,
  turmasDoProfessor,
  cadastrarAluno,
  buscarAlunos,
  paginaDeAlunos,
  alunoPorId,
  alunoTemMatricula,
  cadastrarResponsavel,
  listarResponsaveis,
  responsavelPorId,
  paginaDeResponsaveis,
  vincularResponsavel,
  responsaveisDoAluno,
  paginaDeResponsaveisDoAluno,
  matricular,
  transferir,
  matriculaPorId,
  matriculasAtivasDaTurma,
  paginaDeMatriculasAtivasDaTurma,
  matriculasAtivasDosAlunos,
  matriculasDoResponsavel,
  paginaDeMatriculasDoResponsavel,
  paginaDeMatriculasDoAluno,
  responsaveisDaUnidade,
};

export {
  CAMPOS as CAMPOS_DO_ACADEMICO,
  LIMITES as LIMITES_DO_ACADEMICO,
  VOCABULARIO as VOCABULARIO_DO_ACADEMICO,
} from './constantes';

export { MATRICULA_ATIVA, SITUACOES_DE_MATRICULA } from './dominio/matricula';
export { TURNOS } from './dominio/turma';
