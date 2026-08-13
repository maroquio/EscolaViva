/**
 * A conta de quem está logado — no Estágio 01, trocar a própria senha.
 *
 * É a tela que fecha o ciclo do convite: o administrador da rede cria o usuário e dita uma senha
 * provisória, e a pessoa entra e escolhe a sua. Vale para qualquer papel.
 *
 * I22: a confirmação é conferida aqui, no servidor. O `required` do HTML serve para o retorno
 * imediato; quem decide se a troca acontece é este arquivo e o caso de uso de `identidade`. Senha
 * nenhuma — atual, nova ou confirmação — volta para a tela nem entra em linha de log.
 */

import { Hono, type Context } from 'hono';
import { identidade } from '../../identidade';
import { exigirLogin, usuarioAtual, type CorpoDeFormulario, type Variaveis } from '../../shared/http';
import { logger } from '../../shared/log';
import type { ErroDeAplicacao } from '../../shared/resultado';
import { renderizar } from '../render';

const TEMPLATE = '/conta/senha';
const TITULO = 'Trocar senha';
const ROTA = '/conta/senha';

/** O código volta na URL depois do POST-Redirect-GET; a frase que a pessoa lê nasce aqui. */
const MENSAGENS: Record<string, string> = {
  'senha-alterada': 'Senha alterada. Use a senha nova no próximo acesso.',
};

const CONFIRMACAO_DIFERENTE: ErroDeAplicacao = {
  campo: 'senhaConfirmacao',
  codigo: 'confirmacao_diferente',
  mensagem: 'A confirmação não confere com a senha nova.',
};

export const rotasConta = new Hono<{ Variables: Variaveis }>();

rotasConta.use(exigirLogin());

/** Senha não é aparada: espaço no início ou no fim faz parte do que a pessoa escolheu. */
const senha = (corpo: CorpoDeFormulario, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor : '';
};

const telaDeSenha = (c: Context, erros: ErroDeAplicacao[]): Response =>
  renderizar(c, TEMPLATE, { titulo: TITULO, erros });

rotasConta.get('/senha', (c) =>
  renderizar(c, TEMPLATE, {
    titulo: TITULO,
    erros: [],
    mensagem: MENSAGENS[c.req.query('ok') ?? ''],
  }),
);

rotasConta.post('/senha', async (c) => {
  const usuario = usuarioAtual(c);
  const corpo = c.get('corpo');
  const senhaNova = senha(corpo, 'senhaNova');

  // Conferir a confirmação antes de chamar o caso de uso evita gastar cem milissegundos de
  // verificação de hash para descobrir que a pessoa se enganou ao redigitar.
  if (senhaNova !== senha(corpo, 'senhaConfirmacao')) return telaDeSenha(c, [CONFIRMACAO_DIFERENTE]);

  const resultado = await identidade.trocarSenha({
    usuarioId: usuario.id,
    senhaAtual: senha(corpo, 'senhaAtual'),
    senhaNova,
  });
  if (!resultado.ok) return telaDeSenha(c, resultado.erros);

  logger.info({ usuario_id: usuario.id }, 'senha alterada pelo próprio usuário');
  return c.redirect(`${ROTA}?ok=senha-alterada`, 303);
});
