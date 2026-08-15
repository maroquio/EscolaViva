import type { Hono } from 'hono';
import { middlewareIdempotencia, type Variaveis } from '../../shared/http';
import { GRUPOS_DE_ESCRITA, ROTAS, curingaDe } from '../constantes';
import { rotasComunicados } from './comunicados';
import { rotasConta } from './conta';
import { rotasLogin } from './login';
import { rotasProfessor } from './professor';
import { rotasRede } from './rede';
import { rotasResponsavel } from './responsavel';
import { rotasSecretaria } from './secretaria';

export type AplicacaoWeb = Hono<{ Variables: Variaveis }>;

export function montarRotas(app: AplicacaoWeb): void {
  app.use(ROTAS.publicas.login.padrao, middlewareIdempotencia);
  for (const prefixo of GRUPOS_DE_ESCRITA) {
    app.use(prefixo, middlewareIdempotencia);
    app.use(curingaDe(prefixo), middlewareIdempotencia);
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
