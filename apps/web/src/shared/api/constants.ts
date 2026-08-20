export const API_PREFIX = '/api/v1';

export const SESSION_PATH = '/session';

export const UNREACHABLE_SERVER = 'Não foi possível falar com o servidor.';

export const UNREACHABLE_SERVER_WITH_RETRY = `${UNREACHABLE_SERVER} Tente de novo.`;

export const NETWORK_UNREACHABLE_CODE = 'network_unreachable';

export const NOT_FOUND_STATUS = 404;

export const FIRST_PAGE = 1;

export const PAGE_PARAMS = {
  default: 'p',
  guardians: 'pGuardians',
  enrollments: 'pEnrollments',
  subjects: 'pSubjects',
  unread: 'pUnread',
  read: 'pRead',
} as const;

export const HEADERS = {
  requestedBy: 'X-Requested-By',
  idempotencyKey: 'Idempotency-Key',
  contentType: 'Content-Type',
  correlationId: 'x-correlation-id',
} as const;

export const REQUESTED_BY = 'escolaviva';

export const JSON_CONTENT_TYPE = 'application/json';

export const WHOLE_FORM = 'root';

export const SERVER_REFUSAL = 'server';

export const askingForHelp = (correlationId: string): string =>
  `Se precisar de ajuda, informe o código ${correlationId}.`;

export const refusedWithoutDetail = (status: number): string =>
  `O servidor recusou o envio (${status}) sem explicar o motivo.`;
