/*
 * Signing in, staying in and signing out, in JSON.
 *
 * The decisions from the SSR login survive the port unchanged, which is what this file is here to
 * hold. An unknown CPF and a wrong password are indistinguishable, so nobody can use the endpoint to
 * find out who exists. The attempt reaches the log while the CPF typed does not. And an unknown
 * network is a *different* answer — the migration ports that as it stands rather than tightening it,
 * because it may not change a business rule, and a case below pins it so the day someone closes that
 * gap it is a decision and not an accident.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { SESSION_COOKIE } from '../../src/shared/http';
import { ROLE } from '../../src/identity';
import { API } from '../../src/http/constants';
import { clearDatabase, testSql } from '../support/database';
import { DEFAULT_PASSWORD, fullScenario } from '../support/factories';
import { cookieFromResponse, read, signIn, write } from './support';

const SESSION = `${API.versionedPrefix}/session`;

type Refusal = { errors: { field?: string; code: string; message: string }[] };

type SessionBody = {
  user: {
    id: string;
    email: string;
    networkSlug: string;
    roles: { role: string; schoolId: string; schoolName: string }[];
  };
};

describe('opening a session', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('valid credentials answer 201 with the user and set the cookie', async () => {
    const scenario = await fullScenario();

    const response = await write('POST', SESSION, {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: DEFAULT_PASSWORD,
    });
    const body = (await response.json()) as SessionBody;

    expect(response.status).toBe(201);
    expect(body.user.networkSlug).toBe(scenario.network.slug);
    expect(body.user.roles.some((role) => role.role === ROLE.registrar)).toBe(true);
    expect(response.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=`);
  });

  /*
   * The user in the 201 comes from the authentication result, not from the request context: the
   * session middleware ran long before this route and left the context anonymous. Reading it here
   * would answer with no user at all, and only an assertion on a field proves the difference.
   */
  test('the answer carries the roles and the network, not an empty shell', async () => {
    const scenario = await fullScenario();

    const response = await write('POST', SESSION, {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: DEFAULT_PASSWORD,
    });
    const body = (await response.json()) as SessionBody;

    expect(body.user.id).toBe(scenario.registrar.id);
    expect(body.user.roles.length).toBeGreaterThan(0);
    expect(body.user.roles[0]?.schoolName).not.toBe('');
  });

  /*
   * One door for the two mistakes that identify a person: an unknown CPF and a wrong password are
   * indistinguishable, so the endpoint cannot be used to find out who exists inside a network.
   */
  test('an unknown CPF and a wrong password come back identical', async () => {
    const scenario = await fullScenario();

    const unknownPerson = await write('POST', SESSION, {
      networkSlug: scenario.network.slug,
      cpf: '529.982.247-25',
      password: DEFAULT_PASSWORD,
    });
    const wrongPassword = await write('POST', SESSION, {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: 'senha-errada',
    });

    const first = (await unknownPerson.json()) as Refusal;
    const second = (await wrongPassword.json()) as Refusal;

    expect(unknownPerson.status).toBe(422);
    expect(wrongPassword.status).toBe(422);
    expect(first.errors).toEqual(second.errors);
  });

  /*
   * The network is a separate answer, and this case pins the behaviour rather than endorsing it.
   * `identity.authenticate` refuses an unknown slug with `network_unavailable` on the `networkSlug`
   * field, which is a different shape from `invalid_credentials` — so the endpoint does say whether
   * a network exists. That is what the SSR screen has always shown, this migration ports it
   * unchanged because it may not alter a business rule, and the test exists so the day someone
   * decides to close it, the decision is deliberate rather than accidental.
   */
  test('an unknown network is refused as a network, which is a distinguishable answer', async () => {
    const scenario = await fullScenario();

    const response = await write('POST', SESSION, {
      networkSlug: 'rede-que-nao-existe',
      cpf: scenario.registrar.cpf,
      password: DEFAULT_PASSWORD,
    });
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.code).toBe('network_unavailable');
    expect(body.errors[0]?.field).toBe('networkSlug');
  });

  test('a body missing a field is a 400, which is shape, not a 422, which is rule', async () => {
    const response = await write('POST', SESSION, { networkSlug: 'rede-teste-1' });

    expect(response.status).toBe(400);
  });

  test('the password never comes back, in the accepted answer or the refused one', async () => {
    const scenario = await fullScenario();

    const accepted = await write('POST', SESSION, {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: DEFAULT_PASSWORD,
    });
    const refused = await write('POST', SESSION, {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: 'senha-errada',
    });

    expect(await accepted.text()).not.toContain(DEFAULT_PASSWORD);
    expect(await refused.text()).not.toContain('senha-errada');
  });

  /*
   * A leading or trailing space is part of the password somebody chose; the slug and the CPF are
   * typed into a field and get trimmed. Trimming the password would silently refuse an account whose
   * owner did nothing wrong.
   */
  test('the slug is trimmed and the password is not', async () => {
    const scenario = await fullScenario();

    const trimmedSlug = await write('POST', SESSION, {
      networkSlug: `  ${scenario.network.slug}  `,
      cpf: scenario.registrar.cpf,
      password: DEFAULT_PASSWORD,
    });
    const paddedPassword = await write('POST', SESSION, {
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: ` ${DEFAULT_PASSWORD} `,
    });

    expect(trimmedSlug.status).toBe(201);
    expect(paddedPassword.status).toBe(422);
  });
});

describe('reading and ending a session', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const signedIn = async (): Promise<{ cookie: string; email: string; userId: string }> => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    return { cookie, email: scenario.registrar.email, userId: scenario.registrar.id };
  };

  test('without a cookie the session reads 401', async () => {
    const response = await read(SESSION);

    expect(response.status).toBe(401);
  });

  test('with a cookie it answers who signed in', async () => {
    const { cookie, email } = await signedIn();

    const response = await read(SESSION, cookie);
    const body = (await response.json()) as SessionBody;

    expect(response.status).toBe(200);
    expect(body.user.email).toBe(email);
  });

  test('signing out answers 204 and the next read is anonymous again', async () => {
    const { cookie } = await signedIn();

    const exit = await write('DELETE', SESSION, null, cookie);
    const after = await read(SESSION, cookie);

    expect(exit.status).toBe(204);
    expect(after.status).toBe(401);
  });

  /*
   * The row goes before the cookie. Deleting only the cookie would leave a session the server still
   * honours for anyone who kept the value — which is the whole reason the session lives in a table.
   */
  test('signing out deletes the row, not merely the cookie', async () => {
    const { cookie, userId } = await signedIn();

    await write('DELETE', SESSION, null, cookie);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM session WHERE user_id = ${userId}`;

    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });

  test('the cookie the sign-out sends back no longer carries the session', async () => {
    const { cookie } = await signedIn();

    const exit = await write('DELETE', SESSION, null, cookie);
    const cleared = cookieFromResponse(exit);

    expect(cleared).not.toBe(cookie);
  });
});
