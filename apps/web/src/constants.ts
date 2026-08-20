export type RoutePattern = `${string}/:${string}`;

const filledInWithGeneratePath = <Path extends RoutePattern>(path: Path): Path => path;

export const APP_ROUTES = {
  root: '/',
  dashboard: '/dashboard',
  login: '/login',
  noRole: '/no-role',
  accountPassword: '/account/password',
  network: '/network',
  registrar: '/registrar',
  teacher: '/teacher',
  guardian: '/guardian',
  announcements: '/announcements',
} as const;

export const AREA_ROUTES = {
  network: '/network/*',
  registrar: '/registrar/*',
  teacher: '/teacher/*',
  guardian: '/guardian/*',
  announcements: '/announcements/*',
} as const;

export const WILDCARD_ROUTE = '*';

export const NETWORK_ROUTES = {
  schools: '/network/schools',
  newSchool: '/network/schools/new',
  users: '/network/users',
  newUser: '/network/users/new',
  academicYears: '/network/academic-years',
  newAcademicYear: '/network/academic-years/new',
} as const;

export const NETWORK_CHILD_ROUTES = {
  schools: 'schools',
  newSchool: 'schools/new',
  users: 'users',
  newUser: 'users/new',
  academicYears: 'academic-years',
  newAcademicYear: 'academic-years/new',
} as const;

export const REGISTRAR_ROUTES = {
  students: '/registrar/students',
  newStudent: '/registrar/students/new',
  student: filledInWithGeneratePath('/registrar/students/:id'),
  newStudentGuardian: filledInWithGeneratePath('/registrar/students/:id/guardians/new'),
  enroll: filledInWithGeneratePath('/registrar/students/:id/enroll'),
  enrollmentTransfer: filledInWithGeneratePath('/registrar/enrollments/:id/transfer'),
  guardians: '/registrar/guardians',
  newGuardian: '/registrar/guardians/new',
  classGroups: '/registrar/class-groups',
  newClassGroup: '/registrar/class-groups/new',
  classGroup: filledInWithGeneratePath('/registrar/class-groups/:id'),
  newClassGroupSubject: filledInWithGeneratePath('/registrar/class-groups/:id/subjects/new'),
  subjects: '/registrar/subjects',
  newSubject: '/registrar/subjects/new',
} as const;

export const REGISTRAR_CHILD_ROUTES = {
  students: 'students',
  newStudent: 'students/new',
  student: filledInWithGeneratePath('students/:id'),
  newStudentGuardian: filledInWithGeneratePath('students/:id/guardians/new'),
  enroll: filledInWithGeneratePath('students/:id/enroll'),
  enrollmentTransfer: filledInWithGeneratePath('enrollments/:id/transfer'),
  guardians: 'guardians',
  newGuardian: 'guardians/new',
  classGroups: 'class-groups',
  newClassGroup: 'class-groups/new',
  classGroup: filledInWithGeneratePath('class-groups/:id'),
  newClassGroupSubject: filledInWithGeneratePath('class-groups/:id/subjects/new'),
  subjects: 'subjects',
  newSubject: 'subjects/new',
} as const;

export const TEACHER_ROUTES = {
  rollCall: filledInWithGeneratePath('/teacher/class-groups/:classGroupId/roll-call'),
  closing: filledInWithGeneratePath('/teacher/class-groups/:classGroupId/closing'),
  grades: filledInWithGeneratePath('/teacher/subjects/:classGroupSubjectId/grades'),
} as const;

export const TEACHER_CHILD_ROUTES = {
  rollCall: filledInWithGeneratePath('class-groups/:classGroupId/roll-call'),
  closing: filledInWithGeneratePath('class-groups/:classGroupId/closing'),
  grades: filledInWithGeneratePath('subjects/:classGroupSubjectId/grades'),
} as const;

export const GUARDIAN_ROUTES = {
  board: '/guardian/board',
  announcement: filledInWithGeneratePath('/guardian/board/:announcementId'),
  attendance: filledInWithGeneratePath('/guardian/enrollments/:id/attendance'),
  reportCard: filledInWithGeneratePath('/guardian/enrollments/:id/report-card'),
} as const;

export const GUARDIAN_CHILD_ROUTES = {
  board: 'board',
  announcement: filledInWithGeneratePath('board/:announcementId'),
  attendance: filledInWithGeneratePath('enrollments/:id/attendance'),
  reportCard: filledInWithGeneratePath('enrollments/:id/report-card'),
} as const;

export const ANNOUNCEMENT_ROUTES = {
  newAnnouncement: '/announcements/new',
} as const;

export const ANNOUNCEMENT_CHILD_ROUTES = {
  newAnnouncement: 'new',
} as const;
