/*
 * Signing in, staying in and signing out. All against a real PostgreSQL: the EscolaViva session
 * lives in a table (I2), and it is the row — with the network and the user beside it — that decides
 * whether the session holds.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { identity } from '../../src/identity';
import { generateCpf } from '../../src/shared/document';
import type { ApplicationError, Result } from '../../src/shared/result';
import { clearDatabase, testSql } from '../support/database';
import {
  DEFAULT_PASSWORD,
  fullScenario,
  createNetwork,
  createSession,
  createSchool,
  createUser,
} from '../support/factories';

const HOUR_IN_MS = 3_600_000;
const NEW_PASSWORD = 'nova-senha-2026';

function valueOfResult<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

function errorsOf(result: Result<unknown>): ApplicationError[] {
  if (result.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return result.errors;
}

async function countSessions(userId: string): Promise<number> {
  const rows = await testSql()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM session WHERE user_id = ${userId}`;
  return rows[0]?.total ?? 0;
}

beforeEach(clearDatabase);

describe('authenticate', () => {
  test('with the right credentials it opens the session and gives back the user with network and roles', async () => {
    const network = await createNetwork({ name: 'Rede Municipal Serra', slug: 'serra' });
    const center = await createSchool({ networkId: network.id, name: 'Escola Centro' });
    const beach = await createSchool({ networkId: network.id, name: 'Escola Praia' });
    const user = await createUser({
      networkId: network.id,
      name: 'Ana Souza',
      email: 'ana.souza@serra.br',
      roles: [
        { schoolId: beach.id, role: 'registrar' },
        { schoolId: center.id, role: 'teacher' },
      ],
    });

    const result = await identity.authenticate({
      networkSlug: 'serra',
      loginIdentifier: user.cpf,
      password: DEFAULT_PASSWORD,
      ip: '203.0.113.7',
    });

    const { sessionId, user: authenticatedUser } = valueOfResult(result);
    expect(authenticatedUser).toEqual({
      id: user.id,
      networkId: network.id,
      networkName: 'Rede Municipal Serra',
      networkSlug: 'serra',
      name: 'Ana Souza',
      email: 'ana.souza@serra.br',
      roles: [
        { schoolId: center.id, schoolName: 'Escola Centro', role: 'teacher' },
        { schoolId: beach.id, schoolName: 'Escola Praia', role: 'registrar' },
      ],
      guardianId: null,
    });
    const rows = await testSql()<{ user_id: string; expires_at: Date; ip: string | null }[]>`
      SELECT user_id, expires_at, ip FROM session WHERE id = ${sessionId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(user.id);
    expect(rows[0]?.ip).toBe('203.0.113.7');
    expect(rows[0]?.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('with no IP the session is born without an address rather than with empty text', async () => {
    const network = await createNetwork({ slug: 'sem-ip' });
    const user = await createUser({ networkId: network.id, email: 'carlos@escola.br' });

    const result = await identity.authenticate({
      networkSlug: 'sem-ip',
      loginIdentifier: user.cpf,
      password: DEFAULT_PASSWORD,
      ip: '',
    });

    const { sessionId } = valueOfResult(result);
    const rows = await testSql()<{ ip: string | null }[]>`
      SELECT ip FROM session WHERE id = ${sessionId}`;
    expect(rows[0]?.ip).toBeNull();
  });

  test('a wrong password, a CPF that does not exist and an inactive user all give the same refusal, pointing at no field', async () => {
    const network = await createNetwork({ slug: 'generica' });
    const active = await createUser({ networkId: network.id, email: 'ativo@escola.br' });
    const inactive = await createUser({ networkId: network.id, email: 'inativo@escola.br', active: false });

    const [wrongPassword, nonexistentCpf, inactiveUser] = await Promise.all([
      identity.authenticate({
        networkSlug: 'generica', loginIdentifier: active.cpf, password: 'senha-errada-1', ip: '',
      }),
      identity.authenticate({
        networkSlug: 'generica', loginIdentifier: generateCpf(999_998), password: DEFAULT_PASSWORD, ip: '',
      }),
      identity.authenticate({
        networkSlug: 'generica', loginIdentifier: inactive.cpf, password: DEFAULT_PASSWORD, ip: '',
      }),
    ]);

    const genericRejection = [{ code: 'invalid_credentials', message: 'CPF ou senha inválidos' }];
    expect(errorsOf(wrongPassword)).toEqual(genericRejection);
    expect(errorsOf(nonexistentCpf)).toEqual(genericRejection);
    expect(errorsOf(inactiveUser)).toEqual(genericRejection);
    // With no `field`, the screen cannot highlight the identifier input and give away which of the three it is.
    const pointAtField = [wrongPassword, nonexistentCpf, inactiveUser]
      .flatMap(errorsOf)
      .some((error) => Object.hasOwn(error, 'field'));
    expect(pointAtField).toBe(false);
  });

  test('none of the three refusals opens a session', async () => {
    const network = await createNetwork({ slug: 'sem-sessao' });
    const user = await createUser({ networkId: network.id, email: 'ativo@escola.br' });
    const inactive = await createUser({ networkId: network.id, email: 'inativo@escola.br', active: false });

    await Promise.all([
      identity.authenticate({
        networkSlug: 'sem-sessao', loginIdentifier: user.cpf, password: 'senha-errada-1', ip: '',
      }),
      identity.authenticate({
        networkSlug: 'sem-sessao', loginIdentifier: inactive.cpf, password: DEFAULT_PASSWORD, ip: '',
      }),
    ]);

    expect(await countSessions(user.id)).toBe(0);
    expect(await countSessions(inactive.id)).toBe(0);
  });

  test('a suspended network and a network that does not exist refuse over the network, not over the credentials', async () => {
    const suspended = await createNetwork({ slug: 'suspensa', status: 'suspended' });
    const user = await createUser({ networkId: suspended.id, email: 'ana@escola.br' });

    const [suspendedNetwork, nonexistentNetwork] = await Promise.all([
      identity.authenticate({
        networkSlug: 'suspensa', loginIdentifier: user.cpf, password: DEFAULT_PASSWORD, ip: '',
      }),
      identity.authenticate({
        networkSlug: 'rede-que-nao-existe', loginIdentifier: user.cpf, password: DEFAULT_PASSWORD, ip: '',
      }),
    ]);

    // The network is typed by the user on the screen and is no secret: the two refusals match each
    // other and differ from the credential refusal, so they do not turn into a "my password stopped
    // working" support ticket.
    const networkRejection = [
      {
        field: 'networkSlug',
        code: 'network_unavailable',
        message: 'rede não encontrada ou fora de operação',
      },
    ];
    expect(errorsOf(suspendedNetwork)).toEqual(networkRejection);
    expect(errorsOf(nonexistentNetwork)).toEqual(networkRejection);
  });

  test('a cancelled network opens no session either', async () => {
    const cancelled = await createNetwork({ slug: 'cancelada', status: 'cancelled' });
    const user = await createUser({ networkId: cancelled.id, email: 'ana@escola.br' });

    const result = await identity.authenticate({
      networkSlug: 'cancelada', loginIdentifier: user.cpf, password: DEFAULT_PASSWORD, ip: '',
    });

    expect(errorsOf(result)[0]?.code).toBe('network_unavailable');
    expect(await countSessions(user.id)).toBe(0);
  });

  test('a blank form comes back with an error on every required field', async () => {
    const network = await createNetwork({ slug: 'em-branco' });
    await createUser({ networkId: network.id, email: 'ana@escola.br' });

    const result = await identity.authenticate({
      networkSlug: '', loginIdentifier: '', password: '', ip: '',
    });

    const fields = errorsOf(result).map((error) => error.field);
    expect(fields).toEqual(['networkSlug', 'cpf', 'password']);
  });

  test('the same CPF across different networks authenticates each one in its own network', async () => {
    const first = await createNetwork({ slug: 'primeira' });
    const second = await createNetwork({ slug: 'segunda' });
    const sharedCpf = generateCpf(700_001);
    const ofTheFirst = await createUser({ networkId: first.id, cpf: sharedCpf });
    const ofTheSecond = await createUser({ networkId: second.id, cpf: sharedCpf });

    const [inTheFirst, inTheSecond] = await Promise.all([
      identity.authenticate({
        networkSlug: 'primeira', loginIdentifier: sharedCpf, password: DEFAULT_PASSWORD, ip: '',
      }),
      identity.authenticate({
        networkSlug: 'segunda', loginIdentifier: sharedCpf, password: DEFAULT_PASSWORD, ip: '',
      }),
    ]);

    expect(valueOfResult(inTheFirst).user.id).toBe(ofTheFirst.id);
    expect(valueOfResult(inTheSecond).user.id).toBe(ofTheSecond.id);
  });

  test('signs in with a bare CPF', async () => {
    const scenario = await fullScenario();

    const authenticated = await identity.authenticate({
      networkSlug: scenario.network.slug,
      loginIdentifier: scenario.registrar.cpf,
      password: scenario.password,
      ip: '',
    });

    expect(authenticated.ok).toBe(true);
  });

  test('signs in with a punctuated CPF', async () => {
    const scenario = await fullScenario();
    const cpf = scenario.registrar.cpf;
    const punctuated = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    const authenticated = await identity.authenticate({
      networkSlug: scenario.network.slug, loginIdentifier: punctuated, password: scenario.password, ip: '',
    });

    expect(authenticated.ok).toBe(true);
  });

  test('an e-mail no longer gets in — the identifier is the CPF', async () => {
    const scenario = await fullScenario();

    const authenticated = await identity.authenticate({
      networkSlug: scenario.network.slug, loginIdentifier: scenario.registrar.email,
      password: scenario.password, ip: '',
    });

    expect(authenticated.ok).toBe(false);
  });

  test('a CPF that does not exist and a wrong password give the same refusal', async () => {
    const scenario = await fullScenario();

    const [nonexistent, wrongPassword] = await Promise.all([
      identity.authenticate({
        networkSlug: scenario.network.slug, loginIdentifier: generateCpf(999_999), password: scenario.password, ip: '',
      }),
      identity.authenticate({
        networkSlug: scenario.network.slug, loginIdentifier: scenario.registrar.cpf, password: 'errada', ip: '',
      }),
    ]);

    expect(nonexistent.ok).toBe(false);
    expect(wrongPassword.ok).toBe(false);
    if (!nonexistent.ok && !wrongPassword.ok) {
      expect(nonexistent.errors).toEqual(wrongPassword.errors);
    }
  });
});

describe('validSession', () => {
  test('gives back the user of a session still within its window', async () => {
    const network = await createNetwork({ name: 'Rede Norte', slug: 'norte' });
    const school = await createSchool({ networkId: network.id, name: 'Escola Norte' });
    const user = await createUser({
      networkId: network.id, name: 'Ana Souza', email: 'ana@norte.br',
      roles: [{ schoolId: school.id, role: 'network_admin' }],
    });
    const session = await createSession({ networkId: network.id, userId: user.id });

    const found = await identity.validSession(session.id);

    expect(found).toEqual({
      id: user.id,
      networkId: network.id,
      networkName: 'Rede Norte',
      networkSlug: 'norte',
      name: 'Ana Souza',
      email: 'ana@norte.br',
      roles: [{ schoolId: school.id, schoolName: 'Escola Norte', role: 'network_admin' }],
      guardianId: null,
    });
  });

  test('an expired session does not hold, even with the row still in the database', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    const expiredSession = await createSession({
      networkId: network.id, userId: user.id, expiresAt: new Date(Date.now() - HOUR_IN_MS),
    });

    const found = await identity.validSession(expiredSession.id);

    expect(found).toBeNull();
    expect(await countSessions(user.id)).toBe(1);
  });

  test('a session id that does not exist gives back null', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id });

    const found = await identity.validSession(crypto.randomUUID());

    expect(found).toBeNull();
  });

  test('an id outside the format gives back null instead of blowing up on a cast error', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id });

    const found = await identity.validSession('nao-e-um-uuid');

    expect(found).toBeNull();
  });

  test('suspending the network drops the sessions already open, on the spot', async () => {
    const network = await createNetwork({ slug: 'derrubada' });
    const user = await createUser({ networkId: network.id });
    const session = await createSession({ networkId: network.id, userId: user.id });

    await testSql()`UPDATE network SET status = 'suspended' WHERE id = ${network.id}`;

    expect(await identity.validSession(session.id)).toBeNull();
  });

  test('deactivating the user drops that user\'s session', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    const session = await createSession({ networkId: network.id, userId: user.id });

    await testSql()`UPDATE app_user SET active = false WHERE id = ${user.id}`;

    expect(await identity.validSession(session.id)).toBeNull();
  });
});

describe('endSession', () => {
  test('erases the session and it stops holding', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    const session = await createSession({ networkId: network.id, userId: user.id });

    await identity.endSession(session.id);

    expect(await identity.validSession(session.id)).toBeNull();
    expect(await countSessions(user.id)).toBe(0);
  });

  test('ends only the session asked for and leaves the user\'s others standing', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    const ofTheLaptop = await createSession({ networkId: network.id, userId: user.id });
    const ofTheMobile = await createSession({ networkId: network.id, userId: user.id });

    await identity.endSession(ofTheLaptop.id);

    expect(await identity.validSession(ofTheMobile.id)).not.toBeNull();
    expect(await countSessions(user.id)).toBe(1);
  });

  test('a forged id erases nothing and blows up on nothing', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    await createSession({ networkId: network.id, userId: user.id });

    await identity.endSession('cookie-forjado');

    expect(await countSessions(user.id)).toBe(1);
  });
});

describe('purgeExpiredSessions', () => {
  test('removes only the expired ones and reports how many went out', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    await createSession({
      networkId: network.id, userId: user.id, expiresAt: new Date(Date.now() - HOUR_IN_MS),
    });
    await createSession({
      networkId: network.id, userId: user.id, expiresAt: new Date(Date.now() - 1000),
    });
    const alive = await createSession({ networkId: network.id, userId: user.id });

    const removed = await identity.purgeExpiredSessions();

    expect(removed).toBe(2);
    expect(await countSessions(user.id)).toBe(1);
    expect(await identity.validSession(alive.id)).not.toBeNull();
  });

  test('with no expired session it removes nothing and reports zero', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    await createSession({ networkId: network.id, userId: user.id });

    const removed = await identity.purgeExpiredSessions();

    expect(removed).toBe(0);
    expect(await countSessions(user.id)).toBe(1);
  });
});

describe('changePassword', () => {
  test('demands the current password', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });

    const result = await identity.changePassword({
      userId: user.id, currentPassword: 'chute-errado-1', newPassword: NEW_PASSWORD,
    });

    expect(errorsOf(result)).toEqual([
      { field: 'currentPassword', code: 'wrong_password', message: 'a senha atual não confere' },
    ]);
  });

  test('refuses a new password that is too short', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });

    const result = await identity.changePassword({
      userId: user.id, currentPassword: DEFAULT_PASSWORD, newPassword: 'curta123',
    });

    expect(errorsOf(result)[0]?.field).toBe('newPassword');
  });

  test('the new password starts authenticating and the old one stops working', async () => {
    const network = await createNetwork({ slug: 'troca' });
    const user = await createUser({ networkId: network.id, email: 'ana@troca.br' });

    const swap = await identity.changePassword({
      userId: user.id, currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD,
    });

    expect(swap.ok).toBe(true);
    const withTheNewOne = await identity.authenticate({
      networkSlug: 'troca', loginIdentifier: user.cpf, password: NEW_PASSWORD, ip: '',
    });
    const withTheOldOne = await identity.authenticate({
      networkSlug: 'troca', loginIdentifier: user.cpf, password: DEFAULT_PASSWORD, ip: '',
    });
    expect(withTheNewOne.ok).toBe(true);
    expect(errorsOf(withTheOldOne)[0]?.code).toBe('invalid_credentials');
  });

  test('changing one user\'s password does not touch another user\'s in the same network', async () => {
    const network = await createNetwork({ slug: 'vizinhos' });
    const ana = await createUser({ networkId: network.id, email: 'ana@vizinhos.br' });
    const bia = await createUser({ networkId: network.id, email: 'bia@vizinhos.br' });

    await identity.changePassword({
      userId: ana.id, currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD,
    });

    const result = await identity.authenticate({
      networkSlug: 'vizinhos', loginIdentifier: bia.cpf, password: DEFAULT_PASSWORD, ip: '',
    });
    expect(result.ok).toBe(true);
  });

  test('a user who does not exist is refused without pointing at any field', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id });

    const result = await identity.changePassword({
      userId: crypto.randomUUID(), currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD,
    });

    expect(errorsOf(result)).toEqual([
      { code: 'user_not_found', message: 'usuário não encontrado' },
    ]);
  });

  test('a user id outside the format is refused by the input validation', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id });

    const result = await identity.changePassword({
      userId: 'nao-e-uuid', currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD,
    });

    expect(errorsOf(result)[0]?.field).toBe('userId');
  });
});
