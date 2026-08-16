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
  user: { name: 120 },
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
    roleAssignments: 'roleAssignments',
    guardianId: 'guardianId',
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
  invalidCredentials: 'credenciais_invalidas',
  networkUnavailable: 'rede_indisponivel',
  schoolFromAnotherNetwork: 'unidade_de_outra_rede',
  emailInUse: 'email_em_uso',
  cpfInUse: 'cpf_em_uso',
  guardianRequired: 'responsavel_obrigatorio',
  cpfMismatch: 'cpf_diverge_do_cadastro',
  nameInUse: 'nome_em_uso',
  userNotFound: 'usuario_inexistente',
  wrongPassword: 'senha_incorreta',
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
    invalidCpf: 'Informe um CPF válido.',
    invalidSchool: 'unidade inválida',
    unknownRole: 'papel desconhecido',
    noRoleAssignment: 'escolha ao menos uma unidade e um papel',
    invalidGuardian: 'responsável inválido',
    schoolFromAnotherNetwork: 'unidade não pertence a esta rede',
    emailInUse: 'já existe usuário com este e-mail na rede',
    cpfInUse: 'já existe usuário com este CPF na rede',
    guardianRequired:
      'quem entra como responsável precisa estar ligado a um cadastro de responsável',
    guardianLabel: 'responsável',
    cpfMismatch: (registeredName: string): string =>
      `O CPF não confere com o do cadastro de ${registeredName}.`,
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
