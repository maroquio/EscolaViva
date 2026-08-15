import { z } from 'zod';
import { leitura } from '../../shared/db';
import {
  TAMANHO_PADRAO,
  consultarPagina,
  paginaVazia,
  type Pagina,
} from '../../shared/paginacao';
import { clockDoSistema } from '../../shared/ports';
import { redeAtiva } from '../dominio/rede';
import { sessaoExpirou } from '../dominio/sessao';
import type { Unidade } from '../dominio/unidade';
import { usuarioAutenticado, type UsuarioAutenticado, type UsuarioResumo } from '../dominio/usuario';
import * as redeRepositorio from '../infra/redeRepositorio';
import * as sessaoRepositorio from '../infra/sessaoRepositorio';
import * as unidadeRepositorio from '../infra/unidadeRepositorio';
import * as usuarioRepositorio from '../infra/usuarioRepositorio';

const identificador = z.string().uuid();

const ehIdentificador = (valor: string): boolean => identificador.safeParse(valor).success;

export async function sessaoValida(sessaoId: string): Promise<UsuarioAutenticado | null> {
  if (!ehIdentificador(sessaoId)) return null;
  const sql = leitura();
  const encontrada = await sessaoRepositorio.porId(sql, sessaoId);
  if (encontrada === null) return null;

  const { sessao, rede, usuario } = encontrada;
  if (sessaoExpirou(sessao, clockDoSistema.agora())) return null;
  if (!redeAtiva(rede) || !usuario.ativo) return null;

  const papeis = await usuarioRepositorio.papeisDoUsuario(sql, rede.id, usuario.id);
  return usuarioAutenticado(usuario, rede, papeis);
}

export async function listarUnidades(redeId: string): Promise<Unidade[]> {
  if (!ehIdentificador(redeId)) return [];
  return await unidadeRepositorio.listarPorRede(leitura(), redeId);
}

export async function unidadePorId(redeId: string, unidadeId: string): Promise<Unidade | null> {
  if (!ehIdentificador(redeId) || !ehIdentificador(unidadeId)) return null;
  return await unidadeRepositorio.porId(leitura(), redeId, unidadeId);
}

export async function paginaDeUnidades(
  redeId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<Unidade>> {
  if (!ehIdentificador(redeId)) return paginaVazia<Unidade>(tamanho);
  const sql = leitura();
  return await consultarPagina(
    pagina,
    tamanho,
    () => unidadeRepositorio.contarPorRede(sql, redeId),
    (faixa) => unidadeRepositorio.listarPorRede(sql, redeId, faixa),
  );
}

export async function listarUsuarios(redeId: string): Promise<UsuarioResumo[]> {
  if (!ehIdentificador(redeId)) return [];
  return await usuarioRepositorio.listarResumos(leitura(), redeId);
}

export async function paginaDeUsuarios(
  redeId: string,
  pagina: number,
  tamanho: number = TAMANHO_PADRAO,
): Promise<Pagina<UsuarioResumo>> {
  if (!ehIdentificador(redeId)) return paginaVazia<UsuarioResumo>(tamanho);
  const sql = leitura();
  return await consultarPagina(
    pagina,
    tamanho,
    () => usuarioRepositorio.contarPorRede(sql, redeId),
    (faixa) => usuarioRepositorio.listarResumos(sql, redeId, faixa),
  );
}

export async function contarUnidadesEUsuarios(
  redeId: string,
): Promise<{ unidades: number; usuarios: number }> {
  if (!ehIdentificador(redeId)) return { unidades: 0, usuarios: 0 };
  const sql = leitura();
  const [unidades, usuarios] = await Promise.all([
    unidadeRepositorio.contarPorRede(sql, redeId),
    usuarioRepositorio.contarPorRede(sql, redeId),
  ]);
  return { unidades, usuarios };
}

export async function redePorSlug(
  slug: string,
): Promise<{ id: string; nome: string; slug: string; status: string } | null> {
  return await redeRepositorio.porSlug(leitura(), slug);
}

export async function ehProfessorNaUnidade(
  redeId: string,
  usuarioId: string,
  unidadeId: string,
): Promise<boolean> {
  if (!ehIdentificador(redeId) || !ehIdentificador(usuarioId) || !ehIdentificador(unidadeId)) {
    return false;
  }
  return await usuarioRepositorio.ehProfessorNaUnidade(leitura(), redeId, usuarioId, unidadeId);
}

export async function professoresDaUnidade(
  redeId: string,
  unidadeId: string,
): Promise<{ id: string; nome: string }[]> {
  if (!ehIdentificador(redeId) || !ehIdentificador(unidadeId)) return [];
  return await usuarioRepositorio.professoresDaUnidade(leitura(), redeId, unidadeId);
}

export async function nomesDeUsuarios(
  redeId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (!ehIdentificador(redeId)) return new Map<string, string>();
  const validos = [...new Set(ids.filter(ehIdentificador))];
  return await usuarioRepositorio.nomesPorIds(leitura(), redeId, validos);
}
