import type { Connection } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import type { FechamentoBimestre } from '../domain/termClosing';

export async function porTurma(
  sql: Connection,
  redeId: string,
  turmaId: string,
): Promise<FechamentoBimestre[]> {
  const linhas: { term: number; closed_at: string }[] = await sql`
    SELECT term,
           to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS closed_at
      FROM term_closing
     WHERE network_id = ${redeId}
       AND class_group_id = ${turmaId}
     ORDER BY term`;
  return linhas.map((linha) => ({ bimestre: linha.term, fechadoEm: linha.closed_at }));
}

export async function estaFechado(
  sql: Connection,
  redeId: string,
  turmaId: string,
  bimestre: number,
): Promise<boolean> {
  const linhas: { closed: number }[] = await sql`
    SELECT 1 AS closed
      FROM term_closing
     WHERE network_id = ${redeId}
       AND class_group_id = ${turmaId}
       AND term = ${bimestre}`;
  return linhas.length > 0;
}

export async function registrar(
  sql: Connection,
  fechamento: { redeId: string; turmaId: string; bimestre: number; fechadoPor: string },
): Promise<void> {
  await sql`
    INSERT INTO term_closing (id, network_id, class_group_id, term, closed_by)
    VALUES (${uuidIdGenerator.next()}, ${fechamento.redeId}, ${fechamento.turmaId},
            ${fechamento.bimestre}, ${fechamento.fechadoPor})`;
}
