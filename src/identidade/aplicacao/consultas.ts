import { z } from 'zod';
import { leitura } from '../../shared/db';
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

/**
 * I22 vale também na leitura: id fora do formato vira lista vazia ou nulo aqui, e não um erro
 * de conversão do PostgreSQL virando 500 por causa de um parâmetro de rota digitado à mão.
 */
const ehIdentificador = (valor: string): boolean => identificador.safeParse(valor).success;

/**
 * Chamada a cada requisição autenticada. A validade é decidida pelo domínio a partir do que o
 * banco devolveu — a linha vencida continua lá até o expurgo passar, e uma rede suspensa derruba
 * na hora as sessões que já estavam abertas.
 */
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

export async function listarUsuarios(redeId: string): Promise<UsuarioResumo[]> {
  if (!ehIdentificador(redeId)) return [];
  return await usuarioRepositorio.listarResumos(leitura(), redeId);
}

/** A tela de login precisa do nome da rede antes de existir sessão — por isso é pública. */
export async function redePorSlug(
  slug: string,
): Promise<{ id: string; nome: string; slug: string; status: string } | null> {
  return await redeRepositorio.porSlug(leitura(), slug);
}

/** O acadêmico usa isto para recusar alocar como professor quem não é professor na unidade. */
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

/** Resolve nome de autor e de professor em lote: uma consulta por tela, não uma por linha. */
export async function nomesDeUsuarios(
  redeId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (!ehIdentificador(redeId)) return new Map<string, string>();
  const validos = [...new Set(ids.filter(ehIdentificador))];
  return await usuarioRepositorio.nomesPorIds(leitura(), redeId, validos);
}
