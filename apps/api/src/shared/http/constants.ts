export const FORWARDED_SEPARATOR = ',';

export const COOKIE = {
  session: 'ev_session',
  path: '/',
  sameSite: 'Lax',
} as const;

export const RESPONSE_HASH = { algorithm: 'sha256', encoding: 'hex' } as const;

export const IDEMPOTENCY_MESSAGES = {
  missingKey: 'Toda criação precisa do cabeçalho Idempotency-Key.',
  malformedBody: 'O corpo da requisição não é um JSON válido.',
  keyOfAnotherRequest: 'Esta chave de idempotência já pertence a outro envio. Gere uma nova.',
  stillFinishing: 'O envio anterior com esta chave ainda está sendo concluído. Tente de novo em instantes.',
} as const;
