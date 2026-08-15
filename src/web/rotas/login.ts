/**
 * Entrar e sair do sistema.
 *
 * Duas decisões governam este arquivo:
 *
 * 1. A tela não é um oráculo. Rede inexistente, CPF desconhecido e senha errada voltam
 *    pela mesma porta, com a mensagem que `identidade.autenticar` já escolheu — quem fica
 *    tentando não descobre quem estuda ou trabalha na rede.
 * 2. I17: a tentativa vai para o log, o CPF digitado não. A linha guarda o identificador
 *    da rede, o desfecho e o endereço de origem resolvido por `ipDoCliente` (I12): é o bastante
 *    para reconhecer uma sequência de tentativas contra a mesma rede, e não transforma o log em
 *    cadastro de pessoas.
 *
 * A senha digitada nunca volta para a tela. A rede e o CPF voltam — quem errou a senha
 * não deve ser obrigado a redigitar o resto.
 */

import { Hono, type Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { identidade } from '../../identidade';
import { config } from '../../shared/config';
import { VARIAVEIS_DE_CONTEXTO } from '../../shared/constantes';
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

/** O painel de destino é escolhido pelo papel de quem entrou; aqui só se aponta para ele. */
const DESTINO_APOS_ENTRAR = ROTAS.publicas.painel();

/** Sair devolve à porta de entrada com o aviso do POST-Redirect-GET já na query. */
const DESTINO_APOS_SAIR = `${ROTAS.publicas.login()}?${PARAMETROS.ok}=${encodeURIComponent(AVISOS.sessaoEncerrada)}`;

export const rotasLogin = new Hono<{ Variables: Variaveis }>();

/** Campo de texto do formulário; o que não for texto simplesmente não foi preenchido. */
const texto = (corpo: CorpoDeFormulario, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

/** Senha não é aparada: espaço no início ou no fim faz parte do que a pessoa escolheu. */
const senhaDigitada = (corpo: CorpoDeFormulario): string => {
  const valor = corpo[CAMPOS.login.senha];
  return typeof valor === 'string' ? valor : '';
};

/**
 * O endereço da conexão só existe quando o processo está atrás do `Bun.serve`. Em teste, que
 * chama a aplicação direto, não há conexão para inspecionar — e `ipDoCliente` já sabe responder
 * com string vazia nesse caso.
 */
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
  // Quem já entrou não vê o formulário de novo: vai para o painel do seu papel.
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

/**
 * Sair apaga a sessão no banco antes de apagar o cookie: a ordem inversa deixaria uma linha
 * válida para um cookie que ainda estivesse em trânsito em outra aba.
 */
rotasLogin.post(ROTAS.publicas.logout.padrao, async (c) => {
  const sessaoId = sessaoIdAtual(c);
  if (sessaoId !== null) await identidade.encerrarSessao(sessaoId);
  await fecharSessao(c);
  return c.redirect(DESTINO_APOS_SAIR, 303);
});
