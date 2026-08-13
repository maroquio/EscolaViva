import { leitura } from '../../shared/db';
import type { Aluno } from '../dominio/aluno';
import type { AnoLetivo } from '../dominio/anoLetivo';
import type { Disciplina } from '../dominio/disciplina';
import type { Matricula } from '../dominio/matricula';
import type { Responsavel, VinculoResponsavel } from '../dominio/responsavel';
import type { Turma, TurmaDisciplina, TurmaDisciplinaDoProfessor } from '../dominio/turma';
import * as alunos from '../infra/alunoRepositorio';
import * as anosLetivos from '../infra/anoLetivoRepositorio';
import * as disciplinas from '../infra/disciplinaRepositorio';
import * as matriculas from '../infra/matriculaRepositorio';
import * as responsaveis from '../infra/responsavelRepositorio';
import * as turmas from '../infra/turmaRepositorio';

// I15: cada consulta declara a intenção escolhendo a conexão de leitura. Hoje as duas apontam
// para o primário, e é dentro de `leitura()` que a réplica entrará — não aqui.

export function listarAnosLetivos(redeId: string): Promise<AnoLetivo[]> {
  return anosLetivos.listar(leitura(), redeId);
}

export function listarDisciplinas(redeId: string): Promise<Disciplina[]> {
  return disciplinas.listar(leitura(), redeId);
}

export function listarTurmas(
  redeId: string,
  filtro?: { unidadeId?: string; anoLetivoId?: string },
): Promise<Turma[]> {
  return turmas.listar(leitura(), redeId, filtro);
}

export function turmaPorId(redeId: string, turmaId: string): Promise<Turma | null> {
  return turmas.porId(leitura(), redeId, turmaId);
}

export function listarTurmaDisciplinas(
  redeId: string,
  turmaId: string,
): Promise<TurmaDisciplina[]> {
  return turmas.listarDisciplinas(leitura(), redeId, turmaId);
}

export function turmaDisciplinaPorId(
  redeId: string,
  id: string,
): Promise<TurmaDisciplina | null> {
  return turmas.disciplinaPorId(leitura(), redeId, id);
}

export function turmaDisciplinasDoProfessor(
  redeId: string,
  professorUsuarioId: string,
): Promise<TurmaDisciplinaDoProfessor[]> {
  return turmas.disciplinasDoProfessor(leitura(), redeId, professorUsuarioId);
}

export function turmasDoProfessor(
  redeId: string,
  professorUsuarioId: string,
): Promise<Turma[]> {
  return turmas.doProfessor(leitura(), redeId, professorUsuarioId);
}

export function buscarAlunos(redeId: string, termo: string): Promise<Aluno[]> {
  return alunos.buscar(leitura(), redeId, termo);
}

export function alunoPorId(redeId: string, alunoId: string): Promise<Aluno | null> {
  return alunos.porId(leitura(), redeId, alunoId);
}

export function listarResponsaveis(redeId: string): Promise<Responsavel[]> {
  return responsaveis.listar(leitura(), redeId);
}

export function responsaveisDoAluno(
  redeId: string,
  alunoId: string,
): Promise<VinculoResponsavel[]> {
  return responsaveis.doAluno(leitura(), redeId, alunoId);
}

export function responsaveisDaUnidade(
  redeId: string,
  unidadeId: string,
): Promise<{ id: string; nome: string }[]> {
  return responsaveis.daUnidade(leitura(), redeId, unidadeId);
}

export function matriculaPorId(redeId: string, matriculaId: string): Promise<Matricula | null> {
  return matriculas.porId(leitura(), redeId, matriculaId);
}

export function matriculasAtivasDaTurma(redeId: string, turmaId: string): Promise<Matricula[]> {
  return matriculas.ativasDaTurma(leitura(), redeId, turmaId);
}

export function matriculasDoResponsavel(
  redeId: string,
  responsavelId: string,
): Promise<Matricula[]> {
  return matriculas.doResponsavel(leitura(), redeId, responsavelId);
}
