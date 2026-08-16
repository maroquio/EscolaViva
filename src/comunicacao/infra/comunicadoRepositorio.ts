import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/pagination';
import { ERROS_INTERNOS } from '../constantes';
import type { ComunicadoArmazenado } from '../dominio/comunicado';
import type { ContagemDeLeitura, ItemDoMural } from '../dominio/destinatario';

type LinhaDeComunicado = {
  id: string;
  network_id: string;
  school_id: string;
  title: string;
  body: string;
  author_user_id: string;
  published_at: Date | null;
};

type LinhaDoMural = {
  announcement_id: string;
  title: string;
  published_at: Date;
  read_at: Date | null;
};

type LinhaDeContagem = {
  announcement_id: string;
  title: string;
  published_at: Date | null;
  destinatarios: number;
  leituras: number;
};

export type NovoComunicado = {
  id: string;
  redeId: string;
  unidadeId: string;
  titulo: string;
  corpo: string;
  autorUsuarioId: string;
};

export type ChaveDeDestinatario = {
  redeId: string;
  comunicadoId: string;
  responsavelId: string;
};

function emTexto(instante: Date): string {
  return instante.toISOString();
}

function emTextoOuNulo(instante: Date | null): string | null {
  return instante === null ? null : instante.toISOString();
}

function paraComunicado(linha: LinhaDeComunicado): ComunicadoArmazenado {
  return {
    id: linha.id,
    redeId: linha.network_id,
    unidadeId: linha.school_id,
    titulo: linha.title,
    corpo: linha.body,
    autorUsuarioId: linha.author_user_id,
    publicadoEm: emTextoOuNulo(linha.published_at),
  };
}

export async function inserirPublicado(
  sql: Conexao,
  novo: NovoComunicado,
): Promise<ComunicadoArmazenado> {
  const linhas = await sql<{ published_at: Date }[]>`
    INSERT INTO announcement (id, network_id, school_id, title, body, author_user_id, published_at)
    VALUES (${novo.id}, ${novo.redeId}, ${novo.unidadeId}, ${novo.titulo}, ${novo.corpo},
            ${novo.autorUsuarioId}, now())
    RETURNING published_at
  `;
  const linha = linhas[0];
  if (linha === undefined) throw new Error(ERROS_INTERNOS.insercaoSemPublicadoEm);
  return {
    id: novo.id,
    redeId: novo.redeId,
    unidadeId: novo.unidadeId,
    titulo: novo.titulo,
    corpo: novo.corpo,
    autorUsuarioId: novo.autorUsuarioId,
    publicadoEm: emTexto(linha.published_at),
  };
}

export async function inserirDestinatarios(
  sql: Conexao,
  entrada: { redeId: string; comunicadoId: string; responsaveisIds: readonly string[] },
): Promise<void> {
  const linhas = entrada.responsaveisIds.map((responsavelId) => ({
    network_id: entrada.redeId,
    announcement_id: entrada.comunicadoId,
    guardian_id: responsavelId,
  }));
  await sql`INSERT INTO announcement_recipient ${sql(linhas)}`;
}

export type FiltroDoMural = { lido?: boolean };

export async function listarDoResponsavel(
  sql: Conexao,
  redeId: string,
  responsavelId: string,
  filtro?: FiltroDoMural,
  faixa?: Faixa,
): Promise<ItemDoMural[]> {
  const lido = filtro?.lido ?? null;
  const { limite, deslocamento } = recorte(faixa);
  const linhas = await sql<LinhaDoMural[]>`
    SELECT c.id AS announcement_id, c.title, c.published_at, d.read_at
    FROM announcement_recipient d
    JOIN announcement c ON c.network_id = d.network_id AND c.id = d.announcement_id
    WHERE d.network_id = ${redeId}
      AND d.guardian_id = ${responsavelId}
      AND c.published_at IS NOT NULL
      AND (${lido}::boolean IS NULL OR (d.read_at IS NOT NULL) = ${lido}::boolean)
    ORDER BY c.published_at DESC
    LIMIT ${limite}::int OFFSET ${deslocamento}::int
  `;
  return linhas.map((linha) => ({
    comunicadoId: linha.announcement_id,
    titulo: linha.title,
    publicadoEm: emTexto(linha.published_at),
    lidoEm: emTextoOuNulo(linha.read_at),
  }));
}

export async function contarDoResponsavel(
  sql: Conexao,
  redeId: string,
  responsavelId: string,
  filtro?: FiltroDoMural,
): Promise<number> {
  const lido = filtro?.lido ?? null;
  const linhas = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM announcement_recipient d
    JOIN announcement c ON c.network_id = d.network_id AND c.id = d.announcement_id
    WHERE d.network_id = ${redeId}
      AND d.guardian_id = ${responsavelId}
      AND c.published_at IS NOT NULL
      AND (${lido}::boolean IS NULL OR (d.read_at IS NOT NULL) = ${lido}::boolean)
  `;
  return linhas[0]?.total ?? 0;
}

export async function buscarParaResponsavel(
  sql: Conexao,
  redeId: string,
  responsavelId: string,
  comunicadoId: string,
): Promise<ComunicadoArmazenado | null> {
  const linhas = await sql<LinhaDeComunicado[]>`
    SELECT c.id, c.network_id, c.school_id, c.title, c.body, c.author_user_id, c.published_at
    FROM announcement c
    JOIN announcement_recipient d ON d.network_id = c.network_id AND d.announcement_id = c.id
    WHERE c.network_id = ${redeId}
      AND c.id = ${comunicadoId}
      AND d.guardian_id = ${responsavelId}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : paraComunicado(linha);
}

export async function marcarLeitura(sql: Conexao, chave: ChaveDeDestinatario): Promise<void> {
  await sql`
    UPDATE announcement_recipient
    SET read_at = now()
    WHERE network_id = ${chave.redeId}
      AND announcement_id = ${chave.comunicadoId}
      AND guardian_id = ${chave.responsavelId}
      AND read_at IS NULL
  `;
}

export async function contarLeituras(
  sql: Conexao,
  redeId: string,
  unidadeId: string | null,
  faixa?: Faixa,
): Promise<ContagemDeLeitura[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas = await sql<LinhaDeContagem[]>`
    SELECT c.id AS announcement_id,
           c.title,
           c.published_at,
           count(d.guardian_id)::int AS destinatarios,
           count(d.read_at)::int     AS leituras
    FROM announcement c
    LEFT JOIN announcement_recipient d ON d.network_id = c.network_id AND d.announcement_id = c.id
    WHERE c.network_id = ${redeId}
      AND (${unidadeId}::uuid IS NULL OR c.school_id = ${unidadeId})
    GROUP BY c.id, c.title, c.published_at
    ORDER BY c.published_at DESC NULLS LAST
    LIMIT ${limite}::int OFFSET ${deslocamento}::int
  `;
  return linhas.map((linha) => ({
    comunicadoId: linha.announcement_id,
    titulo: linha.title,
    publicadoEm: emTextoOuNulo(linha.published_at),
    destinatarios: linha.destinatarios,
    leituras: linha.leituras,
  }));
}

export async function contarComunicados(
  sql: Conexao,
  redeId: string,
  unidadeId: string | null,
): Promise<number> {
  const linhas = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM announcement c
    WHERE c.network_id = ${redeId}
      AND (${unidadeId}::uuid IS NULL OR c.school_id = ${unidadeId})
  `;
  return linhas[0]?.total ?? 0;
}

export async function somarLeituras(
  sql: Conexao,
  redeId: string,
  unidadeId: string | null,
): Promise<{ destinatarios: number; leituras: number }> {
  const linhas = await sql<{ destinatarios: number; leituras: number }[]>`
    SELECT count(d.guardian_id)::int AS destinatarios,
           count(d.read_at)::int     AS leituras
    FROM announcement c
    LEFT JOIN announcement_recipient d ON d.network_id = c.network_id AND d.announcement_id = c.id
    WHERE c.network_id = ${redeId}
      AND (${unidadeId}::uuid IS NULL OR c.school_id = ${unidadeId})
  `;
  const somado = linhas[0];
  if (somado === undefined) return { destinatarios: 0, leituras: 0 };
  return { destinatarios: somado.destinatarios, leituras: somado.leituras };
}
