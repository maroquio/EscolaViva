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
  failureEvents: { rejection: 'unhandledRejection', exception: 'uncaughtException' },
} as const;

export const ENVIRONMENTS = ['development', 'test', 'production'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const PRODUCTION_ENV = 'production';
export const DEVELOPMENT_ENV = 'development';

export const LOCK_KEYS = {
  sessionPurge: 1001,
  migration: 4242,
} as const;

export const STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  invalidShape: 400,
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  unsupportedMediaType: 415,
  refused: 422,
  internalFailure: 500,
  unavailable: 503,
} as const;

export const isClientOrServerError = (status: number): boolean => status >= STATUS.invalidShape;

export const HEADERS = {
  cacheControl: 'Cache-Control',
  vary: 'Vary',
  cookie: 'Cookie',
  location: 'Location',
  correlation: 'X-Correlation-Id',
  forwarded: 'X-Forwarded-For',
  idempotencyKey: 'Idempotency-Key',
  contentType: 'Content-Type',
  requestedBy: 'X-Requested-By',
  origin: 'Origin',
} as const;

export const APPLICATION_MARK = 'escolaviva';

export const CORS_HEADERS = {
  allowOrigin: 'Access-Control-Allow-Origin',
  allowCredentials: 'Access-Control-Allow-Credentials',
  allowMethods: 'Access-Control-Allow-Methods',
  allowHeaders: 'Access-Control-Allow-Headers',
  exposeHeaders: 'Access-Control-Expose-Headers',
  maxAge: 'Access-Control-Max-Age',
} as const;

export const METHODS = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  options: 'OPTIONS',
} as const;

export const CACHE = {
  asset: 'public, max-age=31536000, immutable',
  authenticated: 'private, no-store',
  anonymous: 'no-store',
} as const;

export const FORMATS = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  correlation: /^[A-Za-z0-9._:-]{8,128}$/,
  isoDate: /^\d{4}-\d{2}-\d{2}$/,
} as const;

export const ISO_DATE_LENGTH = 10;

export const CONTEXT_VARIABLES = {
  user: 'user',
  sessionId: 'sessionId',
  jsonBody: 'jsonBody',
  correlationId: 'correlationId',
  applicationDocument: 'applicationDocument',
  arrivedWithASession: 'arrivedWithASession',
} as const;

export const INTERNAL_REASONS = {
  requestWithoutSession: 'request without a session',
  networkUnavailableWithoutSession: 'network unavailable without a session',
  accessDeniedByRole: 'access denied by role',
  writeWithoutKey: 'write without an idempotency key',
  writeWithoutMark: 'write without the application mark',
  repeatedWrite: 'the idempotency key was claimed by an earlier write',
  replayDestinationNotStored: 'the repeat could not be given a destination',
} as const;

export const ASSETS = {
  buildDirectory: 'assets',
  buildUrlPrefix: '/assets/',
  document: 'index.html',
} as const;

export const MIGRATIONS = { directory: 'migrations', glob: '*.sql' } as const;

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
  databaseUnavailable: 'database did not answer the health probe',
  unhandledRejection: 'unhandled promise rejection',
  uncaughtException: 'uncaught exception',
} as const;

export const MISSING_VALUE = '—';

export const ERROR_CODES = {
  missingIdempotencyKey: 'missing_idempotency_key',
  idempotencyKeyOfAnotherRequest: 'idempotency_key_of_another_request',
  idempotencyKeyStillFinishing: 'idempotency_key_still_finishing',
  malformedBody: 'malformed_body',
  writeWithoutMark: 'write_without_mark',
  invalidRequest: 'invalid_request',
  noSession: 'no_session',
  forbidden: 'forbidden',
  notFound: 'not_found',
  unsupportedMediaType: 'unsupported_media_type',
  businessRule: 'business_rule',
  internalFailure: 'internal_failure',
} as const;

export const ERROR_MESSAGES = {
  400: 'A requisição chegou incompleta ou malformada.',
  401: 'Entre para continuar.',
  403: 'Sua conta não tem permissão para esta operação.',
  404: 'O registro não existe ou não está ao seu alcance.',
  415: 'O corpo precisa chegar como JSON.',
  422: 'A situação atual não permite concluir esta operação.',
  500: 'Algo falhou do nosso lado. A ocorrência foi registrada.',
} as const;

export const HEALTH_PATHS = { readiness: '/health', liveness: '/health/live' } as const;

export const LOCALE = 'pt-BR';
