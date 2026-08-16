import { z } from 'zod';
import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, emptyPage, queryPage, type Page } from '../../shared/pagination';
import { systemClock } from '../../shared/ports';
import { redeAtiva } from '../dominio/rede';
import { sessaoExpirou } from '../dominio/sessao';
import type { Unidade } from '../dominio/unidade';
import { usuarioAutenticado, type UsuarioAutenticado, type UsuarioResumo } from '../dominio/usuario';
import * as redeRepositorio from '../infra/redeRepositorio';
import * as sessaoRepositorio from '../infra/sessaoRepositorio';
import * as unidadeRepositorio from '../infra/unidadeRepositorio';
import * as usuarioRepositorio from '../infra/usuarioRepositorio';

const identificador = z.string().uuid();

const isUuid = (valor: string): boolean => identificador.safeParse(valor).success;

export async function sessaoValida(sessaoId: string): Promise<UsuarioAutenticado | null> {
  if (!isUuid(sessaoId)) return null;
  const sql = reader();
  const encontrada = await sessaoRepositorio.porId(sql, sessaoId);
  if (encontrada === null) return null;

  const { sessao, rede, usuario } = encontrada;
  if (sessaoExpirou(sessao, systemClock.now())) return null;
  if (!redeAtiva(rede) || !usuario.ativo) return null;

  const papeis = await usuarioRepositorio.papeisDoUsuario(sql, rede.id, usuario.id);
  return usuarioAutenticado(usuario, rede, papeis);
}

export async function listarUnidades(redeId: string): Promise<Unidade[]> {
  if (!isUuid(redeId)) return [];
  return await unidadeRepositorio.listarPorRede(reader(), redeId);
}

export async function unidadePorId(redeId: string, unidadeId: string): Promise<Unidade | null> {
  if (!isUuid(redeId) || !isUuid(unidadeId)) return null;
  return await unidadeRepositorio.porId(reader(), redeId, unidadeId);
}

export async function paginaDeUnidades(
  redeId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<Unidade>> {
  if (!isUuid(redeId)) return emptyPage<Unidade>(tamanho);
  const sql = reader();
  return await queryPage(
    pagina,
    tamanho,
    () => unidadeRepositorio.contarPorRede(sql, redeId),
    (faixa) => unidadeRepositorio.listarPorRede(sql, redeId, faixa),
  );
}

export async function listarUsuarios(redeId: string): Promise<UsuarioResumo[]> {
  if (!isUuid(redeId)) return [];
  return await usuarioRepositorio.listarResumos(reader(), redeId);
}

export async function paginaDeUsuarios(
  redeId: string,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<UsuarioResumo>> {
  if (!isUuid(redeId)) return emptyPage<UsuarioResumo>(tamanho);
  const sql = reader();
  return await queryPage(
    pagina,
    tamanho,
    () => usuarioRepositorio.contarPorRede(sql, redeId),
    (faixa) => usuarioRepositorio.listarResumos(sql, redeId, faixa),
  );
}

export async function contarUnidadesEUsuarios(
  redeId: string,
): Promise<{ unidades: number; usuarios: number }> {
  if (!isUuid(redeId)) return { unidades: 0, usuarios: 0 };
  const sql = reader();
  const [unidades, usuarios] = await Promise.all([
    unidadeRepositorio.contarPorRede(sql, redeId),
    usuarioRepositorio.contarPorRede(sql, redeId),
  ]);
  return { unidades, usuarios };
}

export async function redePorSlug(
  slug: string,
): Promise<{ id: string; nome: string; slug: string; status: string } | null> {
  return await redeRepositorio.porSlug(reader(), slug);
}

export async function ehProfessorNaUnidade(
  redeId: string,
  usuarioId: string,
  unidadeId: string,
): Promise<boolean> {
  if (!isUuid(redeId) || !isUuid(usuarioId) || !isUuid(unidadeId)) {
    return false;
  }
  return await usuarioRepositorio.ehProfessorNaUnidade(reader(), redeId, usuarioId, unidadeId);
}

export async function professoresDaUnidade(
  redeId: string,
  unidadeId: string,
): Promise<{ id: string; nome: string }[]> {
  if (!isUuid(redeId) || !isUuid(unidadeId)) return [];
  return await usuarioRepositorio.professoresDaUnidade(reader(), redeId, unidadeId);
}

export async function nomesDeUsuarios(
  redeId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (!isUuid(redeId)) return new Map<string, string>();
  const validos = [...new Set(ids.filter(isUuid))];
  return await usuarioRepositorio.nomesPorIds(reader(), redeId, validos);
}
