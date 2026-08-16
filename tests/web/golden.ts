/*
 * The refactor's safety net: the HTML of every screen the system renders today, frozen to file.
 *
 * A pure refactor promises that nothing changes for whoever uses the system. Unit tests do not
 * hold that promise to account — they look at one piece at a time, and what breaks in a route
 * reorganization is precisely the seam: an `href` that now points somewhere else, a label that
 * fell out of the layout, a `redirect` that changed destination. The golden compares the whole
 * document, byte for byte, against what the system used to answer.
 *
 * Three decisions govern this file:
 *
 * 1. ONE scenario, built by hand and named. The factories number their names with a per-process
 *    counter (`Aluno de Teste 47`), and that number depends on how many tests ran before — which
 *    would make the golden pass on its own and fail inside the full suite. Here every name,
 *    e-mail, CPF and date is written out, and the scenario is the same under any execution order.
 *
 * 2. Normalization by dictionary, not by broom. The scenario's identifiers become NAMED markers —
 *    `{{student01}}`, `{{classGroup1}}` — so swapping one student's `href` for another's is still a
 *    visible difference. Only what cannot be predicted (the idempotency key, the CSS hash, the
 *    database timestamp) becomes an anonymous marker.
 *
 * 3. The frozen document includes response status and headers. Half of the entry routes have no
 *    body: `/` and `/dashboard` are redirects, and their destination is exactly what a route
 *    refactor can change without any HTML moving.
 */

import { join } from 'node:path';
import { app } from '../../src/web/app';
import { generateCpf } from '../../src/shared/document';
import { testSql } from '../support/database';
import {
  DEFAULT_PASSWORD,
  createStudent,
  createAcademicYear,
  createAnnouncement,
  createSubject,
  createAttendance,
  createEnrollment,
  createGrade,
  createNetwork,
  createGuardian,
  createClassGroup,
  createClassGroupSubject,
  createSchool,
  createUser,
  linkStudentGuardian,
  type TestStudent,
  type TestEnrollment,
  type TestUser,
} from '../support/factories';
import { signIn } from './support';

export const GOLDEN_DIR = join(import.meta.dir, 'golden');

/**
 * The roles that open the screens. `anonymous` is the absence of a session, and it is a screen too;
 * `noRole` is the account that exists and has not been tied to any school yet, which is the only
 * door to the "Conta sem papel atribuído" screen of `/dashboard`.
 */
export type GoldenRole =
  | 'anonymous'
  | 'noRole'
  | 'admin'
  | 'registrar'
  | 'teacher'
  | 'guardian';

export type GoldenScreen = {
  /** The file name under `tests/web/golden/`, without extension. */
  readonly name: string;
  readonly role: GoldenRole;
  readonly path: string;
};

/*
 * A header the correlation middleware accepts (I16): pinning it here makes the error page
 * deterministic without normalization having to erase the occurrence code — if that code
 * disappears from the screen, the golden says so.
 */
const CORRELATION = 'golden-fixed-correlation';

/** An identifier that honours the format and exists in no table: the door to the 404. */
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000000';

const CURRENT_YEAR = 2026;
const PREVIOUS_YEAR = 2025;
const STUDENT_COUNT = 12;
const ROLL_CALL_DAY_COUNT = 12;
const CLOSED_TERM = 1;

const twoDigits = (value: number): string => String(value).padStart(2, '0');

/* --- Scenario --------------------------------------------------------------- */

export type GoldenScenario = {
  readonly cookies: Readonly<Record<GoldenRole, string>>;
  readonly markers: ReadonlyMap<string, string>;
  readonly ids: {
    readonly schoolA: string;
    readonly schoolB: string;
    readonly currentYear: string;
    readonly classGroup1: string;
    readonly classGroup2: string;
    readonly assignment1: string;
    readonly student1: string;
    readonly enrollment1: string;
    readonly announcement1: string;
    readonly nonexistent: string;
  };
};

/**
 * Builds the golden's entire network. Everything is written by hand on purpose: ten lines per
 * table cost less than finding out, six months later, that the golden only passes when it runs
 * alone.
 *
 * The size is not arbitrary — twelve students, twelve guardians and twelve roll-call days are two
 * more than a page holds (ten), and that is what makes the pagination bar appear on three
 * different screens. A pagination bar builds its `href` from the request path, and the path is
 * exactly what a route refactor moves.
 */
export async function buildGoldenScenario(): Promise<GoldenScenario> {
  const network = await createNetwork({ name: 'Rede Modelo do Litoral', slug: 'rede-golden' });
  const networkId = network.id;

  const schoolA = await createSchool({ networkId, name: 'Escola Central', inepCode: '32001234' });
  const schoolB = await createSchool({ networkId, name: 'Escola do Bairro', inepCode: '32005678' });

  const currentYear = await createAcademicYear({ networkId, year: CURRENT_YEAR });
  const previousYear = await createAcademicYear({ networkId, year: PREVIOUS_YEAR });

  const admin = await createUser({
    networkId,
    name: 'Alice Diretora',
    email: 'alice@golden.test',
    cpf: generateCpf(9_100_001),
    password: DEFAULT_PASSWORD,
    roles: [
      { schoolId: schoolA.id, role: 'network_admin' },
      { schoolId: schoolB.id, role: 'network_admin' },
    ],
  });
  const registrar = await createUser({
    networkId,
    name: 'Bruno Secretário',
    email: 'bruno@golden.test',
    cpf: generateCpf(9_100_002),
    password: DEFAULT_PASSWORD,
    roles: [{ schoolId: schoolA.id, role: 'registrar' }],
  });
  const teacher = await createUser({
    networkId,
    name: 'Carla Professora',
    email: 'carla@golden.test',
    cpf: generateCpf(9_100_003),
    password: DEFAULT_PASSWORD,
    roles: [{ schoolId: schoolA.id, role: 'teacher' }],
  });

  const classGroup1 = await createClassGroup({
    networkId, schoolId: schoolA.id, academicYearId: currentYear.id,
    name: '6A', gradeLevel: '6º ano', shift: 'morning',
  });
  const classGroup2 = await createClassGroup({
    networkId, schoolId: schoolA.id, academicYearId: currentYear.id,
    name: '7B', gradeLevel: '7º ano', shift: 'afternoon',
  });

  const portuguese = await createSubject({ networkId, name: 'Língua Portuguesa' });
  const math = await createSubject({ networkId, name: 'Matemática' });
  const history = await createSubject({ networkId, name: 'História' });

  const assign = (subjectId: string): Promise<{ id: string }> =>
    createClassGroupSubject({
      networkId, classGroupId: classGroup1.id, subjectId, teacherUserId: teacher.id,
    });
  const assignment1 = await assign(portuguese.id);
  const assignment2 = await assign(math.id);
  const assignment3 = await assign(history.id);

  const students: TestStudent[] = [];
  const guardians: TestUser[] = [];
  const enrollments: TestEnrollment[] = [];
  for (let number = 1; number <= STUDENT_COUNT; number += 1) {
    const label = twoDigits(number);
    const student = await createStudent({
      networkId, name: `Aluno ${label} da Silva`, birthDate: `2014-${label}-08`,
    });
    const guardian = await createGuardian({
      networkId,
      schoolId: schoolA.id,
      name: `Responsável ${label} da Silva`,
      email: `responsavel${label}@golden.test`,
      cpf: generateCpf(9_200_000 + number),
      phone: `2799000${label}${label}`,
      password: DEFAULT_PASSWORD,
    });
    await linkStudentGuardian({
      networkId, studentId: student.id, userId: guardian.id,
      relationship: number % 2 === 0 ? 'pai' : 'mãe', financiallyResponsible: number === 1,
    });
    const enrollment = await createEnrollment({
      networkId, studentId: student.id, classGroupId: classGroup1.id,
      academicYearId: currentYear.id, enrollmentDate: `${CURRENT_YEAR}-02-05`,
    });
    students.push(student);
    guardians.push(guardian);
    enrollments.push(enrollment);
  }

  // An account created and not yet assigned: `/dashboard` has nowhere to send it, and says so on screen.
  const roleless = await createUser({
    networkId,
    name: 'Eva Recém-Convidada',
    email: 'eva@golden.test',
    cpf: generateCpf(9_100_005),
    password: DEFAULT_PASSWORD,
    roles: [],
  });

  // ADR 0006: the portal user IS the guardian — there is no second record to tie it to.
  const guardian = guardians[0];
  if (guardian === undefined) throw new Error('the golden scenario needs at least one guardian');

  // Grades for two terms for the first student (the report card needs a full row) and for the
  // first term for the first four (the grades screen needs both a filled and an empty column).
  const assignments = [assignment1, assignment2, assignment3];
  const GRADE_VALUES = [8.5, 7, 9.5];
  for (let index = 0; index < assignments.length; index += 1) {
    for (const term of [1, 2]) {
      await createGrade({
        networkId,
        enrollmentId: enrollments[0]?.id ?? '',
        classGroupSubjectId: assignments[index]?.id ?? '',
        postedBy: teacher.id,
        term,
        value: (GRADE_VALUES[index] ?? 0) - (term === 1 ? 0 : 1),
      });
    }
  }
  for (let index = 1; index < 4; index += 1) {
    await createGrade({
      networkId,
      enrollmentId: enrollments[index]?.id ?? '',
      classGroupSubjectId: assignment1.id,
      postedBy: teacher.id,
      term: 1,
      value: 6 + index,
    });
  }

  for (let day = 1; day <= ROLL_CALL_DAY_COUNT; day += 1) {
    const present = day % 5 !== 0;
    await createAttendance({
      networkId,
      enrollmentId: enrollments[0]?.id ?? '',
      attendanceDate: `${CURRENT_YEAR}-03-${twoDigits(day)}`,
      present,
      excuse: present ? null : 'Consulta médica com atestado.',
    });
  }

  /*
   * Noon UTC on purpose: `formatDateTime` prints the local time, and a midnight stamp would shift
   * day depending on the time zone of whoever runs the suite. The time itself is normalized; the
   * day is not.
   */
  const announcement1 = await createAnnouncement({
    networkId, schoolId: schoolA.id, authorUserId: admin.id,
    title: 'Reunião de pais e mestres',
    body: 'A reunião do primeiro bimestre acontece no dia 20, às 19h, no auditório da unidade.',
    publishedAt: new Date('2026-03-10T12:00:00.000Z'),
    recipients: [
      { userId: guardians[0]?.id ?? '', readAt: new Date('2026-03-11T12:00:00.000Z') },
      { userId: guardians[1]?.id ?? '' },
      { userId: guardians[2]?.id ?? '' },
    ],
  });
  const announcement2 = await createAnnouncement({
    networkId, schoolId: schoolA.id, authorUserId: registrar.id,
    title: 'Feira de ciências',
    body: 'A feira de ciências ocupa o pátio na primeira semana de maio.',
    publishedAt: new Date('2026-04-05T12:00:00.000Z'),
    recipients: [
      { userId: guardians[0]?.id ?? '' },
      { userId: guardians[1]?.id ?? '', readAt: new Date('2026-04-06T12:00:00.000Z') },
    ],
  });
  const announcement3 = await createAnnouncement({
    networkId, schoolId: schoolB.id, authorUserId: admin.id,
    title: 'Rascunho ainda não publicado',
    body: 'Este comunicado não foi publicado e não aparece em mural nenhum.',
    publishedAt: null,
    recipients: [],
  });

  // The class group's first term closed: the state the closing screen and the report card show.
  const sql = testSql();
  await sql`
    INSERT INTO term_closing (id, network_id, class_group_id, term, closed_at, closed_by)
    VALUES (${crypto.randomUUID()}, ${networkId}, ${classGroup1.id}, ${CLOSED_TERM},
            ${new Date('2026-04-20T12:00:00.000Z')}, ${teacher.id})
  `;

  const signInWithCpf = (cpf: string): Promise<string> =>
    signIn({ networkSlug: network.slug, cpf, password: DEFAULT_PASSWORD });

  const cookies: Record<GoldenRole, string> = {
    anonymous: '',
    noRole: await signInWithCpf(roleless.cpf),
    admin: await signInWithCpf(admin.cpf),
    registrar: await signInWithCpf(registrar.cpf),
    teacher: await signInWithCpf(teacher.cpf),
    guardian: await signInWithCpf(guardian.cpf),
  };

  const markers = new Map<string, string>([
    [network.id, '{{network}}'],
    [schoolA.id, '{{schoolA}}'],
    [schoolB.id, '{{schoolB}}'],
    [currentYear.id, '{{currentYear}}'],
    [previousYear.id, '{{previousYear}}'],
    [admin.id, '{{adminUser}}'],
    [registrar.id, '{{registrarUser}}'],
    [teacher.id, '{{teacherUser}}'],
    [roleless.id, '{{rolelessUser}}'],
    [classGroup1.id, '{{classGroup1}}'],
    [classGroup2.id, '{{classGroup2}}'],
    [portuguese.id, '{{subjectPortuguese}}'],
    [math.id, '{{subjectMath}}'],
    [history.id, '{{subjectHistory}}'],
    [assignment1.id, '{{assignment1}}'],
    [assignment2.id, '{{assignment2}}'],
    [assignment3.id, '{{assignment3}}'],
    [announcement1.id, '{{announcement1}}'],
    [announcement2.id, '{{announcement2}}'],
    [announcement3.id, '{{announcement3}}'],
    [NONEXISTENT_ID, '{{nonexistentId}}'],
  ]);
  for (let index = 0; index < STUDENT_COUNT; index += 1) {
    const label = twoDigits(index + 1);
    markers.set(students[index]?.id ?? '', `{{student${label}}}`);
    markers.set(guardians[index]?.id ?? '', `{{guardian${label}}}`);
    markers.set(enrollments[index]?.id ?? '', `{{enrollment${label}}}`);
  }

  return {
    cookies,
    markers,
    ids: {
      schoolA: schoolA.id,
      schoolB: schoolB.id,
      currentYear: currentYear.id,
      classGroup1: classGroup1.id,
      classGroup2: classGroup2.id,
      assignment1: assignment1.id,
      student1: students[0]?.id ?? '',
      enrollment1: enrollments[0]?.id ?? '',
      announcement1: announcement1.id,
      nonexistent: NONEXISTENT_ID,
    },
  };
}

/* --- The screens ------------------------------------------------------------ */

/**
 * Every GET route registered in `src/web/app.ts`, `src/web/health.ts` and `src/web/routes/*.ts`,
 * plus the state variations that are different screens behind the same path: the list with and
 * without a search, the form with and without a school chosen, the page with and without a success
 * notice, the second page of a paginated table, and the 404 for someone asking after another
 * school's record.
 */
export function systemScreens(ids: GoldenScenario['ids']): readonly GoldenScreen[] {
  const signOutMessage = encodeURIComponent('Sessão encerrada.');

  return [
    /* No session ----------------------------------------------------------- */
    { name: 'anonymous-root', role: 'anonymous', path: '/' },
    { name: 'anonymous-login', role: 'anonymous', path: '/login' },
    { name: 'anonymous-login-after-sign-out', role: 'anonymous', path: `/login?ok=${signOutMessage}` },
    { name: 'anonymous-dashboard', role: 'anonymous', path: '/dashboard' },
    { name: 'anonymous-registrar', role: 'anonymous', path: '/registrar' },
    { name: 'anonymous-route-not-found', role: 'anonymous', path: '/nao-existe' },
    { name: 'anonymous-public-file-not-found', role: 'anonymous', path: '/public/nao-existe.css' },
    { name: 'anonymous-public-name-refused', role: 'anonymous', path: '/public/..%2Fsegredo' },

    /* Account with no role assigned ---------------------------------------- */
    { name: 'no-role-dashboard', role: 'noRole', path: '/dashboard' },
    { name: 'no-role-root', role: 'noRole', path: '/' },

    /* Health --------------------------------------------------------------- */
    { name: 'health-check', role: 'anonymous', path: '/health' },
    { name: 'health-live', role: 'anonymous', path: '/health/live' },

    /* Network administration ----------------------------------------------- */
    { name: 'admin-root', role: 'admin', path: '/' },
    { name: 'admin-dashboard', role: 'admin', path: '/dashboard' },
    { name: 'admin-login-with-session', role: 'admin', path: '/login' },
    { name: 'admin-network-dashboard', role: 'admin', path: '/network' },
    { name: 'admin-network-schools', role: 'admin', path: '/network/schools' },
    { name: 'admin-network-schools-created', role: 'admin', path: '/network/schools?ok=school-created' },
    { name: 'admin-network-school-new', role: 'admin', path: '/network/schools/new' },
    { name: 'admin-network-users', role: 'admin', path: '/network/users' },
    { name: 'admin-network-users-invited', role: 'admin', path: '/network/users?ok=user-invited' },
    { name: 'admin-network-user-new', role: 'admin', path: '/network/users/new' },
    { name: 'admin-network-academic-years', role: 'admin', path: '/network/academic-years' },
    { name: 'admin-network-academic-years-defined', role: 'admin', path: '/network/academic-years?ok=year-defined' },
    { name: 'admin-network-year-new', role: 'admin', path: '/network/academic-years/new' },
    { name: 'admin-announcements', role: 'admin', path: '/announcements' },
    { name: 'admin-announcements-school', role: 'admin', path: `/announcements?schoolId=${ids.schoolA}` },
    { name: 'admin-announcement-new', role: 'admin', path: '/announcements/new' },
    { name: 'admin-announcement-new-school', role: 'admin', path: `/announcements/new?schoolId=${ids.schoolA}` },
    { name: 'admin-account-password', role: 'admin', path: '/account/password' },
    { name: 'admin-account-password-changed', role: 'admin', path: '/account/password?ok=password-changed' },
    { name: 'admin-teacher-forbidden', role: 'admin', path: '/teacher' },

    /* Registrar ------------------------------------------------------------- */
    { name: 'registrar-dashboard-redirected', role: 'registrar', path: '/dashboard' },
    { name: 'registrar-dashboard', role: 'registrar', path: '/registrar' },
    { name: 'registrar-students-no-search', role: 'registrar', path: '/registrar/students' },
    { name: 'registrar-students-search', role: 'registrar', path: '/registrar/students?q=Silva' },
    { name: 'registrar-students-search-page-2', role: 'registrar', path: '/registrar/students?q=Silva&p=2' },
    { name: 'registrar-student-new', role: 'registrar', path: '/registrar/students/new' },
    { name: 'registrar-student-record', role: 'registrar', path: `/registrar/students/${ids.student1}` },
    { name: 'registrar-student-not-found', role: 'registrar', path: `/registrar/students/${ids.nonexistent}` },
    { name: 'registrar-student-guardian-new', role: 'registrar', path: `/registrar/students/${ids.student1}/guardians/new` },
    { name: 'registrar-student-enroll', role: 'registrar', path: `/registrar/students/${ids.student1}/enroll` },
    { name: 'registrar-enrollment-transfer', role: 'registrar', path: `/registrar/enrollments/${ids.enrollment1}/transfer` },
    { name: 'registrar-guardians', role: 'registrar', path: '/registrar/guardians' },
    { name: 'registrar-guardians-page-2', role: 'registrar', path: '/registrar/guardians?p=2' },
    { name: 'registrar-guardian-new', role: 'registrar', path: '/registrar/guardians/new' },
    { name: 'registrar-class-groups', role: 'registrar', path: '/registrar/class-groups' },
    { name: 'registrar-class-groups-filtered', role: 'registrar', path: `/registrar/class-groups?school=${ids.schoolA}&year=${ids.currentYear}` },
    { name: 'registrar-class-group-new', role: 'registrar', path: '/registrar/class-groups/new' },
    { name: 'registrar-class-group-record', role: 'registrar', path: `/registrar/class-groups/${ids.classGroup1}` },
    { name: 'registrar-class-group-record-page-2', role: 'registrar', path: `/registrar/class-groups/${ids.classGroup1}?pEnrollments=2` },
    { name: 'registrar-class-group-subject-new', role: 'registrar', path: `/registrar/class-groups/${ids.classGroup1}/subjects/new` },
    { name: 'registrar-subjects', role: 'registrar', path: '/registrar/subjects' },
    { name: 'registrar-subject-new', role: 'registrar', path: '/registrar/subjects/new' },
    { name: 'registrar-announcements', role: 'registrar', path: '/announcements' },
    { name: 'registrar-announcement-new', role: 'registrar', path: '/announcements/new' },
    { name: 'registrar-route-not-found', role: 'registrar', path: '/nao-existe' },

    /* Teacher --------------------------------------------------------------- */
    { name: 'teacher-dashboard-redirected', role: 'teacher', path: '/dashboard' },
    { name: 'teacher-dashboard', role: 'teacher', path: '/teacher' },
    { name: 'teacher-grades', role: 'teacher', path: `/teacher/subjects/${ids.assignment1}/grades` },
    { name: 'teacher-grades-term-2', role: 'teacher', path: `/teacher/subjects/${ids.assignment1}/grades?term=2` },
    { name: 'teacher-roll-call-fixed-date', role: 'teacher', path: `/teacher/class-groups/${ids.classGroup1}/roll-call?date=${CURRENT_YEAR}-03-05` },
    { name: 'teacher-roll-call-today', role: 'teacher', path: `/teacher/class-groups/${ids.classGroup1}/roll-call` },
    { name: 'teacher-closing', role: 'teacher', path: `/teacher/class-groups/${ids.classGroup1}/closing` },
    { name: 'teacher-foreign-class-group', role: 'teacher', path: `/teacher/class-groups/${ids.classGroup2}/closing` },
    { name: 'teacher-account-password', role: 'teacher', path: '/account/password' },

    /* Guardian -------------------------------------------------------------- */
    { name: 'guardian-dashboard-redirected', role: 'guardian', path: '/dashboard' },
    { name: 'guardian-dashboard', role: 'guardian', path: '/guardian' },
    { name: 'guardian-report-card', role: 'guardian', path: `/guardian/enrollments/${ids.enrollment1}/report-card` },
    { name: 'guardian-attendance', role: 'guardian', path: `/guardian/enrollments/${ids.enrollment1}/attendance` },
    { name: 'guardian-attendance-page-2', role: 'guardian', path: `/guardian/enrollments/${ids.enrollment1}/attendance?p=2` },
    { name: 'guardian-board', role: 'guardian', path: '/guardian/board' },
    { name: 'guardian-announcement', role: 'guardian', path: `/guardian/board/${ids.announcement1}` },
    { name: 'guardian-foreign-announcement', role: 'guardian', path: `/guardian/board/${ids.nonexistent}` },
    { name: 'guardian-account-password', role: 'guardian', path: '/account/password' },
  ];
}

/* --- Normalization ---------------------------------------------------------- */

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
/**
 * The idempotency key (`KEY_FIELD`, in `shared/constants.ts`) is a fresh UUID on every render: the
 * 57 fixtures that carry the hidden field would diverge on every run if it were not normalized.
 */
const IDEMPOTENCY_KEY_ATTR = /(name="_key" value=")[^"]*(")/g;
/**
 * The published CSS name (I10) and the raw name `asset()` returns when `bun run build:assets` has
 * not run yet collapse into the same marker. They are the same line of the screen; freezing the
 * hash would make 71 files change on every stylesheet tweak, and a fresh clone, with no manifest,
 * would fail a refactor that never touched any CSS.
 */
const VERSIONED_ASSET = /\/public\/app\.(?:[0-9a-f]{6,}\.)?css/g;
/** `Tue Mar 10 2026 09:00:00 GMT-0300 (Brasilia Standard Time)` — the `toString` of a `Date`. */
const JAVASCRIPT_DATE =
  /[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}(?: \([^)]*\))?/g;
const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const TIME_OF_DAY = /\b\d{2}:\d{2}\b/g;

/** Two days either way cover the local time zone, the UTC day, and midnight turning over mid-suite. */
const DAY_WINDOW = 2;
const MS_PER_DAY = 86_400_000;

/**
 * The days that depend on when the suite runs: the registrar's `today()` (UTC day), the teacher's
 * `today()` (local day), and the previous and next day on the roll-call screen. All become the
 * same marker — the distinction between them stays frozen in `professor-chamada-data-fixa`, which
 * passes the date in the query and therefore depends on no clock.
 */
function currentDays(): string[] {
  const now = Date.now();
  const days = new Set<string>();
  for (let step = -DAY_WINDOW; step <= DAY_WINDOW; step += 1) {
    const date = new Date(now + step * MS_PER_DAY);
    days.add(`${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`);
    days.add(date.toISOString().slice(0, 10));
  }
  return [...days];
}

const inBrazilianFormat = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
};

/**
 * Swaps what cannot be predicted for stable markers, and nothing beyond that.
 *
 * Order matters: whole timestamps go before loose dates, otherwise the `2026-08-14` inside
 * `2026-08-14T12:00:00Z` would be swapped first and the rest of the stamp would be left orphaned.
 * The known identifiers go before the UUID sweeper, otherwise all of them would turn into
 * `{{uuid}}` and the golden would stop telling one student's `href` from another's.
 */
export function normalize(text: string, markers: ReadonlyMap<string, string>): string {
  let output = text;

  output = output.replace(IDEMPOTENCY_KEY_ATTR, '$1{{key}}$2');
  output = output.replace(VERSIONED_ASSET, '/public/app.{{cssHash}}.css');
  output = output.replaceAll(CORRELATION, '{{correlation}}');

  for (const [raw, marker] of markers) {
    if (raw !== '') output = output.replaceAll(raw, marker);
  }

  output = output.replace(JAVASCRIPT_DATE, '{{timestamp}}');
  output = output.replace(ISO_TIMESTAMP, '{{timestamp}}');

  for (const day of currentDays()) {
    output = output.replaceAll(day, '{{currentDay}}');
    output = output.replaceAll(inBrazilianFormat(day), '{{currentDay}}');
  }

  output = output.replace(TIME_OF_DAY, '{{time}}');
  output = output.replace(UUID, '{{uuid}}');

  return output;
}

/* --- Capture ---------------------------------------------------------------- */

/** What goes into the golden file besides the body: what a route refactor can change on its own. */
const FROZEN_HEADERS = ['Location', 'Content-Type', 'Cache-Control', 'Vary'] as const;

const SEPARATOR = '-'.repeat(78);

export async function capture(screen: GoldenScreen, scenario: GoldenScenario): Promise<string> {
  const cookie = scenario.cookies[screen.role];
  const headers: Record<string, string> = { 'X-Correlation-Id': CORRELATION };
  if (cookie !== '') headers['Cookie'] = cookie;

  const response = await app.request(screen.path, { headers });
  const body = await response.text();

  const rows = [`GET ${screen.path}`, `role: ${screen.role}`, `status: ${response.status}`];
  for (const name of FROZEN_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) rows.push(`${name}: ${value}`);
  }
  rows.push(SEPARATOR, body);

  return normalize(rows.join('\n'), scenario.markers);
}

export const goldenPath = (name: string): string => join(GOLDEN_DIR, `${name}.txt`);
