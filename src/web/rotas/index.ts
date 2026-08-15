/**
 * Onde cada grupo de rota é pendurado no servidor.
 *
 * Cada router declara seus caminhos **relativos ao prefixo** em que é montado aqui — `rotasRede`
 * define `/unidades`, não `/rede/unidades`. Prefixo e caminho relativo são as duas leituras do
 * mesmo mapa (`ROTAS`, em `web/constantes.ts`): `.prefixo` monta o router aqui, `.padrao` registra
 * o caminho lá dentro. Trocar o prefixo de um papel continua sendo uma linha só — a que declara o
 * grupo no mapa.
 *
 * I4: `middlewareIdempotencia` é aplicado por prefixo, e não globalmente, porque ele exige a chave
 * `_chave` em todo POST e responde 400 sem ela. `GRUPOS_DE_ESCRITA` é exatamente a lista dos grupos
 * cujos formulários a carregam. `/login` entra na lista por um motivo diferente: o middleware lê o
 * corpo do formulário uma única vez e o deixa no contexto, e o login é POST anônimo — a tabela de
 * idempotência exige `usuario_id`, então ele apenas passa adiante. `/logout` fica de fora: sair
 * duas vezes é o mesmo estado, e não há registro a proteger.
 */

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
  // Registrado antes dos routers: no Hono, a ordem de registro é a ordem de execução.
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
