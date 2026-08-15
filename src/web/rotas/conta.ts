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
import { VARIAVEIS_DE_CONTEXTO } from '../../shared/constantes';
import { exigirLogin, usuarioAtual, type CorpoDeFormulario, type Variaveis } from '../../shared/http';
import { logger } from '../../shared/log';
import type { ErroDeAplicacao } from '../../shared/resultado';
import {
  AVISOS,
  CAMPOS,
  CODIGOS_DE_AVISO,
  ERROS_DE_FORMULARIO,
  EVENTOS_DE_LOG,
  PARAMETROS,
  ROTAS,
  TEMPLATES,
  TITULOS,
} from '../constantes';
import { renderizar } from '../render';

/** O código volta na URL depois do POST-Redirect-GET; a frase que a pessoa lê nasce aqui. */
const MENSAGENS: Record<string, string> = {
  [CODIGOS_DE_AVISO.senhaAlterada]: AVISOS.senhaAlterada,
};

export const rotasConta = new Hono<{ Variables: Variaveis }>();

rotasConta.use(exigirLogin());

/** Senha não é aparada: espaço no início ou no fim faz parte do que a pessoa escolheu. */
const senha = (corpo: CorpoDeFormulario, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor : '';
};

const telaDeSenha = (c: Context, erros: ErroDeAplicacao[]): Response =>
  renderizar(c, TEMPLATES.conta.senha, { titulo: TITULOS.trocarSenha, erros });

rotasConta.get(ROTAS.conta.senha.padrao, (c) =>
  renderizar(c, TEMPLATES.conta.senha, {
    titulo: TITULOS.trocarSenha,
    erros: [],
    mensagem: MENSAGENS[c.req.query(PARAMETROS.ok) ?? ''],
  }),
);

rotasConta.post(ROTAS.conta.senha.padrao, async (c) => {
  const usuario = usuarioAtual(c);
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const senhaNova = senha(corpo, CAMPOS.senha.nova);

  // Conferir a confirmação antes de chamar o caso de uso evita gastar cem milissegundos de
  // verificação de hash para descobrir que a pessoa se enganou ao redigitar.
  if (senhaNova !== senha(corpo, CAMPOS.senha.confirmacao)) {
    return telaDeSenha(c, [ERROS_DE_FORMULARIO.confirmacaoDiferente]);
  }

  const resultado = await identidade.trocarSenha({
    usuarioId: usuario.id,
    senhaAtual: senha(corpo, CAMPOS.senha.atual),
    senhaNova,
  });
  if (!resultado.ok) return telaDeSenha(c, resultado.erros);

  logger.info({ usuario_id: usuario.id }, EVENTOS_DE_LOG.senhaAlterada);
  return c.redirect(
    `${ROTAS.conta.senha()}?${PARAMETROS.ok}=${CODIGOS_DE_AVISO.senhaAlterada}`,
    303,
  );
});
