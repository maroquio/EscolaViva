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

const MENSAGENS: Record<string, string> = {
  [CODIGOS_DE_AVISO.senhaAlterada]: AVISOS.senhaAlterada,
};

export const rotasConta = new Hono<{ Variables: Variaveis }>();

rotasConta.use(exigirLogin());

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
