/**
 * Onde cada grupo de rota é pendurado no servidor.
 *
 * Cada router declara seus caminhos **relativos ao prefixo** em que é montado aqui — `rotasRede`
 * define `/unidades`, não `/rede/unidades`. Trocar o prefixo de um papel é, por isso, uma linha
 * neste arquivo.
 *
 * I4: `middlewareIdempotencia` é aplicado por prefixo, e não globalmente, porque ele exige a chave
 * `_chave` em todo POST e responde 400 sem ela. Os prefixos abaixo são exatamente os grupos cujos
 * formulários a carregam. `/login` entra na lista por um motivo diferente: o middleware lê o corpo
 * do formulário uma única vez e o deixa no contexto, e o login é POST anônimo — a tabela de
 * idempotência exige `usuario_id`, então ele apenas passa adiante. `/logout` fica de fora: sair
 * duas vezes é o mesmo estado, e não há registro a proteger.
 */

import type { Hono } from 'hono';
import { middlewareIdempotencia, type Variaveis } from '../../shared/http';
import { rotasComunicados } from './comunicados';
import { rotasConta } from './conta';
import { rotasLogin } from './login';
import { rotasProfessor } from './professor';
import { rotasRede } from './rede';
import { rotasResponsavel } from './responsavel';
import { rotasSecretaria } from './secretaria';

export type AplicacaoWeb = Hono<{ Variables: Variaveis }>;

const PREFIXO_CONTA = '/conta';
const PREFIXO_REDE = '/rede';
const PREFIXO_SECRETARIA = '/secretaria';
const PREFIXO_PROFESSOR = '/professor';
const PREFIXO_RESPONSAVEL = '/responsavel';
const PREFIXO_COMUNICADOS = '/comunicados';

const GRUPOS_DE_ESCRITA: readonly string[] = [
  PREFIXO_CONTA,
  PREFIXO_REDE,
  PREFIXO_SECRETARIA,
  PREFIXO_PROFESSOR,
  PREFIXO_RESPONSAVEL,
  PREFIXO_COMUNICADOS,
];

export function montarRotas(app: AplicacaoWeb): void {
  // Registrado antes dos routers: no Hono, a ordem de registro é a ordem de execução.
  app.use('/login', middlewareIdempotencia);
  for (const prefixo of GRUPOS_DE_ESCRITA) {
    app.use(prefixo, middlewareIdempotencia);
    app.use(`${prefixo}/*`, middlewareIdempotencia);
  }

  app.route('/', rotasLogin);
  app.route(PREFIXO_CONTA, rotasConta);
  app.route(PREFIXO_REDE, rotasRede);
  app.route(PREFIXO_SECRETARIA, rotasSecretaria);
  app.route(PREFIXO_PROFESSOR, rotasProfessor);
  app.route(PREFIXO_RESPONSAVEL, rotasResponsavel);
  app.route(PREFIXO_COMUNICADOS, rotasComunicados);
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
