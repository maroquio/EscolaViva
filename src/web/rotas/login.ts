import { Hono, type Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { identity } from '../../identity';
import { config } from '../../shared/config';
import { CONTEXT_VARIABLES } from '../../shared/constants';
import {
  clientIp,
  closeSession,
  currentSessionId,
  currentUserOrNull,
  openSession,
  type FormBody,
  type Variables,
} from '../../shared/http';
import { logger } from '../../shared/log';
import {
  AVISOS,
  CAMPOS,
  EVENTOS_DE_LOG,
  PARAMETROS,
  ROTAS,
  TEMPLATES,
  TITULOS,
  VALORES_INICIAIS,
} from '../constantes';
import { renderizar } from '../render';

const DESTINO_APOS_ENTRAR = ROTAS.publicas.painel();

const DESTINO_APOS_SAIR = `${ROTAS.publicas.login()}?${PARAMETROS.ok}=${encodeURIComponent(AVISOS.sessaoEncerrada)}`;

export const rotasLogin = new Hono<{ Variables: Variables }>();

const texto = (corpo: FormBody, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

const senhaDigitada = (corpo: FormBody): string => {
  const valor = corpo[CAMPOS.login.senha];
  return typeof valor === 'string' ? valor : '';
};

const enderecoRemoto = (c: Context): string | undefined => {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
};

const telaDeEntrada = (c: Context, dados: Record<string, unknown> = {}): Response =>
  renderizar(c, TEMPLATES.login, {
    titulo: TITULOS.login,
    valores: VALORES_INICIAIS.login,
    erros: [],
    ...dados,
  });

rotasLogin.get(ROTAS.publicas.login.padrao, (c) => {
  if (currentUserOrNull(c) !== null) return c.redirect(DESTINO_APOS_ENTRAR, 303);
  return telaDeEntrada(c);
});

rotasLogin.post(ROTAS.publicas.login.padrao, async (c) => {
  if (currentUserOrNull(c) !== null) return c.redirect(DESTINO_APOS_ENTRAR, 303);

  const corpo = c.get(CONTEXT_VARIABLES.body);
  const redeSlug = texto(corpo, CAMPOS.login.redeSlug);
  const cpf = texto(corpo, CAMPOS.login.cpf);
  const ip = clientIp(c.req.raw, enderecoRemoto(c), config.trustedProxies);

  const resultado = await identity.authenticate({
    networkSlug: redeSlug,
    loginIdentifier: cpf,
    password: senhaDigitada(corpo),
    ip,
  });

  if (!resultado.ok) {
    logger.warn(
      { rede_slug: redeSlug, resultado: EVENTOS_DE_LOG.recusado, ip },
      EVENTOS_DE_LOG.tentativaDeEntrada,
    );
    return telaDeEntrada(c, { valores: { redeSlug, cpf }, erros: resultado.erros });
  }

  await openSession(c, resultado.valor.sessionId);
  logger.info(
    { rede_slug: redeSlug, resultado: EVENTOS_DE_LOG.sucesso, ip },
    EVENTOS_DE_LOG.tentativaDeEntrada,
  );
  return c.redirect(DESTINO_APOS_ENTRAR, 303);
});

rotasLogin.post(ROTAS.publicas.logout.padrao, async (c) => {
  const sessaoId = currentSessionId(c);
  if (sessaoId !== null) await identity.endSession(sessaoId);
  await closeSession(c);
  return c.redirect(DESTINO_APOS_SAIR, 303);
});
