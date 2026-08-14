/**
 * Entrar e sair do sistema.
 *
 * Duas decisões governam este arquivo:
 *
 * 1. A tela não é um oráculo. Rede inexistente, CPF ou e-mail desconhecido e senha errada voltam
 *    pela mesma porta, com a mensagem que `identidade.autenticar` já escolheu — quem fica
 *    tentando não descobre quem estuda ou trabalha na rede.
 * 2. I17: a tentativa vai para o log, o CPF ou e-mail digitado não. A linha guarda o identificador
 *    da rede, o desfecho e o endereço de origem resolvido por `ipDoCliente` (I12): é o bastante
 *    para reconhecer uma sequência de tentativas contra a mesma rede, e não transforma o log em
 *    cadastro de pessoas.
 *
 * A senha digitada nunca volta para a tela. A rede e o CPF ou e-mail voltam — quem errou a senha
 * não deve ser obrigado a redigitar o resto.
 */

import { Hono, type Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { identidade } from '../../identidade';
import { config } from '../../shared/config';
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
import { renderizar } from '../render';

const TEMPLATE = '/login';
const TITULO = 'Entrar';
const DESTINO_APOS_ENTRAR = '/painel';
const DESTINO_APOS_SAIR = `/login?ok=${encodeURIComponent('Sessão encerrada.')}`;

export const rotasLogin = new Hono<{ Variables: Variaveis }>();

/** Campo de texto do formulário; o que não for texto simplesmente não foi preenchido. */
const texto = (corpo: CorpoDeFormulario, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

/** Senha não é aparada: espaço no início ou no fim faz parte do que a pessoa escolheu. */
const senhaDigitada = (corpo: CorpoDeFormulario): string => {
  const valor = corpo['senha'];
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
  renderizar(c, TEMPLATE, {
    titulo: TITULO,
    valores: { redeSlug: '', identificador: '' },
    erros: [],
    ...dados,
  });

rotasLogin.get('/login', (c) => {
  // Quem já entrou não vê o formulário de novo: vai para o painel do seu papel.
  if (usuarioAtualOuNulo(c) !== null) return c.redirect(DESTINO_APOS_ENTRAR, 303);
  return telaDeEntrada(c);
});

rotasLogin.post('/login', async (c) => {
  if (usuarioAtualOuNulo(c) !== null) return c.redirect(DESTINO_APOS_ENTRAR, 303);

  const corpo = c.get('corpo');
  const redeSlug = texto(corpo, 'redeSlug');
  const identificador = texto(corpo, 'identificador');
  const ip = ipDoCliente(c.req.raw, enderecoRemoto(c), config.proxiesConfiaveis);

  const resultado = await identidade.autenticar({
    redeSlug,
    identificador,
    senha: senhaDigitada(corpo),
    ip,
  });

  if (!resultado.ok) {
    logger.warn({ rede_slug: redeSlug, resultado: 'recusado', ip }, 'tentativa de entrada');
    return telaDeEntrada(c, { valores: { redeSlug, identificador }, erros: resultado.erros });
  }

  await abrirSessao(c, resultado.valor.sessaoId);
  logger.info({ rede_slug: redeSlug, resultado: 'sucesso', ip }, 'tentativa de entrada');
  return c.redirect(DESTINO_APOS_ENTRAR, 303);
});

/**
 * Sair apaga a sessão no banco antes de apagar o cookie: a ordem inversa deixaria uma linha
 * válida para um cookie que ainda estivesse em trânsito em outra aba.
 */
rotasLogin.post('/logout', async (c) => {
  const sessaoId = sessaoIdAtual(c);
  if (sessaoId !== null) await identidade.encerrarSessao(sessaoId);
  await fecharSessao(c);
  return c.redirect(DESTINO_APOS_SAIR, 303);
});
