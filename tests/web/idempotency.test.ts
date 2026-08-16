/*
 * I4 — the browser is external input.
 *
 * A guardian on bad 4G taps "send" twice and the system receives two identical requests. The key is
 * born when the form is rendered, travels in a hidden field and is written down before any
 * processing: whoever arrives afterwards with the same key meets the conflict and is taken to the
 * result of the first one, with nothing reprocessed. Two clicks on the same button are one record;
 * two loads of the screen are two keys and therefore two records — which is what the person asked
 * for.
 *
 * The other half of the rule is the giving back: when the form returns with a validation error, the
 * key is released. Without that, fixing one field would mean reloading the page.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase, testSql } from '../support/database';
import { fullScenario, type Scenario } from '../support/factories';
import { open, signIn, send, post } from './support';

const ROUTE = '/registrar/subjects';
const UUID_KEY = /name="_key" value="([0-9a-f-]{36})"/g;

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

describe('form idempotency', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('a write with no idempotency key is refused with a 400', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await post(ROUTE, { name: 'Geografia' }, cookie);

    expect(response.status).toBe(400);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(0);
  });

  test('a key outside the uuid format is refused with a 400', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await post(ROUTE, { _key: 'chave-inventada', name: 'Geografia' }, cookie);

    expect(response.status).toBe(400);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(0);
  });

  test('the same form sent twice creates a single record', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);
    const fields = { _key: crypto.randomUUID(), name: 'Geografia' };

    const first = await post(ROUTE, fields, cookie);
    const second = await post(ROUTE, fields, cookie);

    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(1);
  });

  test('the resend leads to the same destination as the first submission', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);
    const fields = { _key: crypto.randomUUID(), name: 'Geografia' };

    const first = await post(ROUTE, fields, cookie);
    const second = await post(ROUTE, fields, cookie);

    expect(second.headers.get('Location')).toBe(first.headers.get('Location'));
  });

  test('different keys create two records', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    await send(ROUTE, { name: 'Geografia' }, cookie);
    await send(ROUTE, { name: 'Artes' }, cookie);

    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(1);
    expect(await subjectsNamed(scenario.network.id, 'Artes')).toBe(1);
  });

  test('the key is stored with the destination recorded, not with the whole response', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);
    const key = crypto.randomUUID();

    const response = await post(ROUTE, { _key: key, name: 'Geografia' }, cookie);
    const rows = await testSql()<{ route: string; response_location: string }[]>`
      SELECT route, response_location FROM idempotent_request WHERE idempotency_key = ${key}`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.route).toBe(ROUTE);
    expect(rows[0]?.response_location).toBe(response.headers.get('Location') ?? '');
  });

  test('a form refused at validation gives the key back for the correction', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);
    const key = crypto.randomUUID();

    const rejected = await post(ROUTE, { _key: key, name: '' }, cookie);
    const keysAfter = await storedKeys();
    const fixed = await post(ROUTE, { _key: key, name: 'Geografia' }, cookie);

    expect(rejected.status).toBe(200);
    expect(keysAfter).toBe(0);
    expect(fixed.status).toBe(303);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(1);
  });

  test('every load of the form brings a fresh key', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const first = pageKeys(await (await open(ROUTE, cookie)).text());
    const second = pageKeys(await (await open(ROUTE, cookie)).text());

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBe(first.length);
    expect(first.some((key) => second.includes(key))).toBe(false);
  });

  test('one person\'s key does not block another person\'s form', async () => {
    const scenario = await fullScenario();
    const otherNetwork = await fullScenario();
    const key = crypto.randomUUID();

    const ofTheFirst = await post(
      ROUTE,
      { _key: key, name: 'Geografia' },
      await signInAsRegistrar(scenario),
    );
    const ofTheSecond = await post(
      ROUTE,
      { _key: crypto.randomUUID(), name: 'Geografia' },
      await signInAsRegistrar(otherNetwork),
    );

    expect(ofTheFirst.status).toBe(303);
    expect(ofTheSecond.status).toBe(303);
    expect(await subjectsNamed(scenario.network.id, 'Geografia')).toBe(1);
    expect(await subjectsNamed(otherNetwork.network.id, 'Geografia')).toBe(1);
  });
});
