import { z } from 'zod';
import {
  AMBIENTES,
  AMBIENTE_PRODUCAO,
  BOOLEANOS_DE_AMBIENTE,
  MENSAGENS_DE_CONFIG,
  NIVEIS_DE_LOG,
  PADROES_DE_CONFIG,
  SEPARADOR_DE_LISTA_DE_AMBIENTE,
  TAMANHO_MINIMO_DO_SEGREDO,
  VERDADEIRO_DE_AMBIENTE,
} from '../constantes';

/**
 * Os dois campos de conjunto fechado nascem das MESMAS listas que o schema valida: repetir a união
 * aqui criaria um segundo lugar para acrescentar um ambiente, e o tipo continuaria compilando
 * enquanto o schema recusasse o valor em tempo de execução.
 */
export type Config = {
  ambiente: (typeof AMBIENTES)[number];
  porta: number;
  databaseUrl: string;
  sessionSecret: string;
  sessaoDuracaoHoras: number;
  httpTimeoutMs: number;
  proxiesConfiaveis: string[];
  logLevel: (typeof NIVEIS_DE_LOG)[number];
  cookieSeguro: boolean;
};

/** O `path` do zod vem segmentado; o relatório o mostra como um caminho só. */
const SEPARADOR_DE_CAMINHO = '.';

/** O relatório é lido no terminal: um problema por linha. */
const QUEBRA_DE_LINHA = '\n';

const booleano = z.enum(BOOLEANOS_DE_AMBIENTE, {
  errorMap: () => ({ message: MENSAGENS_DE_CONFIG.booleanoInvalido }),
});

export const schemaDeAmbiente = z.object({
  APP_ENV: z
    .enum(AMBIENTES, { errorMap: () => ({ message: MENSAGENS_DE_CONFIG.ambienteInvalido }) })
    .default(PADROES_DE_CONFIG.ambiente),
  PORT: z.coerce
    .number({ invalid_type_error: MENSAGENS_DE_CONFIG.portaInvalida })
    .int()
    .positive()
    .default(PADROES_DE_CONFIG.porta),
  DATABASE_URL: z
    .string({ required_error: MENSAGENS_DE_CONFIG.databaseUrlAusente })
    .min(1, MENSAGENS_DE_CONFIG.databaseUrlAusente),
  SESSION_SECRET: z
    .string({ required_error: MENSAGENS_DE_CONFIG.sessionSecretAusente })
    .min(TAMANHO_MINIMO_DO_SEGREDO, MENSAGENS_DE_CONFIG.sessionSecretCurto),
  SESSAO_DURACAO_HORAS: z.coerce
    .number({ invalid_type_error: MENSAGENS_DE_CONFIG.duracaoInvalida })
    .int()
    .positive()
    .default(PADROES_DE_CONFIG.sessaoDuracaoHoras),
  HTTP_TIMEOUT_MS: z.coerce
    .number({ invalid_type_error: MENSAGENS_DE_CONFIG.timeoutInvalido })
    .int()
    .positive()
    .default(PADROES_DE_CONFIG.httpTimeoutMs),
  PROXIES_CONFIAVEIS: z.string().default(''),
  LOG_LEVEL: z
    .enum(NIVEIS_DE_LOG, { errorMap: () => ({ message: MENSAGENS_DE_CONFIG.logLevelInvalido }) })
    .default(PADROES_DE_CONFIG.logLevel),
  COOKIE_SEGURO: booleano.optional(),
});

/**
 * `VARIAVEL=` no .env chega como string vazia, não como ausência. Tratar as duas do mesmo
 * jeito faz o default valer e produz a mensagem certa ("obrigatória") em vez de
 * "precisa de no mínimo 32 caracteres" para quem simplesmente não preencheu.
 */
const semValoresVazios = (
  env: Record<string, string | undefined>,
): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(env).map(([chave, valor]): [string, string | undefined] => [
      chave,
      valor === '' ? undefined : valor,
    ]),
  );

const listaSeparadaPorVirgula = (valor: string): string[] =>
  valor
    .split(SEPARADOR_DE_LISTA_DE_AMBIENTE)
    .map((item) => item.trim())
    .filter((item) => item !== '');

const mensagemDeConfigInvalida = (
  issues: readonly { path: (string | number)[]; message: string }[],
): string => {
  const linhas = issues.map((problema) => {
    const onde = problema.path.join(SEPARADOR_DE_CAMINHO) || MENSAGENS_DE_CONFIG.rotuloDaRaiz;
    return `  - ${onde}: ${problema.message}`;
  });
  return [
    MENSAGENS_DE_CONFIG.cabecalhoDoRelatorio,
    ...linhas,
    MENSAGENS_DE_CONFIG.rodapeDoRelatorio,
  ].join(QUEBRA_DE_LINHA);
};

/**
 * Pura por decisão: recebe o mapa de variáveis em vez de ler o ambiente sozinha, o que
 * permite testar cada combinação sem mexer no processo. Lança listando TODAS as variáveis
 * com problema de uma vez — descobrir uma por vez, reiniciando o processo, é o oposto de
 * falhar rápido.
 */
export function carregarConfig(env: Record<string, string | undefined>): Config {
  const analise = schemaDeAmbiente.safeParse(semValoresVazios(env));
  if (!analise.success) {
    throw new Error(mensagemDeConfigInvalida(analise.error.issues));
  }

  const bruto = analise.data;
  return {
    ambiente: bruto.APP_ENV,
    porta: bruto.PORT,
    databaseUrl: bruto.DATABASE_URL,
    sessionSecret: bruto.SESSION_SECRET,
    sessaoDuracaoHoras: bruto.SESSAO_DURACAO_HORAS,
    httpTimeoutMs: bruto.HTTP_TIMEOUT_MS,
    proxiesConfiaveis: listaSeparadaPorVirgula(bruto.PROXIES_CONFIAVEIS),
    logLevel: bruto.LOG_LEVEL,
    cookieSeguro:
      bruto.COOKIE_SEGURO === undefined
        ? bruto.APP_ENV === AMBIENTE_PRODUCAO
        : bruto.COOKIE_SEGURO === VERDADEIRO_DE_AMBIENTE,
  };
}
