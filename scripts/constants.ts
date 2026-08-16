export const ARGUMENTS = {
  status: '--status',
  url: '--url',
  prefix: '--',
  firstUserArg: 2,
} as const;

export const MIGRATION_MESSAGES = {
  urlWithoutValue: `${ARGUMENTS.url} takes the connection URL right after it.`,
  unknownArgument: (argument: string): string =>
    `Unknown argument: ${argument}. Use ${ARGUMENTS.status} and ${ARGUMENTS.url} <postgres://...>.`,
  target: (database: string): string => `Database: ${database}`,
  failure: (reason: string): string => `Migration failed: ${reason}`,
  status: {
    pending: (version: string): string => `  pending  ${version}`,
    applied: (version: string, instant: string): string => `  applied  ${version}  (${instant})`,
    withoutFile: (version: string): string => `  recorded with no file  ${version}`,
    summary: (applied: number, pending: number): string =>
      `${applied} applied, ${pending} pending.`,
  },
  application: {
    nothingToApply: 'Nothing to apply: the database is already on the last migration.',
    applied: (version: string, durationMs: number): string =>
      `  applied  ${version}  (${durationMs} ms)`,
    one: '1 migration applied.',
    many: (total: number): string => `${total} migrations applied.`,
  },
} as const;
