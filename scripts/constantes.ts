export const ARGUMENTOS = {
  status: '--status',
  url: '--url',
  prefixo: '--',
  primeiroDoUsuario: 2,
} as const;

export const MENSAGENS_DA_MIGRACAO = {
  urlSemValor: `${ARGUMENTOS.url} exige a URL de conexão logo em seguida.`,
  argumentoDesconhecido: (argumento: string): string =>
    `Argumento desconhecido: ${argumento}. Use ${ARGUMENTOS.status} e ${ARGUMENTOS.url} <postgres://...>.`,
  destino: (banco: string): string => `Banco: ${banco}`,
  falha: (motivo: string): string => `Falha ao migrar: ${motivo}`,
  status: {
    pendente: (versao: string): string => `  pendente  ${versao}`,
    aplicada: (versao: string, instante: string): string => `  aplicada  ${versao}  (${instante})`,
    semArquivo: (versao: string): string => `  registrada sem arquivo  ${versao}`,
    resumo: (aplicadas: number, pendentes: number): string =>
      `${aplicadas} aplicada(s), ${pendentes} pendente(s).`,
  },
  aplicacao: {
    nadaAAplicar: 'Nada a aplicar: o banco já está na última migração.',
    aplicada: (versao: string, duracaoMs: number): string =>
      `  aplicada  ${versao}  (${duracaoMs} ms)`,
    uma: '1 migração aplicada.',
    varias: (total: number): string => `${total} migrações aplicadas.`,
  },
} as const;
