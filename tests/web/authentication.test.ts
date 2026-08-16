/*
 * I2 — entrar, continuar entrado e sair.
 *
 * O processo não guarda sessão em memória: o cookie assinado carrega apenas o id e quem responde
 * quem é o usuário é a tabela `sessao`, a cada requisição. Os casos abaixo cobrem as quatro coisas
 * que isso implica — o cookie que a aplicação emite, o cookie que ela recusa, a tela que não conta
 * quem existe e o logout que apaga a linha, e não só o cookie.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { generateCpf } from '../../src/shared/document';
import { clearDatabase, testSql } from '../support/database';
import { DEFAULT_PASSWORD, fullScenario, createNetwork, createUser } from '../support/factories';
import { open, cookieFromResponse, signIn, send, post } from './support';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Duas telas de login só podem diferir no que a pessoa digitou — nunca no que o banco tem. */
const withoutVolatileValues = (html: string, ...values: string[]): string =>
  values
    .reduce((text, value) => text.replaceAll(value, 'CPF_DIGITADO'), html)
    .replace(UUID, 'IDENTIFICADOR');

/** Troca o primeiro caractere do id assinado: mesma forma, assinatura que não confere mais. */
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

describe('autenticação', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('credenciais válidas levam ao painel com 303', async () => {
    const scenario = await fullScenario();

    const response = await send('/login', {
      redeSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      senha: scenario.password,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/painel');
  });

  test('o cookie de sessão é HttpOnly, SameSite=Lax e vale para todo o site', async () => {
    const scenario = await fullScenario();

    const response = await send('/login', {
      redeSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      senha: scenario.password,
    });
    const header = response.headers.get('Set-Cookie') ?? '';

    expect(header).toContain('ev_sessao=');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
  });

  test('o cookie carrega apenas o id da sessão gravada, e não o usuário', async () => {
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

  test('senha errada volta para a tela de entrada sem abrir sessão', async () => {
    const scenario = await fullScenario();

    const response = await send('/login', {
      redeSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      senha: 'senha-que-nao-e-a-dele',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(await storedSessions(scenario.registrar.id)).toBe(0);
  });

  test('CPF desconhecido e senha errada devolvem a mesma tela', async () => {
    const scenario = await fullScenario();
    const unknown = generateCpf(888_888);

    const withWrongPassword = await send('/login', {
      redeSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      senha: 'senha-que-nao-e-a-dele',
    });
    const withNonexistentCpf = await send('/login', {
      redeSlug: scenario.network.slug,
      cpf: unknown,
      senha: 'senha-que-nao-e-a-dele',
    });
    const first = withoutVolatileValues(await withWrongPassword.text(), scenario.registrar.cpf);
    const second = withoutVolatileValues(await withNonexistentCpf.text(), unknown);

    expect(withNonexistentCpf.status).toBe(withWrongPassword.status);
    expect(second).toBe(first);
    expect(first).toContain('CPF ou senha inválidos');
  });

  test('usuário de outra rede não entra pelo slug errado', async () => {
    const scenario = await fullScenario();
    const other = await createNetwork({});
    await createUser({ networkId: other.id, password: DEFAULT_PASSWORD });

    const response = await send('/login', {
      redeSlug: other.slug,
      cpf: scenario.registrar.cpf,
      senha: scenario.password,
    });

    expect(response.status).toBe(200);
    expect(await storedSessions(scenario.registrar.id)).toBe(0);
  });

  test('rota autenticada sem cookie redireciona para o login', async () => {
    const response = await open('/secretaria');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/login');
  });

  test('escrita sem cookie é recusada em vez de redirecionada', async () => {
    const response = await send('/secretaria/disciplinas', { nome: 'Filosofia' });

    expect(response.status).toBe(401);
  });

  test('cookie com assinatura adulterada não abre rota autenticada', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const withGoodCookie = await open('/secretaria', cookie);
    const withTamperedCookie = await open('/secretaria', tamper(cookie));

    expect(withGoodCookie.status).toBe(200);
    expect(withTamperedCookie.status).toBe(303);
    expect(withTamperedCookie.headers.get('Location')).toBe('/login');
  });

  test('cookie inventado, sem assinatura nenhuma, não abre rota autenticada', async () => {
    const response = await open('/secretaria', `ev_sessao=${crypto.randomUUID()}`);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/login');
  });

  test('sair apaga a sessão do banco, e não apenas o cookie do navegador', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const signedOut = await post('/logout', {}, cookie);
    const after = await open('/secretaria', cookie);

    expect(signedOut.status).toBe(303);
    expect(await storedSessions(scenario.registrar.id)).toBe(0);
    expect(after.status).toBe(303);
    expect(after.headers.get('Location')).toBe('/login');
  });

  test('sair também manda o navegador descartar o cookie', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const signedOut = await post('/logout', {}, cookie);
    const discarded = cookieFromResponse(signedOut);

    expect(discarded).toBe('ev_sessao=');
  });

  test('quem já entrou não vê o formulário de entrada de novo', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const response = await open('/login', cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/painel');
  });

  test('a raiz leva ao login sem sessão e ao painel com sessão', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const anonymousResponse = await open('/');
    const autenticada = await open('/', cookie);

    expect(anonymousResponse.headers.get('Location')).toBe('/login');
    expect(autenticada.headers.get('Location')).toBe('/painel');
  });
});
