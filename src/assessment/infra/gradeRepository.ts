import type { Connection } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';

export type NotaDaMatricula = { turmaDisciplinaId: string; bimestre: number; valor: number };

export type NotaParaGravar = { matriculaId: string; valor: number };

export async function porTurmaDisciplinaEBimestre(
  sql: Connection,
  redeId: string,
  turmaDisciplinaId: string,
  bimestre: number,
): Promise<Map<string, number>> {
  const linhas: { enrollment_id: string; value: number }[] = await sql`
    SELECT enrollment_id, value::float8 AS value
      FROM grade
     WHERE network_id = ${redeId}
       AND class_group_subject_id = ${turmaDisciplinaId}
       AND term = ${bimestre}`;
  return new Map(linhas.map((linha): [string, number] => [linha.enrollment_id, linha.value]));
}

export async function porMatricula(
  sql: Connection,
  redeId: string,
  matriculaId: string,
): Promise<NotaDaMatricula[]> {
  const linhas: { class_group_subject_id: string; term: number; value: number }[] = await sql`
    SELECT class_group_subject_id, term, value::float8 AS value
      FROM grade
     WHERE network_id = ${redeId}
       AND enrollment_id = ${matriculaId}`;
  return linhas.map((linha) => ({
    turmaDisciplinaId: linha.class_group_subject_id,
    bimestre: linha.term,
    valor: linha.value,
  }));
}

export async function contagemPorDisciplina(
  sql: Connection,
  redeId: string,
  turmaDisciplinaIds: string[],
  bimestre: number,
  matriculaIds: string[],
): Promise<Map<string, number>> {
  const linhas: { class_group_subject_id: string; total: number }[] = await sql`
    SELECT class_group_subject_id, count(*)::int AS total
      FROM grade
     WHERE network_id = ${redeId}
       AND class_group_subject_id = ANY(${sql.array(turmaDisciplinaIds, 'TEXT')}::uuid[])
       AND term = ${bimestre}
       AND enrollment_id = ANY(${sql.array(matriculaIds, 'TEXT')}::uuid[])
     GROUP BY class_group_subject_id`;
  return new Map(
    linhas.map((linha): [string, number] => [linha.class_group_subject_id, linha.total]),
  );
}

export async function gravarEmLote(
  sql: Connection,
  lancamento: {
    redeId: string;
    turmaDisciplinaId: string;
    bimestre: number;
    lancadaPor: string;
    notas: NotaParaGravar[];
  },
): Promise<number> {
  const linhas = lancamento.notas.map((nota) => ({
    id: uuidIdGenerator.next(),
    network_id: lancamento.redeId,
    enrollment_id: nota.matriculaId,
    class_group_subject_id: lancamento.turmaDisciplinaId,
    term: lancamento.bimestre,
    value: nota.valor,
    posted_by: lancamento.lancadaPor,
  }));
  const gravadas: { id: string }[] = await sql`
    INSERT INTO grade ${sql(linhas)}
    ON CONFLICT (enrollment_id, class_group_subject_id, term)
    DO UPDATE SET value = EXCLUDED.value,
                  posted_by = EXCLUDED.posted_by,
                  posted_at = now()
    RETURNING id`;
  return gravadas.length;
}

export async function apagarEmLote(
  sql: Connection,
  redeId: string,
  turmaDisciplinaId: string,
  bimestre: number,
  matriculaIds: string[],
): Promise<number> {
  const apagadas: { id: string }[] = await sql`
    DELETE FROM grade
     WHERE network_id = ${redeId}
       AND class_group_subject_id = ${turmaDisciplinaId}
       AND term = ${bimestre}
       AND enrollment_id = ANY(${sql.array(matriculaIds, 'TEXT')}::uuid[])
    RETURNING id`;
  return apagadas.length;
}
