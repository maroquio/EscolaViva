import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import type { AnoLetivo } from '../dominio/anoLetivo';

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

export async function inserir(sql: Conexao, anoLetivo: AnoLetivo): Promise<boolean> {
  const criados: { id: string }[] = await sql`
    INSERT INTO academic_year (id, network_id, year, start_date, end_date)
    VALUES (${anoLetivo.id}, ${anoLetivo.redeId}, ${anoLetivo.ano},
            ${anoLetivo.dataInicio}, ${anoLetivo.dataFim})
    ON CONFLICT ON CONSTRAINT year_unique_in_network DO NOTHING
    RETURNING id`;
  return criados.length === 1;
}

export async function porId(sql: Conexao, redeId: string, id: string): Promise<AnoLetivo | null> {
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
  sql: Conexao,
  redeId: string,
  faixa?: Faixa,
): Promise<AnoLetivo[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeAnoLetivo[] = await sql`
    SELECT id, network_id, year,
           to_char(start_date, 'YYYY-MM-DD') AS start_date,
           to_char(end_date, 'YYYY-MM-DD') AS end_date
      FROM academic_year
     WHERE network_id = ${redeId}
     ORDER BY year DESC
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraAnoLetivo);
}

export async function contar(sql: Conexao, redeId: string): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM academic_year WHERE network_id = ${redeId}`;
  return linhas[0]?.total ?? 0;
}
