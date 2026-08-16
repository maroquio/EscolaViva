import type { Conexao } from '../../shared/db';
import { paraStatusDeRede, type Rede } from '../dominio/rede';
import type { Sessao } from '../dominio/sessao';
import type { Usuario } from '../dominio/usuario';

export type SessaoComDono = { sessao: Sessao; rede: Rede; usuario: Usuario };

type LinhaDeSessao = {
  id: string;
  network_id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  ip: string | null;
  network_name: string;
  network_slug: string;
  network_status: string;
  user_name: string;
  user_email: string;
  user_cpf: string;
  user_active: boolean;
  guardian_id: string | null;
};

const paraSessaoComDono = (linha: LinhaDeSessao): SessaoComDono => ({
  sessao: {
    id: linha.id,
    redeId: linha.network_id,
    usuarioId: linha.user_id,
    criadoEm: linha.created_at,
    expiraEm: linha.expires_at,
    ip: linha.ip,
  },
  rede: {
    id: linha.network_id,
    nome: linha.network_name,
    slug: linha.network_slug,
    status: paraStatusDeRede(linha.network_status),
  },
  usuario: {
    id: linha.user_id,
    redeId: linha.network_id,
    nome: linha.user_name,
    email: linha.user_email,
    cpf: linha.user_cpf,
    ativo: linha.user_active,
    responsavelId: linha.guardian_id,
  },
});

export async function porId(sql: Conexao, sessaoId: string): Promise<SessaoComDono | null> {
  const linhas = await sql<LinhaDeSessao[]>`
    SELECT s.id, s.network_id, s.user_id, s.created_at, s.expires_at, s.ip,
           n.name AS network_name, n.slug AS network_slug, n.status AS network_status,
           u.name AS user_name, u.email AS user_email, u.cpf AS user_cpf,
           u.active AS user_active, u.guardian_id
    FROM session s
    JOIN network n ON n.id = s.network_id
    JOIN app_user u ON u.id = s.user_id AND u.network_id = s.network_id
    WHERE s.id = ${sessaoId}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : paraSessaoComDono(linha);
}

export async function inserir(sql: Conexao, sessao: Sessao): Promise<void> {
  await sql`
    INSERT INTO session (id, network_id, user_id, created_at, expires_at, ip)
    VALUES (
      ${sessao.id}, ${sessao.redeId}, ${sessao.usuarioId},
      ${sessao.criadoEm}, ${sessao.expiraEm}, ${sessao.ip}
    )
  `;
}

export async function remover(sql: Conexao, sessaoId: string): Promise<void> {
  await sql`DELETE FROM session WHERE id = ${sessaoId}`;
}

export async function expurgarExpiradas(sql: Conexao): Promise<number> {
  const linhas = await sql<{ total: number }[]>`
    WITH expiradas AS (
      DELETE FROM session WHERE expires_at < now() RETURNING 1
    )
    SELECT count(*)::int AS total FROM expiradas
  `;
  return linhas[0]?.total ?? 0;
}
