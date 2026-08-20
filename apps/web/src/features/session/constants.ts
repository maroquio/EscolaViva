export const SESSION_ENDPOINT = '/session';
export const PASSWORD_ENDPOINT = '/account/password';

const MINUTES_FRESH = 5;
const MILLISECONDS_PER_MINUTE = 60_000;

export const SESSION_FRESH_FOR_MS = MINUTES_FRESH * MILLISECONDS_PER_MINUTE;

export const SESSION_QUERY_KEY = ['session'] as const;

export const SIGN_IN_FIELD = {
  networkSlug: 'networkSlug',
  cpf: 'cpf',
  password: 'password',
} as const;

export const SIGN_IN_MESSAGES = {
  networkSlug: 'Informe a rede.',
  cpf: 'Informe seu CPF.',
  password: 'Informe a senha.',
} as const;

export const SHOW_OR_HIDE_PASSWORD = 'Mostrar ou ocultar a senha';
