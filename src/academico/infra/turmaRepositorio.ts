import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import { ERROS_INTERNOS } from '../constantes';
import {
  turnoValido,
  type Turma,
  type TurmaDisciplina,
  type TurmaDisciplinaDoProfessor,
  type Turno,
} from '../dominio/turma';

type LinhaDeTurma = {
  id: string;
  rede_id: string;
  unidade_id: string;
  ano_letivo_id: string;
  nome: string;
  serie: string;
  turno: string;
};

type LinhaDeTurmaDisciplina = {
  id: string;
  rede_id: string;
  turma_id: string;
  disciplina_id: string;
  disciplina_nome: string;
  professor_usuario_id: string;
};

type LinhaDeTurmaDisciplinaDoProfessor = LinhaDeTurmaDisciplina & {
  turma_nome: string;
  serie: string;
  turno: string;
  unidade_id: string;
};

function paraTurno(valor: string): Turno {
  if (!turnoValido(valor)) throw new Error(ERROS_INTERNOS.turnoDesconhecido(valor));
  return valor;
}

const paraTurma = (linha: LinhaDeTurma): Turma => ({
  id: linha.id,
  redeId: linha.rede_id,
  unidadeId: linha.unidade_id,
  anoLetivoId: linha.ano_letivo_id,
  nome: linha.nome,
  serie: linha.serie,
  turno: paraTurno(linha.turno),
});

const paraTurmaDisciplina = (linha: LinhaDeTurmaDisciplina): TurmaDisciplina => ({
  id: linha.id,
  redeId: linha.rede_id,
  turmaId: linha.turma_id,
  disciplinaId: linha.disciplina_id,
  disciplinaNome: linha.disciplina_nome,
  professorUsuarioId: linha.professor_usuario_id,
});

const paraTurmaDisciplinaDoProfessor = (
  linha: LinhaDeTurmaDisciplinaDoProfessor,
): TurmaDisciplinaDoProfessor => ({
  ...paraTurmaDisciplina(linha),
  turmaNome: linha.turma_nome,
  serie: linha.serie,
  turno: paraTurno(linha.turno),
  unidadeId: linha.unidade_id,
});

export async function inserir(sql: Conexao, turma: Turma): Promise<boolean> {
  const criadas: { id: string }[] = await sql`
    INSERT INTO turma (id, rede_id, unidade_id, ano_letivo_id, nome, serie, turno)
    VALUES (${turma.id}, ${turma.redeId}, ${turma.unidadeId}, ${turma.anoLetivoId},
            ${turma.nome}, ${turma.serie}, ${turma.turno})
    ON CONFLICT ON CONSTRAINT turma_unica DO NOTHING
    RETURNING id`;
  return criadas.length === 1;
}

export async function porId(sql: Conexao, redeId: string, id: string): Promise<Turma | null> {
  const linhas: LinhaDeTurma[] = await sql`
    SELECT id, rede_id, unidade_id, ano_letivo_id, nome, serie, turno
      FROM turma
     WHERE rede_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraTurma(linha);
}

export type FiltroDeTurma = {
  unidadeId?: string;
  unidadeIds?: readonly string[];
  anoLetivoId?: string;
};

const condicoesDoFiltro = (sql: Conexao, filtro?: FiltroDeTurma) => ({
  unidadeId: filtro?.unidadeId ?? null,
  unidadeIds:
    filtro?.unidadeIds === undefined ? null : sql.array([...filtro.unidadeIds], 'TEXT'),
  anoLetivoId: filtro?.anoLetivoId ?? null,
});

export async function listar(
  sql: Conexao,
  redeId: string,
  filtro?: FiltroDeTurma,
  faixa?: Faixa,
): Promise<Turma[]> {
  const { unidadeId, unidadeIds, anoLetivoId } = condicoesDoFiltro(sql, filtro);
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeTurma[] = await sql`
    SELECT id, rede_id, unidade_id, ano_letivo_id, nome, serie, turno
      FROM turma
     WHERE rede_id = ${redeId}
       AND (${unidadeId}::uuid IS NULL OR unidade_id = ${unidadeId}::uuid)
       AND (${unidadeIds}::uuid[] IS NULL OR unidade_id = ANY(${unidadeIds}::uuid[]))
       AND (${anoLetivoId}::uuid IS NULL OR ano_letivo_id = ${anoLetivoId}::uuid)
     ORDER BY serie, nome
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraTurma);
}

export async function contar(
  sql: Conexao,
  redeId: string,
  filtro?: FiltroDeTurma,
): Promise<number> {
  const { unidadeId, unidadeIds, anoLetivoId } = condicoesDoFiltro(sql, filtro);
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM turma
     WHERE rede_id = ${redeId}
       AND (${unidadeId}::uuid IS NULL OR unidade_id = ${unidadeId}::uuid)
       AND (${unidadeIds}::uuid[] IS NULL OR unidade_id = ANY(${unidadeIds}::uuid[]))
       AND (${anoLetivoId}::uuid IS NULL OR ano_letivo_id = ${anoLetivoId}::uuid)`;
  return linhas[0]?.total ?? 0;
}

export async function contarPorUnidade(
  sql: Conexao,
  redeId: string,
  unidadeIds: readonly string[],
): Promise<Map<string, number>> {
  if (unidadeIds.length === 0) return new Map<string, number>();
  const linhas: { unidade_id: string; total: number }[] = await sql`
    SELECT unidade_id, count(*)::int AS total
      FROM turma
     WHERE rede_id = ${redeId}
       AND unidade_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     GROUP BY unidade_id`;
  return new Map(linhas.map((linha): [string, number] => [linha.unidade_id, linha.total]));
}

export async function inserirDisciplina(
  sql: Conexao,
  alocacao: TurmaDisciplina,
): Promise<boolean> {
  const criadas: { id: string }[] = await sql`
    INSERT INTO turma_disciplina (id, rede_id, turma_id, disciplina_id, professor_usuario_id)
    VALUES (${alocacao.id}, ${alocacao.redeId}, ${alocacao.turmaId}, ${alocacao.disciplinaId},
            ${alocacao.professorUsuarioId})
    ON CONFLICT ON CONSTRAINT disciplina_unica_na_turma DO NOTHING
    RETURNING id`;
  return criadas.length === 1;
}

export async function disciplinaPorId(
  sql: Conexao,
  redeId: string,
  id: string,
): Promise<TurmaDisciplina | null> {
  const linhas: LinhaDeTurmaDisciplina[] = await sql`
    SELECT td.id, td.rede_id, td.turma_id, td.disciplina_id, d.nome AS disciplina_nome,
           td.professor_usuario_id
      FROM turma_disciplina td
      JOIN disciplina d ON d.id = td.disciplina_id AND d.rede_id = td.rede_id
     WHERE td.rede_id = ${redeId} AND td.id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraTurmaDisciplina(linha);
}

export async function listarDisciplinas(
  sql: Conexao,
  redeId: string,
  turmaId: string,
  faixa?: Faixa,
): Promise<TurmaDisciplina[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeTurmaDisciplina[] = await sql`
    SELECT td.id, td.rede_id, td.turma_id, td.disciplina_id, d.nome AS disciplina_nome,
           td.professor_usuario_id
      FROM turma_disciplina td
      JOIN disciplina d ON d.id = td.disciplina_id AND d.rede_id = td.rede_id
     WHERE td.rede_id = ${redeId} AND td.turma_id = ${turmaId}
     ORDER BY d.nome
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraTurmaDisciplina);
}

export async function contarDisciplinas(
  sql: Conexao,
  redeId: string,
  turmaId: string,
): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM turma_disciplina
     WHERE rede_id = ${redeId} AND turma_id = ${turmaId}`;
  return linhas[0]?.total ?? 0;
}

export async function disciplinasDoProfessor(
  sql: Conexao,
  redeId: string,
  professorUsuarioId: string,
): Promise<TurmaDisciplinaDoProfessor[]> {
  const linhas: LinhaDeTurmaDisciplinaDoProfessor[] = await sql`
    SELECT td.id, td.rede_id, td.turma_id, td.disciplina_id, d.nome AS disciplina_nome,
           td.professor_usuario_id, t.nome AS turma_nome, t.serie, t.turno, t.unidade_id
      FROM turma_disciplina td
      JOIN disciplina d ON d.id = td.disciplina_id AND d.rede_id = td.rede_id
      JOIN turma t ON t.id = td.turma_id AND t.rede_id = td.rede_id
     WHERE td.rede_id = ${redeId} AND td.professor_usuario_id = ${professorUsuarioId}
     ORDER BY t.serie, t.nome, d.nome`;
  return linhas.map(paraTurmaDisciplinaDoProfessor);
}

export async function doProfessor(
  sql: Conexao,
  redeId: string,
  professorUsuarioId: string,
): Promise<Turma[]> {
  const linhas: LinhaDeTurma[] = await sql`
    SELECT DISTINCT t.id, t.rede_id, t.unidade_id, t.ano_letivo_id, t.nome, t.serie, t.turno
      FROM turma t
      JOIN turma_disciplina td ON td.turma_id = t.id AND td.rede_id = t.rede_id
     WHERE t.rede_id = ${redeId} AND td.professor_usuario_id = ${professorUsuarioId}
     ORDER BY t.serie, t.nome`;
  return linhas.map(paraTurma);
}
