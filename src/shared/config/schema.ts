import { z } from 'zod';
import {
  CONFIG_DEFAULTS,
  CONFIG_MESSAGES,
  ENVIRONMENTS,
  ENV_BOOLEANS,
  ENV_LIST_SEPARATOR,
  ENV_TRUE,
  LOG_LEVELS,
  MINIMUM_SECRET_LENGTH,
  PRODUCTION_ENV,
} from '../constants';

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
};

const PATH_SEPARATOR = '.';

const LINE_BREAK = '\n';

const envBoolean = z.enum(ENV_BOOLEANS, {
  errorMap: () => ({ message: CONFIG_MESSAGES.invalidBoolean }),
});

export const environmentSchema = z.object({
  APP_ENV: z
    .enum(ENVIRONMENTS, { errorMap: () => ({ message: CONFIG_MESSAGES.invalidEnvironment }) })
    .default(CONFIG_DEFAULTS.environment),
  PORT: z.coerce
    .number({ invalid_type_error: CONFIG_MESSAGES.invalidPort })
    .int()
    .positive()
    .default(CONFIG_DEFAULTS.port),
  DATABASE_URL: z
    .string({ required_error: CONFIG_MESSAGES.missingDatabaseUrl })
    .min(1, CONFIG_MESSAGES.missingDatabaseUrl),
  SESSION_SECRET: z
    .string({ required_error: CONFIG_MESSAGES.missingSessionSecret })
    .min(MINIMUM_SECRET_LENGTH, CONFIG_MESSAGES.shortSessionSecret),
  SESSAO_DURACAO_HORAS: z.coerce
    .number({ invalid_type_error: CONFIG_MESSAGES.invalidDuration })
    .int()
    .positive()
    .default(CONFIG_DEFAULTS.sessionDurationHours),
  HTTP_TIMEOUT_MS: z.coerce
    .number({ invalid_type_error: CONFIG_MESSAGES.invalidTimeout })
    .int()
    .positive()
    .default(CONFIG_DEFAULTS.httpTimeoutMs),
  PROXIES_CONFIAVEIS: z.string().default(''),
  LOG_LEVEL: z
    .enum(LOG_LEVELS, { errorMap: () => ({ message: CONFIG_MESSAGES.invalidLogLevel }) })
    .default(CONFIG_DEFAULTS.logLevel),
  COOKIE_SEGURO: envBoolean.optional(),
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
  issues: readonly { path: (string | number)[]; message: string }[],
): string => {
  const lines = issues.map((issue) => {
    const where = issue.path.join(PATH_SEPARATOR) || CONFIG_MESSAGES.rootLabel;
    return `  - ${where}: ${issue.message}`;
  });
  return [CONFIG_MESSAGES.reportHeader, ...lines, CONFIG_MESSAGES.reportFooter].join(LINE_BREAK);
};

export function loadConfig(env: Record<string, string | undefined>): Config {
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
    sessionDurationHours: raw.SESSAO_DURACAO_HORAS,
    httpTimeoutMs: raw.HTTP_TIMEOUT_MS,
    trustedProxies: commaSeparatedList(raw.PROXIES_CONFIAVEIS),
    logLevel: raw.LOG_LEVEL,
    secureCookie:
      raw.COOKIE_SEGURO === undefined
        ? raw.APP_ENV === PRODUCTION_ENV
        : raw.COOKIE_SEGURO === ENV_TRUE,
  };
}
