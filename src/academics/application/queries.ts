import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { Aluno } from '../domain/student';
import type { AnoLetivo } from '../domain/academicYear';
import type { Disciplina } from '../domain/subject';
import type { Matricula } from '../domain/enrollment';
import type { Responsavel, VinculoResponsavel } from '../domain/guardian';
import type { Turma, TurmaDisciplina, TurmaDisciplinaDoProfessor } from '../domain/classGroup';
import type { FiltroDeTurma } from '../infra/classGroupRepository';
import * as alunos from '../infra/studentRepository';
import * as anosLetivos from '../infra/academicYearRepository';
import * as disciplinas from '../infra/subjectRepository';
import * as matriculas from '../infra/enrollmentRepository';
import * as responsaveis from '../infra/guardianRepository';
import * as turmas from '../infra/classGroupRepository';

export type { FiltroDeTurma } from '../infra/classGroupRepository';

export type ContagemDaUnidade = {
  readonly turmas: number;
  readonly matriculas: number;
  readonly responsaveis: number;
};

export function listarAnosLetivos(redeId: string): Promise<AnoLetivo[]> {
  return anosLetivos.listar(reader(), redeId);
}

export function paginaDeAnosLetivos(
  redeId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<AnoLetivo>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => anosLetivos.contar(sql, redeId),
    (faixa) => anosLetivos.listar(sql, redeId, faixa),
  );
}

export function listarDisciplinas(redeId: string): Promise<Disciplina[]> {
  return disciplinas.listar(reader(), redeId);
}

export function paginaDeDisciplinas(
  redeId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Disciplina>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => disciplinas.contar(sql, redeId),
    (faixa) => disciplinas.listar(sql, redeId, faixa),
  );
}

export function listarTurmas(redeId: string, filtro?: FiltroDeTurma): Promise<Turma[]> {
  return turmas.listar(reader(), redeId, filtro);
}

export function paginaDeTurmas(
  redeId: string,
  filtro: FiltroDeTurma,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Turma>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => turmas.contar(sql, redeId, filtro),
    (faixa) => turmas.listar(sql, redeId, filtro, faixa),
  );
}

export async function totaisDoAlcance(
  redeId: string,
  unidadeIds: readonly string[],
): Promise<{ turmas: number; matriculas: number; responsaveis: number; disciplinas: number }> {
  const sql = reader();
  const [porTurma, porMatricula, quantosResponsaveis, quantasDisciplinas] = await Promise.all([
    turmas.contarPorUnidade(sql, redeId, unidadeIds),
    matriculas.contarAtivasPorUnidade(sql, redeId, unidadeIds),
    responsaveis.contarNasUnidades(sql, redeId, unidadeIds),
    disciplinas.contar(sql, redeId),
  ]);
  const somar = (contagens: ReadonlyMap<string, number>): number =>
    unidadeIds.reduce((total, id) => total + (contagens.get(id) ?? 0), 0);
  return {
    turmas: somar(porTurma),
    matriculas: somar(porMatricula),
    responsaveis: quantosResponsaveis,
    disciplinas: quantasDisciplinas,
  };
}

export async function contagensPorUnidade(
  redeId: string,
  unidadeIds: readonly string[],
): Promise<Map<string, ContagemDaUnidade>> {
  const sql = reader();
  const [porTurma, porMatricula, porResponsavel] = await Promise.all([
    turmas.contarPorUnidade(sql, redeId, unidadeIds),
    matriculas.contarAtivasPorUnidade(sql, redeId, unidadeIds),
    responsaveis.contarPorUnidade(sql, redeId, unidadeIds),
  ]);
  return new Map(
    unidadeIds.map((unidadeId): [string, ContagemDaUnidade] => [
      unidadeId,
      {
        turmas: porTurma.get(unidadeId) ?? 0,
        matriculas: porMatricula.get(unidadeId) ?? 0,
        responsaveis: porResponsavel.get(unidadeId) ?? 0,
      },
    ]),
  );
}

export function turmaPorId(redeId: string, turmaId: string): Promise<Turma | null> {
  return turmas.porId(reader(), redeId, turmaId);
}

export function listarTurmaDisciplinas(
  redeId: string,
  turmaId: string,
): Promise<TurmaDisciplina[]> {
  return turmas.listarDisciplinas(reader(), redeId, turmaId);
}

export function paginaDeTurmaDisciplinas(
  redeId: string,
  turmaId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<TurmaDisciplina>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => turmas.contarDisciplinas(sql, redeId, turmaId),
    (faixa) => turmas.listarDisciplinas(sql, redeId, turmaId, faixa),
  );
}

export function turmaDisciplinaPorId(
  redeId: string,
  id: string,
): Promise<TurmaDisciplina | null> {
  return turmas.disciplinaPorId(reader(), redeId, id);
}

export function turmaDisciplinasDoProfessor(
  redeId: string,
  professorUsuarioId: string,
): Promise<TurmaDisciplinaDoProfessor[]> {
  return turmas.disciplinasDoProfessor(reader(), redeId, professorUsuarioId);
}

export function turmasDoProfessor(
  redeId: string,
  professorUsuarioId: string,
): Promise<Turma[]> {
  return turmas.doProfessor(reader(), redeId, professorUsuarioId);
}

export function buscarAlunos(redeId: string, termo: string): Promise<Aluno[]> {
  return alunos.buscar(reader(), redeId, termo);
}

export function paginaDeAlunos(
  redeId: string,
  termo: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Aluno>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => alunos.contarBusca(sql, redeId, termo),
    (faixa) => alunos.buscar(sql, redeId, termo, faixa),
  );
}

export function matriculasAtivasDosAlunos(
  redeId: string,
  alunoIds: readonly string[],
  unidadeIds: readonly string[],
): Promise<Matricula[]> {
  return matriculas.ativasDosAlunos(reader(), redeId, alunoIds, unidadeIds);
}

export function alunoPorId(redeId: string, alunoId: string): Promise<Aluno | null> {
  return alunos.porId(reader(), redeId, alunoId);
}

export function listarResponsaveis(redeId: string): Promise<Responsavel[]> {
  return responsaveis.listar(reader(), redeId);
}

export function paginaDeResponsaveis(
  redeId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Responsavel>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => responsaveis.contar(sql, redeId),
    (faixa) => responsaveis.listar(sql, redeId, faixa),
  );
}

export function responsavelPorId(
  redeId: string,
  responsavelId: string,
): Promise<Responsavel | null> {
  return responsaveis.porId(reader(), redeId, responsavelId);
}

export function responsaveisDoAluno(
  redeId: string,
  alunoId: string,
): Promise<VinculoResponsavel[]> {
  return responsaveis.doAluno(reader(), redeId, alunoId);
}

export function paginaDeResponsaveisDoAluno(
  redeId: string,
  alunoId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<VinculoResponsavel>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => responsaveis.contarDoAluno(sql, redeId, alunoId),
    (faixa) => responsaveis.doAluno(sql, redeId, alunoId, faixa),
  );
}

export function responsaveisDaUnidade(
  redeId: string,
  unidadeId: string,
): Promise<{ id: string; nome: string }[]> {
  return responsaveis.daUnidade(reader(), redeId, unidadeId);
}

export function matriculaPorId(redeId: string, matriculaId: string): Promise<Matricula | null> {
  return matriculas.porId(reader(), redeId, matriculaId);
}

export function matriculasAtivasDaTurma(redeId: string, turmaId: string): Promise<Matricula[]> {
  return matriculas.ativasDaTurma(reader(), redeId, turmaId);
}

export function paginaDeMatriculasAtivasDaTurma(
  redeId: string,
  turmaId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Matricula>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => matriculas.contarAtivasDaTurma(sql, redeId, turmaId),
    (faixa) => matriculas.ativasDaTurma(sql, redeId, turmaId, faixa),
  );
}

export function matriculasDoResponsavel(
  redeId: string,
  responsavelId: string,
): Promise<Matricula[]> {
  return matriculas.doResponsavel(reader(), redeId, responsavelId);
}

export function paginaDeMatriculasDoResponsavel(
  redeId: string,
  responsavelId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Matricula>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => matriculas.contarDoResponsavel(sql, redeId, responsavelId),
    (faixa) => matriculas.doResponsavel(sql, redeId, responsavelId, faixa),
  );
}

export function paginaDeMatriculasDoAluno(
  redeId: string,
  alunoId: string,
  unidadeIds: readonly string[],
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Matricula>> {
  const sql = reader();
  return queryPage(
    pagina,
    tamanho,
    () => matriculas.contarDoAlunoNasUnidades(sql, redeId, alunoId, unidadeIds),
    (faixa) => matriculas.doAlunoNasUnidades(sql, redeId, alunoId, unidadeIds, faixa),
  );
}

export function alunoTemMatricula(redeId: string, alunoId: string): Promise<boolean> {
  return matriculas.temAlgumaMatricula(reader(), redeId, alunoId);
}
