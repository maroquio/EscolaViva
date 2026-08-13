import type { Conexao } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import type { FechamentoBimestre } from '../dominio/fechamentoBimestre';

export async function porTurma(
  sql: Conexao,
  redeId: string,
  turmaId: string,
): Promise<FechamentoBimestre[]> {
  // `timestamptz` volta do driver como objeto de data; o `to_char` sobre o instante em UTC entrega
  // sempre o mesmo texto ISO à aplicação, sem depender do fuso da sessão do banco.
  const linhas: { bimestre: number; fechado_em: string }[] = await sql`
    SELECT bimestre,
           to_char(fechado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fechado_em
      FROM fechamento_bimestre
     WHERE rede_id = ${redeId}
       AND turma_id = ${turmaId}
     ORDER BY bimestre`;
  return linhas.map((linha) => ({ bimestre: linha.bimestre, fechadoEm: linha.fechado_em }));
}

export async function estaFechado(
  sql: Conexao,
  redeId: string,
  turmaId: string,
  bimestre: number,
): Promise<boolean> {
  const linhas: { fechado: number }[] = await sql`
    SELECT 1 AS fechado
      FROM fechamento_bimestre
     WHERE rede_id = ${redeId}
       AND turma_id = ${turmaId}
       AND bimestre = ${bimestre}`;
  return linhas.length > 0;
}

export async function registrar(
  sql: Conexao,
  fechamento: { redeId: string; turmaId: string; bimestre: number; fechadoPor: string },
): Promise<void> {
  await sql`
    INSERT INTO fechamento_bimestre (id, rede_id, turma_id, bimestre, fechado_por)
    VALUES (${idGeneratorUuid.novo()}, ${fechamento.redeId}, ${fechamento.turmaId},
            ${fechamento.bimestre}, ${fechamento.fechadoPor})`;
}
