/*
 * Minimal, composable scenarios. Every factory writes straight to the database, under the same
 * constraints the application obeys, and hands back what it created together with the ids.
 * Writing through INSERT instead of through the use case is deliberate: the test for `enroll`
 * must not depend on `enroll`.
 */

import type { EnrollmentStatus } from '../../src/academics';
import type { Role } from '../../src/identity';
import { generateCpf } from '../../src/shared/document';
import { testSql } from './database';

export type NetworkStatus = 'active' | 'suspended' | 'cancelled';
export type Shift = 'morning' | 'afternoon' | 'evening' | 'full_time';
export type TestRoleInSchool = { schoolId: string; role: Role };

/** The password of every test user. Ten characters: the minimum the domain accepts. */
export const DEFAULT_PASSWORD = 'teste-1234';
export const DEFAULT_YEAR = 2026;
const DOMAIN = 'escolaviva.test';
const SESSION_DURATION_HOURS = 12;
const HOUR_IN_MS = 3_600_000;
const newId = (): string => crypto.randomUUID();

/** Name, e-mail and slug run into a real unique index: a counter that never restarts settles it. */
let sequence = 0;
const nextNumber = (): number => (sequence += 1);

const toSnakeCase = (key: string): string => key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

/**
 * Writes the row and hands it back. The object keys become the columns — `networkId` is
 * `network_id` — so each factory describes what it created only once, instead of once in
 * camelCase and again in snake_case.
 */
async function insertRow<T extends object>(table: string, record: T): Promise<T> {
  const row = Object.fromEntries(Object.entries(record).map(([c, v]) => [toSnakeCase(c), v]));
  const sql = testSql();
  await sql`INSERT INTO ${sql(table)} ${sql(row)}`;
  return record;
}

/** Argon2id costs ~100 ms: without this memo a scenario would spend that four times over on the same password. */
const hashByPassword = new Map<string, Promise<string>>();

function hashPassword(password: string): Promise<string> {
  const known = hashByPassword.get(password);
  if (known !== undefined) return known;
  const hashing = Bun.password.hash(password);
  hashByPassword.set(password, hashing);
  return hashing;
}

export type TestNetwork = { id: string; name: string; slug: string; status: NetworkStatus };

export async function createNetwork(options: {
  name?: string | undefined; slug?: string | undefined; status?: NetworkStatus | undefined;
} = {}): Promise<TestNetwork> {
  const number = nextNumber();
  return await insertRow('network', {
    id: newId(), name: options.name ?? `Rede de Teste ${number}`,
    slug: options.slug ?? `rede-teste-${number}`, status: options.status ?? 'active',
  });
}

export type TestSchool = {
  id: string; networkId: string; name: string; inepCode: string | null; active: boolean;
};

export async function createSchool(options: {
  networkId: string; name?: string | undefined;
  inepCode?: string | null | undefined; active?: boolean | undefined;
}): Promise<TestSchool> {
  return await insertRow('school', {
    id: newId(), networkId: options.networkId, name: options.name ?? `Unidade de Teste ${nextNumber()}`,
    inepCode: options.inepCode ?? null, active: options.active ?? true,
  });
}

export type TestUser = {
  id: string; networkId: string; name: string; email: string;
  /** Every `app_user` row carries a CPF, always — never `null` here. */
  cpf: string;
  /** The contact column that used to live on the `guardian` table. */
  phone: string | null;
  /** The plaintext password, so the test can authenticate later on. */
  password: string;
  active: boolean; roles: TestRoleInSchool[];
};

export async function createUser(options: {
  networkId: string; name?: string | undefined; email?: string | undefined;
  cpf?: string | undefined; phone?: string | null | undefined; password?: string | undefined;
  active?: boolean | undefined;
  roles?: TestRoleInSchool[] | undefined;
}): Promise<TestUser> {
  const number = nextNumber();
  const user: TestUser = {
    id: newId(), networkId: options.networkId, name: options.name ?? `Pessoa de Teste ${number}`,
    email: options.email ?? `usuario${number}@${DOMAIN}`,
    cpf: options.cpf === undefined ? generateCpf(number) : options.cpf,
    phone: options.phone ?? null,
    password: options.password ?? DEFAULT_PASSWORD,
    active: options.active ?? true, roles: options.roles ?? [],
  };

  // `password` and `roles` are not columns of `app_user`: the first becomes a hash, the second becomes rows.
  const { password, roles, ...columns } = user;
  await insertRow('app_user', { ...columns, passwordHash: await hashPassword(password) });
  for (const { schoolId, role } of roles) {
    await insertRow('user_role', { networkId: user.networkId, userId: user.id, schoolId, role });
  }
  return user;
}

export type TestSession = {
  id: string; networkId: string; userId: string; expiresAt: Date; ip: string | null;
};

/** Pass an `expiresAt` in the past to build the expired session the purge has to find. */
export async function createSession(options: {
  networkId: string; userId: string; expiresAt?: Date | undefined; ip?: string | null | undefined;
}): Promise<TestSession> {
  return await insertRow('session', {
    id: newId(), networkId: options.networkId, userId: options.userId,
    expiresAt: options.expiresAt ?? new Date(Date.now() + SESSION_DURATION_HOURS * HOUR_IN_MS),
    ip: options.ip ?? null,
  });
}

export type TestAcademicYear = {
  id: string; networkId: string; year: number; startDate: string; endDate: string;
};

export async function createAcademicYear(options: {
  networkId: string; year?: number | undefined;
  startDate?: string | undefined; endDate?: string | undefined;
}): Promise<TestAcademicYear> {
  const year = options.year ?? DEFAULT_YEAR;
  return await insertRow('academic_year', {
    id: newId(), networkId: options.networkId, year,
    startDate: options.startDate ?? `${year}-02-01`, endDate: options.endDate ?? `${year}-12-15`,
  });
}

export type TestSubject = { id: string; networkId: string; name: string };

export async function createSubject(options: {
  networkId: string; name?: string | undefined;
}): Promise<TestSubject> {
  return await insertRow('subject', {
    id: newId(), networkId: options.networkId, name: options.name ?? `Disciplina ${nextNumber()}`,
  });
}

export type TestClassGroup = {
  id: string; networkId: string; schoolId: string; academicYearId: string;
  name: string; gradeLevel: string; shift: Shift;
};

export async function createClassGroup(options: {
  networkId: string; schoolId: string; academicYearId: string;
  name?: string | undefined; gradeLevel?: string | undefined; shift?: Shift | undefined;
}): Promise<TestClassGroup> {
  return await insertRow('class_group', {
    id: newId(), networkId: options.networkId, schoolId: options.schoolId,
    academicYearId: options.academicYearId, name: options.name ?? `Turma ${nextNumber()}`,
    gradeLevel: options.gradeLevel ?? '6º ano', shift: options.shift ?? 'morning',
  });
}

export type TestClassGroupSubject = {
  id: string; networkId: string; classGroupId: string; subjectId: string; teacherUserId: string;
};

export async function createClassGroupSubject(options: {
  networkId: string; classGroupId: string; subjectId: string; teacherUserId: string;
}): Promise<TestClassGroupSubject> {
  return await insertRow('class_group_subject', { id: newId(), ...options });
}

export type TestStudent = { id: string; networkId: string; name: string; birthDate: string };

export async function createStudent(options: {
  networkId: string; name?: string | undefined; birthDate?: string | undefined;
}): Promise<TestStudent> {
  return await insertRow('student', {
    id: newId(), networkId: options.networkId, name: options.name ?? `Aluno de Teste ${nextNumber()}`,
    birthDate: options.birthDate ?? '2014-05-10',
  });
}

/**
 * A guardian is an `app_user`. This factory is `createUser` with the guardian's naming
 * and, when a school is given, the role that lets them into the portal.
 */
export async function createGuardian(options: {
  networkId: string; schoolId?: string | undefined; name?: string | undefined;
  email?: string | undefined; cpf?: string | undefined; phone?: string | null | undefined;
  password?: string | undefined;
}): Promise<TestUser> {
  const number = nextNumber();
  const { schoolId, ...rest } = options;
  return await createUser({
    ...rest,
    name: options.name ?? `Responsável de Teste ${number}`,
    email: options.email ?? `responsavel${number}@${DOMAIN}`,
    ...(schoolId === undefined ? {} : { roles: [{ schoolId, role: 'guardian' as const }] }),
  });
}

export type TestGuardianLink = {
  networkId: string; studentId: string; userId: string; relationship: string;
  financiallyResponsible: boolean;
};

export async function linkStudentGuardian(options: {
  networkId: string; studentId: string; userId: string;
  relationship?: string | undefined; financiallyResponsible?: boolean | undefined;
}): Promise<TestGuardianLink> {
  return await insertRow('student_guardian', {
    networkId: options.networkId, studentId: options.studentId, userId: options.userId,
    relationship: options.relationship ?? 'mãe',
    financiallyResponsible: options.financiallyResponsible ?? true,
  });
}

export type TestEnrollment = {
  id: string; networkId: string; studentId: string; classGroupId: string; academicYearId: string;
  enrollmentDate: string; status: EnrollmentStatus;
};

export async function createEnrollment(options: {
  networkId: string; studentId: string; classGroupId: string; academicYearId: string;
  enrollmentDate?: string | undefined; status?: EnrollmentStatus | undefined;
}): Promise<TestEnrollment> {
  return await insertRow('enrollment', {
    id: newId(), networkId: options.networkId, studentId: options.studentId,
    classGroupId: options.classGroupId, academicYearId: options.academicYearId,
    enrollmentDate: options.enrollmentDate ?? `${DEFAULT_YEAR}-02-05`,
    status: options.status ?? 'active',
  });
}

export type TestGrade = {
  id: string; networkId: string; enrollmentId: string; classGroupSubjectId: string;
  term: number; value: number; postedBy: string;
};

export async function createGrade(options: {
  networkId: string; enrollmentId: string; classGroupSubjectId: string; postedBy: string;
  term?: number | undefined; value?: number | undefined;
}): Promise<TestGrade> {
  return await insertRow('grade', {
    id: newId(), networkId: options.networkId, enrollmentId: options.enrollmentId,
    classGroupSubjectId: options.classGroupSubjectId, term: options.term ?? 1,
    value: options.value ?? 8, postedBy: options.postedBy,
  });
}

export type TestAttendance = {
  id: string; networkId: string; enrollmentId: string; attendanceDate: string;
  present: boolean; excuse: string | null;
};

export async function createAttendance(options: {
  networkId: string; enrollmentId: string; attendanceDate?: string | undefined;
  present?: boolean | undefined; excuse?: string | null | undefined;
}): Promise<TestAttendance> {
  return await insertRow('attendance', {
    id: newId(), networkId: options.networkId, enrollmentId: options.enrollmentId,
    attendanceDate: options.attendanceDate ?? `${DEFAULT_YEAR}-03-02`, present: options.present ?? true,
    excuse: options.excuse ?? null,
  });
}

export type TestRecipient = { userId: string; readAt: Date | null };

export type TestAnnouncement = {
  id: string; networkId: string; schoolId: string; title: string; body: string;
  authorUserId: string; publishedAt: Date | null; recipients: TestRecipient[];
};

export async function createAnnouncement(options: {
  networkId: string; schoolId: string; authorUserId: string;
  title?: string | undefined; body?: string | undefined;
  /** `null` builds the announcement that has not been published yet and shows up on no board. */
  publishedAt?: Date | null | undefined;
  recipients?: { userId: string; readAt?: Date | null | undefined }[] | undefined;
}): Promise<TestAnnouncement> {
  const announcement: TestAnnouncement = {
    id: newId(), networkId: options.networkId, schoolId: options.schoolId,
    title: options.title ?? `Comunicado de Teste ${nextNumber()}`,
    body: options.body ?? 'Corpo do comunicado de teste.',
    authorUserId: options.authorUserId,
    publishedAt: options.publishedAt === undefined ? new Date() : options.publishedAt,
    recipients: (options.recipients ?? []).map((d) => ({ ...d, readAt: d.readAt ?? null })),
  };

  const { recipients, ...columns } = announcement;
  await insertRow('announcement', columns);
  for (const { userId, readAt } of recipients) {
    await insertRow('announcement_recipient', {
      networkId: announcement.networkId, announcementId: announcement.id, userId, readAt,
    });
  }
  return announcement;
}

/**
 * The ready-made network most tests use: two schools, one academic year, two class groups in the
 * first school, three subjects allocated to the first class group under the same teacher, five
 * students enrolled with one guardian each, and one user per role. The second class group is born
 * empty on purpose: it is the destination of the transfer.
 */
export type Scenario = {
  network: TestNetwork;
  schools: [TestSchool, TestSchool];
  academicYear: TestAcademicYear;
  classGroups: [TestClassGroup, TestClassGroup];
  subjects: [TestSubject, TestSubject, TestSubject];
  classGroupSubjects: [TestClassGroupSubject, TestClassGroupSubject, TestClassGroupSubject];
  students: [TestStudent, TestStudent, TestStudent, TestStudent, TestStudent];
  guardians: [TestUser, TestUser, TestUser, TestUser, TestUser];
  enrollments: [TestEnrollment, TestEnrollment, TestEnrollment, TestEnrollment, TestEnrollment];
  admin: TestUser; registrar: TestUser; teacher: TestUser;
  /** The portal user **is** the guardian. The same object as `guardians[0]`. */
  guardian: TestUser;
  password: string;
};

async function enrollOneStudent(base: {
  networkId: string; schoolId: string; classGroupId: string; academicYearId: string;
  year: number; password: string;
}): Promise<{ student: TestStudent; guardian: TestUser; enrollment: TestEnrollment }> {
  const student = await createStudent({ networkId: base.networkId });
  const guardian = await createGuardian({
    networkId: base.networkId, schoolId: base.schoolId, password: base.password,
  });
  await linkStudentGuardian({
    networkId: base.networkId, studentId: student.id, userId: guardian.id,
  });
  const enrollment = await createEnrollment({
    networkId: base.networkId, studentId: student.id, classGroupId: base.classGroupId,
    academicYearId: base.academicYearId, enrollmentDate: `${base.year}-02-05`,
  });
  return { student, guardian, enrollment };
}

export async function fullScenario(options: {
  name?: string | undefined; slug?: string | undefined;
  year?: number | undefined; password?: string | undefined;
} = {}): Promise<Scenario> {
  const password = options.password ?? DEFAULT_PASSWORD;
  const network = await createNetwork({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.slug === undefined ? {} : { slug: options.slug }),
  });
  const networkId = network.id;

  const [schoolA, schoolB] = await Promise.all([
    createSchool({ networkId, name: `Escola Central ${nextNumber()}` }),
    createSchool({ networkId, name: `Escola Bairro ${nextNumber()}` }),
  ]);
  const academicYear = await createAcademicYear({ networkId, year: options.year ?? DEFAULT_YEAR });

  const admin = await createUser({
    networkId, password,
    roles: [
      { schoolId: schoolA.id, role: 'network_admin' }, { schoolId: schoolB.id, role: 'network_admin' },
    ],
  });
  const [registrar, teacher] = await Promise.all([
    createUser({ networkId, password, roles: [{ schoolId: schoolA.id, role: 'registrar' }] }),
    createUser({ networkId, password, roles: [{ schoolId: schoolA.id, role: 'teacher' }] }),
  ]);

  const [classGroupA, classGroupB] = await Promise.all([
    createClassGroup({ networkId, schoolId: schoolA.id, academicYearId: academicYear.id, gradeLevel: '6º ano' }),
    createClassGroup({ networkId, schoolId: schoolA.id, academicYearId: academicYear.id, gradeLevel: '7º ano' }),
  ]);
  const [portuguese, math, history] = await Promise.all([
    createSubject({ networkId, name: `Português ${nextNumber()}` }),
    createSubject({ networkId, name: `Matemática ${nextNumber()}` }),
    createSubject({ networkId, name: `História ${nextNumber()}` }),
  ]);
  const assign = (subjectId: string): Promise<TestClassGroupSubject> =>
    createClassGroupSubject({ networkId, classGroupId: classGroupA.id, subjectId, teacherUserId: teacher.id });
  const [assignmentA, assignmentB, assignmentC] = await Promise.all([
    assign(portuguese.id), assign(math.id), assign(history.id),
  ]);

  const base = {
    networkId, schoolId: schoolA.id, classGroupId: classGroupA.id,
    academicYearId: academicYear.id, year: academicYear.year, password,
  };
  const [one, two, three, four, five] = await Promise.all([
    enrollOneStudent(base), enrollOneStudent(base), enrollOneStudent(base),
    enrollOneStudent(base), enrollOneStudent(base),
  ]);

  return {
    network, academicYear, schools: [schoolA, schoolB], classGroups: [classGroupA, classGroupB],
    subjects: [portuguese, math, history],
    classGroupSubjects: [assignmentA, assignmentB, assignmentC],
    students: [one.student, two.student, three.student, four.student, five.student],
    guardians: [
      one.guardian, two.guardian, three.guardian, four.guardian, five.guardian,
    ],
    enrollments: [one.enrollment, two.enrollment, three.enrollment, four.enrollment, five.enrollment],
    admin, registrar, teacher, guardian: one.guardian, password,
  };
}

/** Two complete, independent networks: the scenario behind the tenant isolation test. */
export async function twoNetworks(): Promise<{ a: Scenario; b: Scenario }> {
  const [a, b] = await Promise.all([fullScenario(), fullScenario()]);
  return { a, b };
}
