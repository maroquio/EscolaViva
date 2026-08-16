import { alocarProfessor } from './application/assignTeacher';
import { cadastrarAluno } from './application/registerStudent';
import { cadastrarDisciplina } from './application/registerSubject';
import { cadastrarResponsavel } from './application/registerGuardian';
import { cadastrarTurma } from './application/registerClassGroup';
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
} from './application/queries';
import { definirAnoLetivo } from './application/defineAcademicYear';
import { matricular } from './application/enroll';
import { transferir } from './application/transfer';
import { vincularResponsavel } from './application/linkGuardian';

export type { Aluno } from './domain/student';
export type { AnoLetivo } from './domain/academicYear';
export type { Disciplina } from './domain/subject';
export type { Matricula, SituacaoMatricula } from './domain/enrollment';
export type { Responsavel, VinculoResponsavel } from './domain/guardian';
export type { Turma, TurmaDisciplina } from './domain/classGroup';
export type { ContagemDaUnidade, FiltroDeTurma } from './application/queries';

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
} from './constants';

export { MATRICULA_ATIVA, SITUACOES_DE_MATRICULA } from './domain/enrollment';
export { TURNOS } from './domain/classGroup';
