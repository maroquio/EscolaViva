import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
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
  const linhas: { matricula_id: string; presente: boolean; justificativa: string | null }[] =
    await sql`
      SELECT matricula_id, presente, justificativa
        FROM frequencia
       WHERE rede_id = ${redeId}
         AND matricula_id = ANY(${sql.array(matriculaIds, 'TEXT')}::uuid[])
         AND data = ${data}`;
  return new Map(
    linhas.map((linha): [string, PresencaDoDia] => [
      linha.matricula_id,
      { presente: linha.presente, justificativa: linha.justificativa },
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
  const linhas: { data: string; presente: boolean; justificativa: string | null }[] = await sql`
    SELECT to_char(data, 'YYYY-MM-DD') AS data, presente, justificativa
      FROM frequencia
     WHERE rede_id = ${redeId}
       AND matricula_id = ${matriculaId}
     ORDER BY data DESC
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map((linha) => ({
    data: linha.data,
    presente: linha.presente,
    justificativa: linha.justificativa,
  }));
}

export async function contarPorMatricula(
  sql: Conexao,
  redeId: string,
  matriculaId: string,
): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM frequencia
     WHERE rede_id = ${redeId} AND matricula_id = ${matriculaId}`;
  return linhas[0]?.total ?? 0;
}

export async function apuracaoDaMatricula(
  sql: Conexao,
  redeId: string,
  matriculaId: string,
): Promise<ApuracaoDeFrequencia> {
  const linhas: { total_dias: number; presencas: number }[] = await sql`
    SELECT count(*)::int AS total_dias,
           (count(*) FILTER (WHERE presente))::int AS presencas
      FROM frequencia
     WHERE rede_id = ${redeId}
       AND matricula_id = ${matriculaId}`;
  const apurado = linhas[0];
  if (apurado === undefined) return { totalDias: 0, presencas: 0 };
  return { totalDias: apurado.total_dias, presencas: apurado.presencas };
}

export async function gravarEmLote(
  sql: Conexao,
  chamada: { redeId: string; data: string; linhas: LinhaParaGravar[] },
): Promise<number> {
  const registros = chamada.linhas.map((linha) => ({
    id: idGeneratorUuid.novo(),
    rede_id: chamada.redeId,
    matricula_id: linha.matriculaId,
    data: chamada.data,
    presente: linha.presente,
    justificativa: linha.justificativa,
  }));
  const gravadas: { id: string }[] = await sql`
    INSERT INTO frequencia ${sql(registros)}
    ON CONFLICT (matricula_id, data)
    DO UPDATE SET presente = EXCLUDED.presente,
                  justificativa = EXCLUDED.justificativa
    RETURNING id`;
  return gravadas.length;
}
