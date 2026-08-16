import type { Hono } from 'hono';
import { idempotencyMiddleware, type Variables } from '../../shared/http';
import { GRUPOS_DE_ESCRITA, ROTAS, curingaDe } from '../constants';
import { rotasComunicados } from './announcements';
import { rotasConta } from './account';
import { rotasLogin } from './login';
import { rotasProfessor } from './teacher';
import { rotasRede } from './network';
import { rotasResponsavel } from './guardian';
import { rotasSecretaria } from './registrar';

export type AplicacaoWeb = Hono<{ Variables: Variables }>;

export function montarRotas(app: AplicacaoWeb): void {
  app.use(ROTAS.publicas.login.padrao, idempotencyMiddleware);
  for (const prefixo of GRUPOS_DE_ESCRITA) {
    app.use(prefixo, idempotencyMiddleware);
    app.use(curingaDe(prefixo), idempotencyMiddleware);
  }

  app.route(ROTAS.publicas.prefixo, rotasLogin);
  app.route(ROTAS.conta.prefixo, rotasConta);
  app.route(ROTAS.rede.prefixo, rotasRede);
  app.route(ROTAS.secretaria.prefixo, rotasSecretaria);
  app.route(ROTAS.professor.prefixo, rotasProfessor);
  app.route(ROTAS.responsavel.prefixo, rotasResponsavel);
  app.route(ROTAS.comunicados.prefixo, rotasComunicados);
}

export {
  rotasComunicados,
  rotasConta,
  rotasLogin,
  rotasProfessor,
  rotasRede,
  rotasResponsavel,
  rotasSecretaria,
};
