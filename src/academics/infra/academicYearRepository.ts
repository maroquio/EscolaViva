import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { AnoLetivo } from '../domain/academicYear';

type LinhaDeAnoLetivo = {
  id: string;
  network_id: string;
  year: number;
  start_date: string;
  end_date: string;
};

const paraAnoLetivo = (linha: LinhaDeAnoLetivo): AnoLetivo => ({
  id: linha.id,
  redeId: linha.network_id,
  ano: linha.year,
  dataInicio: linha.start_date,
  dataFim: linha.end_date,
});

export async function inserir(sql: Connection, anoLetivo: AnoLetivo): Promise<boolean> {
  const criados: { id: string }[] = await sql`
    INSERT INTO academic_year (id, network_id, year, start_date, end_date)
    VALUES (${anoLetivo.id}, ${anoLetivo.redeId}, ${anoLetivo.ano},
            ${anoLetivo.dataInicio}, ${anoLetivo.dataFim})
    ON CONFLICT ON CONSTRAINT year_unique_in_network DO NOTHING
    RETURNING id`;
  return criados.length === 1;
}

export async function porId(sql: Connection, redeId: string, id: string): Promise<AnoLetivo | null> {
  const linhas: LinhaDeAnoLetivo[] = await sql`
    SELECT id, network_id, year,
           to_char(start_date, 'YYYY-MM-DD') AS start_date,
           to_char(end_date, 'YYYY-MM-DD') AS end_date
      FROM academic_year
     WHERE network_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraAnoLetivo(linha);
}

export async function listar(
  sql: Connection,
  redeId: string,
  faixa?: Range,
): Promise<AnoLetivo[]> {
  const { limit, offset } = rangeParams(faixa);
  const linhas: LinhaDeAnoLetivo[] = await sql`
    SELECT id, network_id, year,
           to_char(start_date, 'YYYY-MM-DD') AS start_date,
           to_char(end_date, 'YYYY-MM-DD') AS end_date
      FROM academic_year
     WHERE network_id = ${redeId}
     ORDER BY year DESC
     LIMIT ${limit}::int OFFSET ${offset}::int`;
  return linhas.map(paraAnoLetivo);
}

export async function contar(sql: Connection, redeId: string): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM academic_year WHERE network_id = ${redeId}`;
  return linhas[0]?.total ?? 0;
}
