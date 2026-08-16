import type { Conexao } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import type { FechamentoBimestre } from '../dominio/fechamentoBimestre';

export async function porTurma(
  sql: Conexao,
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
  sql: Conexao,
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
  sql: Conexao,
  fechamento: { redeId: string; turmaId: string; bimestre: number; fechadoPor: string },
): Promise<void> {
  await sql`
    INSERT INTO term_closing (id, network_id, class_group_id, term, closed_by)
    VALUES (${idGeneratorUuid.novo()}, ${fechamento.redeId}, ${fechamento.turmaId},
            ${fechamento.bimestre}, ${fechamento.fechadoPor})`;
}
