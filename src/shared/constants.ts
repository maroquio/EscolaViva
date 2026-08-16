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

export const KEY_FIELD = '_key';

export const CONTEXT_VARIABLES = {
  user: 'user',
  sessionId: 'sessionId',
  body: 'body',
  correlationId: 'correlationId',
} as const;

export const COOKIE = {
  session: 'ev_session',
  path: '/',
  sameSite: 'Lax',
} as const;

export const RESPONSE_HASH = { algorithm: 'sha256', encoding: 'hex' } as const;

export const INTERNAL_REASONS = {
  requestWithoutSession: 'request without a session',
  networkUnavailableWithoutSession: 'network unavailable without a session',
  accessDeniedByRole: 'access denied by role',
  writeWithoutKey: 'write without an idempotency key',
} as const;

export const ASSETS = {
  directory: 'public',
  urlPrefix: '/public/',
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
  requestFailed: 'failed to serve request',
  requestRejected: 'request rejected',
} as const;

export const PROCESS_MESSAGES = {
  up: 'escolaviva is up',
  shutdownStarted: 'shutdown started',
  shutdownCompleted: 'shutdown completed',
  drainTimedOut: 'drain deadline reached: closing in-flight connections',
  jobSkipped: 'job skipped: lock held by another instance',
  jobFailed: 'job failed',
} as const;

export const MISSING_VALUE = '—';

export const MASKED_CPF_LENGTH = 14;

export const ENTRY_PATHS = { login: '/login', dashboard: '/dashboard' } as const;

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
