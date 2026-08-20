import { DEVELOPMENT_ENV, ENVIRONMENTS, LOG_LEVELS } from '../constants';

export const ENV_BOOLEANS = ['true', 'false'] as const;
export const ENV_TRUE = 'true';

export const CONFIG_DEFAULTS = {
  environment: DEVELOPMENT_ENV,
  port: 3000,
  sessionDurationHours: 12,
  httpTimeoutMs: 25000,
  logLevel: 'info',
} as const;

export const MINIMUM_SECRET_LENGTH = 32;

export const ENV_LIST_SEPARATOR = ',';

export const RENAMED_ENVIRONMENT_VARIABLES = {
  SESSAO_DURACAO_HORAS: 'SESSION_DURATION_HOURS',
  PROXIES_CONFIAVEIS: 'TRUSTED_PROXIES',
  COOKIE_SEGURO: 'SECURE_COOKIE',
  PORTA_BANCO: 'DB_PORT',
  PORTA_BANCO_TESTE: 'TEST_DB_PORT',
  DATABASE_URL_TESTE: 'TEST_DATABASE_URL',
} as const;

export const CONFIG_MESSAGES = {
  invalidBoolean: 'use true or false',
  invalidEnvironment: `use ${ENVIRONMENTS.join(', ').replace(/, ([^,]*)$/, ' or $1')}`,
  invalidPort: 'must be a whole port number',
  missingDatabaseUrl: 'required — the primary PostgreSQL connection',
  missingSessionSecret: 'required — the secret that signs the session cookie',
  shortSessionSecret: `needs at least ${MINIMUM_SECRET_LENGTH} characters`,
  invalidDuration: 'must be a number of hours',
  invalidTimeout: 'must be a number of milliseconds',
  invalidLogLevel: `use ${LOG_LEVELS.join(', ').replace(/, ([^,]*)$/, ' or $1')}`,
  rootLabel: 'environment',
  reportHeader: 'Invalid environment configuration — the process does not start (I18).',
  reportFooter: 'See .env.example.',
  renamedTo: 'was renamed to',
  renamedHeader:
    'Environment variable under an old name — the process does not start (I18).\n' +
    'Under the old name the value would be ignored and the default would slip in unnoticed.',
  renamedFooter:
    'Rename it in .env (and in the process environment) before starting. See .env.example.',
} as const;

export const FRONT = { buildDirectory: 'apps/web/dist' } as const;
