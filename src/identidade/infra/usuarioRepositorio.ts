import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import { PAPEL } from '../constantes';
import { paraPapel, type Papel, type PapelEmUnidade } from '../dominio/papel';
import type { Usuario, UsuarioResumo } from '../dominio/usuario';

export type Credenciais = { usuario: Usuario; senhaHash: string };

type LinhaDeUsuario = {
  id: string;
  rede_id: string;
  nome: string;
  email: string;
  cpf: string;
  ativo: boolean;
  responsavel_id: string | null;
};

type LinhaDeCredenciais = LinhaDeUsuario & { senha_hash: string };

type LinhaDePapel = { unidade_id: string; unidade_nome: string; papel: string };

const paraUsuario = (linha: LinhaDeUsuario): Usuario => ({
  id: linha.id,
  redeId: linha.rede_id,
  nome: linha.nome,
  email: linha.email,
  cpf: linha.cpf,
  ativo: linha.ativo,
  responsavelId: linha.responsavel_id,
});

const paraPapelEmUnidade = (linha: LinhaDePapel): PapelEmUnidade => ({
  unidadeId: linha.unidade_id,
  unidadeNome: linha.unidade_nome,
  papel: paraPapel(linha.papel),
});

export async function credenciaisPorCpf(
  sql: Conexao,
  redeId: string,
  cpf: string,
): Promise<Credenciais | null> {
  const linhas = await sql<LinhaDeCredenciais[]>`
    SELECT id, rede_id, nome, email, cpf, ativo, responsavel_id, senha_hash
    FROM usuario
    WHERE rede_id = ${redeId} AND cpf = ${cpf} AND ativo
  `;
  const linha = linhas[0];
  return linha === undefined ? null : { usuario: paraUsuario(linha), senhaHash: linha.senha_hash };
}

export async function credenciaisPorId(
  sql: Conexao,
  usuarioId: string,
): Promise<Credenciais | null> {
  const linhas = await sql<LinhaDeCredenciais[]>`
    SELECT id, rede_id, nome, email, cpf, ativo, responsavel_id, senha_hash
    FROM usuario
    WHERE id = ${usuarioId} AND ativo
  `;
  const linha = linhas[0];
  return linha === undefined ? null : { usuario: paraUsuario(linha), senhaHash: linha.senha_hash };
}

export async function papeisDoUsuario(
  sql: Conexao,
  redeId: string,
  usuarioId: string,
): Promise<PapelEmUnidade[]> {
  const linhas = await sql<LinhaDePapel[]>`
    SELECT pu.unidade_id, u.nome AS unidade_nome, pu.papel
    FROM papel_usuario pu
    JOIN unidade u ON u.id = pu.unidade_id AND u.rede_id = pu.rede_id
    WHERE pu.rede_id = ${redeId} AND pu.usuario_id = ${usuarioId}
    ORDER BY u.nome, pu.papel
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
    SELECT id, rede_id, nome, email, cpf, ativo, responsavel_id
    FROM usuario
    WHERE rede_id = ${redeId}
    ORDER BY nome
    LIMIT ${limite}::int OFFSET ${deslocamento}::int
  `;
  if (usuarios.length === 0) return [];

  const ids = usuarios.map((linha) => linha.id);
  const papeis = await sql<(LinhaDePapel & { usuario_id: string })[]>`
    SELECT pu.usuario_id, pu.unidade_id, u.nome AS unidade_nome, pu.papel
    FROM papel_usuario pu
    JOIN unidade u ON u.id = pu.unidade_id AND u.rede_id = pu.rede_id
    WHERE pu.rede_id = ${redeId} AND pu.usuario_id IN ${sql(ids)}
    ORDER BY u.nome, pu.papel
  `;

  const porUsuario = new Map<string, PapelEmUnidade[]>();
  for (const linha of papeis) {
    const acumulado = porUsuario.get(linha.usuario_id) ?? [];
    porUsuario.set(linha.usuario_id, [...acumulado, paraPapelEmUnidade(linha)]);
  }

  return usuarios.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    cpf: linha.cpf,
    ativo: linha.ativo,
    papeis: porUsuario.get(linha.id) ?? [],
  }));
}

export async function contarPorRede(sql: Conexao, redeId: string): Promise<number> {
  const linhas = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM usuario
    WHERE rede_id = ${redeId}
  `;
  return linhas[0]?.total ?? 0;
}

export async function existeEmail(sql: Conexao, redeId: string, email: string): Promise<boolean> {
  const linhas = await sql<{ existe: number }[]>`
    SELECT 1 AS existe
    FROM usuario
    WHERE rede_id = ${redeId} AND email = ${email}
    LIMIT 1
  `;
  return linhas.length > 0;
}

export async function existeCpf(sql: Conexao, redeId: string, cpf: string): Promise<boolean> {
  const linhas = await sql<{ existe: number }[]>`
    SELECT 1 AS existe
    FROM usuario
    WHERE rede_id = ${redeId} AND cpf = ${cpf}
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
    FROM papel_usuario
    WHERE rede_id = ${redeId}
      AND usuario_id = ${usuarioId}
      AND unidade_id = ${unidadeId}
      AND papel = ${PAPEL.professor}
    LIMIT 1
  `;
  return linhas.length > 0;
}

export async function professoresDaUnidade(
  sql: Conexao,
  redeId: string,
  unidadeId: string,
): Promise<{ id: string; nome: string }[]> {
  const linhas = await sql<{ id: string; nome: string }[]>`
    SELECT u.id, u.nome
    FROM usuario u
    JOIN papel_usuario pu ON pu.usuario_id = u.id AND pu.rede_id = u.rede_id
    WHERE u.rede_id = ${redeId}
      AND pu.unidade_id = ${unidadeId}
      AND pu.papel = ${PAPEL.professor}
      AND u.ativo
    ORDER BY u.nome
  `;
  return linhas.map((linha) => ({ id: linha.id, nome: linha.nome }));
}

export async function nomesPorIds(
  sql: Conexao,
  redeId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map<string, string>();
  const linhas = await sql<{ id: string; nome: string }[]>`
    SELECT id, nome
    FROM usuario
    WHERE rede_id = ${redeId} AND id IN ${sql(ids)}
  `;
  return new Map(linhas.map((linha): [string, string] => [linha.id, linha.nome]));
}

export async function inserir(sql: Conexao, usuario: Usuario, senhaHash: string): Promise<void> {
  await sql`
    INSERT INTO usuario (id, rede_id, email, cpf, senha_hash, nome, ativo, responsavel_id)
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
      INSERT INTO papel_usuario (rede_id, usuario_id, unidade_id, papel)
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
    UPDATE usuario
    SET senha_hash = ${senhaHash}
    WHERE rede_id = ${redeId} AND id = ${usuarioId}
  `;
}
