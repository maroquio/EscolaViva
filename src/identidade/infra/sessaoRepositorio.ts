import type { Conexao } from '../../shared/db';
import { paraStatusDeRede, type Rede } from '../dominio/rede';
import type { Sessao } from '../dominio/sessao';
import type { Usuario } from '../dominio/usuario';

/** Uma sessão só é útil com o dono e a rede junto — é o que a borda HTTP precisa por requisição. */
export type SessaoComDono = { sessao: Sessao; rede: Rede; usuario: Usuario };

type LinhaDeSessao = {
  id: string;
  rede_id: string;
  usuario_id: string;
  criado_em: Date;
  expira_em: Date;
  ip: string | null;
  rede_nome: string;
  rede_slug: string;
  rede_status: string;
  usuario_nome: string;
  usuario_email: string;
  usuario_ativo: boolean;
  responsavel_id: string | null;
};

const paraSessaoComDono = (linha: LinhaDeSessao): SessaoComDono => ({
  sessao: {
    id: linha.id,
    redeId: linha.rede_id,
    usuarioId: linha.usuario_id,
    criadoEm: linha.criado_em,
    expiraEm: linha.expira_em,
    ip: linha.ip,
  },
  rede: {
    id: linha.rede_id,
    nome: linha.rede_nome,
    slug: linha.rede_slug,
    status: paraStatusDeRede(linha.rede_status),
  },
  usuario: {
    id: linha.usuario_id,
    redeId: linha.rede_id,
    nome: linha.usuario_nome,
    email: linha.usuario_email,
    ativo: linha.usuario_ativo,
    responsavelId: linha.responsavel_id,
  },
});

/**
 * A outra consulta sem filtro de rede: o cookie assinado traz só o id da sessão, e é esta linha
 * que revela a qual rede a requisição pertence. A expiração é decidida pelo domínio, não aqui —
 * a linha vencida continua no banco até o expurgo periódico passar (I20).
 */
export async function porId(sql: Conexao, sessaoId: string): Promise<SessaoComDono | null> {
  const linhas = await sql<LinhaDeSessao[]>`
    SELECT s.id, s.rede_id, s.usuario_id, s.criado_em, s.expira_em, s.ip,
           r.nome AS rede_nome, r.slug AS rede_slug, r.status AS rede_status,
           u.nome AS usuario_nome, u.email AS usuario_email, u.ativo AS usuario_ativo,
           u.responsavel_id
    FROM sessao s
    JOIN rede r ON r.id = s.rede_id
    JOIN usuario u ON u.id = s.usuario_id AND u.rede_id = s.rede_id
    WHERE s.id = ${sessaoId}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : paraSessaoComDono(linha);
}

export async function inserir(sql: Conexao, sessao: Sessao): Promise<void> {
  await sql`
    INSERT INTO sessao (id, rede_id, usuario_id, criado_em, expira_em, ip)
    VALUES (
      ${sessao.id}, ${sessao.redeId}, ${sessao.usuarioId},
      ${sessao.criadoEm}, ${sessao.expiraEm}, ${sessao.ip}
    )
  `;
}

export async function remover(sql: Conexao, sessaoId: string): Promise<void> {
  await sql`DELETE FROM sessao WHERE id = ${sessaoId}`;
}

/**
 * Conta pelo próprio comando: a CTE devolve uma linha por sessão apagada e o `count` resume,
 * sem depender de propriedade específica do driver para saber quantas saíram.
 */
export async function expurgarExpiradas(sql: Conexao): Promise<number> {
  const linhas = await sql<{ total: number }[]>`
    WITH expiradas AS (
      DELETE FROM sessao WHERE expira_em < now() RETURNING 1
    )
    SELECT count(*)::int AS total FROM expiradas
  `;
  return linhas[0]?.total ?? 0;
}
