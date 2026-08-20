import { HEALTH_PATHS } from '../shared/constants';

const VERSION = 'v1';

const PATH_SEPARATOR = '/';

export const API_PATH_PREFIX = '/api';

export const API = {
  prefix: API_PATH_PREFIX,
  version: VERSION,
  versionedPrefix: `${API_PATH_PREFIX}${PATH_SEPARATOR}${VERSION}`,
  mediaType: 'application/json',
} as const;

export const CORS = {
  credentials: 'true',
  methods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  maxAge: '600',
  headerSeparator: ', ',
} as const;

export const DOCUMENT_MEDIA_TYPE = 'text/html; charset=utf-8';

export const SERVER_PATHS: readonly string[] = [API_PATH_PREFIX, HEALTH_PATHS.readiness];

export const WILDCARD_PATH = '*';

export const API_ROUTES = {
  root: '/',
  session: '/session',
  account: '/account',
  password: '/password',
  options: '/options',
  network: '/network',
  registrar: '/registrar',
  teacher: '/teacher',
  guardian: '/guardian',
  announcements: '/announcements',
} as const;

export const OPTIONS_ROUTES = {
  schools: '/schools',
  academicYears: '/academic-years',
  guardians: '/guardians',
  classGroups: '/class-groups',
  subjects: '/subjects',
  teachers: '/teachers',
} as const;

export const NETWORK_ROUTES = {
  dashboard: '/dashboard',
  schools: '/schools',
  users: '/users',
  academicYears: '/academic-years',
} as const;

export const REGISTRAR_ROUTES = {
  dashboard: '/dashboard',
  students: '/students',
  student: '/students/:id',
  studentGuardians: '/students/:id/guardians',
  studentAvailableGuardians: '/students/:id/available-guardians',
  guardians: '/guardians',
  enrollments: '/enrollments',
  enrollment: '/enrollments/:id',
  enrollmentTransfer: '/enrollments/:id/transfer',
  classGroups: '/class-groups',
  classGroup: '/class-groups/:id',
  classGroupSubjects: '/class-groups/:id/subjects',
  subjects: '/subjects',
} as const;

export const TEACHER_ROUTES = {
  classGroups: '/class-groups',
  rollCall: '/class-groups/:classGroupId/roll-call',
  closing: '/class-groups/:classGroupId/closing',
  grades: '/subjects/:classGroupSubjectId/grades',
} as const;

export const GUARDIAN_ROUTES = {
  dashboard: '/dashboard',
  board: '/board',
  announcement: '/board/:announcementId',
  announcementRead: '/board/:announcementId/read',
  attendance: '/enrollments/:id/attendance',
  reportCard: '/enrollments/:id/report-card',
} as const;

export const ANNOUNCEMENT_ROUTES = {
  list: '/',
  recipients: '/recipients',
} as const;

export const PARAMS = {
  defaultPage: 'p',
  guardiansPage: 'pGuardians',
  enrollmentsPage: 'pEnrollments',
  subjectsPage: 'pSubjects',
  unreadPage: 'pUnread',
  readPage: 'pRead',
  search: 'q',
  school: 'school',
  year: 'year',
  schoolId: 'schoolId',
  term: 'term',
  date: 'date',
} as const;

export const SECURE_WRITE_MESSAGES = {
  missingMark: 'Esta requisição não veio da aplicação.',
} as const;

export const ASSET_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;

export const ASSET_TYPES: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
};

export const DEFAULT_ASSET_TYPE = 'application/octet-stream';

export const HEALTH_NO_CACHE = 'no-store';

export const HEALTH_BODY = {
  ok: { status: 'ok', database: 'ok' },
  degraded: { status: 'degraded', database: 'unavailable' },
  alive: { status: 'ok' },
} as const;

export const PROBE_TIMEOUT_MS = 2000;

export const ROOT_PATH = '/';
