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

/**
 * A única porta de entrada do módulo: quem estuda, onde e com quem. Casos de uso devolvem
 * `Resultado`; consultas devolvem o valor direto. Nada aqui expõe linha de banco.
 */
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
