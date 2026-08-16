/*
 * O domínio de identidade não fala com banco nenhum: quem decide se a rede opera, se o papel
 * existe e se a sessão ainda vale são funções puras. É assim que elas são exercidas aqui.
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

describe('status da rede', () => {
  test('converte os três status que o esquema aceita', () => {
    const fromTheDatabase = [...NETWORK_STATUSES];

    const converted = fromTheDatabase.map(toNetworkStatus);

    expect(converted).toEqual(['active', 'suspended', 'cancelled']);
  });

  test('recusa status fora do domínio em vez de servir a rede com estado desconhecido', () => {
    const outsider = 'inadimplente';

    const convert = (): string => toNetworkStatus(outsider);

    expect(convert).toThrow('status de rede fora do domínio: inadimplente');
  });

  test('só a rede ativa opera; suspensa e cancelada não', () => {
    const networks = [networkWith('active'), networkWith('suspended'), networkWith('cancelled')];

    const operand = networks.map(isNetworkActive);

    expect(operand).toEqual([true, false, false]);
  });
});

describe('papel do usuário', () => {
  test('reconhece os quatro papéis do produto', () => {
    const known = [...ROLES];

    const valid = known.map(isValidRole);

    expect(valid).toEqual([true, true, true, true]);
  });

  test('não reconhece cargo que o produto não modela', () => {
    const position = 'diretor';

    const valid = isValidRole(position);

    expect(valid).toBe(false);
  });

  test('recusa papel desconhecido em vez de descartá-lo em silêncio', () => {
    const unknown = 'coordenador';

    const convert = (): string => toRole(unknown);

    expect(convert).toThrow('papel fora do domínio: coordenador');
  });
});

describe('validade da sessão', () => {
  test('a expiração é a duração somada ao instante da criação', () => {
    const durationHours = 12;

    const expiresAt = sessionExpiration(NOW, durationHours);

    expect(expiresAt.getTime()).toBe(NOW.getTime() + durationHours * HOUR_IN_MS);
  });

  test('a sessão dentro do prazo continua valendo', () => {
    const session = sessionExpiringAt(new Date(NOW.getTime() + HOUR_IN_MS));

    const expired = hasSessionExpired(session, NOW);

    expect(expired).toBe(false);
  });

  test('a sessão vencida não vale mais', () => {
    const session = sessionExpiringAt(new Date(NOW.getTime() - 1));

    const expired = hasSessionExpired(session, NOW);

    expect(expired).toBe(true);
  });

  test('a sessão que vence exatamente agora já não vale', () => {
    const session = sessionExpiringAt(new Date(NOW.getTime()));

    const expired = hasSessionExpired(session, NOW);

    expect(expired).toBe(true);
  });
});

describe('usuário', () => {
  test('o e-mail perde espaços das pontas e vai para caixa baixa', () => {
    const typed = '  Ana.Souza@Escola.BR  ';

    const normalized = normalizedEmail(typed);

    expect(normalized).toBe('ana.souza@escola.br');
  });

  test('e-mail já normalizado atravessa sem mudança', () => {
    const typed = 'ana.souza@escola.br';

    const normalized = normalizedEmail(typed);

    expect(normalized).toBe(typed);
  });

  test('o usuário autenticado carrega identidade, rede e todos os papéis', () => {
    const user: User = {
      id: 'usuario-1',
      networkId: 'rede-1',
      name: 'Ana Souza',
      email: 'ana.souza@escola.br',
      cpf: generateCpf(1),
      active: true,
      guardianId: null,
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
      guardianId: null,
    });
  });

  test('quem entra como responsável leva o cadastro de responsável junto', () => {
    const user: User = {
      id: 'usuario-2',
      networkId: 'rede-1',
      name: 'Carlos Lima',
      email: 'carlos@familia.br',
      cpf: generateCpf(2),
      active: true,
      guardianId: 'responsavel-9',
    };

    const authenticatedUser = toAuthenticatedUser(user, networkWith('active'), []);

    expect(authenticatedUser.guardianId).toBe('responsavel-9');
  });

  test('montar o usuário autenticado não altera o usuário recebido', () => {
    const user: User = {
      id: 'usuario-3',
      networkId: 'rede-1',
      name: 'Bia Nunes',
      email: 'bia@escola.br',
      cpf: generateCpf(3),
      active: true,
      guardianId: null,
    };
    const copy = { ...user };

    toAuthenticatedUser(user, networkWith('active'), []);

    expect(user).toEqual(copy);
  });

  test('o produto exige senha de pelo menos dez caracteres', () => {
    const shortPassword = 'abc123456';

    const fits = shortPassword.length >= MINIMUM_PASSWORD_LENGTH;

    expect(fits).toBe(false);
  });
});
