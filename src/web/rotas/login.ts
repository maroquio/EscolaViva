import { Hono, type Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { identidade } from '../../identidade';
import { config } from '../../shared/config';
import { VARIAVEIS_DE_CONTEXTO } from '../../shared/constants';
import {
  abrirSessao,
  fecharSessao,
  ipDoCliente,
  sessaoIdAtual,
  usuarioAtualOuNulo,
  type CorpoDeFormulario,
  type Variaveis,
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

export const rotasLogin = new Hono<{ Variables: Variaveis }>();

const texto = (corpo: CorpoDeFormulario, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

const senhaDigitada = (corpo: CorpoDeFormulario): string => {
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
  if (usuarioAtualOuNulo(c) !== null) return c.redirect(DESTINO_APOS_ENTRAR, 303);
  return telaDeEntrada(c);
});

rotasLogin.post(ROTAS.publicas.login.padrao, async (c) => {
  if (usuarioAtualOuNulo(c) !== null) return c.redirect(DESTINO_APOS_ENTRAR, 303);

  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const redeSlug = texto(corpo, CAMPOS.login.redeSlug);
  const cpf = texto(corpo, CAMPOS.login.cpf);
  const ip = ipDoCliente(c.req.raw, enderecoRemoto(c), config.proxiesConfiaveis);

  const resultado = await identidade.autenticar({
    redeSlug,
    identificador: cpf,
    senha: senhaDigitada(corpo),
    ip,
  });

  if (!resultado.ok) {
    logger.warn(
      { rede_slug: redeSlug, resultado: EVENTOS_DE_LOG.recusado, ip },
      EVENTOS_DE_LOG.tentativaDeEntrada,
    );
    return telaDeEntrada(c, { valores: { redeSlug, cpf }, erros: resultado.erros });
  }

  await abrirSessao(c, resultado.valor.sessaoId);
  logger.info(
    { rede_slug: redeSlug, resultado: EVENTOS_DE_LOG.sucesso, ip },
    EVENTOS_DE_LOG.tentativaDeEntrada,
  );
  return c.redirect(DESTINO_APOS_ENTRAR, 303);
});

rotasLogin.post(ROTAS.publicas.logout.padrao, async (c) => {
  const sessaoId = sessaoIdAtual(c);
  if (sessaoId !== null) await identidade.encerrarSessao(sessaoId);
  await fecharSessao(c);
  return c.redirect(DESTINO_APOS_SAIR, 303);
});
