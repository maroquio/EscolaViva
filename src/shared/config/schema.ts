import { z } from 'zod';

export type Config = {
  ambiente: 'development' | 'test' | 'production';
  porta: number;
  databaseUrl: string;
  sessionSecret: string;
  sessaoDuracaoHoras: number;
  httpTimeoutMs: number;
  proxiesConfiaveis: string[];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  cookieSeguro: boolean;
};

const AMBIENTES = ['development', 'test', 'production'] as const;
const NIVEIS_DE_LOG = ['debug', 'info', 'warn', 'error'] as const;
const TAMANHO_MINIMO_DO_SEGREDO = 32;

const booleano = z.enum(['true', 'false'], {
  errorMap: () => ({ message: 'use true ou false' }),
});

export const schemaDeAmbiente = z.object({
  APP_ENV: z
    .enum(AMBIENTES, { errorMap: () => ({ message: 'use development, test ou production' }) })
    .default('development'),
  PORT: z.coerce
    .number({ invalid_type_error: 'precisa ser um número inteiro de porta' })
    .int()
    .positive()
    .default(3000),
  DATABASE_URL: z
    .string({ required_error: 'obrigatória — conexão do PostgreSQL primário' })
    .min(1, 'obrigatória — conexão do PostgreSQL primário'),
  SESSION_SECRET: z
    .string({ required_error: 'obrigatória — segredo que assina o cookie de sessão' })
    .min(TAMANHO_MINIMO_DO_SEGREDO, `precisa de no mínimo ${TAMANHO_MINIMO_DO_SEGREDO} caracteres`),
  SESSAO_DURACAO_HORAS: z.coerce
    .number({ invalid_type_error: 'precisa ser um número de horas' })
    .int()
    .positive()
    .default(12),
  HTTP_TIMEOUT_MS: z.coerce
    .number({ invalid_type_error: 'precisa ser um número de milissegundos' })
    .int()
    .positive()
    .default(25000),
  PROXIES_CONFIAVEIS: z.string().default(''),
  LOG_LEVEL: z
    .enum(NIVEIS_DE_LOG, { errorMap: () => ({ message: 'use debug, info, warn ou error' }) })
    .default('info'),
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
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

const mensagemDeConfigInvalida = (
  issues: readonly { path: (string | number)[]; message: string }[],
): string => {
  const linhas = issues.map(
    (problema) => `  - ${problema.path.join('.') || 'ambiente'}: ${problema.message}`,
  );
  return [
    'Configuração de ambiente inválida — o processo não sobe (I18).',
    ...linhas,
    'Consulte .env.example.',
  ].join('\n');
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
        ? bruto.APP_ENV === 'production'
        : bruto.COOKIE_SEGURO === 'true',
  };
}
