export const TIME = {
  msPerSecond: 1000,
  secondsPerMinute: 60,
  secondsPerHour: 3600,
  msPerHour: 3_600_000,
  msPerDay: 86_400_000,
} as const;

export const MINUTE_MS = TIME.secondsPerMinute * TIME.msPerSecond;

export const WEEK_DAYS = {
  saturdayJs: 6,
  firstWeekendDayIso: 6,
} as const;

export const SERVER = {
  maxIdleSeconds: 255,
  drainGraceMs: 5000,
  shutdownSignals: ['SIGTERM', 'SIGINT'],
} as const;

export const ENVIRONMENTS = ['development', 'test', 'production'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const PRODUCTION_ENV = 'production';
export const DEVELOPMENT_ENV = 'development';

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

export const CONFIG_MESSAGES = {
  invalidBoolean: 'use true ou false',
  invalidEnvironment: `use ${ENVIRONMENTS.join(', ').replace(/, ([^,]*)$/, ' ou $1')}`,
  invalidPort: 'precisa ser um número inteiro de porta',
  missingDatabaseUrl: 'obrigatória — conexão do PostgreSQL primário',
  missingSessionSecret: 'obrigatória — segredo que assina o cookie de sessão',
  shortSessionSecret: `precisa de no mínimo ${MINIMUM_SECRET_LENGTH} caracteres`,
  invalidDuration: 'precisa ser um número de horas',
  invalidTimeout: 'precisa ser um número de milissegundos',
  invalidLogLevel: `use ${LOG_LEVELS.join(', ').replace(/, ([^,]*)$/, ' ou $1')}`,
  rootLabel: 'ambiente',
  reportHeader: 'Configuração de ambiente inválida — o processo não sobe (I18).',
  reportFooter: 'Consulte .env.example.',
} as const;

export const DATABASE = {
  maxConnections: 10,
  idleTimeoutSeconds: 30,
  connectionTimeoutSeconds: 10,
} as const;

export const LOCK_KEYS = {
  sessionPurge: 1001,
  migration: 4242,
} as const;

export const DEFAULT_PAGE_SIZE = 10;

export const HEADERS = {
  cacheControl: 'Cache-Control',
  vary: 'Vary',
  cookie: 'Cookie',
  location: 'Location',
  correlation: 'X-Correlation-Id',
  forwarded: 'X-Forwarded-For',
} as const;

export const METHODS = { get: 'GET', post: 'POST' } as const;

export const CACHE = {
  asset: 'public, max-age=31536000, immutable',
  authenticated: 'private, no-store',
  anonymous: 'no-store',
} as const;

export const FORWARDED_SEPARATOR = ',';

export const FORMATS = {
  idempotencyKey: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  identifier: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  correlation: /^[A-Za-z0-9._:-]{8,128}$/,
  isoDate: /^\d{4}-\d{2}-\d{2}$/,
} as const;

export const ISO_DATE_LENGTH = 10;

export const HTML_ENTITIES = {
  ampersand: '&amp;',
  lessThan: '&lt;',
  greaterThan: '&gt;',
  doubleQuote: '&quot;',
} as const;

export const KEY_FIELD = '_chave';

export const CONTEXT_VARIABLES = {
  user: 'user',
  sessionId: 'sessionId',
  body: 'body',
  correlationId: 'correlationId',
} as const;

export const COOKIE = {
  session: 'ev_sessao',
  path: '/',
  sameSite: 'Lax',
} as const;

export const RESPONSE_HASH = { algorithm: 'sha256', encoding: 'hex' } as const;

export const INTERNAL_REASONS = {
  requestWithoutSession: 'requisição sem sessão',
  networkUnavailableWithoutSession: 'rede indisponível sem sessão',
  accessDeniedByRole: 'acesso negado por papel',
  writeWithoutKey: 'escrita sem chave de idempotência',
} as const;

export const ASSETS = {
  directory: 'publico',
  urlPrefix: '/publico/',
  stylesheetLogicalName: 'app.css',
  manifest: 'manifest.json',
  hashCharacters: 8,
  hashAlgorithm: 'sha256',
  hashEncoding: 'hex',
} as const;

export const MIGRATIONS = { directory: 'migrations', glob: '*.sql' } as const;

export const LOG = {
  correlationField: 'correlation_id',
  redactedValue: '[redacted]',
  maxDepth: 6,
} as const;

export const FORBIDDEN_LOG_KEYS: readonly string[] = [
  'nome',
  'name',
  'nome_completo',
  'full_name',
  'aluno_nome',
  'student_name',
  'email',
  'senha',
  'password',
  'senha_hash',
  'password_hash',
  'senha_provisoria',
  'temporary_password',
  'cpf',
  'telefone',
  'phone',
  'valor',
  'value',
  'nota',
  'grade',
  'notas',
  'grades',
  'justificativa',
  'excuse',
  'titulo',
  'title',
  'corpo',
  'body',
  'data_nascimento',
  'birth_date',
  'authorization',
  'cookie',
  'set-cookie',
  'session_secret',
  'database_url',
];

export const HTTP_LOG_EVENTS = {
  requestFailed: 'falha ao atender requisição',
  requestRejected: 'requisição recusada',
} as const;

export const PROCESS_MESSAGES = {
  up: 'escolaviva no ar',
  shutdownStarted: 'desligamento iniciado',
  shutdownCompleted: 'desligamento concluído',
  drainTimedOut: 'prazo de drenagem esgotado: encerrando conexões em curso',
  jobSkipped: 'job ignorado: lock em outra instancia',
  jobFailed: 'job falhou',
} as const;

export const MISSING_VALUE = '—';

export const MASKED_CPF_LENGTH = 14;

export const ENTRY_PATHS = { login: '/login', dashboard: '/painel' } as const;

export const ERROR_TITLES = {
  400: 'Requisição inválida',
  401: 'Entre para continuar',
  403: 'Acesso não permitido',
  404: 'Página não encontrada',
  422: 'Não foi possível concluir',
  500: 'Erro inesperado',
} as const;

export const HEALTH_PATHS = { readiness: '/health', liveness: '/health/live' } as const;

export const PROBE_TIMEOUT_MS = 2000;

export const LOCALE = 'pt-BR';
