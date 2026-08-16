export const ARGUMENTS = {
  status: '--status',
  url: '--url',
  prefix: '--',
  firstUserArg: 2,
} as const;

export const MIGRATION_MESSAGES = {
  urlWithoutValue: `${ARGUMENTS.url} exige a URL de conexão logo em seguida.`,
  unknownArgument: (argument: string): string =>
    `Argumento desconhecido: ${argument}. Use ${ARGUMENTS.status} e ${ARGUMENTS.url} <postgres://...>.`,
  target: (database: string): string => `Banco: ${database}`,
  failure: (reason: string): string => `Falha ao migrar: ${reason}`,
  status: {
    pending: (version: string): string => `  pendente  ${version}`,
    applied: (version: string, instant: string): string => `  aplicada  ${version}  (${instant})`,
    withoutFile: (version: string): string => `  registrada sem arquivo  ${version}`,
    summary: (applied: number, pending: number): string =>
      `${applied} aplicada(s), ${pending} pendente(s).`,
  },
  application: {
    nothingToApply: 'Nada a aplicar: o banco já está na última migração.',
    applied: (version: string, durationMs: number): string =>
      `  aplicada  ${version}  (${durationMs} ms)`,
    one: '1 migração aplicada.',
    many: (total: number): string => `${total} migrações aplicadas.`,
  },
} as const;
