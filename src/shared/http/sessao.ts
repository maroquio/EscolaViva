import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { config } from '../config';
import { COOKIE, MOTIVOS_INTERNOS, TEMPO, VARIAVEIS_DE_CONTEXTO } from '../constantes';
import { comContexto, contextoAtual } from './correlacao';
import { NaoAutorizado } from './erros';

// `shared/` não conhece módulo de domínio: a forma do usuário autenticado é declarada aqui, e o
// papel é união literal. `identidade.UsuarioAutenticado` é estruturalmente idêntico, então a
// atribuição funciona nos dois sentidos sem que uma camada precise importar a outra.
export type PapelDaSessao = 'admin_rede' | 'secretaria' | 'professor' | 'responsavel';

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

/**
 * O nome do cookie continua exportado daqui porque `shared/http/index.ts` o reexporta, mas o valor
 * mora em `COOKIE`, ao lado do caminho e do `sameSite` que precisam mudar junto com ele.
 */
export const COOKIE_SESSAO = COOKIE.sessao;

/** Quem sabe resolver um id de sessão em usuário é injetado pela camada web. */
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
  // `false` é assinatura inválida — cookie forjado ou segredo trocado. Vale o mesmo que ausente.
  const valor = await getSignedCookie(c, config.sessionSecret, COOKIE_SESSAO);
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
};

/**
 * I2: o processo não guarda sessão em memória. O cookie assinado carrega apenas o id; quem
 * responde quem é o usuário é o banco, a cada requisição. Derrubar um container e subir outro
 * não perde nada além do que já estava em voo.
 */
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
