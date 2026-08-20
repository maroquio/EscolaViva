import { CHOOSE, YEAR_LABEL } from '../../shared/labels/constants';
import { ABSENCE_COLOUR, AGREEMENT_COLOUR } from '../../shared/ui/constants';
import type { Role } from '@escolaviva/contracts/enumerations';

export { YEAR_LABEL };

export const NETWORK_API = {
  dashboard: '/network/dashboard',
  schools: '/network/schools',
  users: '/network/users',
  academicYears: '/network/academic-years',
  schoolOptions: '/options/schools',
} as const;

const SCHOOLS_LIST_KEY = ['network', 'schools'] as const;
const USERS_LIST_KEY = ['network', 'users'] as const;
const ACADEMIC_YEARS_LIST_KEY = ['network', 'academic-years'] as const;

export const NETWORK_QUERY_KEYS = {
  dashboard: ['network', 'dashboard'] as const,
  schoolOptions: ['options', 'schools'] as const,
  schoolsList: SCHOOLS_LIST_KEY,
  usersList: USERS_LIST_KEY,
  academicYearsList: ACADEMIC_YEARS_LIST_KEY,
  schoolsPage: (page: number) => [...SCHOOLS_LIST_KEY, page] as const,
  usersPage: (page: number) => [...USERS_LIST_KEY, page] as const,
  academicYearsPage: (page: number) => [...ACADEMIC_YEARS_LIST_KEY, page] as const,
} as const;

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  network_admin: 'Administração da rede',
  registrar: 'Secretaria',
  teacher: 'Docência',
  guardian: 'Responsável',
};

export const ROLE_OFFERED_FIRST: Role = 'registrar';

export const NETWORK_OVERLINES = {
  area: 'Rede',
  schools: 'Rede · Escolas',
  users: 'Rede · Usuários',
  academicYears: 'Rede · Anos letivos',
} as const;

export const NETWORK_ACTIONS = {
  newSchool: 'Nova escola',
  inviteUser: 'Convidar usuário',
  defineAcademicYear: 'Definir ano letivo',
} as const;

export const NO_ACADEMIC_YEAR_TITLE = 'Nenhum ano letivo definido';

export const SCHOOL_CHOICE = {
  none: '',
  stillLoading: 'Carregando escolas…',
  prompt: CHOOSE.school,
} as const;

export const ACTIVITY_COLOURS = {
  active: AGREEMENT_COLOUR,
  inactive: ABSENCE_COLOUR,
} as const;

export const SCHOOL_ACTIVITY_LABELS = { active: 'Ativa', inactive: 'Inativa' } as const;
export const USER_ACTIVITY_LABELS = { active: 'Ativo', inactive: 'Inativo' } as const;

export const SCHOOL_FIELD = { name: 'name', inepCode: 'inepCode' } as const;

export const USER_FIELD = {
  name: 'name',
  cpf: 'cpf',
  email: 'email',
  phone: 'phone',
  roleAssignments: 'roleAssignments',
} as const;

export const ROLE_ASSIGNMENT_FIELD = {
  school: (index: number): `roleAssignments.${number}.schoolId` =>
    `roleAssignments.${index}.schoolId`,
  role: (index: number): `roleAssignments.${number}.role` => `roleAssignments.${index}.role`,
} as const;

export const ACADEMIC_YEAR_FIELD = {
  year: 'year',
  startDate: 'startDate',
  endDate: 'endDate',
} as const;

export const NETWORK_MESSAGES = {
  schoolName: 'Informe o nome da escola.',
  schoolChoice: 'Escolha a escola.',
  roleChoice: 'Escolha o papel.',
  name: 'Informe o nome.',
  cpf: 'Informe o CPF.',
  email: 'Informe o e-mail.',
  atLeastOneAssignment: 'Atribua ao menos uma escola e um papel.',
  yearMissing: 'Informe o ano.',
  yearIsATypo: 'Informe um ano válido.',
  startDate: 'Informe a data de início.',
  endDate: 'Informe a data de término.',
} as const;

export const NETWORK_NOTICES = {
  schoolCreated: 'Escola criada.',
  academicYearDefined: 'Ano letivo definido.',
} as const;

export const INEP_CODE_LABEL = 'Código INEP';
export const ROLES_LABEL = 'Papéis';

export const NO_ACADEMIC_YEAR_IN_WORDS = 'sem ano letivo';
export const academicYearInWords = (year: number): string => `ano letivo ${year}`;

export const REPEATED_MARK = 'repeated';

export const SENSIBLE_YEARS = {
  first: 2000,
  last: 2100,
} as const;

export const DASHBOARD_HEADING_IDS = {
  counters: 'numeros',
  academicYear: 'ano-letivo',
} as const;

