import { Hono, type Context } from 'hono';
import { identity } from '../../identity';
import { CONTEXT_VARIABLES } from '../../shared/constants';
import { currentUser, requireLogin, type FormBody, type Variables } from '../../shared/http';
import { logger } from '../../shared/log';
import type { ApplicationError } from '../../shared/result';
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
} from '../constants';
import { renderizar } from '../render';

const MENSAGENS: Record<string, string> = {
  [CODIGOS_DE_AVISO.senhaAlterada]: AVISOS.senhaAlterada,
};

export const rotasConta = new Hono<{ Variables: Variables }>();

rotasConta.use(requireLogin());

const senha = (corpo: FormBody, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor : '';
};

const telaDeSenha = (c: Context, erros: ApplicationError[]): Response =>
  renderizar(c, TEMPLATES.conta.senha, { titulo: TITULOS.trocarSenha, erros });

rotasConta.get(ROTAS.conta.senha.padrao, (c) =>
  renderizar(c, TEMPLATES.conta.senha, {
    titulo: TITULOS.trocarSenha,
    erros: [],
    mensagem: MENSAGENS[c.req.query(PARAMETROS.ok) ?? ''],
  }),
);

rotasConta.post(ROTAS.conta.senha.padrao, async (c) => {
  const usuario = currentUser(c);
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const senhaNova = senha(corpo, CAMPOS.senha.nova);

  if (senhaNova !== senha(corpo, CAMPOS.senha.confirmacao)) {
    return telaDeSenha(c, [ERROS_DE_FORMULARIO.confirmacaoDiferente]);
  }

  const resultado = await identity.changePassword({
    userId: usuario.id,
    currentPassword: senha(corpo, CAMPOS.senha.atual),
    newPassword: senhaNova,
  });
  if (!resultado.ok) return telaDeSenha(c, resultado.erros);

  logger.info({ usuario_id: usuario.id }, EVENTOS_DE_LOG.senhaAlterada);
  return c.redirect(
    `${ROTAS.conta.senha()}?${PARAMETROS.ok}=${CODIGOS_DE_AVISO.senhaAlterada}`,
    303,
  );
});
