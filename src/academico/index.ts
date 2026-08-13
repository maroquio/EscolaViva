import { alocarProfessor } from './aplicacao/alocarProfessor';
import { cadastrarAluno } from './aplicacao/cadastrarAluno';
import { cadastrarDisciplina } from './aplicacao/cadastrarDisciplina';
import { cadastrarResponsavel } from './aplicacao/cadastrarResponsavel';
import { cadastrarTurma } from './aplicacao/cadastrarTurma';
import {
  alunoPorId,
  buscarAlunos,
  listarAnosLetivos,
  listarDisciplinas,
  listarResponsaveis,
  listarTurmaDisciplinas,
  listarTurmas,
  matriculaPorId,
  matriculasAtivasDaTurma,
  matriculasDoResponsavel,
  responsaveisDaUnidade,
  responsaveisDoAluno,
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

/**
 * A única porta de entrada do módulo: quem estuda, onde e com quem. Casos de uso devolvem
 * `Resultado`; consultas devolvem o valor direto. Nada aqui expõe linha de banco.
 */
export const academico = {
  definirAnoLetivo,
  listarAnosLetivos,
  cadastrarDisciplina,
  listarDisciplinas,
  cadastrarTurma,
  listarTurmas,
  turmaPorId,
  alocarProfessor,
  listarTurmaDisciplinas,
  turmaDisciplinaPorId,
  turmaDisciplinasDoProfessor,
  turmasDoProfessor,
  cadastrarAluno,
  buscarAlunos,
  alunoPorId,
  cadastrarResponsavel,
  listarResponsaveis,
  vincularResponsavel,
  responsaveisDoAluno,
  matricular,
  transferir,
  matriculaPorId,
  matriculasAtivasDaTurma,
  matriculasDoResponsavel,
  responsaveisDaUnidade,
};
