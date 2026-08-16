/*
 * I18: missing configuration brings the boot down, not the request. `loadConfig` is pure on
 * purpose — it takes the map of variables — so every combination of environment is exercised here
 * without touching the process.
 */

import { describe, expect, test } from 'bun:test';
import { config, loadConfig } from '../../src/shared/config';

/** The least that gets the configuration through: the two variables with no default. */
const REQUIRED = {
  DATABASE_URL: 'postgres://escolaviva:senha@localhost:5442/escolaviva',
  SESSION_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
};

const MINIMUM_SECRET_LENGTH = 32;

/** Gives back the refusal message; fails the test if the environment was accepted instead. */
function rejectionMessage(environment: Record<string, string | undefined>): string {
  try {
    loadConfig(environment);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('loadConfig aceitou um ambiente que deveria ter recusado');
}

describe('loadConfig — required variables', () => {
  test('refuses an empty environment: with no configuration the process does not start', () => {
    const emptyEnvironment = {};

    const load = (): unknown => loadConfig(emptyEnvironment);

    expect(load).toThrow();
  });

  test('the refusal names every missing variable at once, not just the first', () => {
    const emptyEnvironment = {};

    const message = rejectionMessage(emptyEnvironment);

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('SESSION_SECRET');
  });

  test('refuses when SESSION_SECRET is the only one missing', () => {
    const withoutSecret = { DATABASE_URL: REQUIRED.DATABASE_URL };

    const message = rejectionMessage(withoutSecret);

    expect(message).toContain('SESSION_SECRET');
    expect(message).not.toContain('DATABASE_URL');
  });

  test('refuses when DATABASE_URL is the only one missing', () => {
    const withoutDatabase = { SESSION_SECRET: REQUIRED.SESSION_SECRET };

    const message = rejectionMessage(withoutDatabase);

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('SESSION_SECRET');
  });

  test('treats a variable filled in as empty the same as an absent one', () => {
    const empty = { DATABASE_URL: '', SESSION_SECRET: '' };

    const message = rejectionMessage(empty);

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('SESSION_SECRET');
  });
});

describe('loadConfig — SESSION_SECRET', () => {
  test(`refuses a secret shorter than ${MINIMUM_SECRET_LENGTH} characters`, () => {
    const short = { ...REQUIRED, SESSION_SECRET: 'x'.repeat(MINIMUM_SECRET_LENGTH - 1) };

    const message = rejectionMessage(short);

    expect(message).toContain('SESSION_SECRET');
  });

  test(`accepts a secret of exactly ${MINIMUM_SECRET_LENGTH} characters`, () => {
    const atTheLimit = { ...REQUIRED, SESSION_SECRET: 'x'.repeat(MINIMUM_SECRET_LENGTH) };

    const loaded = loadConfig(atTheLimit);

    expect(loaded.sessionSecret).toHaveLength(MINIMUM_SECRET_LENGTH);
  });
});

describe('loadConfig — defaults', () => {
  test('applies port 3000, a 25000 ms timeout, a 12-hour session and the info level', () => {
    const onlyRequired = { ...REQUIRED };

    const loaded = loadConfig(onlyRequired);

    expect(loaded.port).toBe(3000);
    expect(loaded.httpTimeoutMs).toBe(25000);
    expect(loaded.sessionDurationHours).toBe(12);
    expect(loaded.logLevel).toBe('info');
  });

  test('with no TRUSTED_PROXIES the proxy list is born empty', () => {
    const onlyRequired = { ...REQUIRED };

    const loaded = loadConfig(onlyRequired);

    expect(loaded.trustedProxies).toEqual([]);
  });

  test('with no APP_ENV the environment is development', () => {
    const onlyRequired = { ...REQUIRED };

    const loaded = loadConfig(onlyRequired);

    expect(loaded.environment).toBe('development');
  });

  test('converts the numbers that arrive from the environment as text', () => {
    const numbersAsText = {
      ...REQUIRED,
      PORT: '8080',
      HTTP_TIMEOUT_MS: '9000',
      SESSION_DURATION_HOURS: '4',
    };

    const loaded = loadConfig(numbersAsText);

    expect(loaded.port).toBe(8080);
    expect(loaded.httpTimeoutMs).toBe(9000);
    expect(loaded.sessionDurationHours).toBe(4);
  });
});

describe('loadConfig — secureCookie', () => {
  test('derives secureCookie from APP_ENV: true in production', () => {
    const production = { ...REQUIRED, APP_ENV: 'production' };

    const loaded = loadConfig(production);

    expect(loaded.secureCookie).toBe(true);
  });

  test('derives secureCookie from APP_ENV: false in development and in test', () => {
    const development = { ...REQUIRED, APP_ENV: 'development' };
    const teste = { ...REQUIRED, APP_ENV: 'test' };

    const inDevelopment = loadConfig(development);
    const inTest = loadConfig(teste);

    expect(inDevelopment.secureCookie).toBe(false);
    expect(inTest.secureCookie).toBe(false);
  });

  test('an explicit SECURE_COOKIE beats the one derived from the environment', () => {
    const productionWithoutTls = { ...REQUIRED, APP_ENV: 'production', SECURE_COOKIE: 'false' };

    const loaded = loadConfig(productionWithoutTls);

    expect(loaded.secureCookie).toBe(false);
  });

  test('refuses a SECURE_COOKIE that is neither true nor false', () => {
    const invalid = { ...REQUIRED, SECURE_COOKIE: 'sim' };

    const message = rejectionMessage(invalid);

    expect(message).toContain('SECURE_COOKIE');
  });
});

describe('loadConfig — TRUSTED_PROXIES', () => {
  test('splits the list on commas, trims the spaces and drops the empty items', () => {
    const withSpaces = { ...REQUIRED, TRUSTED_PROXIES: ' 10.0.0.1 , 10.0.0.2 ,,10.0.0.3 ' };

    const loaded = loadConfig(withSpaces);

    expect(loaded.trustedProxies).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3']);
  });

  test('a single proxy with no comma becomes a one-item list', () => {
    const onlyOne = { ...REQUIRED, TRUSTED_PROXIES: '172.17.0.1' };

    const loaded = loadConfig(onlyOne);

    expect(loaded.trustedProxies).toEqual(['172.17.0.1']);
  });

  test('a list of nothing but commas and spaces yields no trusted proxy at all', () => {
    const onlySeparators = { ...REQUIRED, TRUSTED_PROXIES: ' , , ' };

    const loaded = loadConfig(onlySeparators);

    expect(loaded.trustedProxies).toEqual([]);
  });
});

describe('loadConfig — the old variable names', () => {
  const RENAMED: [string, string][] = [
    ['SESSAO_DURACAO_HORAS', 'SESSION_DURATION_HOURS'],
    ['PROXIES_CONFIAVEIS', 'TRUSTED_PROXIES'],
    ['COOKIE_SEGURO', 'SECURE_COOKIE'],
    ['PORTA_BANCO', 'DB_PORT'],
    ['PORTA_BANCO_TESTE', 'TEST_DB_PORT'],
    ['DATABASE_URL_TESTE', 'TEST_DATABASE_URL'],
  ];

  test.each(RENAMED)('refuses %s and says the new name is %s', (oldName, newName) => {
    const withOldName = { ...REQUIRED, [oldName]: '1' };

    const message = rejectionMessage(withOldName);

    expect(message).toContain(oldName);
    expect(message).toContain(newName);
  });

  test('refuses the old name even when filled in as empty: defined is defined', () => {
    const emptyOldName = { ...REQUIRED, PROXIES_CONFIAVEIS: '' };

    const message = rejectionMessage(emptyOldName);

    expect(message).toContain('TRUSTED_PROXIES');
  });

  test('the refusal names every old name at once, not just the first', () => {
    const several = { ...REQUIRED, PORTA_BANCO: '5432', COOKIE_SEGURO: 'false' };

    const message = rejectionMessage(several);

    expect(message).toContain('DB_PORT');
    expect(message).toContain('SECURE_COOKIE');
  });

  test('the old name brings the boot down before the default slips in unnoticed', () => {
    const wouldFallBackToDefault = { ...REQUIRED, SESSAO_DURACAO_HORAS: '99' };

    const message = rejectionMessage(wouldFallBackToDefault);

    expect(message).toContain('SESSION_DURATION_HOURS');
  });

  test('the new name gets through: the refusal is about the old name, not the value', () => {
    const withNewName = { ...REQUIRED, SESSION_DURATION_HOURS: '99' };

    const loaded = loadConfig(withNewName);

    expect(loaded.sessionDurationHours).toBe(99);
  });
});

describe('loadConfig — invalid values', () => {
  test('refuses an APP_ENV outside development, test and production', () => {
    const madeUpEnvironment = { ...REQUIRED, APP_ENV: 'producao' };

    const message = rejectionMessage(madeUpEnvironment);

    expect(message).toContain('APP_ENV');
  });

  test('refuses a LOG_LEVEL outside debug, info, warn and error', () => {
    const madeUpLevel = { ...REQUIRED, LOG_LEVEL: 'verbose' };

    const message = rejectionMessage(madeUpLevel);

    expect(message).toContain('LOG_LEVEL');
  });

  test('refuses a PORT that is not a number', () => {
    const portAsText = { ...REQUIRED, PORT: 'oitenta' };

    const message = rejectionMessage(portAsText);

    expect(message).toContain('PORT');
  });

  test('refuses a PORT of zero or below', () => {
    const portZero = { ...REQUIRED, PORT: '0' };

    const message = rejectionMessage(portZero);

    expect(message).toContain('PORT');
  });

  test('refuses a negative HTTP_TIMEOUT_MS', () => {
    const negativeDeadline = { ...REQUIRED, HTTP_TIMEOUT_MS: '-1' };

    const message = rejectionMessage(negativeDeadline);

    expect(message).toContain('HTTP_TIMEOUT_MS');
  });

  test('reports every invalid value in the same message', () => {
    const several = { ...REQUIRED, APP_ENV: 'producao', LOG_LEVEL: 'verbose', PORT: 'oitenta' };

    const message = rejectionMessage(several);

    expect(message).toContain('APP_ENV');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toContain('PORT');
  });
});

describe('the process config', () => {
  test('the suite runs with the test environment already validated at import time', () => {
    const loaded = config;

    const environment = loaded.environment;

    expect(environment).toBe('test');
  });

  test('the process configuration points at the suite\'s throwaway database', () => {
    const loaded = config;

    const url = loaded.databaseUrl;

    expect(url).toBe(Bun.env.TEST_DATABASE_URL?.trim() ?? '');
  });
});
