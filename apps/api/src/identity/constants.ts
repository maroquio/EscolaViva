import type { Role } from './domain/role';
import type { NetworkStatus } from './domain/network';

export const ROLE = {
  networkAdmin: 'network_admin',
  registrar: 'registrar',
  teacher: 'teacher',
  guardian: 'guardian',
} as const;

export const ACTIVE_NETWORK_STATUS = 'active' as const satisfies NetworkStatus;

export const LIMITS = {
  user: { name: 120, email: 254, phone: 30 },
  school: { name: 120, inepCode: 20 },
} as const;

export const SECURITY = {
  nonexistentUserHash:
    '$argon2id$v=19$m=65536,t=2,p=1$XMdb31Dd1P5tOekJsaneq6Yl0CU6HnbV15d11ekBprQ$jxM302vDpER0f7uF9xQRIwAkDNaDTukAT0y3bg04lhQ',
  unambiguousAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  temporaryPasswordLength: 12,
} as const;

export const ROLE_ASSIGNMENT_SEPARATOR = ':';

export const FIELDS = {
  login: { networkSlug: 'networkSlug', cpf: 'cpf', password: 'password' },
  user: {
    name: 'name',
    email: 'email',
    cpf: 'cpf',
    phone: 'phone',
    roleAssignments: 'roleAssignments',
  },
  school: { name: 'name', inepCode: 'inepCode' },
  password: {
    currentPassword: 'currentPassword',
    newPassword: 'newPassword',
    passwordConfirmation: 'passwordConfirmation',
  },
} as const;

export const SCHEMA_FIELD_NAMES = {
  login: { loginIdentifier: FIELDS.login.cpf },
} as const;

export const CODES = {
  invalidCredentials: 'invalid_credentials',
  networkUnavailable: 'network_unavailable',
  schoolFromAnotherNetwork: 'school_from_another_network',
  cpfInUse: 'cpf_in_use',
  nameInUse: 'name_in_use',
  userNotFound: 'user_not_found',
  wrongPassword: 'wrong_password',
} as const;

export const MESSAGES = {
  login: {
    networkRequired: 'informe a rede',
    cpfRequired: 'informe o CPF',
    passwordRequired: 'informe a senha',
    invalidCredentials: 'CPF ou senha inválidos',
    networkUnavailable: 'rede não encontrada ou fora de operação',
  },
  user: {
    invalidNetwork: 'rede inválida',
    nameRequired: 'informe o nome',
    nameTooLong: 'nome longo demais',
    emailRequired: 'informe o e-mail',
    invalidEmail: 'e-mail inválido',
    emailTooLong: 'e-mail longo demais',
    invalidCpf: 'Informe um CPF válido.',
    phoneTooLong: `O telefone precisa ter até ${LIMITS.user.phone} caracteres.`,
    invalidSchool: 'unidade inválida',
    unknownRole: 'papel desconhecido',
    noRoleAssignment: 'escolha ao menos uma unidade e um papel',
    schoolFromAnotherNetwork: 'unidade não pertence a esta rede',
    cpfInUse: 'já existe usuário com este CPF na rede',
  },
  school: {
    invalidNetwork: 'rede inválida',
    nameRequired: 'informe o nome da unidade',
    nameTooLong: 'nome longo demais',
    inepTooLong: 'código INEP longo demais',
    nameInUse: 'já existe unidade com este nome na rede',
  },
  password: {
    invalidUser: 'usuário inválido',
    currentRequired: 'informe a senha atual',
    newTooShort: (minimum: number): string =>
      `a senha nova precisa de ao menos ${minimum} caracteres`,
    userNotFound: 'usuário não encontrado',
    currentDoesNotMatch: 'a senha atual não confere',
  },
} as const;

export const INTERNAL_ERRORS = {
  roleOutOfDomain: (value: string): string => `role outside the domain: ${value}`,
  networkStatusOutOfDomain: (value: string): string => `network status outside the domain: ${value}`,
} as const;

export const LOG_EVENTS = {
  authenticationRejected: 'authentication attempt rejected',
  sessionOpened: 'session opened',
  expiredSessionsRemoved: 'expired sessions removed',
} as const;

export const SESSION_PURGE = { name: 'expurgo-de-sessoes', intervalInMinutes: 15 } as const;

export const VOCABULARY = {
  role: {
    network_admin: 'Administração da rede',
    registrar: 'Secretaria',
    teacher: 'Professor',
    guardian: 'Responsável',
  } as const satisfies Record<Role, string>,
  active: { yes: 'Ativo', no: 'Inativo' },
  schoolActive: { yes: 'Ativa', no: 'Inativa' },
  noRole: 'sem papel atribuído',
} as const;
