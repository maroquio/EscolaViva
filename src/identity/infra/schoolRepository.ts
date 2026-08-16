import type { Connection } from '../../shared/db';
import { rangeParams, type Range } from '../../shared/pagination';
import type { Unidade } from '../domain/school';

type LinhaDeUnidade = {
  id: string;
  network_id: string;
  name: string;
  inep_code: string | null;
  active: boolean;
};

const paraUnidade = (linha: LinhaDeUnidade): Unidade => ({
  id: linha.id,
  redeId: linha.network_id,
  nome: linha.name,
  codigoInep: linha.inep_code,
  ativa: linha.active,
});

export async function listarPorRede(
  sql: Connection,
  redeId: string,
  faixa?: Range,
): Promise<Unidade[]> {
  const { limit, offset } = rangeParams(faixa);
  const linhas = await sql<LinhaDeUnidade[]>`
    SELECT id, network_id, name, inep_code, active
    FROM school
    WHERE network_id = ${redeId}
    ORDER BY name
    LIMIT ${limit}::int OFFSET ${offset}::int
  `;
  return linhas.map(paraUnidade);
}

export async function contarPorRede(sql: Connection, redeId: string): Promise<number> {
  const linhas = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM school
    WHERE network_id = ${redeId}
  `;
  return linhas[0]?.total ?? 0;
}

export async function porId(
  sql: Connection,
  redeId: string,
  unidadeId: string,
): Promise<Unidade | null> {
  const linhas = await sql<LinhaDeUnidade[]>`
    SELECT id, network_id, name, inep_code, active
    FROM school
    WHERE network_id = ${redeId} AND id = ${unidadeId}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : paraUnidade(linha);
}

export async function existeNome(sql: Connection, redeId: string, nome: string): Promise<boolean> {
  const linhas = await sql<{ existe: number }[]>`
    SELECT 1 AS existe
    FROM school
    WHERE network_id = ${redeId} AND name = ${nome}
    LIMIT 1
  `;
  return linhas.length > 0;
}

export async function idsNaRede(
  sql: Connection,
  redeId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set<string>();
  const linhas = await sql<{ id: string }[]>`
    SELECT id
    FROM school
    WHERE network_id = ${redeId} AND id IN ${sql(ids)}
  `;
  return new Set(linhas.map((linha) => linha.id));
}

export async function inserir(sql: Connection, unidade: Unidade): Promise<void> {
  await sql`
    INSERT INTO school (id, network_id, name, inep_code, active)
    VALUES (${unidade.id}, ${unidade.redeId}, ${unidade.nome}, ${unidade.codigoInep}, ${unidade.ativa})
  `;
}
