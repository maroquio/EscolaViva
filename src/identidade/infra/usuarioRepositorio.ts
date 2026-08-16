import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import { PAPEL } from '../constantes';
import { paraPapel, type Papel, type PapelEmUnidade } from '../dominio/papel';
import type { Usuario, UsuarioResumo } from '../dominio/usuario';

export type Credenciais = { usuario: Usuario; senhaHash: string };

type LinhaDeUsuario = {
  id: string;
  network_id: string;
  name: string;
  email: string;
  cpf: string;
  active: boolean;
  guardian_id: string | null;
};

type LinhaDeCredenciais = LinhaDeUsuario & { password_hash: string };

type LinhaDePapel = { school_id: string; school_name: string; role: string };

const paraUsuario = (linha: LinhaDeUsuario): Usuario => ({
  id: linha.id,
  redeId: linha.network_id,
  nome: linha.name,
  email: linha.email,
  cpf: linha.cpf,
  ativo: linha.active,
  responsavelId: linha.guardian_id,
});

const paraPapelEmUnidade = (linha: LinhaDePapel): PapelEmUnidade => ({
  unidadeId: linha.school_id,
  unidadeNome: linha.school_name,
  papel: paraPapel(linha.role),
});

export async function credenciaisPorCpf(
  sql: Conexao,
  redeId: string,
  cpf: string,
): Promise<Credenciais | null> {
  const linhas = await sql<LinhaDeCredenciais[]>`
    SELECT id, network_id, name, email, cpf, active, guardian_id, password_hash
    FROM app_user
    WHERE network_id = ${redeId} AND cpf = ${cpf} AND active
  `;
  const linha = linhas[0];
  return linha === undefined
    ? null
    : { usuario: paraUsuario(linha), senhaHash: linha.password_hash };
}

export async function credenciaisPorId(
  sql: Conexao,
  usuarioId: string,
): Promise<Credenciais | null> {
  const linhas = await sql<LinhaDeCredenciais[]>`
    SELECT id, network_id, name, email, cpf, active, guardian_id, password_hash
    FROM app_user
    WHERE id = ${usuarioId} AND active
  `;
  const linha = linhas[0];
  return linha === undefined
    ? null
    : { usuario: paraUsuario(linha), senhaHash: linha.password_hash };
}

export async function papeisDoUsuario(
  sql: Conexao,
  redeId: string,
  usuarioId: string,
): Promise<PapelEmUnidade[]> {
  const linhas = await sql<LinhaDePapel[]>`
    SELECT ur.school_id, s.name AS school_name, ur.role
    FROM user_role ur
    JOIN school s ON s.id = ur.school_id AND s.network_id = ur.network_id
    WHERE ur.network_id = ${redeId} AND ur.user_id = ${usuarioId}
    ORDER BY s.name, ur.role
  `;
  return linhas.map(paraPapelEmUnidade);
}

export async function listarResumos(
  sql: Conexao,
  redeId: string,
  faixa?: Faixa,
): Promise<UsuarioResumo[]> {
  const { limite, deslocamento } = recorte(faixa);
  const usuarios = await sql<LinhaDeUsuario[]>`
    SELECT id, network_id, name, email, cpf, active, guardian_id
    FROM app_user
    WHERE network_id = ${redeId}
    ORDER BY name
    LIMIT ${limite}::int OFFSET ${deslocamento}::int
  `;
  if (usuarios.length === 0) return [];

  const ids = usuarios.map((linha) => linha.id);
  const papeis = await sql<(LinhaDePapel & { user_id: string })[]>`
    SELECT ur.user_id, ur.school_id, s.name AS school_name, ur.role
    FROM user_role ur
    JOIN school s ON s.id = ur.school_id AND s.network_id = ur.network_id
    WHERE ur.network_id = ${redeId} AND ur.user_id IN ${sql(ids)}
    ORDER BY s.name, ur.role
  `;

  const porUsuario = new Map<string, PapelEmUnidade[]>();
  for (const linha of papeis) {
    const acumulado = porUsuario.get(linha.user_id) ?? [];
    porUsuario.set(linha.user_id, [...acumulado, paraPapelEmUnidade(linha)]);
  }

  return usuarios.map((linha) => ({
    id: linha.id,
    nome: linha.name,
    email: linha.email,
    cpf: linha.cpf,
    ativo: linha.active,
    papeis: porUsuario.get(linha.id) ?? [],
  }));
}

export async function contarPorRede(sql: Conexao, redeId: string): Promise<number> {
  const linhas = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM app_user
    WHERE network_id = ${redeId}
  `;
  return linhas[0]?.total ?? 0;
}

export async function existeEmail(sql: Conexao, redeId: string, email: string): Promise<boolean> {
  const linhas = await sql<{ existe: number }[]>`
    SELECT 1 AS existe
    FROM app_user
    WHERE network_id = ${redeId} AND email = ${email}
    LIMIT 1
  `;
  return linhas.length > 0;
}

export async function existeCpf(sql: Conexao, redeId: string, cpf: string): Promise<boolean> {
  const linhas = await sql<{ existe: number }[]>`
    SELECT 1 AS existe
    FROM app_user
    WHERE network_id = ${redeId} AND cpf = ${cpf}
    LIMIT 1
  `;
  return linhas.length > 0;
}

export async function ehProfessorNaUnidade(
  sql: Conexao,
  redeId: string,
  usuarioId: string,
  unidadeId: string,
): Promise<boolean> {
  const linhas = await sql<{ existe: number }[]>`
    SELECT 1 AS existe
    FROM user_role
    WHERE network_id = ${redeId}
      AND user_id = ${usuarioId}
      AND school_id = ${unidadeId}
      AND role = ${PAPEL.professor}
    LIMIT 1
  `;
  return linhas.length > 0;
}

export async function professoresDaUnidade(
  sql: Conexao,
  redeId: string,
  unidadeId: string,
): Promise<{ id: string; nome: string }[]> {
  const linhas = await sql<{ id: string; name: string }[]>`
    SELECT u.id, u.name
    FROM app_user u
    JOIN user_role ur ON ur.user_id = u.id AND ur.network_id = u.network_id
    WHERE u.network_id = ${redeId}
      AND ur.school_id = ${unidadeId}
      AND ur.role = ${PAPEL.professor}
      AND u.active
    ORDER BY u.name
  `;
  return linhas.map((linha) => ({ id: linha.id, nome: linha.name }));
}

export async function nomesPorIds(
  sql: Conexao,
  redeId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map<string, string>();
  const linhas = await sql<{ id: string; name: string }[]>`
    SELECT id, name
    FROM app_user
    WHERE network_id = ${redeId} AND id IN ${sql(ids)}
  `;
  return new Map(linhas.map((linha): [string, string] => [linha.id, linha.name]));
}

export async function inserir(sql: Conexao, usuario: Usuario, senhaHash: string): Promise<void> {
  await sql`
    INSERT INTO app_user (id, network_id, email, cpf, password_hash, name, active, guardian_id)
    VALUES (
      ${usuario.id}, ${usuario.redeId}, ${usuario.email}, ${usuario.cpf}, ${senhaHash},
      ${usuario.nome}, ${usuario.ativo}, ${usuario.responsavelId}
    )
  `;
}

export async function inserirPapeis(
  sql: Conexao,
  redeId: string,
  usuarioId: string,
  atribuicoes: { unidadeId: string; papel: Papel }[],
): Promise<void> {
  for (const atribuicao of atribuicoes) {
    await sql`
      INSERT INTO user_role (network_id, user_id, school_id, role)
      VALUES (${redeId}, ${usuarioId}, ${atribuicao.unidadeId}, ${atribuicao.papel})
    `;
  }
}

export async function atualizarSenha(
  sql: Conexao,
  redeId: string,
  usuarioId: string,
  senhaHash: string,
): Promise<void> {
  await sql`
    UPDATE app_user
    SET password_hash = ${senhaHash}
    WHERE network_id = ${redeId} AND id = ${usuarioId}
  `;
}
