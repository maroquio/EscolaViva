import { leitura } from '../../shared/db';
import { TAMANHO_PADRAO, consultarPagina, type Pagina } from '../../shared/paginacao';
import type { Aluno } from '../dominio/aluno';
import type { AnoLetivo } from '../dominio/anoLetivo';
import type { Disciplina } from '../dominio/disciplina';
import type { Matricula } from '../dominio/matricula';
import type { Responsavel, VinculoResponsavel } from '../dominio/responsavel';
import type { Turma, TurmaDisciplina, TurmaDisciplinaDoProfessor } from '../dominio/turma';
import type { FiltroDeTurma } from '../infra/turmaRepositorio';
import * as alunos from '../infra/alunoRepositorio';
import * as anosLetivos from '../infra/anoLetivoRepositorio';
import * as disciplinas from '../infra/disciplinaRepositorio';
import * as matriculas from '../infra/matriculaRepositorio';
import * as responsaveis from '../infra/responsavelRepositorio';
import * as turmas from '../infra/turmaRepositorio';

export type { FiltroDeTurma } from '../infra/turmaRepositorio';

export type ContagemDaUnidade = {
  readonly turmas: number;
  readonly matriculas: number;
  readonly responsaveis: number;
};

export function listarAnosLetivos(redeId: string): Promise<AnoLetivo[]> {
  return anosLetivos.listar(leitura(), redeId);
}

export function paginaDeAnosLetivos(
  redeId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<AnoLetivo>> {
  const sql = leitura();
  return consultarPagina(
    pagina,
    tamanho,
    () => anosLetivos.contar(sql, redeId),
    (faixa) => anosLetivos.listar(sql, redeId, faixa),
  );
}

export function listarDisciplinas(redeId: string): Promise<Disciplina[]> {
  return disciplinas.listar(leitura(), redeId);
}

export function paginaDeDisciplinas(
  redeId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<Disciplina>> {
  const sql = leitura();
  return consultarPagina(
    pagina,
    tamanho,
    () => disciplinas.contar(sql, redeId),
    (faixa) => disciplinas.listar(sql, redeId, faixa),
  );
}

export function listarTurmas(redeId: string, filtro?: FiltroDeTurma): Promise<Turma[]> {
  return turmas.listar(leitura(), redeId, filtro);
}

export function paginaDeTurmas(
  redeId: string,
  filtro: FiltroDeTurma,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<Turma>> {
  const sql = leitura();
  return consultarPagina(
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
  const sql = leitura();
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
  const sql = leitura();
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
  return turmas.porId(leitura(), redeId, turmaId);
}

export function listarTurmaDisciplinas(
  redeId: string,
  turmaId: string,
): Promise<TurmaDisciplina[]> {
  return turmas.listarDisciplinas(leitura(), redeId, turmaId);
}

export function paginaDeTurmaDisciplinas(
  redeId: string,
  turmaId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<TurmaDisciplina>> {
  const sql = leitura();
  return consultarPagina(
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

export function paginaDeAlunos(
  redeId: string,
  termo: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<Aluno>> {
  const sql = leitura();
  return consultarPagina(
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
  return matriculas.ativasDosAlunos(leitura(), redeId, alunoIds, unidadeIds);
}

export function alunoPorId(redeId: string, alunoId: string): Promise<Aluno | null> {
  return alunos.porId(leitura(), redeId, alunoId);
}

export function listarResponsaveis(redeId: string): Promise<Responsavel[]> {
  return responsaveis.listar(leitura(), redeId);
}

export function paginaDeResponsaveis(
  redeId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<Responsavel>> {
  const sql = leitura();
  return consultarPagina(
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
  return responsaveis.porId(leitura(), redeId, responsavelId);
}

export function responsaveisDoAluno(
  redeId: string,
  alunoId: string,
): Promise<VinculoResponsavel[]> {
  return responsaveis.doAluno(leitura(), redeId, alunoId);
}

export function paginaDeResponsaveisDoAluno(
  redeId: string,
  alunoId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<VinculoResponsavel>> {
  const sql = leitura();
  return consultarPagina(
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
  return responsaveis.daUnidade(leitura(), redeId, unidadeId);
}

export function matriculaPorId(redeId: string, matriculaId: string): Promise<Matricula | null> {
  return matriculas.porId(leitura(), redeId, matriculaId);
}

export function matriculasAtivasDaTurma(redeId: string, turmaId: string): Promise<Matricula[]> {
  return matriculas.ativasDaTurma(leitura(), redeId, turmaId);
}

export function paginaDeMatriculasAtivasDaTurma(
  redeId: string,
  turmaId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<Matricula>> {
  const sql = leitura();
  return consultarPagina(
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
  return matriculas.doResponsavel(leitura(), redeId, responsavelId);
}

export function paginaDeMatriculasDoResponsavel(
  redeId: string,
  responsavelId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<Matricula>> {
  const sql = leitura();
  return consultarPagina(
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
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<Matricula>> {
  const sql = leitura();
  return consultarPagina(
    pagina,
    tamanho,
    () => matriculas.contarDoAlunoNasUnidades(sql, redeId, alunoId, unidadeIds),
    (faixa) => matriculas.doAlunoNasUnidades(sql, redeId, alunoId, unidadeIds, faixa),
  );
}

export function alunoTemMatricula(redeId: string, alunoId: string): Promise<boolean> {
  return matriculas.temAlgumaMatricula(leitura(), redeId, alunoId);
}
