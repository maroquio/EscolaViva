import { resolve } from 'node:path';
import { z } from 'zod';
import { ENVIRONMENTS, LOG_LEVELS, PRODUCTION_ENV } from '../constants';
import {
  CONFIG_DEFAULTS,
  CONFIG_MESSAGES,
  ENV_BOOLEANS,
  ENV_LIST_SEPARATOR,
  ENV_TRUE,
  FRONT,
  MINIMUM_SECRET_LENGTH,
  RENAMED_ENVIRONMENT_VARIABLES,
} from './constants';

export type Config = {
  environment: (typeof ENVIRONMENTS)[number];
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  sessionDurationHours: number;
  httpTimeoutMs: number;
  trustedProxies: string[];
  logLevel: (typeof LOG_LEVELS)[number];
  secureCookie: boolean;
  allowedOrigins: string[];
  cookieDomain: string | null;
  frontPath: string;
};

const PATH_SEPARATOR = '.';

const DEFAULT_FRONT_PATH = resolve(import.meta.dir, '..', '..', '..', '..', '..', FRONT.buildDirectory);

const LINE_BREAK = '\n';

const envBoolean = z.enum(ENV_BOOLEANS, { error: CONFIG_MESSAGES.invalidBoolean });

export const environmentSchema = z.object({
  APP_ENV: z
    .enum(ENVIRONMENTS, { error: CONFIG_MESSAGES.invalidEnvironment })
    .default(CONFIG_DEFAULTS.environment),
  PORT: z.coerce
    .number({ error: CONFIG_MESSAGES.invalidPort })
    .int()
    .positive()
    .default(CONFIG_DEFAULTS.port),
  DATABASE_URL: z
    .string({ error: CONFIG_MESSAGES.missingDatabaseUrl })
    .min(1, CONFIG_MESSAGES.missingDatabaseUrl),
  SESSION_SECRET: z
    .string({ error: CONFIG_MESSAGES.missingSessionSecret })
    .min(MINIMUM_SECRET_LENGTH, CONFIG_MESSAGES.shortSessionSecret),
  SESSION_DURATION_HOURS: z.coerce
    .number({ error: CONFIG_MESSAGES.invalidDuration })
    .int()
    .positive()
    .default(CONFIG_DEFAULTS.sessionDurationHours),
  HTTP_TIMEOUT_MS: z.coerce
    .number({ error: CONFIG_MESSAGES.invalidTimeout })
    .int()
    .positive()
    .default(CONFIG_DEFAULTS.httpTimeoutMs),
  TRUSTED_PROXIES: z.string().default(''),
  ALLOWED_ORIGINS: z.string().default(''),
  COOKIE_DOMAIN: z.string().default(''),
  FRONT_PATH: z.string().default(''),
  LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: CONFIG_MESSAGES.invalidLogLevel })
    .default(CONFIG_DEFAULTS.logLevel),
  SECURE_COOKIE: envBoolean.optional(),
});

const withoutEmptyValues = (
  env: Record<string, string | undefined>,
): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(env).map(([key, value]): [string, string | undefined] => [
      key,
      value === '' ? undefined : value,
    ]),
  );

const commaSeparatedList = (value: string): string[] =>
  value
    .split(ENV_LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter((item) => item !== '');

const invalidConfigMessage = (
  issues: readonly { path: PropertyKey[]; message: string }[],
): string => {
  const lines = issues.map((issue) => {
    const where = issue.path.map(String).join(PATH_SEPARATOR) || CONFIG_MESSAGES.rootLabel;
    return `  - ${where}: ${issue.message}`;
  });
  return [CONFIG_MESSAGES.reportHeader, ...lines, CONFIG_MESSAGES.reportFooter].join(LINE_BREAK);
};

const renamedVariablesFound = (
  env: Record<string, string | undefined>,
): [string, string][] =>
  Object.entries(RENAMED_ENVIRONMENT_VARIABLES).filter(
    ([oldName]) => env[oldName] !== undefined,
  );

const renamedVariablesMessage = (found: readonly [string, string][]): string => {
  const lines = found.map(
    ([oldName, newName]) => `  - ${oldName}: ${CONFIG_MESSAGES.renamedTo} ${newName}`,
  );
  return [CONFIG_MESSAGES.renamedHeader, ...lines, CONFIG_MESSAGES.renamedFooter].join(LINE_BREAK);
};

export function loadConfig(env: Record<string, string | undefined>): Config {
  const renamed = renamedVariablesFound(env);
  if (renamed.length > 0) {
    throw new Error(renamedVariablesMessage(renamed));
  }

  const parsed = environmentSchema.safeParse(withoutEmptyValues(env));
  if (!parsed.success) {
    throw new Error(invalidConfigMessage(parsed.error.issues));
  }

  const raw = parsed.data;
  return {
    environment: raw.APP_ENV,
    port: raw.PORT,
    databaseUrl: raw.DATABASE_URL,
    sessionSecret: raw.SESSION_SECRET,
    sessionDurationHours: raw.SESSION_DURATION_HOURS,
    httpTimeoutMs: raw.HTTP_TIMEOUT_MS,
    trustedProxies: commaSeparatedList(raw.TRUSTED_PROXIES),
    logLevel: raw.LOG_LEVEL,
    secureCookie:
      raw.SECURE_COOKIE === undefined
        ? raw.APP_ENV === PRODUCTION_ENV
        : raw.SECURE_COOKIE === ENV_TRUE,
    allowedOrigins: commaSeparatedList(raw.ALLOWED_ORIGINS),
    cookieDomain: raw.COOKIE_DOMAIN === '' ? null : raw.COOKIE_DOMAIN,
    frontPath: raw.FRONT_PATH === '' ? DEFAULT_FRONT_PATH : raw.FRONT_PATH,
  };
}
