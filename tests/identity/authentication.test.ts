/*
 * Entrar, continuar dentro e sair. Tudo contra PostgreSQL de verdade: a sessão do EscolaViva
 * mora em tabela (I2), e é a linha — com a rede e o usuário ao lado — que decide se ela vale.
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
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(result.erros)}`);
  }
  return result.valor;
}

function errorsOf(result: Result<unknown>): ApplicationError[] {
  if (result.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return result.erros;
}

async function countSessions(userId: string): Promise<number> {
  const rows = await testSql()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM session WHERE user_id = ${userId}`;
  return rows[0]?.total ?? 0;
}

beforeEach(clearDatabase);

describe('autenticar', () => {
  test('com credenciais corretas abre a sessão e devolve o usuário com a rede e os papéis', async () => {
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

  test('sem IP a sessão nasce sem endereço em vez de com texto vazio', async () => {
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

  test('senha errada, CPF inexistente e usuário inativo devolvem a mesma recusa, sem apontar campo', async () => {
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

    const genericRejection = [{ codigo: 'credenciais_invalidas', mensagem: 'CPF ou senha inválidos' }];
    expect(errorsOf(wrongPassword)).toEqual(genericRejection);
    expect(errorsOf(nonexistentCpf)).toEqual(genericRejection);
    expect(errorsOf(inactiveUser)).toEqual(genericRejection);
    // Sem `campo`, a tela não consegue destacar o input do identificador e revelar qual dos três é.
    const pointAtField = [wrongPassword, nonexistentCpf, inactiveUser]
      .flatMap(errorsOf)
      .some((error) => Object.hasOwn(error, 'campo'));
    expect(pointAtField).toBe(false);
  });

  test('nenhuma das três recusas abre sessão', async () => {
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

  test('rede suspensa e rede inexistente recusam pela rede, não pelas credenciais', async () => {
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

    // A rede é dita pelo próprio usuário na tela e não é segredo: as duas recusas são iguais
    // entre si e distintas da recusa de credenciais, para não virar chamado de "senha parou".
    const networkRejection = [
      {
        campo: 'networkSlug',
        codigo: 'rede_indisponivel',
        mensagem: 'rede não encontrada ou fora de operação',
      },
    ];
    expect(errorsOf(suspendedNetwork)).toEqual(networkRejection);
    expect(errorsOf(nonexistentNetwork)).toEqual(networkRejection);
  });

  test('rede cancelada também não abre sessão', async () => {
    const cancelled = await createNetwork({ slug: 'cancelada', status: 'cancelled' });
    const user = await createUser({ networkId: cancelled.id, email: 'ana@escola.br' });

    const result = await identity.authenticate({
      networkSlug: 'cancelada', loginIdentifier: user.cpf, password: DEFAULT_PASSWORD, ip: '',
    });

    expect(errorsOf(result)[0]?.codigo).toBe('rede_indisponivel');
    expect(await countSessions(user.id)).toBe(0);
  });

  test('formulário em branco volta com erro em cada campo obrigatório', async () => {
    const network = await createNetwork({ slug: 'em-branco' });
    await createUser({ networkId: network.id, email: 'ana@escola.br' });

    const result = await identity.authenticate({
      networkSlug: '', loginIdentifier: '', password: '', ip: '',
    });

    const fields = errorsOf(result).map((error) => error.campo);
    expect(fields).toEqual(['networkSlug', 'cpf', 'password']);
  });

  test('o mesmo CPF em redes diferentes autentica cada um na sua rede', async () => {
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

  test('entra com CPF cru', async () => {
    const scenario = await fullScenario();

    const authenticated = await identity.authenticate({
      networkSlug: scenario.network.slug,
      loginIdentifier: scenario.registrar.cpf,
      password: scenario.password,
      ip: '',
    });

    expect(authenticated.ok).toBe(true);
  });

  test('entra com CPF pontuado', async () => {
    const scenario = await fullScenario();
    const cpf = scenario.registrar.cpf;
    const punctuated = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    const authenticated = await identity.authenticate({
      networkSlug: scenario.network.slug, loginIdentifier: punctuated, password: scenario.password, ip: '',
    });

    expect(authenticated.ok).toBe(true);
  });

  test('e-mail não entra mais — o identificador é o CPF', async () => {
    const scenario = await fullScenario();

    const authenticated = await identity.authenticate({
      networkSlug: scenario.network.slug, loginIdentifier: scenario.registrar.email,
      password: scenario.password, ip: '',
    });

    expect(authenticated.ok).toBe(false);
  });

  test('CPF inexistente e senha errada dão a mesma recusa', async () => {
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
      expect(nonexistent.erros).toEqual(wrongPassword.erros);
    }
  });
});

describe('sessaoValida', () => {
  test('devolve o usuário da sessão dentro do prazo', async () => {
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

  test('sessão expirada não vale, mesmo com a linha ainda no banco', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    const expiredSession = await createSession({
      networkId: network.id, userId: user.id, expiresAt: new Date(Date.now() - HOUR_IN_MS),
    });

    const found = await identity.validSession(expiredSession.id);

    expect(found).toBeNull();
    expect(await countSessions(user.id)).toBe(1);
  });

  test('id de sessão inexistente devolve nulo', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id });

    const found = await identity.validSession(crypto.randomUUID());

    expect(found).toBeNull();
  });

  test('id fora do formato devolve nulo em vez de estourar erro de conversão', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id });

    const found = await identity.validSession('nao-e-um-uuid');

    expect(found).toBeNull();
  });

  test('suspender a rede derruba na hora as sessões já abertas', async () => {
    const network = await createNetwork({ slug: 'derrubada' });
    const user = await createUser({ networkId: network.id });
    const session = await createSession({ networkId: network.id, userId: user.id });

    await testSql()`UPDATE network SET status = 'suspended' WHERE id = ${network.id}`;

    expect(await identity.validSession(session.id)).toBeNull();
  });

  test('desativar o usuário derruba a sessão dele', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    const session = await createSession({ networkId: network.id, userId: user.id });

    await testSql()`UPDATE app_user SET active = false WHERE id = ${user.id}`;

    expect(await identity.validSession(session.id)).toBeNull();
  });
});

describe('encerrarSessao', () => {
  test('apaga a sessão e ela deixa de valer', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    const session = await createSession({ networkId: network.id, userId: user.id });

    await identity.endSession(session.id);

    expect(await identity.validSession(session.id)).toBeNull();
    expect(await countSessions(user.id)).toBe(0);
  });

  test('encerra apenas a sessão pedida e deixa as outras do mesmo usuário de pé', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    const ofTheLaptop = await createSession({ networkId: network.id, userId: user.id });
    const ofTheMobile = await createSession({ networkId: network.id, userId: user.id });

    await identity.endSession(ofTheLaptop.id);

    expect(await identity.validSession(ofTheMobile.id)).not.toBeNull();
    expect(await countSessions(user.id)).toBe(1);
  });

  test('id forjado não apaga nada nem estoura', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    await createSession({ networkId: network.id, userId: user.id });

    await identity.endSession('cookie-forjado');

    expect(await countSessions(user.id)).toBe(1);
  });
});

describe('expurgarSessoesExpiradas', () => {
  test('remove só as vencidas e devolve quantas saíram', async () => {
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

  test('sem sessão vencida não remove nada e devolve zero', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });
    await createSession({ networkId: network.id, userId: user.id });

    const removed = await identity.purgeExpiredSessions();

    expect(removed).toBe(0);
    expect(await countSessions(user.id)).toBe(1);
  });
});

describe('trocarSenha', () => {
  test('exige a senha atual', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });

    const result = await identity.changePassword({
      userId: user.id, currentPassword: 'chute-errado-1', newPassword: NEW_PASSWORD,
    });

    expect(errorsOf(result)).toEqual([
      { campo: 'currentPassword', codigo: 'senha_incorreta', mensagem: 'a senha atual não confere' },
    ]);
  });

  test('recusa senha nova curta demais', async () => {
    const network = await createNetwork();
    const user = await createUser({ networkId: network.id });

    const result = await identity.changePassword({
      userId: user.id, currentPassword: DEFAULT_PASSWORD, newPassword: 'curta123',
    });

    expect(errorsOf(result)[0]?.campo).toBe('newPassword');
  });

  test('a senha nova passa a autenticar e a antiga deixa de funcionar', async () => {
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
    expect(errorsOf(withTheOldOne)[0]?.codigo).toBe('credenciais_invalidas');
  });

  test('trocar a senha de um usuário não mexe na senha de outro da mesma rede', async () => {
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

  test('usuário inexistente é recusado sem apontar campo', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id });

    const result = await identity.changePassword({
      userId: crypto.randomUUID(), currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD,
    });

    expect(errorsOf(result)).toEqual([
      { codigo: 'usuario_inexistente', mensagem: 'usuário não encontrado' },
    ]);
  });

  test('id de usuário fora do formato é recusado pela validação de entrada', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id });

    const result = await identity.changePassword({
      userId: 'nao-e-uuid', currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD,
    });

    expect(errorsOf(result)[0]?.campo).toBe('userId');
  });
});
