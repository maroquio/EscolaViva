/*
 * I4 — o navegador é entrada externa.
 *
 * Um responsável em 4G ruim toca duas vezes em "enviar" e o sistema recebe duas requisições
 * idênticas. A chave nasce no render do formulário, viaja em campo oculto e é gravada antes do
 * processamento: quem chega depois com a mesma chave encontra o conflito e é levado ao resultado
 * da primeira sem reprocessar nada. Dois cliques no mesmo botão são um registro; dois
 * carregamentos da tela são duas chaves e, portanto, dois registros — que é o que a pessoa pediu.
 *
 * A outra metade da regra é a devolução: quando o formulário volta com erro de validação, a chave
 * é liberada. Sem isso, corrigir um campo exigiria recarregar a página.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase, testSql } from '../support/database';
import { fullScenario, type Scenario } from '../support/factories';
import { open, signIn, send, post } from './support';

const ROUTE = '/registrar/subjects';
const UUID_KEY = /name="_chave" value="([0-9a-f-]{36})"/g;

const pageKeys = (html: string): string[] =>
  [...html.matchAll(UUID_KEY)].flatMap((meeting) =>
    meeting[1] === undefined ? [] : [meeting[1]],
  );

const signInAsRegistrar = (scenario: Scenario): Promise<string> =>
  signIn({
    networkSlug: scenario.network.slug,
    cpf: scenario.registrar.cpf,
    password: scenario.password,
  });

const subjectsNamed = async (networkId: string, name: string): Promise<number> => {
  const rows = await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM subject WHERE network_id = ${networkId} AND name = ${name}`;
  return Number(rows[0]?.total ?? '0');
};

const storedKeys = async (): Promise<number> => {
  const rows = await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM idempotent_request`;
  return Number(rows[0]?.total ?? '0');
};

describe('idempotência de formulário', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('escrita sem chave de idempotência é recusada com 400', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await post(ROUTE, { nome: 'Geografia' }, cookie);

    expect(response.status).toBe(400);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(0);
  });

  test('chave fora do formato de uuid é recusada com 400', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await post(ROUTE, { _chave: 'chave-inventada', nome: 'Geografia' }, cookie);

    expect(response.status).toBe(400);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(0);
  });

  test('o mesmo formulário enviado duas vezes cria um único registro', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);
    const fields = { _chave: crypto.randomUUID(), nome: 'Geografia' };

    const first = await post(ROUTE, fields, cookie);
    const second = await post(ROUTE, fields, cookie);

    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(1);
  });

  test('o reenvio leva ao mesmo destino da primeira submissão', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);
    const fields = { _chave: crypto.randomUUID(), nome: 'Geografia' };

    const first = await post(ROUTE, fields, cookie);
    const second = await post(ROUTE, fields, cookie);

    expect(second.headers.get('Location')).toBe(first.headers.get('Location'));
  });

  test('chaves diferentes criam dois registros', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    await send(ROUTE, { nome: 'Geografia' }, cookie);
    await send(ROUTE, { nome: 'Artes' }, cookie);

    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(1);
    expect(await subjectsNamed(scenario.network.id, 'Artes')).toBe(1);
  });

  test('a chave é registrada com o destino gravado, e não com a resposta inteira', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);
    const key = crypto.randomUUID();

    const response = await post(ROUTE, { _chave: key, nome: 'Geografia' }, cookie);
    const rows = await testSql()<{ route: string; response_location: string }[]>`
      SELECT route, response_location FROM idempotent_request WHERE idempotency_key = ${key}`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.route).toBe(ROUTE);
    expect(rows[0]?.response_location).toBe(response.headers.get('Location') ?? '');
  });

  test('formulário recusado na validação devolve a chave para a correção', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);
    const key = crypto.randomUUID();

    const rejected = await post(ROUTE, { _chave: key, nome: '' }, cookie);
    const keysAfter = await storedKeys();
    const fixed = await post(ROUTE, { _chave: key, nome: 'Geografia' }, cookie);

    expect(rejected.status).toBe(200);
    expect(keysAfter).toBe(0);
    expect(fixed.status).toBe(303);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(1);
  });

  test('cada carregamento do formulário traz uma chave nova', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const first = pageKeys(await (await open(ROUTE, cookie)).text());
    const second = pageKeys(await (await open(ROUTE, cookie)).text());

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBe(first.length);
    expect(first.some((key) => second.includes(key))).toBe(false);
  });

  test('a chave de uma pessoa não bloqueia o formulário de outra', async () => {
    const scenario = await fullScenario();
    const otherNetwork = await fullScenario();
    const key = crypto.randomUUID();

    const ofTheFirst = await post(
      ROUTE,
      { _chave: key, nome: 'Geografia' },
      await signInAsRegistrar(scenario),
    );
    const ofTheSecond = await post(
      ROUTE,
      { _chave: crypto.randomUUID(), nome: 'Geografia' },
      await signInAsRegistrar(otherNetwork),
    );

    expect(ofTheFirst.status).toBe(303);
    expect(ofTheSecond.status).toBe(303);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(1);
    expect(await subjectsNamed(otherNetwork.network.id, 'Geografia')).toBe(1);
  });
});
