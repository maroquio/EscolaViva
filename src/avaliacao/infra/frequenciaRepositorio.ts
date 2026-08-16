import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/pagination';
import { idGeneratorUuid } from '../../shared/ports';
import type {
  ApuracaoDeFrequencia,
  PresencaDoDia,
  ResumoFrequencia,
} from '../dominio/frequencia';

export type LinhaParaGravar = {
  matriculaId: string;
  presente: boolean;
  justificativa: string | null;
};

export async function porMatriculasEData(
  sql: Conexao,
  redeId: string,
  matriculaIds: string[],
  data: string,
): Promise<Map<string, PresencaDoDia>> {
  const linhas: { enrollment_id: string; present: boolean; excuse: string | null }[] = await sql`
      SELECT enrollment_id, present, excuse
        FROM attendance
       WHERE network_id = ${redeId}
         AND enrollment_id = ANY(${sql.array(matriculaIds, 'TEXT')}::uuid[])
         AND attendance_date = ${data}`;
  return new Map(
    linhas.map((linha): [string, PresencaDoDia] => [
      linha.enrollment_id,
      { presente: linha.present, justificativa: linha.excuse },
    ]),
  );
}

export async function porMatricula(
  sql: Conexao,
  redeId: string,
  matriculaId: string,
  faixa?: Faixa,
): Promise<ResumoFrequencia[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: { attendance_date: string; present: boolean; excuse: string | null }[] = await sql`
    SELECT to_char(attendance_date, 'YYYY-MM-DD') AS attendance_date, present, excuse
      FROM attendance
     WHERE network_id = ${redeId}
       AND enrollment_id = ${matriculaId}
     ORDER BY attendance_date DESC
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map((linha) => ({
    data: linha.attendance_date,
    presente: linha.present,
    justificativa: linha.excuse,
  }));
}

export async function contarPorMatricula(
  sql: Conexao,
  redeId: string,
  matriculaId: string,
): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM attendance
     WHERE network_id = ${redeId} AND enrollment_id = ${matriculaId}`;
  return linhas[0]?.total ?? 0;
}

export async function apuracaoDaMatricula(
  sql: Conexao,
  redeId: string,
  matriculaId: string,
): Promise<ApuracaoDeFrequencia> {
  const linhas: { total_days: number; present_days: number }[] = await sql`
    SELECT count(*)::int AS total_days,
           (count(*) FILTER (WHERE present))::int AS present_days
      FROM attendance
     WHERE network_id = ${redeId}
       AND enrollment_id = ${matriculaId}`;
  const apurado = linhas[0];
  if (apurado === undefined) return { totalDias: 0, presencas: 0 };
  return { totalDias: apurado.total_days, presencas: apurado.present_days };
}

export async function gravarEmLote(
  sql: Conexao,
  chamada: { redeId: string; data: string; linhas: LinhaParaGravar[] },
): Promise<number> {
  const registros = chamada.linhas.map((linha) => ({
    id: idGeneratorUuid.novo(),
    network_id: chamada.redeId,
    enrollment_id: linha.matriculaId,
    attendance_date: chamada.data,
    present: linha.presente,
    excuse: linha.justificativa,
  }));
  const gravadas: { id: string }[] = await sql`
    INSERT INTO attendance ${sql(registros)}
    ON CONFLICT (enrollment_id, attendance_date)
    DO UPDATE SET present = EXCLUDED.present,
                  excuse = EXCLUDED.excuse
    RETURNING id`;
  return gravadas.length;
}
