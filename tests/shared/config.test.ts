/*
 * I18: configuração faltando derruba o boot, não a requisição. `loadConfig` é pura de
 * propósito — recebe o mapa de variáveis —, então cada combinação de ambiente é exercida aqui
 * sem mexer no processo.
 */

import { describe, expect, test } from 'bun:test';
import { config, loadConfig } from '../../src/shared/config';

/** O mínimo que faz a configuração passar: as duas variáveis que não têm default. */
const REQUIRED = {
  DATABASE_URL: 'postgres://escolaviva:senha@localhost:5442/escolaviva',
  SESSION_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
};

const MINIMUM_SECRET_LENGTH = 32;

/** Devolve a mensagem da recusa; falha o teste se o ambiente tiver sido aceito. */
function rejectionMessage(environment: Record<string, string | undefined>): string {
  try {
    loadConfig(environment);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('loadConfig aceitou um ambiente que deveria ter recusado');
}

describe('loadConfig — variáveis obrigatórias', () => {
  test('recusa ambiente vazio: sem configuração o processo não sobe', () => {
    const emptyEnvironment = {};

    const load = (): unknown => loadConfig(emptyEnvironment);

    expect(load).toThrow();
  });

  test('a recusa cita todas as variáveis faltantes de uma vez, não só a primeira', () => {
    const emptyEnvironment = {};

    const message = rejectionMessage(emptyEnvironment);

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('SESSION_SECRET');
  });

  test('recusa quando só falta SESSION_SECRET', () => {
    const withoutSecret = { DATABASE_URL: REQUIRED.DATABASE_URL };

    const message = rejectionMessage(withoutSecret);

    expect(message).toContain('SESSION_SECRET');
    expect(message).not.toContain('DATABASE_URL');
  });

  test('recusa quando só falta DATABASE_URL', () => {
    const withoutDatabase = { SESSION_SECRET: REQUIRED.SESSION_SECRET };

    const message = rejectionMessage(withoutDatabase);

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('SESSION_SECRET');
  });

  test('trata variável preenchida com vazio como ausente', () => {
    const empty = { DATABASE_URL: '', SESSION_SECRET: '' };

    const message = rejectionMessage(empty);

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('SESSION_SECRET');
  });
});

describe('loadConfig — SESSION_SECRET', () => {
  test(`recusa segredo com menos de ${MINIMUM_SECRET_LENGTH} caracteres`, () => {
    const short = { ...REQUIRED, SESSION_SECRET: 'x'.repeat(MINIMUM_SECRET_LENGTH - 1) };

    const message = rejectionMessage(short);

    expect(message).toContain('SESSION_SECRET');
  });

  test(`aceita segredo com exatamente ${MINIMUM_SECRET_LENGTH} caracteres`, () => {
    const atTheLimit = { ...REQUIRED, SESSION_SECRET: 'x'.repeat(MINIMUM_SECRET_LENGTH) };

    const loaded = loadConfig(atTheLimit);

    expect(loaded.sessionSecret).toHaveLength(MINIMUM_SECRET_LENGTH);
  });
});

describe('loadConfig — defaults', () => {
  test('aplica porta 3000, timeout de 25000 ms, 12 horas de sessão e nível info', () => {
    const onlyRequired = { ...REQUIRED };

    const loaded = loadConfig(onlyRequired);

    expect(loaded.port).toBe(3000);
    expect(loaded.httpTimeoutMs).toBe(25000);
    expect(loaded.sessionDurationHours).toBe(12);
    expect(loaded.logLevel).toBe('info');
  });

  test('sem PROXIES_CONFIAVEIS a lista de proxies nasce vazia', () => {
    const onlyRequired = { ...REQUIRED };

    const loaded = loadConfig(onlyRequired);

    expect(loaded.trustedProxies).toEqual([]);
  });

  test('sem APP_ENV o ambiente é development', () => {
    const onlyRequired = { ...REQUIRED };

    const loaded = loadConfig(onlyRequired);

    expect(loaded.environment).toBe('development');
  });

  test('converte os números vindos como texto do ambiente', () => {
    const numbersAsText = {
      ...REQUIRED,
      PORT: '8080',
      HTTP_TIMEOUT_MS: '9000',
      SESSAO_DURACAO_HORAS: '4',
    };

    const loaded = loadConfig(numbersAsText);

    expect(loaded.port).toBe(8080);
    expect(loaded.httpTimeoutMs).toBe(9000);
    expect(loaded.sessionDurationHours).toBe(4);
  });
});

describe('loadConfig — secureCookie', () => {
  test('deriva secureCookie de APP_ENV: verdadeiro em produção', () => {
    const production = { ...REQUIRED, APP_ENV: 'production' };

    const loaded = loadConfig(production);

    expect(loaded.secureCookie).toBe(true);
  });

  test('deriva secureCookie de APP_ENV: falso em desenvolvimento e em teste', () => {
    const development = { ...REQUIRED, APP_ENV: 'development' };
    const teste = { ...REQUIRED, APP_ENV: 'test' };

    const inDevelopment = loadConfig(development);
    const inTest = loadConfig(teste);

    expect(inDevelopment.secureCookie).toBe(false);
    expect(inTest.secureCookie).toBe(false);
  });

  test('COOKIE_SEGURO explícito vence o derivado do ambiente', () => {
    const productionWithoutTls = { ...REQUIRED, APP_ENV: 'production', COOKIE_SEGURO: 'false' };

    const loaded = loadConfig(productionWithoutTls);

    expect(loaded.secureCookie).toBe(false);
  });

  test('recusa COOKIE_SEGURO que não é true nem false', () => {
    const invalid = { ...REQUIRED, COOKIE_SEGURO: 'sim' };

    const message = rejectionMessage(invalid);

    expect(message).toContain('COOKIE_SEGURO');
  });
});

describe('loadConfig — PROXIES_CONFIAVEIS', () => {
  test('quebra a lista por vírgula, apara espaços e descarta itens vazios', () => {
    const withSpaces = { ...REQUIRED, PROXIES_CONFIAVEIS: ' 10.0.0.1 , 10.0.0.2 ,,10.0.0.3 ' };

    const loaded = loadConfig(withSpaces);

    expect(loaded.trustedProxies).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3']);
  });

  test('um único proxie sem vírgula vira lista de um item', () => {
    const onlyOne = { ...REQUIRED, PROXIES_CONFIAVEIS: '172.17.0.1' };

    const loaded = loadConfig(onlyOne);

    expect(loaded.trustedProxies).toEqual(['172.17.0.1']);
  });

  test('lista só com vírgulas e espaços resulta em nenhum proxie confiável', () => {
    const onlySeparators = { ...REQUIRED, PROXIES_CONFIAVEIS: ' , , ' };

    const loaded = loadConfig(onlySeparators);

    expect(loaded.trustedProxies).toEqual([]);
  });
});

describe('loadConfig — valores inválidos', () => {
  test('recusa APP_ENV fora de development, test e production', () => {
    const madeUpEnvironment = { ...REQUIRED, APP_ENV: 'producao' };

    const message = rejectionMessage(madeUpEnvironment);

    expect(message).toContain('APP_ENV');
  });

  test('recusa LOG_LEVEL fora de debug, info, warn e error', () => {
    const madeUpLevel = { ...REQUIRED, LOG_LEVEL: 'verbose' };

    const message = rejectionMessage(madeUpLevel);

    expect(message).toContain('LOG_LEVEL');
  });

  test('recusa PORT que não é número', () => {
    const portAsText = { ...REQUIRED, PORT: 'oitenta' };

    const message = rejectionMessage(portAsText);

    expect(message).toContain('PORT');
  });

  test('recusa PORT zero ou negativa', () => {
    const portZero = { ...REQUIRED, PORT: '0' };

    const message = rejectionMessage(portZero);

    expect(message).toContain('PORT');
  });

  test('recusa HTTP_TIMEOUT_MS negativo', () => {
    const negativeDeadline = { ...REQUIRED, HTTP_TIMEOUT_MS: '-1' };

    const message = rejectionMessage(negativeDeadline);

    expect(message).toContain('HTTP_TIMEOUT_MS');
  });

  test('acusa todos os valores inválidos na mesma mensagem', () => {
    const several = { ...REQUIRED, APP_ENV: 'producao', LOG_LEVEL: 'verbose', PORT: 'oitenta' };

    const message = rejectionMessage(several);

    expect(message).toContain('APP_ENV');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toContain('PORT');
  });
});

describe('config do processo', () => {
  test('a suíte roda com o ambiente de teste já validado no import', () => {
    const loaded = config;

    const environment = loaded.environment;

    expect(environment).toBe('test');
  });

  test('a configuração do processo aponta para o banco descartável da suíte', () => {
    const loaded = config;

    const url = loaded.databaseUrl;

    expect(url).toBe(Bun.env.DATABASE_URL_TESTE?.trim() ?? '');
  });
});
