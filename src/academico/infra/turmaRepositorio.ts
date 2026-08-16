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
  network_id: string;
  school_id: string;
  academic_year_id: string;
  name: string;
  grade_level: string;
  shift: string;
};

type LinhaDeTurmaDisciplina = {
  id: string;
  network_id: string;
  class_group_id: string;
  subject_id: string;
  subject_name: string;
  teacher_user_id: string;
};

type LinhaDeTurmaDisciplinaDoProfessor = LinhaDeTurmaDisciplina & {
  class_group_name: string;
  grade_level: string;
  shift: string;
  school_id: string;
};

function paraTurno(valor: string): Turno {
  if (!turnoValido(valor)) throw new Error(ERROS_INTERNOS.turnoDesconhecido(valor));
  return valor;
}

const paraTurma = (linha: LinhaDeTurma): Turma => ({
  id: linha.id,
  redeId: linha.network_id,
  unidadeId: linha.school_id,
  anoLetivoId: linha.academic_year_id,
  nome: linha.name,
  serie: linha.grade_level,
  turno: paraTurno(linha.shift),
});

const paraTurmaDisciplina = (linha: LinhaDeTurmaDisciplina): TurmaDisciplina => ({
  id: linha.id,
  redeId: linha.network_id,
  turmaId: linha.class_group_id,
  disciplinaId: linha.subject_id,
  disciplinaNome: linha.subject_name,
  professorUsuarioId: linha.teacher_user_id,
});

const paraTurmaDisciplinaDoProfessor = (
  linha: LinhaDeTurmaDisciplinaDoProfessor,
): TurmaDisciplinaDoProfessor => ({
  ...paraTurmaDisciplina(linha),
  turmaNome: linha.class_group_name,
  serie: linha.grade_level,
  turno: paraTurno(linha.shift),
  unidadeId: linha.school_id,
});

export async function inserir(sql: Conexao, turma: Turma): Promise<boolean> {
  const criadas: { id: string }[] = await sql`
    INSERT INTO class_group (id, network_id, school_id, academic_year_id, name, grade_level, shift)
    VALUES (${turma.id}, ${turma.redeId}, ${turma.unidadeId}, ${turma.anoLetivoId},
            ${turma.nome}, ${turma.serie}, ${turma.turno})
    ON CONFLICT ON CONSTRAINT class_group_unique DO NOTHING
    RETURNING id`;
  return criadas.length === 1;
}

export async function porId(sql: Conexao, redeId: string, id: string): Promise<Turma | null> {
  const linhas: LinhaDeTurma[] = await sql`
    SELECT id, network_id, school_id, academic_year_id, name, grade_level, shift
      FROM class_group
     WHERE network_id = ${redeId} AND id = ${id}`;
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
    SELECT id, network_id, school_id, academic_year_id, name, grade_level, shift
      FROM class_group
     WHERE network_id = ${redeId}
       AND (${unidadeId}::uuid IS NULL OR school_id = ${unidadeId}::uuid)
       AND (${unidadeIds}::uuid[] IS NULL OR school_id = ANY(${unidadeIds}::uuid[]))
       AND (${anoLetivoId}::uuid IS NULL OR academic_year_id = ${anoLetivoId}::uuid)
     ORDER BY grade_level, name
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
      FROM class_group
     WHERE network_id = ${redeId}
       AND (${unidadeId}::uuid IS NULL OR school_id = ${unidadeId}::uuid)
       AND (${unidadeIds}::uuid[] IS NULL OR school_id = ANY(${unidadeIds}::uuid[]))
       AND (${anoLetivoId}::uuid IS NULL OR academic_year_id = ${anoLetivoId}::uuid)`;
  return linhas[0]?.total ?? 0;
}

export async function contarPorUnidade(
  sql: Conexao,
  redeId: string,
  unidadeIds: readonly string[],
): Promise<Map<string, number>> {
  if (unidadeIds.length === 0) return new Map<string, number>();
  const linhas: { school_id: string; total: number }[] = await sql`
    SELECT school_id, count(*)::int AS total
      FROM class_group
     WHERE network_id = ${redeId}
       AND school_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     GROUP BY school_id`;
  return new Map(linhas.map((linha): [string, number] => [linha.school_id, linha.total]));
}

export async function inserirDisciplina(
  sql: Conexao,
  alocacao: TurmaDisciplina,
): Promise<boolean> {
  const criadas: { id: string }[] = await sql`
    INSERT INTO class_group_subject (id, network_id, class_group_id, subject_id, teacher_user_id)
    VALUES (${alocacao.id}, ${alocacao.redeId}, ${alocacao.turmaId}, ${alocacao.disciplinaId},
            ${alocacao.professorUsuarioId})
    ON CONFLICT ON CONSTRAINT subject_unique_in_class_group DO NOTHING
    RETURNING id`;
  return criadas.length === 1;
}

export async function disciplinaPorId(
  sql: Conexao,
  redeId: string,
  id: string,
): Promise<TurmaDisciplina | null> {
  const linhas: LinhaDeTurmaDisciplina[] = await sql`
    SELECT td.id, td.network_id, td.class_group_id, td.subject_id, d.name AS subject_name,
           td.teacher_user_id
      FROM class_group_subject td
      JOIN subject d ON d.id = td.subject_id AND d.network_id = td.network_id
     WHERE td.network_id = ${redeId} AND td.id = ${id}`;
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
    SELECT td.id, td.network_id, td.class_group_id, td.subject_id, d.name AS subject_name,
           td.teacher_user_id
      FROM class_group_subject td
      JOIN subject d ON d.id = td.subject_id AND d.network_id = td.network_id
     WHERE td.network_id = ${redeId} AND td.class_group_id = ${turmaId}
     ORDER BY d.name
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
      FROM class_group_subject
     WHERE network_id = ${redeId} AND class_group_id = ${turmaId}`;
  return linhas[0]?.total ?? 0;
}

export async function disciplinasDoProfessor(
  sql: Conexao,
  redeId: string,
  professorUsuarioId: string,
): Promise<TurmaDisciplinaDoProfessor[]> {
  const linhas: LinhaDeTurmaDisciplinaDoProfessor[] = await sql`
    SELECT td.id, td.network_id, td.class_group_id, td.subject_id, d.name AS subject_name,
           td.teacher_user_id, t.name AS class_group_name, t.grade_level, t.shift, t.school_id
      FROM class_group_subject td
      JOIN subject d ON d.id = td.subject_id AND d.network_id = td.network_id
      JOIN class_group t ON t.id = td.class_group_id AND t.network_id = td.network_id
     WHERE td.network_id = ${redeId} AND td.teacher_user_id = ${professorUsuarioId}
     ORDER BY t.grade_level, t.name, d.name`;
  return linhas.map(paraTurmaDisciplinaDoProfessor);
}

export async function doProfessor(
  sql: Conexao,
  redeId: string,
  professorUsuarioId: string,
): Promise<Turma[]> {
  const linhas: LinhaDeTurma[] = await sql`
    SELECT DISTINCT t.id, t.network_id, t.school_id, t.academic_year_id, t.name, t.grade_level,
           t.shift
      FROM class_group t
      JOIN class_group_subject td ON td.class_group_id = t.id AND td.network_id = t.network_id
     WHERE t.network_id = ${redeId} AND td.teacher_user_id = ${professorUsuarioId}
     ORDER BY t.grade_level, t.name`;
  return linhas.map(paraTurma);
}
