import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import type { Unidade } from '../dominio/unidade';

type LinhaDeUnidade = {
  id: string;
  rede_id: string;
  nome: string;
  codigo_inep: string | null;
  ativa: boolean;
};

const paraUnidade = (linha: LinhaDeUnidade): Unidade => ({
  id: linha.id,
  redeId: linha.rede_id,
  nome: linha.nome,
  codigoInep: linha.codigo_inep,
  ativa: linha.ativa,
});

export async function listarPorRede(
  sql: Conexao,
  redeId: string,
  faixa?: Faixa,
): Promise<Unidade[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas = await sql<LinhaDeUnidade[]>`
    SELECT id, rede_id, nome, codigo_inep, ativa
    FROM unidade
    WHERE rede_id = ${redeId}
    ORDER BY nome
    LIMIT ${limite}::int OFFSET ${deslocamento}::int
  `;
  return linhas.map(paraUnidade);
}

export async function contarPorRede(sql: Conexao, redeId: string): Promise<number> {
  const linhas = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM unidade
    WHERE rede_id = ${redeId}
  `;
  return linhas[0]?.total ?? 0;
}

export async function porId(
  sql: Conexao,
  redeId: string,
  unidadeId: string,
): Promise<Unidade | null> {
  const linhas = await sql<LinhaDeUnidade[]>`
    SELECT id, rede_id, nome, codigo_inep, ativa
    FROM unidade
    WHERE rede_id = ${redeId} AND id = ${unidadeId}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : paraUnidade(linha);
}

export async function existeNome(sql: Conexao, redeId: string, nome: string): Promise<boolean> {
  const linhas = await sql<{ existe: number }[]>`
    SELECT 1 AS existe
    FROM unidade
    WHERE rede_id = ${redeId} AND nome = ${nome}
    LIMIT 1
  `;
  return linhas.length > 0;
}

export async function idsNaRede(
  sql: Conexao,
  redeId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set<string>();
  const linhas = await sql<{ id: string }[]>`
    SELECT id
    FROM unidade
    WHERE rede_id = ${redeId} AND id IN ${sql(ids)}
  `;
  return new Set(linhas.map((linha) => linha.id));
}

export async function inserir(sql: Conexao, unidade: Unidade): Promise<void> {
  await sql`
    INSERT INTO unidade (id, rede_id, nome, codigo_inep, ativa)
    VALUES (${unidade.id}, ${unidade.redeId}, ${unidade.nome}, ${unidade.codigoInep}, ${unidade.ativa})
  `;
}
