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

const HORA_EM_MS = 3_600_000;
const AGORA = new Date('2026-03-10T08:00:00.000Z');

const redeCom = (status: Network['status']): Network => ({
  id: 'rede-1',
  name: 'Rede Municipal Central',
  slug: 'central',
  status,
});

const sessaoQueVenceEm = (expiraEm: Date): Session => ({
  id: 'sessao-1',
  networkId: 'rede-1',
  userId: 'usuario-1',
  createdAt: AGORA,
  expiresAt: expiraEm,
  ip: '203.0.113.7',
});

describe('status da rede', () => {
  test('converte os três status que o esquema aceita', () => {
    const vindosDoBanco = [...NETWORK_STATUSES];

    const convertidos = vindosDoBanco.map(toNetworkStatus);

    expect(convertidos).toEqual(['active', 'suspended', 'cancelled']);
  });

  test('recusa status fora do domínio em vez de servir a rede com estado desconhecido', () => {
    const forasteiro = 'inadimplente';

    const converter = (): string => toNetworkStatus(forasteiro);

    expect(converter).toThrow('status de rede fora do domínio: inadimplente');
  });

  test('só a rede ativa opera; suspensa e cancelada não', () => {
    const redes = [redeCom('active'), redeCom('suspended'), redeCom('cancelled')];

    const operando = redes.map(isNetworkActive);

    expect(operando).toEqual([true, false, false]);
  });
});

describe('papel do usuário', () => {
  test('reconhece os quatro papéis do produto', () => {
    const conhecidos = [...ROLES];

    const validos = conhecidos.map(isValidRole);

    expect(validos).toEqual([true, true, true, true]);
  });

  test('não reconhece cargo que o produto não modela', () => {
    const cargo = 'diretor';

    const valido = isValidRole(cargo);

    expect(valido).toBe(false);
  });

  test('recusa papel desconhecido em vez de descartá-lo em silêncio', () => {
    const desconhecido = 'coordenador';

    const converter = (): string => toRole(desconhecido);

    expect(converter).toThrow('papel fora do domínio: coordenador');
  });
});

describe('validade da sessão', () => {
  test('a expiração é a duração somada ao instante da criação', () => {
    const duracaoHoras = 12;

    const expiraEm = sessionExpiration(AGORA, duracaoHoras);

    expect(expiraEm.getTime()).toBe(AGORA.getTime() + duracaoHoras * HORA_EM_MS);
  });

  test('a sessão dentro do prazo continua valendo', () => {
    const sessao = sessaoQueVenceEm(new Date(AGORA.getTime() + HORA_EM_MS));

    const expirou = hasSessionExpired(sessao, AGORA);

    expect(expirou).toBe(false);
  });

  test('a sessão vencida não vale mais', () => {
    const sessao = sessaoQueVenceEm(new Date(AGORA.getTime() - 1));

    const expirou = hasSessionExpired(sessao, AGORA);

    expect(expirou).toBe(true);
  });

  test('a sessão que vence exatamente agora já não vale', () => {
    const sessao = sessaoQueVenceEm(new Date(AGORA.getTime()));

    const expirou = hasSessionExpired(sessao, AGORA);

    expect(expirou).toBe(true);
  });
});

describe('usuário', () => {
  test('o e-mail perde espaços das pontas e vai para caixa baixa', () => {
    const digitado = '  Ana.Souza@Escola.BR  ';

    const normalizado = normalizedEmail(digitado);

    expect(normalizado).toBe('ana.souza@escola.br');
  });

  test('e-mail já normalizado atravessa sem mudança', () => {
    const digitado = 'ana.souza@escola.br';

    const normalizado = normalizedEmail(digitado);

    expect(normalizado).toBe(digitado);
  });

  test('o usuário autenticado carrega identidade, rede e todos os papéis', () => {
    const usuario: User = {
      id: 'usuario-1',
      networkId: 'rede-1',
      name: 'Ana Souza',
      email: 'ana.souza@escola.br',
      cpf: generateCpf(1),
      active: true,
      guardianId: null,
    };
    const papeis = [
      { schoolId: 'unidade-1', schoolName: 'Escola Centro', role: 'teacher' as const },
      { schoolId: 'unidade-2', schoolName: 'Escola Praia', role: 'registrar' as const },
    ];

    const autenticado = toAuthenticatedUser(usuario, redeCom('active'), papeis);

    expect(autenticado).toEqual({
      id: 'usuario-1',
      networkId: 'rede-1',
      networkName: 'Rede Municipal Central',
      networkSlug: 'central',
      name: 'Ana Souza',
      email: 'ana.souza@escola.br',
      roles: papeis,
      guardianId: null,
    });
  });

  test('quem entra como responsável leva o cadastro de responsável junto', () => {
    const usuario: User = {
      id: 'usuario-2',
      networkId: 'rede-1',
      name: 'Carlos Lima',
      email: 'carlos@familia.br',
      cpf: generateCpf(2),
      active: true,
      guardianId: 'responsavel-9',
    };

    const autenticado = toAuthenticatedUser(usuario, redeCom('active'), []);

    expect(autenticado.guardianId).toBe('responsavel-9');
  });

  test('montar o usuário autenticado não altera o usuário recebido', () => {
    const usuario: User = {
      id: 'usuario-3',
      networkId: 'rede-1',
      name: 'Bia Nunes',
      email: 'bia@escola.br',
      cpf: generateCpf(3),
      active: true,
      guardianId: null,
    };
    const copia = { ...usuario };

    toAuthenticatedUser(usuario, redeCom('active'), []);

    expect(usuario).toEqual(copia);
  });

  test('o produto exige senha de pelo menos dez caracteres', () => {
    const senhaCurta = 'abc123456';

    const cabe = senhaCurta.length >= MINIMUM_PASSWORD_LENGTH;

    expect(cabe).toBe(false);
  });
});
