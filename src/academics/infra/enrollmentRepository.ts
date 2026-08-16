import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import { ERROS_INTERNOS } from '../constants';
import { situacaoValida, type Matricula, type SituacaoMatricula } from '../domain/enrollment';

type LinhaDeMatricula = {
  id: string;
  network_id: string;
  student_id: string;
  student_name: string;
  class_group_id: string;
  class_group_name: string;
  school_id: string;
  academic_year_id: string;
  year: number;
  enrollment_date: string;
  status: string;
};

function paraSituacao(valor: string): SituacaoMatricula {
  if (!situacaoValida(valor)) throw new Error(ERROS_INTERNOS.situacaoDesconhecida(valor));
  return valor;
}

const paraMatricula = (linha: LinhaDeMatricula): Matricula => ({
  id: linha.id,
  redeId: linha.network_id,
  alunoId: linha.student_id,
  alunoNome: linha.student_name,
  turmaId: linha.class_group_id,
  turmaNome: linha.class_group_name,
  unidadeId: linha.school_id,
  anoLetivoId: linha.academic_year_id,
  ano: linha.year,
  dataMatricula: linha.enrollment_date,
  situacao: paraSituacao(linha.status),
});

export async function inserir(sql: Connection, matricula: Matricula): Promise<boolean> {
  const criadas: { id: string }[] = await sql`
    INSERT INTO enrollment (id, network_id, student_id, class_group_id, academic_year_id,
                            enrollment_date, status)
    VALUES (${matricula.id}, ${matricula.redeId}, ${matricula.alunoId}, ${matricula.turmaId},
            ${matricula.anoLetivoId}, ${matricula.dataMatricula}, ${matricula.situacao})
    ON CONFLICT (student_id, academic_year_id) WHERE status = 'active' DO NOTHING
    RETURNING id`;
  return criadas.length === 1;
}

export async function marcarComoTransferida(
  sql: Connection,
  redeId: string,
  id: string,
): Promise<boolean> {
  const atualizadas: { id: string }[] = await sql`
    UPDATE enrollment
       SET status = 'transferred'
     WHERE network_id = ${redeId} AND id = ${id} AND status = 'active'
     RETURNING id`;
  return atualizadas.length === 1;
}

export async function porId(sql: Connection, redeId: string, id: string): Promise<Matricula | null> {
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
     WHERE m.network_id = ${redeId} AND m.id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraMatricula(linha);
}

export async function ativasDaTurma(
  sql: Connection,
  redeId: string,
  turmaId: string,
  faixa?: Range,
): Promise<Matricula[]> {
  const { limit, offset } = rangeParams(faixa);
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
     WHERE m.network_id = ${redeId} AND m.class_group_id = ${turmaId} AND m.status = 'active'
     ORDER BY a.name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return linhas.map(paraMatricula);
}

export async function contarAtivasDaTurma(
  sql: Connection,
  redeId: string,
  turmaId: string,
): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM enrollment
     WHERE network_id = ${redeId} AND class_group_id = ${turmaId} AND status = 'active'`;
  return linhas[0]?.total ?? 0;
}

export async function doAlunoNasUnidades(
  sql: Connection,
  redeId: string,
  alunoId: string,
  unidadeIds: readonly string[],
  faixa?: Range,
): Promise<Matricula[]> {
  if (unidadeIds.length === 0) return [];
  const { limit, offset } = rangeParams(faixa);
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
     WHERE m.network_id = ${redeId}
       AND m.student_id = ${alunoId}
       AND t.school_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     ORDER BY al.year DESC, m.enrollment_date DESC
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return linhas.map(paraMatricula);
}

export async function contarDoAlunoNasUnidades(
  sql: Connection,
  redeId: string,
  alunoId: string,
  unidadeIds: readonly string[],
): Promise<number> {
  if (unidadeIds.length === 0) return 0;
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM enrollment m
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
     WHERE m.network_id = ${redeId}
       AND m.student_id = ${alunoId}
       AND t.school_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])`;
  return linhas[0]?.total ?? 0;
}

export async function temAlgumaMatricula(
  sql: Connection,
  redeId: string,
  alunoId: string,
): Promise<boolean> {
  const linhas: { existe: number }[] = await sql`
    SELECT 1 AS existe
      FROM enrollment
     WHERE network_id = ${redeId} AND student_id = ${alunoId}
     LIMIT 1`;
  return linhas.length > 0;
}

export async function contarAtivasPorUnidade(
  sql: Connection,
  redeId: string,
  unidadeIds: readonly string[],
): Promise<Map<string, number>> {
  if (unidadeIds.length === 0) return new Map<string, number>();
  const linhas: { school_id: string; total: number }[] = await sql`
    SELECT t.school_id, count(*)::int AS total
      FROM enrollment m
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
     WHERE m.network_id = ${redeId}
       AND m.status = 'active'
       AND t.school_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     GROUP BY t.school_id`;
  return new Map(linhas.map((linha): [string, number] => [linha.school_id, linha.total]));
}

export async function ativasDosAlunos(
  sql: Connection,
  redeId: string,
  alunoIds: readonly string[],
  unidadeIds: readonly string[],
): Promise<Matricula[]> {
  if (alunoIds.length === 0 || unidadeIds.length === 0) return [];
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
     WHERE m.network_id = ${redeId}
       AND m.status = 'active'
       AND m.student_id = ANY(${sql.array([...alunoIds], 'TEXT')}::uuid[])
       AND t.school_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     ORDER BY al.year DESC`;
  return linhas.map(paraMatricula);
}

export async function doResponsavel(
  sql: Connection,
  redeId: string,
  responsavelId: string,
  faixa?: Range,
): Promise<Matricula[]> {
  const { limit, offset } = rangeParams(faixa);
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.network_id, m.student_id, a.name AS student_name, m.class_group_id,
           t.name AS class_group_name, t.school_id, m.academic_year_id, al.year,
           to_char(m.enrollment_date, 'YYYY-MM-DD') AS enrollment_date, m.status
      FROM enrollment m
      JOIN student a ON a.id = m.student_id AND a.network_id = m.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = m.network_id
      JOIN academic_year al ON al.id = m.academic_year_id AND al.network_id = m.network_id
      JOIN student_guardian av ON av.student_id = m.student_id AND av.network_id = m.network_id
     WHERE m.network_id = ${redeId} AND av.guardian_id = ${responsavelId}
     ORDER BY al.year DESC, a.name
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return linhas.map(paraMatricula);
}

export async function contarDoResponsavel(
  sql: Connection,
  redeId: string,
  responsavelId: string,
): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM enrollment m
      JOIN student_guardian av ON av.student_id = m.student_id AND av.network_id = m.network_id
     WHERE m.network_id = ${redeId} AND av.guardian_id = ${responsavelId}`;
  return linhas[0]?.total ?? 0;
}
