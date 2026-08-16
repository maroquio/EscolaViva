/*
 * I2 — signing in, staying in and signing out.
 *
 * The process keeps no session in memory: the signed cookie carries only the id, and what answers
 * who the user is is the `session` table, on every request. The cases below cover the four things
 * that implies — the cookie the application emits, the cookie it refuses, the screen that will not
 * tell who exists, and the logout that erases the row, not just the cookie.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { generateCpf } from '../../src/shared/document';
import { clearDatabase, testSql } from '../support/database';
import { DEFAULT_PASSWORD, fullScenario, createNetwork, createUser } from '../support/factories';
import { open, cookieFromResponse, signIn, send, post } from './support';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Two login screens may differ only in what the person typed — never in what the database holds. */
const withoutVolatileValues = (html: string, ...values: string[]): string =>
  values
    .reduce((text, value) => text.replaceAll(value, 'CPF_DIGITADO'), html)
    .replace(UUID, 'IDENTIFICADOR');

/** Swaps the first character of the signed id: same shape, a signature that no longer checks out. */
const tamper = (cookie: string): string => {
  const separator = cookie.indexOf('=');
  const name = cookie.slice(0, separator);
  const value = cookie.slice(separator + 1);
  const swapped = value.startsWith('a') ? 'b' : 'a';
  return `${name}=${swapped}${value.slice(1)}`;
};

const storedSessions = async (userId: string): Promise<number> => {
  const rows = await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM session WHERE user_id = ${userId}`;
  return Number(rows[0]?.total ?? '0');
};

describe('authentication', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('valid credentials lead to the dashboard with a 303', async () => {
    const scenario = await fullScenario();

    const response = await send('/login', {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/dashboard');
  });

  test('the session cookie is HttpOnly, SameSite=Lax and holds across the whole site', async () => {
    const scenario = await fullScenario();

    const response = await send('/login', {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const header = response.headers.get('Set-Cookie') ?? '';

    expect(header).toContain('ev_session=');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
  });

  test('the cookie carries only the id of the stored session, not the user', async () => {
    const scenario = await fullScenario();

    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const rows = await testSql()<{ id: string }[]>`
      SELECT id::text FROM session WHERE user_id = ${scenario.registrar.id}`;
    const sessionId = rows[0]?.id ?? '';

    expect(rows).toHaveLength(1);
    expect(decodeURIComponent(cookie)).toContain(sessionId);
    expect(cookie).not.toContain(scenario.registrar.email);
  });

  test('a wrong password comes back to the sign-in screen without opening a session', async () => {
    const scenario = await fullScenario();

    const response = await send('/login', {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: 'senha-que-nao-e-a-dele',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(await storedSessions(scenario.registrar.id)).toBe(0);
  });

  test('an unknown CPF and a wrong password give back the very same screen', async () => {
    const scenario = await fullScenario();
    const unknown = generateCpf(888_888);

    const withWrongPassword = await send('/login', {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: 'senha-que-nao-e-a-dele',
    });
    const withNonexistentCpf = await send('/login', {
      networkSlug: scenario.network.slug,
      cpf: unknown,
      password: 'senha-que-nao-e-a-dele',
    });
    const first = withoutVolatileValues(await withWrongPassword.text(), scenario.registrar.cpf);
    const second = withoutVolatileValues(await withNonexistentCpf.text(), unknown);

    expect(withNonexistentCpf.status).toBe(withWrongPassword.status);
    expect(second).toBe(first);
    expect(first).toContain('CPF ou senha inválidos');
  });

  test('a user from another network does not get in through the wrong slug', async () => {
    const scenario = await fullScenario();
    const other = await createNetwork({});
    await createUser({ networkId: other.id, password: DEFAULT_PASSWORD });

    const response = await send('/login', {
      networkSlug: other.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    expect(response.status).toBe(200);
    expect(await storedSessions(scenario.registrar.id)).toBe(0);
  });

  test('an authenticated route with no cookie redirects to the login', async () => {
    const response = await open('/registrar');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/login');
  });

  test('a write with no cookie is refused rather than redirected', async () => {
    const response = await send('/registrar/subjects', { name: 'Filosofia' });

    expect(response.status).toBe(401);
  });

  test('a cookie with a tampered signature opens no authenticated route', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const withGoodCookie = await open('/registrar', cookie);
    const withTamperedCookie = await open('/registrar', tamper(cookie));

    expect(withGoodCookie.status).toBe(200);
    expect(withTamperedCookie.status).toBe(303);
    expect(withTamperedCookie.headers.get('Location')).toBe('/login');
  });

  test('a made-up cookie, with no signature at all, opens no authenticated route', async () => {
    const response = await open('/registrar', `ev_session=${crypto.randomUUID()}`);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/login');
  });

  test('signing out erases the session from the database, not just the cookie from the browser', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const signedOut = await post('/logout', {}, cookie);
    const after = await open('/registrar', cookie);

    expect(signedOut.status).toBe(303);
    expect(await storedSessions(scenario.registrar.id)).toBe(0);
    expect(after.status).toBe(303);
    expect(after.headers.get('Location')).toBe('/login');
  });

  test('signing out also tells the browser to throw the cookie away', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const signedOut = await post('/logout', {}, cookie);
    const discarded = cookieFromResponse(signedOut);

    expect(discarded).toBe('ev_session=');
  });

  test('whoever is already in does not see the sign-in form again', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const response = await open('/login', cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/dashboard');
  });

  test('the root leads to the login with no session and to the dashboard with one', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const anonymousResponse = await open('/');
    const autenticada = await open('/', cookie);

    expect(anonymousResponse.headers.get('Location')).toBe('/login');
    expect(autenticada.headers.get('Location')).toBe('/dashboard');
  });
});
