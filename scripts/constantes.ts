/**
 * As bandeiras de linha de comando e o texto de console dos scripts de operação.
 *
 * Este arquivo nasceu de um argumento que não se sustentou. `scripts/migrate.ts` declarava a tabela
 * `ARGUMENTOS` e as doze frases de `MENSAGENS` dentro de si, justificando por escrito que "tem
 * exatamente um consumidor, este script, e por isso fica aqui". A conta estava certa e a conclusão
 * não: ter um consumidor só é motivo para não EXPORTAR, e não para a tabela morar longe das outras.
 * Uma tabela de constantes num arquivo de lógica é a forma de que a segunda fonte da verdade nasce
 * — quem for acrescentar a próxima bandeira encontra `--status` no meio de um `while`, e a próxima
 * frase de console, no meio de um `console.log`.
 *
 * O corte é o mesmo do resto do repositório: os `constantes.ts` de cada módulo, `shared/` e `web/`
 * guardam o que o produto decidiu; este guarda o que a OPERAÇÃO decidiu — o que se digita no
 * terminal e o que o terminal responde. O que atravessa a fronteira dos dois lados continua em
 * `shared/constantes.ts`: `MIGRACOES` e `CHAVES_DE_LOCK` são lidos pelo script E pelo servidor, e
 * é por isso que não estão aqui.
 */

/** As bandeiras que `bun run migrate` aceita, e onde o que o usuário digitou começa. */
export const ARGUMENTOS = {
  status: '--status',
  url: '--url',
  /** Prefixo que distingue uma bandeira de um valor: `--url --status` é URL faltando, não URL. */
  prefixo: '--',
  /** `Bun.argv` abre com o runtime e o caminho do script; o que o usuário digitou vem depois. */
  primeiroDoUsuario: 2,
} as const;

/**
 * O `  aplicada  ` do status e o `  aplicada  ` do progresso têm o mesmo prefixo por coincidência
 * e são duas mensagens: uma lista o que já estava no banco, com o instante em que entrou; a outra
 * narra o que este processo acabou de aplicar, com quanto tempo levou. Quem for reformatar o
 * relatório de `--status` não deve reformatar junto o log de aplicação.
 */
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
