import type { Role } from '@escolaviva/contracts/enumerations';
import {
  APP_ROUTES,
  GUARDIAN_ROUTES,
  NETWORK_ROUTES,
  REGISTRAR_ROUTES,
} from '../constants';
import {
  ACADEMIC_YEARS_LABEL,
  ANNOUNCEMENTS_AREA,
  ANNOUNCEMENTS_LABEL,
  CHANGE_PASSWORD_LABEL,
  CLASS_GROUPS_LABEL,
  GUARDIANS_LABEL,
  MY_CLASS_GROUPS_LABEL,
  NETWORK_LABEL,
  REGISTRAR_DASHBOARD_LABEL,
  SCHOOLS_LABEL,
  STUDENTS_LABEL,
  SUBJECTS_LABEL,
  USERS_LABEL,
} from '../shared/labels/constants';
import type { NavigationArea } from './navigationAreas';

export const BRAND = 'EscolaViva';

export const CONTENT_ID = 'conteudo';
export const NAVIGATION_ID = 'navegacao';

export const HEADER_HEIGHT = 56;
export const NAVBAR_WIDTH = 240;
export const NAVBAR_BREAKPOINT = 'md';

const EVERY_ROLE: readonly Role[] = ['network_admin', 'registrar', 'teacher', 'guardian'];

export const DASHBOARD_BY_WIDEST_ROLE: readonly {
  readonly role: Role;
  readonly dashboard: string;
}[] = [
  { role: 'network_admin', dashboard: APP_ROUTES.network },
  { role: 'registrar', dashboard: APP_ROUTES.registrar },
  { role: 'teacher', dashboard: APP_ROUTES.teacher },
  { role: 'guardian', dashboard: APP_ROUTES.guardian },
];

export const NAVIGATION_AREAS: readonly NavigationArea[] = [
  {
    title: NETWORK_LABEL,
    roles: ['network_admin'],
    links: [
      { href: APP_ROUTES.network, label: 'Painel da rede' },
      { href: NETWORK_ROUTES.schools, label: SCHOOLS_LABEL },
      { href: NETWORK_ROUTES.users, label: USERS_LABEL },
      { href: NETWORK_ROUTES.academicYears, label: ACADEMIC_YEARS_LABEL },
    ],
  },
  {
    title: 'Secretaria',
    roles: ['registrar'],
    links: [
      { href: APP_ROUTES.registrar, label: REGISTRAR_DASHBOARD_LABEL },
      { href: REGISTRAR_ROUTES.students, label: STUDENTS_LABEL },
      { href: REGISTRAR_ROUTES.guardians, label: GUARDIANS_LABEL },
      { href: REGISTRAR_ROUTES.classGroups, label: CLASS_GROUPS_LABEL },
      { href: REGISTRAR_ROUTES.subjects, label: SUBJECTS_LABEL },
    ],
  },
  {
    title: 'Docência',
    roles: ['teacher'],
    links: [{ href: APP_ROUTES.teacher, label: MY_CLASS_GROUPS_LABEL }],
  },
  {
    title: 'Acompanhamento',
    roles: ['guardian'],
    links: [
      { href: APP_ROUTES.guardian, label: 'Painel do responsável' },
      { href: GUARDIAN_ROUTES.board, label: 'Mural' },
    ],
  },
  {
    title: ANNOUNCEMENTS_AREA,
    roles: ['network_admin', 'registrar'],
    links: [{ href: APP_ROUTES.announcements, label: ANNOUNCEMENTS_LABEL }],
  },
  {
    title: 'Conta',
    roles: EVERY_ROLE,
    links: [{ href: APP_ROUTES.accountPassword, label: CHANGE_PASSWORD_LABEL }],
  },
];

export const assignedSchoolsInWords = (howMany: number): string => `${howMany} escolas`;
