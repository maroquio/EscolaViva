import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { config } from '../config';
import { COOKIE, MOTIVOS_INTERNOS, TEMPO, VARIAVEIS_DE_CONTEXTO } from '../constants';
import { comContexto, contextoAtual } from './correlation';
import { NaoAutorizado } from './errors';

export type PapelDaSessao = 'network_admin' | 'registrar' | 'teacher' | 'guardian';

export type UsuarioDaSessao = {
  id: string;
  redeId: string;
  redeNome: string;
  redeSlug: string;
  nome: string;
  email: string;
  papeis: { unidadeId: string; unidadeNome: string; papel: PapelDaSessao }[];
  responsavelId: string | null;
};

export const COOKIE_SESSAO = COOKIE.sessao;

export type CarregadorDeUsuario = (sessaoId: string) => Promise<UsuarioDaSessao | null>;

const opcoesDoCookie = () => ({
  path: COOKIE.caminho,
  httpOnly: true,
  secure: config.cookieSeguro,
  sameSite: COOKIE.sameSite,
  maxAge: config.sessaoDuracaoHoras * TEMPO.segundosPorHora,
});

const guardar = (c: Context, sessaoId: string | null, usuario: UsuarioDaSessao | null): void => {
  c.set(VARIAVEIS_DE_CONTEXTO.sessaoId, sessaoId);
  c.set(VARIAVEIS_DE_CONTEXTO.usuario, usuario);
};

const sessaoIdDoCookie = async (c: Context): Promise<string | null> => {
  const valor = await getSignedCookie(c, config.sessionSecret, COOKIE_SESSAO);
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
};

export function criarMiddlewareSessao(carregar: CarregadorDeUsuario): MiddlewareHandler {
  return async (c, next) => {
    const sessaoId = await sessaoIdDoCookie(c);
    if (sessaoId === null) {
      guardar(c, null, null);
      return next();
    }
    const usuario = await carregar(sessaoId);
    if (usuario === null) {
      await fecharSessao(c);
      return next();
    }
    guardar(c, sessaoId, usuario);
    const contexto = contextoAtual();
    if (contexto === undefined) return next();
    return comContexto({ ...contexto, usuarioId: usuario.id, redeId: usuario.redeId }, next);
  };
}

export async function abrirSessao(c: Context, sessaoId: string): Promise<void> {
  await setSignedCookie(c, COOKIE_SESSAO, sessaoId, config.sessionSecret, opcoesDoCookie());
}

export async function fecharSessao(c: Context): Promise<void> {
  deleteCookie(c, COOKIE_SESSAO, { path: COOKIE.caminho, secure: config.cookieSeguro });
  guardar(c, null, null);
}

export function sessaoIdAtual(c: Context): string | null {
  const sessaoId: string | null | undefined = c.get(VARIAVEIS_DE_CONTEXTO.sessaoId);
  return sessaoId ?? null;
}

export function usuarioAtualOuNulo(c: Context): UsuarioDaSessao | null {
  const usuario: UsuarioDaSessao | null | undefined = c.get(VARIAVEIS_DE_CONTEXTO.usuario);
  return usuario ?? null;
}

export function usuarioAtual(c: Context): UsuarioDaSessao {
  const usuario = usuarioAtualOuNulo(c);
  if (usuario === null) throw new NaoAutorizado(MOTIVOS_INTERNOS.requisicaoSemSessao);
  return usuario;
}
