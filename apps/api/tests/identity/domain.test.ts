/*
 * The identity domain talks to no database: whether the network operates, whether a role exists
 * and whether a session still holds are all decided by pure functions. This is how they are
 * exercised here.
 */

import { describe, expect, test } from 'bun:test';
import { generateCpf } from '../../src/shared/document';
import { ROLES, isValidRole, toRole } from '../../src/identity/domain/role';
import {
  NETWORK_STATUSES,
  isNetworkActive,
  toNetworkStatus,
  type Network,
} from '../../src/identity/domain/network';
import {
  hasSessionExpired,
  sessionExpiration,
  type Session,
} from '../../src/identity/domain/session';
import {
  MINIMUM_PASSWORD_LENGTH,
  normalizedEmail,
  toAuthenticatedUser,
  type User,
} from '../../src/identity/domain/user';

const HOUR_IN_MS = 3_600_000;
const NOW = new Date('2026-03-10T08:00:00.000Z');

const networkWith = (status: Network['status']): Network => ({
  id: 'rede-1',
  name: 'Rede Municipal Central',
  slug: 'central',
  status,
});

const sessionExpiringAt = (expiresAt: Date): Session => ({
  id: 'sessao-1',
  networkId: 'rede-1',
  userId: 'usuario-1',
  createdAt: NOW,
  expiresAt,
  ip: '203.0.113.7',
});

describe('the network status', () => {
  test('converts the three statuses the schema accepts', () => {
    const fromTheDatabase = [...NETWORK_STATUSES];

    const converted = fromTheDatabase.map(toNetworkStatus);

    expect(converted).toEqual(['active', 'suspended', 'cancelled']);
  });

  test('refuses a status outside the domain instead of serving the network in an unknown state', () => {
    const outsider = 'inadimplente';

    const convert = (): string => toNetworkStatus(outsider);

    expect(convert).toThrow('network status outside the domain: inadimplente');
  });

  test('only an active network operates; suspended and cancelled do not', () => {
    const networks = [networkWith('active'), networkWith('suspended'), networkWith('cancelled')];

    const operand = networks.map(isNetworkActive);

    expect(operand).toEqual([true, false, false]);
  });
});

describe('the user role', () => {
  test('recognizes the four roles the product has', () => {
    const known = [...ROLES];

    const valid = known.map(isValidRole);

    expect(valid).toEqual([true, true, true, true]);
  });

  test('does not recognize a position the product does not model', () => {
    const position = 'diretor';

    const valid = isValidRole(position);

    expect(valid).toBe(false);
  });

  test('refuses an unknown role instead of dropping it in silence', () => {
    const unknown = 'coordenador';

    const convert = (): string => toRole(unknown);

    expect(convert).toThrow('role outside the domain: coordenador');
  });
});

describe('how long a session holds', () => {
  test('the expiry is the duration added to the instant of creation', () => {
    const durationHours = 12;

    const expiresAt = sessionExpiration(NOW, durationHours);

    expect(expiresAt.getTime()).toBe(NOW.getTime() + durationHours * HOUR_IN_MS);
  });

  test('a session still within its window keeps holding', () => {
    const session = sessionExpiringAt(new Date(NOW.getTime() + HOUR_IN_MS));

    const expired = hasSessionExpired(session, NOW);

    expect(expired).toBe(false);
  });

  test('an expired session holds no more', () => {
    const session = sessionExpiringAt(new Date(NOW.getTime() - 1));

    const expired = hasSessionExpired(session, NOW);

    expect(expired).toBe(true);
  });

  test('a session expiring exactly now already holds no more', () => {
    const session = sessionExpiringAt(new Date(NOW.getTime()));

    const expired = hasSessionExpired(session, NOW);

    expect(expired).toBe(true);
  });
});

describe('the user', () => {
  test('the e-mail loses its surrounding spaces and goes to lower case', () => {
    const typed = '  Ana.Souza@Escola.BR  ';

    const normalized = normalizedEmail(typed);

    expect(normalized).toBe('ana.souza@escola.br');
  });

  test('an already normalized e-mail passes through unchanged', () => {
    const typed = 'ana.souza@escola.br';

    const normalized = normalizedEmail(typed);

    expect(normalized).toBe(typed);
  });

  test('the authenticated user carries identity, network and every role', () => {
    const user: User = {
      id: 'usuario-1',
      networkId: 'rede-1',
      name: 'Ana Souza',
      email: 'ana.souza@escola.br',
      cpf: generateCpf(1),
      phone: null,
      active: true,
    };
    const roles = [
      { schoolId: 'unidade-1', schoolName: 'Escola Centro', role: 'teacher' as const },
      { schoolId: 'unidade-2', schoolName: 'Escola Praia', role: 'registrar' as const },
    ];

    const authenticatedUser = toAuthenticatedUser(user, networkWith('active'), roles);

    expect(authenticatedUser).toEqual({
      id: 'usuario-1',
      networkId: 'rede-1',
      networkName: 'Rede Municipal Central',
      networkSlug: 'central',
      name: 'Ana Souza',
      email: 'ana.souza@escola.br',
      roles,
    });
  });

  /*
   * The photographic negative of "whoever signs in as a guardian brings the guardian record
   * along". The record is gone: whoever signs in as a guardian IS the guardian, and the
   * session has nothing left to translate.
   */
  test('the authenticated user carries no guardian record, because there is none', () => {
    const user: User = {
      id: 'usuario-2',
      networkId: 'rede-1',
      name: 'Carlos Lima',
      email: 'carlos@familia.br',
      cpf: generateCpf(2),
      phone: '(27) 99999-0000',
      active: true,
    };

    const authenticatedUser = toAuthenticatedUser(user, networkWith('active'), []);

    expect(Object.keys(authenticatedUser)).not.toContain('guardianId');
    expect(authenticatedUser.id).toBe('usuario-2');
  });

  test('building the authenticated user does not alter the user it was handed', () => {
    const user: User = {
      id: 'usuario-3',
      networkId: 'rede-1',
      name: 'Bia Nunes',
      email: 'bia@escola.br',
      cpf: generateCpf(3),
      phone: null,
      active: true,
    };
    const copy = { ...user };

    toAuthenticatedUser(user, networkWith('active'), []);

    expect(user).toEqual(copy);
  });

  test('the product demands a password of at least ten characters', () => {
    const shortPassword = 'abc123456';

    const fits = shortPassword.length >= MINIMUM_PASSWORD_LENGTH;

    expect(fits).toBe(false);
  });
});
