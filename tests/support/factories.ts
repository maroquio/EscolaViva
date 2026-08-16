/*
 * Cenários mínimos e componíveis. Cada fábrica escreve direto no banco, respeitando as mesmas
 * constraints da aplicação, e devolve o que criou com os ids. Escrever pelo INSERT em vez de pelo
 * caso de uso é deliberado: o teste de `matricular` não pode depender de `matricular`.
 */

import type { EnrollmentStatus } from '../../src/academics';
import type { Role } from '../../src/identity';
import { generateCpf } from '../../src/shared/document';
import { testSql } from './database';

export type NetworkStatus = 'active' | 'suspended' | 'cancelled';
export type Shift = 'morning' | 'afternoon' | 'evening' | 'full_time';
export type TestRoleInSchool = { schoolId: string; role: Role };

/** A senha de todo usuário de teste. Dez caracteres: é o mínimo que o domínio aceita. */
export const DEFAULT_PASSWORD = 'teste-1234';
export const DEFAULT_YEAR = 2026;
const DOMAIN = 'escolaviva.test';
const SESSION_DURATION_HOURS = 12;
const HOUR_IN_MS = 3_600_000;
const newId = (): string => crypto.randomUUID();

/** Nome, e-mail e slug esbarram em índice único real: um contador que nunca reinicia resolve. */
let sequence = 0;
const nextNumber = (): number => (sequence += 1);

const toSnakeCase = (key: string): string => key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

/**
 * Grava o registro e o devolve. As chaves do objeto viram as colunas — `networkId` é
 * `network_id` —, então cada fábrica descreve o que criou uma vez só, e não em camelCase e em
 * snake_case.
 */
async function insertRow<T extends object>(table: string, record: T): Promise<T> {
  const row = Object.fromEntries(Object.entries(record).map(([c, v]) => [toSnakeCase(c), v]));
  const sql = testSql();
  await sql`INSERT INTO ${sql(table)} ${sql(row)}`;
  return record;
}

/** Argon2id custa ~100 ms: sem esta memória um cenário gastaria isso quatro vezes pela mesma senha. */
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
  /** Migração 0008 (ADR 0004): toda linha de `app_user` tem CPF, sempre — nunca `null` aqui. */
  cpf: string;
  /** A senha em claro, para o teste conseguir autenticar depois. */
  password: string;
  active: boolean; guardianId: string | null; roles: TestRoleInSchool[];
};

export async function createUser(options: {
  networkId: string; name?: string | undefined; email?: string | undefined;
  cpf?: string | undefined; password?: string | undefined;
  active?: boolean | undefined; guardianId?: string | null | undefined;
  roles?: TestRoleInSchool[] | undefined;
}): Promise<TestUser> {
  const number = nextNumber();
  const user: TestUser = {
    id: newId(), networkId: options.networkId, name: options.name ?? `Pessoa de Teste ${number}`,
    email: options.email ?? `usuario${number}@${DOMAIN}`,
    cpf: options.cpf === undefined ? generateCpf(number) : options.cpf,
    password: options.password ?? DEFAULT_PASSWORD,
    active: options.active ?? true, guardianId: options.guardianId ?? null, roles: options.roles ?? [],
  };

  // `senha` e `papeis` não são colunas de `app_user`: a primeira vira hash, os segundos viram linhas.
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

/** Passe `expiresAt` no passado para montar a sessão vencida que o expurgo precisa encontrar. */
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

export type TestGuardian = {
  id: string; networkId: string; name: string; email: string; cpf: string | null;
  phone: string | null;
};

export async function createGuardian(options: {
  networkId: string; name?: string | undefined; email?: string | undefined;
  cpf?: string | null | undefined; phone?: string | null | undefined;
}): Promise<TestGuardian> {
  const number = nextNumber();
  return await insertRow('guardian', {
    id: newId(), networkId: options.networkId, name: options.name ?? `Responsável de Teste ${number}`,
    email: options.email ?? `responsavel${number}@${DOMAIN}`,
    cpf: options.cpf === undefined ? generateCpf(number) : options.cpf, phone: options.phone ?? null,
  });
}

export type TestGuardianLink = {
  networkId: string; studentId: string; guardianId: string; relationship: string;
  financiallyResponsible: boolean;
};

export async function linkStudentGuardian(options: {
  networkId: string; studentId: string; guardianId: string;
  relationship?: string | undefined; financiallyResponsible?: boolean | undefined;
}): Promise<TestGuardianLink> {
  return await insertRow('student_guardian', {
    networkId: options.networkId, studentId: options.studentId, guardianId: options.guardianId,
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

export type TestRecipient = { guardianId: string; readAt: Date | null };

export type TestAnnouncement = {
  id: string; networkId: string; schoolId: string; title: string; body: string;
  authorUserId: string; publishedAt: Date | null; recipients: TestRecipient[];
};

export async function createAnnouncement(options: {
  networkId: string; schoolId: string; authorUserId: string;
  title?: string | undefined; body?: string | undefined;
  /** `null` monta o comunicado que ainda não foi publicado e não aparece em mural nenhum. */
  publishedAt?: Date | null | undefined;
  recipients?: { guardianId: string; readAt?: Date | null | undefined }[] | undefined;
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
  for (const { guardianId, readAt } of recipients) {
    await insertRow('announcement_recipient', {
      networkId: announcement.networkId, announcementId: announcement.id, guardianId, readAt,
    });
  }
  return announcement;
}

/**
 * A rede pronta que a maioria dos testes usa: duas unidades, um ano letivo, duas turmas na
 * primeira unidade, três disciplinas alocadas na primeira turma com o mesmo professor, cinco
 * alunos matriculados com um responsável cada e um usuário de cada papel. A segunda turma nasce
 * vazia de propósito: é o destino da transferência.
 */
export type Scenario = {
  network: TestNetwork;
  schools: [TestSchool, TestSchool];
  academicYear: TestAcademicYear;
  classGroups: [TestClassGroup, TestClassGroup];
  subjects: [TestSubject, TestSubject, TestSubject];
  classGroupSubjects: [TestClassGroupSubject, TestClassGroupSubject, TestClassGroupSubject];
  students: [TestStudent, TestStudent, TestStudent, TestStudent, TestStudent];
  guardians: [TestGuardian, TestGuardian, TestGuardian, TestGuardian, TestGuardian];
  enrollments: [TestEnrollment, TestEnrollment, TestEnrollment, TestEnrollment, TestEnrollment];
  admin: TestUser; registrar: TestUser; teacher: TestUser;
  /** O usuário do portal, ligado a `responsaveis[0]`. */
  guardian: TestUser;
  password: string;
};

async function enrollOneStudent(base: {
  networkId: string; classGroupId: string; academicYearId: string; year: number;
}): Promise<{ student: TestStudent; guardian: TestGuardian; enrollment: TestEnrollment }> {
  const student = await createStudent({ networkId: base.networkId });
  const guardian = await createGuardian({ networkId: base.networkId });
  await linkStudentGuardian({
    networkId: base.networkId, studentId: student.id, guardianId: guardian.id,
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
    networkId, classGroupId: classGroupA.id, academicYearId: academicYear.id, year: academicYear.year,
  };
  const [one, two, three, four, five] = await Promise.all([
    enrollOneStudent(base), enrollOneStudent(base), enrollOneStudent(base),
    enrollOneStudent(base), enrollOneStudent(base),
  ]);

  const guardian = await createUser({
    networkId, password, guardianId: one.guardian.id,
    roles: [{ schoolId: schoolA.id, role: 'guardian' }],
  });

  return {
    network, academicYear, schools: [schoolA, schoolB], classGroups: [classGroupA, classGroupB],
    subjects: [portuguese, math, history],
    classGroupSubjects: [assignmentA, assignmentB, assignmentC],
    students: [one.student, two.student, three.student, four.student, five.student],
    guardians: [
      one.guardian, two.guardian, three.guardian, four.guardian, five.guardian,
    ],
    enrollments: [one.enrollment, two.enrollment, three.enrollment, four.enrollment, five.enrollment],
    admin, registrar, teacher, guardian, password,
  };
}

/** Duas redes completas e independentes: o cenário do teste de isolamento de tenant. */
export async function twoNetworks(): Promise<{ a: Scenario; b: Scenario }> {
  const [a, b] = await Promise.all([fullScenario(), fullScenario()]);
  return { a, b };
}
