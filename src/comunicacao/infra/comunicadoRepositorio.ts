import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import { ERROS_INTERNOS } from '../constantes';
import type { ComunicadoArmazenado } from '../dominio/comunicado';
import type { ContagemDeLeitura, ItemDoMural } from '../dominio/destinatario';

type LinhaDeComunicado = {
  id: string;
  rede_id: string;
  unidade_id: string;
  titulo: string;
  corpo: string;
  autor_usuario_id: string;
  publicado_em: Date | null;
};

type LinhaDoMural = {
  comunicado_id: string;
  titulo: string;
  publicado_em: Date;
  lido_em: Date | null;
};

type LinhaDeContagem = {
  comunicado_id: string;
  titulo: string;
  publicado_em: Date | null;
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

/** `timestamptz` chega do driver como Date; para fora do módulo todo instante é texto ISO em UTC. */
function emTexto(instante: Date): string {
  return instante.toISOString();
}

function emTextoOuNulo(instante: Date | null): string | null {
  return instante === null ? null : instante.toISOString();
}

function paraComunicado(linha: LinhaDeComunicado): ComunicadoArmazenado {
  return {
    id: linha.id,
    redeId: linha.rede_id,
    unidadeId: linha.unidade_id,
    titulo: linha.titulo,
    corpo: linha.corpo,
    autorUsuarioId: linha.autor_usuario_id,
    publicadoEm: emTextoOuNulo(linha.publicado_em),
  };
}

/** `publicado_em` é o relógio do banco: o instante gravado é o mesmo que a transação enxerga. */
export async function inserirPublicado(
  sql: Conexao,
  novo: NovoComunicado,
): Promise<ComunicadoArmazenado> {
  const linhas = await sql<{ publicado_em: Date }[]>`
    INSERT INTO comunicado (id, rede_id, unidade_id, titulo, corpo, autor_usuario_id, publicado_em)
    VALUES (${novo.id}, ${novo.redeId}, ${novo.unidadeId}, ${novo.titulo}, ${novo.corpo},
            ${novo.autorUsuarioId}, now())
    RETURNING publicado_em
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
    publicadoEm: emTexto(linha.publicado_em),
  };
}

/** Uma instrução para a lista inteira: 300 responsáveis não podem virar 300 idas ao banco. */
export async function inserirDestinatarios(
  sql: Conexao,
  entrada: { redeId: string; comunicadoId: string; responsaveisIds: readonly string[] },
): Promise<void> {
  const linhas = entrada.responsaveisIds.map((responsavelId) => ({
    rede_id: entrada.redeId,
    comunicado_id: entrada.comunicadoId,
    responsavel_id: responsavelId,
  }));
  await sql`INSERT INTO comunicado_destinatario ${sql(linhas)}`;
}

/**
 * O mural é montado do lado do destinatário — o índice que serve aqui é
 * `comunicado_destinatario (rede_id, responsavel_id)`; a ordem por `publicado_em DESC` é a mesma
 * que o índice de `comunicado` materializa.
 */
/**
 * `lido` separa as duas metades do mural no banco, e não depois de trazer tudo. Filtrar em memória
 * obrigaria a carregar o mural inteiro para mostrar as vinte linhas não lidas de quem acumulou
 * quatro anos de comunicados.
 */
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
    SELECT c.id AS comunicado_id, c.titulo, c.publicado_em, d.lido_em
    FROM comunicado_destinatario d
    JOIN comunicado c ON c.rede_id = d.rede_id AND c.id = d.comunicado_id
    WHERE d.rede_id = ${redeId}
      AND d.responsavel_id = ${responsavelId}
      AND c.publicado_em IS NOT NULL
      AND (${lido}::boolean IS NULL OR (d.lido_em IS NOT NULL) = ${lido}::boolean)
    ORDER BY c.publicado_em DESC
    LIMIT ${limite}::int OFFSET ${deslocamento}::int
  `;
  return linhas.map((linha) => ({
    comunicadoId: linha.comunicado_id,
    titulo: linha.titulo,
    publicadoEm: emTexto(linha.publicado_em),
    lidoEm: emTextoOuNulo(linha.lido_em),
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
    FROM comunicado_destinatario d
    JOIN comunicado c ON c.rede_id = d.rede_id AND c.id = d.comunicado_id
    WHERE d.rede_id = ${redeId}
      AND d.responsavel_id = ${responsavelId}
      AND c.publicado_em IS NOT NULL
      AND (${lido}::boolean IS NULL OR (d.lido_em IS NOT NULL) = ${lido}::boolean)
  `;
  return linhas[0]?.total ?? 0;
}

/** O JOIN com destinatário é a regra de visibilidade: quem não recebeu não lê. */
export async function buscarParaResponsavel(
  sql: Conexao,
  redeId: string,
  responsavelId: string,
  comunicadoId: string,
): Promise<ComunicadoArmazenado | null> {
  const linhas = await sql<LinhaDeComunicado[]>`
    SELECT c.id, c.rede_id, c.unidade_id, c.titulo, c.corpo, c.autor_usuario_id, c.publicado_em
    FROM comunicado c
    JOIN comunicado_destinatario d ON d.rede_id = c.rede_id AND d.comunicado_id = c.id
    WHERE c.rede_id = ${redeId}
      AND c.id = ${comunicadoId}
      AND d.responsavel_id = ${responsavelId}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : paraComunicado(linha);
}

/** `lido_em IS NULL` no WHERE: a segunda abertura do comunicado não apaga a primeira leitura. */
export async function marcarLeitura(sql: Conexao, chave: ChaveDeDestinatario): Promise<void> {
  await sql`
    UPDATE comunicado_destinatario
    SET lido_em = now()
    WHERE rede_id = ${chave.redeId}
      AND comunicado_id = ${chave.comunicadoId}
      AND responsavel_id = ${chave.responsavelId}
      AND lido_em IS NULL
  `;
}

/**
 * Destinatários, leituras e ordem em uma consulta só. O parâmetro de unidade é comparado como
 * `uuid` porque `$n IS NULL` sozinho não dá ao Postgres contexto para inferir o tipo.
 */
export async function contarLeituras(
  sql: Conexao,
  redeId: string,
  unidadeId: string | null,
  faixa?: Faixa,
): Promise<ContagemDeLeitura[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas = await sql<LinhaDeContagem[]>`
    SELECT c.id AS comunicado_id,
           c.titulo,
           c.publicado_em,
           count(d.responsavel_id)::int AS destinatarios,
           count(d.lido_em)::int        AS leituras
    FROM comunicado c
    LEFT JOIN comunicado_destinatario d ON d.rede_id = c.rede_id AND d.comunicado_id = c.id
    WHERE c.rede_id = ${redeId}
      AND (${unidadeId}::uuid IS NULL OR c.unidade_id = ${unidadeId})
    GROUP BY c.id, c.titulo, c.publicado_em
    ORDER BY c.publicado_em DESC NULLS LAST
    LIMIT ${limite}::int OFFSET ${deslocamento}::int
  `;
  return linhas.map((linha) => ({
    comunicadoId: linha.comunicado_id,
    titulo: linha.titulo,
    publicadoEm: emTextoOuNulo(linha.publicado_em),
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
    FROM comunicado c
    WHERE c.rede_id = ${redeId}
      AND (${unidadeId}::uuid IS NULL OR c.unidade_id = ${unidadeId})
  `;
  return linhas[0]?.total ?? 0;
}

/**
 * Destinatários e leituras do recorte inteiro, não da página.
 *
 * O número do topo da tela mede o alcance da comunicação da unidade — se ele mudasse a cada
 * clique em "próxima", deixaria de medir alguma coisa e viraria mais uma soma de vinte linhas.
 */
export async function somarLeituras(
  sql: Conexao,
  redeId: string,
  unidadeId: string | null,
): Promise<{ destinatarios: number; leituras: number }> {
  const linhas = await sql<{ destinatarios: number; leituras: number }[]>`
    SELECT count(d.responsavel_id)::int AS destinatarios,
           count(d.lido_em)::int        AS leituras
    FROM comunicado c
    LEFT JOIN comunicado_destinatario d ON d.rede_id = c.rede_id AND d.comunicado_id = c.id
    WHERE c.rede_id = ${redeId}
      AND (${unidadeId}::uuid IS NULL OR c.unidade_id = ${unidadeId})
  `;
  const somado = linhas[0];
  if (somado === undefined) return { destinatarios: 0, leituras: 0 };
  return { destinatarios: somado.destinatarios, leituras: somado.leituras };
}
