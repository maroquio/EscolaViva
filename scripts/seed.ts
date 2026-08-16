import { ACTIVE_ENROLLMENT_STATUS, SHIFTS } from '../src/academics';
import { ACTIVE_NETWORK_STATUS, ROLE, type Role } from '../src/identity';
import { config } from '../src/shared/config';
import { ISO_DATE_LENGTH, PRODUCTION_ENV, TIME, WEEK_DAYS } from '../src/shared/constants';
import { closeDatabase, unitOfWork, writer, type Connection } from '../src/shared/db';
import { formatCpf, generateCpf } from '../src/shared/document';
import { uuidIdGenerator } from '../src/shared/ports';

const SLUG = 'demo';
const NETWORK_NAME = 'Rede Municipal de Demonstração';
const PASSWORD = 'escolaviva';
const DOMAIN = 'escolaviva.test';
const STUDENTS_PER_CLASS_GROUP = 20;
const SCHOOL_DAYS = 60;
const ABSENCE_RATE = 0.06;
const EXCUSE_RATE = 0.4;
const READ_RATE = 0.12;
const BATCH_SIZE = 2000;

const RANDOM_SEED = 20260201;

type Row = Record<string, string | number | boolean | null>;
type Named = { id: string; name: string };
type ClassGroup = {
  id: string;
  schoolIndex: number;
  name: string;
  shift: (typeof SHIFTS)[number];
  age: number;
};

const newId = (): string => uuidIdGenerator.next();

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // magic-values: permitido — the mulberry32 increment, fixed by the algorithm
    state = (state + 0x6d2b79f5) >>> 0;
    // magic-values: permitido — the mulberry32 shift, fixed by the algorithm
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    // magic-values: permitido — the mulberry32 shift and multiplier
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // magic-values: permitido — 2^32, the divisor that normalizes mulberry32 into [0, 1)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seededRandom(RANDOM_SEED);
const between = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));

const ERRORS = {
  randomFromEmptyList: 'draw over an empty list',
  teacherSchool: 'school of the teacher not found',
  classGroupSchool: 'school of the class group not found',
  subjectTeacher: 'teacher of the subject not found',
  announcementWithoutSchoolOrAuthor: 'school or author of the announcement not found',
  productionEnvironment: 'APP_ENV=production: this script erases and recreates the demo network.',
} as const;

function oneOf<T>(items: readonly T[]): T {
  const chosen = items[between(0, items.length - 1)];
  if (chosen === undefined) throw new Error(ERRORS.randomFromEmptyList);
  return chosen;
}

const FIRST_NAMES = [
  'Ana Luíza', 'Beatriz', 'Camila', 'Davi', 'Eduarda', 'Enzo', 'Fernanda', 'Gabriel', 'Heloísa',
  'Igor', 'Isabela', 'João Pedro', 'Júlia', 'Kauã', 'Larissa', 'Lucas', 'Manuela', 'Matheus',
  'Nicolas', 'Olívia', 'Pedro Henrique', 'Rafaela', 'Samuel', 'Sofia', 'Valentina', 'Yasmin',
];
const LAST_NAMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Carvalho', 'Costa', 'Dias', 'Ferreira', 'Gomes', 'Lima',
  'Machado', 'Martins', 'Mendes', 'Nascimento', 'Oliveira', 'Pereira', 'Pinheiro', 'Ribeiro',
  'Rocha', 'Rodrigues', 'Santos', 'Silva', 'Souza', 'Teixeira', 'Vieira',
];
const RELATIONSHIPS = ['mãe', 'pai', 'avó', 'avô', 'tia', 'padrasto'];
const EXCUSES = [
  'Atestado médico entregue na secretaria.', 'Consulta odontológica no contraturno.',
  'Viagem em família comunicada com antecedência.', 'Atestado de exame laboratorial.',
];

const personName = (): string => `${oneOf(FIRST_NAMES)} ${oneOf(LAST_NAMES)} ${oneOf(LAST_NAMES)}`;

const EMAIL = {
  normalization: 'NFD',
  nameSeparator: ' ',
  fallbackFirst: 'pessoa',
  fallbackLast: 'demo',
} as const;

function emailFor(name: string, index: number): string {
  const parts = name
    .normalize(EMAIL.normalization)
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, '')
    .split(EMAIL.nameSeparator);
  const first = parts[0] ?? EMAIL.fallbackFirst;
  const last = parts[parts.length - 1] ?? EMAIL.fallbackLast;
  return `${first}.${last}${index}@${DOMAIN}`;
}

const SCHOOLS = ['Escola Central', 'Escola Bairro Novo'];
const SUBJECTS = ['Português', 'Matemática', 'História', 'Geografia', 'Ciências', 'Arte'];
const CLASS_GROUPS: readonly Omit<ClassGroup, 'id'>[] = [
  { schoolIndex: 0, name: '6º A', shift: 'morning', age: 11 },
  { schoolIndex: 0, name: '7º A', shift: 'morning', age: 12 },
  { schoolIndex: 0, name: '8º A', shift: 'afternoon', age: 13 },
  { schoolIndex: 1, name: '6º B', shift: 'afternoon', age: 11 },
  { schoolIndex: 1, name: '9º A', shift: 'morning', age: 14 },
  { schoolIndex: 1, name: '9º B', shift: 'full_time', age: 14 },
];

const GRADE_LEVEL = { nameDigits: 2, suffix: ' ano' } as const;

const TABLE = {
  school: 'school',
  user: 'app_user',
  userRole: 'user_role',
  session: 'session',
  academicYear: 'academic_year',
  subject: 'subject',
  classGroup: 'class_group',
  classGroupSubject: 'class_group_subject',
  student: 'student',
  guardian: 'guardian',
  studentGuardian: 'student_guardian',
  enrollment: 'enrollment',
  grade: 'grade',
  attendance: 'attendance',
  termClosing: 'term_closing',
  announcement: 'announcement',
  announcementRecipient: 'announcement_recipient',
} as const;

async function insert(sql: Connection, table: string, rows: readonly Row[]): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await sql`INSERT INTO ${sql(table)} ${sql(rows.slice(start, start + BATCH_SIZE))}`;
  }
}

const DELETE_IN_ORDER = [
  TABLE.announcementRecipient, TABLE.announcement, TABLE.attendance, TABLE.grade,
  TABLE.termClosing, TABLE.enrollment, TABLE.studentGuardian, TABLE.classGroupSubject,
  TABLE.classGroup, TABLE.subject, TABLE.academicYear, TABLE.session, TABLE.userRole,
  TABLE.user, TABLE.guardian, TABLE.student, TABLE.school,
];

async function deleteDemoNetwork(sql: Connection, networkId: string): Promise<void> {
  await sql`
    DELETE FROM idempotent_request
     WHERE user_id IN (SELECT id FROM app_user WHERE network_id = ${networkId})`;
  for (const table of DELETE_IN_ORDER) {
    await sql`DELETE FROM ${sql(table)} WHERE network_id = ${networkId}`;
  }
  await sql`DELETE FROM network WHERE id = ${networkId}`;
}

type Structure = {
  networkId: string; schools: Named[]; academicYearId: string;
  year: number; subjects: Named[]; classGroups: ClassGroup[];
};

const CALENDAR = {
  academicYearStart: (year: number): string => `${year}-02-01`,
  academicYearEnd: (year: number): string => `${year}-12-15`,
  enrollmentDay: (year: number): string => `${year}-02-05`,
} as const;

async function createStructure(sql: Connection, year: number): Promise<Structure> {
  const networkId = newId();
  const academicYearId = newId();
  const schools = SCHOOLS.map((name) => ({ id: newId(), name }));
  const subjects = SUBJECTS.map((name) => ({ id: newId(), name }));
  const classGroups = CLASS_GROUPS.map((classGroup) => ({ ...classGroup, id: newId() }));

  await sql`INSERT INTO network (id, name, slug, status)
            VALUES (${networkId}, ${NETWORK_NAME}, ${SLUG}, ${ACTIVE_NETWORK_STATUS})`;
  await insert(sql, TABLE.school, schools.map((s) => ({
    id: s.id, network_id: networkId, name: s.name,
  })));
  await sql`INSERT INTO academic_year (id, network_id, year, start_date, end_date)
            VALUES (${academicYearId}, ${networkId}, ${year},
                    ${CALENDAR.academicYearStart(year)}, ${CALENDAR.academicYearEnd(year)})`;
  await insert(sql, TABLE.subject, subjects.map((s) => ({
    id: s.id, network_id: networkId, name: s.name,
  })));
  await insert(sql, TABLE.classGroup, classGroups.map((classGroup) => ({
    id: classGroup.id, network_id: networkId, school_id: schools[classGroup.schoolIndex]?.id ?? '',
    academic_year_id: academicYearId, name: classGroup.name, shift: classGroup.shift,
    grade_level: `${classGroup.name.slice(0, GRADE_LEVEL.nameDigits)}${GRADE_LEVEL.suffix}`,
  })));
  return { networkId, schools, academicYearId, year, subjects, classGroups };
}

type Staff = {
  credentials: { email: string; cpf: string; role: Role; where: string }[];
  registrars: string[]; teachers: string[];
};

const MAILBOX = { admin: 'admin', registrar: 'secretaria', teacher: 'professor' } as const;
const ADMIN_NAME = 'Marina Alves Correia';

const TEACHERS = { total: 6, perSchool: 3, subjectsPerTeacher: 2 } as const;

const SCHOOL_SEPARATOR = ' + ';

async function createStaff(sql: Connection, s: Structure, hash: string): Promise<Staff> {
  const users: Row[] = [];
  const roles: Row[] = [];
  const credentials: Staff['credentials'] = [];
  const registrars: string[] = [];
  const teachers: string[] = [];
  let index = 0;
  const addUser = (name: string, email: string, role: Role, schools: Named[]): string => {
    const id = newId();
    index += 1;
    const cpf = generateCpf(index);
    users.push({
      id, network_id: s.networkId, email, password_hash: hash, name, guardian_id: null, cpf,
    });
    for (const school of schools) {
      roles.push({ network_id: s.networkId, user_id: id, school_id: school.id, role });
    }
    credentials.push({
      email, cpf, role, where: schools.map((school) => school.name).join(SCHOOL_SEPARATOR),
    });
    return id;
  };
  addUser(ADMIN_NAME, `${MAILBOX.admin}@${DOMAIN}`, ROLE.networkAdmin, s.schools);
  s.schools.forEach((school, i) => {
    const target = [school];
    const email = `${MAILBOX.registrar}${i + 1}@${DOMAIN}`;
    registrars.push(addUser(personName(), email, ROLE.registrar, target));
  });
  for (let p = 0; p < TEACHERS.total; p += 1) {
    const school = s.schools[Math.floor(p / TEACHERS.perSchool)];
    if (school === undefined) throw new Error(ERRORS.teacherSchool);
    const email = `${MAILBOX.teacher}${p + 1}@${DOMAIN}`;
    teachers.push(addUser(personName(), email, ROLE.teacher, [school]));
  }
  await insert(sql, TABLE.user, users);
  await insert(sql, TABLE.userRole, roles);
  return { credentials, registrars, teachers };
}

type Population = {
  enrollments: { id: string; classGroupIndex: number }[];
  guardiansBySchool: string[][]; accounts: { email: string; cpf: string }[];
};

const TWO_GUARDIANS_RATE = 0.65;
const GUARDIANS_PER_STUDENT = { max: 2, min: 1 } as const;

const GUARDIAN_INDEX_STEP = 10;

const BIRTH = { lastMonth: 12, lastDay: 28 } as const;

const TWO_DIGITS = { places: 2, pad: '0' } as const;

const PHONE = {
  prefix: '(27) 9',
  separator: '-',
  blockStart: 1000,
  blockEnd: 9999,
} as const;

async function createPeople(sql: Connection, s: Structure, hash: string): Promise<Population> {
  const students: Row[] = [];
  const guardians: Row[] = [];
  const guardianLinks: Row[] = [];
  const users: Row[] = [];
  const roles: Row[] = [];
  const enrollmentRows: Row[] = [];
  const enrollments: { id: string; classGroupIndex: number }[] = [];
  const guardiansBySchool: string[][] = s.schools.map(() => []);
  const accounts: { email: string; cpf: string }[] = [];
  let index = 0;
  s.classGroups.forEach((classGroup, classGroupIndex) => {
    const school = s.schools[classGroup.schoolIndex];
    if (school === undefined) throw new Error(ERRORS.classGroupSchool);
    for (let n = 0; n < STUDENTS_PER_CLASS_GROUP; n += 1) {
      index += 1;
      const studentId = newId();
      const month = String(between(1, BIRTH.lastMonth))
        .padStart(TWO_DIGITS.places, TWO_DIGITS.pad);
      const day = String(between(1, BIRTH.lastDay))
        .padStart(TWO_DIGITS.places, TWO_DIGITS.pad);
      const birthDate = `${s.year - classGroup.age}-${month}-${day}`;
      students.push({
        id: studentId, network_id: s.networkId, name: personName(), birth_date: birthDate,
      });
      const guardianCount = random() < TWO_GUARDIANS_RATE
        ? GUARDIANS_PER_STUDENT.max
        : GUARDIANS_PER_STUDENT.min;
      for (let r = 0; r < guardianCount; r += 1) {
        const guardianId = newId();
        const userId = newId();
        const name = personName();
        const seed = index * GUARDIAN_INDEX_STEP + r;
        const email = emailFor(name, seed);
        const cpf = generateCpf(seed);
        const block = (): number => between(PHONE.blockStart, PHONE.blockEnd);
        const phone = `${PHONE.prefix}${block()}${PHONE.separator}${block()}`;
        guardians.push({
          id: guardianId, network_id: s.networkId, name, email, phone, cpf,
        });
        guardianLinks.push({
          network_id: s.networkId, student_id: studentId, guardian_id: guardianId,
          relationship: oneOf(RELATIONSHIPS), financially_responsible: r === 0,
        });
        users.push({
          id: userId, network_id: s.networkId, email, password_hash: hash, name,
          guardian_id: guardianId, cpf,
        });
        roles.push({
          network_id: s.networkId, user_id: userId, school_id: school.id,
          role: ROLE.guardian,
        });
        guardiansBySchool[classGroup.schoolIndex]?.push(guardianId);
        accounts.push({ email, cpf });
      }
      const enrollmentId = newId();
      enrollments.push({ id: enrollmentId, classGroupIndex });
      enrollmentRows.push({
        id: enrollmentId, network_id: s.networkId, student_id: studentId,
        class_group_id: classGroup.id,
        academic_year_id: s.academicYearId, enrollment_date: CALENDAR.enrollmentDay(s.year),
        status: ACTIVE_ENROLLMENT_STATUS,
      });
    }
  });
  await insert(sql, TABLE.student, students);
  await insert(sql, TABLE.guardian, guardians);
  await insert(sql, TABLE.studentGuardian, guardianLinks);
  await insert(sql, TABLE.user, users);
  await insert(sql, TABLE.userRole, roles);
  await insert(sql, TABLE.enrollment, enrollmentRows);
  return { enrollments, guardiansBySchool, accounts };
}

async function assign(sql: Connection, s: Structure, teachers: string[]): Promise<string[][]> {
  const rows: Row[] = [];
  const byClassGroup: string[][] = s.classGroups.map(() => []);
  s.classGroups.forEach((classGroup, t) => {
    s.subjects.forEach((subject, d) => {
      const position = classGroup.schoolIndex * TEACHERS.perSchool
        + Math.floor(d / TEACHERS.subjectsPerTeacher);
      const teacher = teachers[position];
      if (teacher === undefined) throw new Error(ERRORS.subjectTeacher);
      const id = newId();
      byClassGroup[t]?.push(id);
      rows.push({
        id, network_id: s.networkId, class_group_id: classGroup.id,
        subject_id: subject.id, teacher_user_id: teacher,
      });
    });
  });
  await insert(sql, TABLE.classGroupSubject, rows);
  return byClassGroup;
}

const FIRST_INCOMPLETE_SUBJECT = 3;
const COMPLETE_TERM_RATE = 0.75;

const GRADE = { doubledMin: 8, doubledMax: 20, divisor: 2 } as const;

async function postGrades(
  sql: Connection, s: Structure, population: Population, assignments: string[][],
  teachers: string[],
): Promise<void> {
  const rows: Row[] = [];
  const termsFor = (d: number): number[] => {
    if (d < FIRST_INCOMPLETE_SUBJECT) return [1, 2, 3];
    if (d === FIRST_INCOMPLETE_SUBJECT) {
      return random() < COMPLETE_TERM_RATE ? [1, 2, 3] : [1, 2];
    }
    return [1, 2];
  };
  population.enrollments.forEach((enrollment) => {
    const classGroup = s.classGroups[enrollment.classGroupIndex];
    const postedBy = teachers[(classGroup?.schoolIndex ?? 0) * TEACHERS.perSchool] ?? '';
    (assignments[enrollment.classGroupIndex] ?? []).forEach((classGroupSubjectId, d) => {
      const terms = termsFor(d);
      for (const term of terms) {
        rows.push({
          id: newId(), network_id: s.networkId, enrollment_id: enrollment.id, posted_by: postedBy,
          class_group_subject_id: classGroupSubjectId, term,
          value: between(GRADE.doubledMin, GRADE.doubledMax) / GRADE.divisor,
        });
      }
    });
  });
  await insert(sql, TABLE.grade, rows);
}

function schoolDays(count: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  while (days.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== WEEK_DAYS.saturdayJs) {
      days.push(cursor.toISOString().slice(0, ISO_DATE_LENGTH));
    }
  }
  return days.reverse();
}

async function recordAttendance(
  sql: Connection, s: Structure, population: Population,
): Promise<void> {
  const days = schoolDays(SCHOOL_DAYS);
  const rows: Row[] = [];
  for (const enrollment of population.enrollments) {
    for (const date of days) {
      const present = random() >= ABSENCE_RATE;
      const excused = !present && random() < EXCUSE_RATE;
      rows.push({
        id: newId(), network_id: s.networkId, enrollment_id: enrollment.id,
        attendance_date: date, present,
        excuse: excused ? oneOf(EXCUSES) : null,
      });
    }
  }
  await insert(sql, TABLE.attendance, rows);
}

const ANNOUNCEMENTS = [
  { title: 'Reunião de pais e mestres do 2º bimestre', days: 34 },
  { title: 'Calendário da semana de provas', days: 21 },
  { title: 'Campanha de agasalho — entrega na secretaria', days: 12 },
  { title: 'Alteração no horário de entrada às sextas-feiras', days: 4 },
];

const ANNOUNCEMENT_BODY = (title: string, school: string): string =>
  `${title}. A equipe da ${school} pede a leitura atenta e a confirmação no portal.`;

async function publishAnnouncements(
  sql: Connection, s: Structure, population: Population, staff: Staff,
): Promise<void> {
  const announcements: Row[] = [];
  const recipients: Row[] = [];
  ANNOUNCEMENTS.forEach((announcement, i) => {
    const schoolIndex = i % s.schools.length;
    const school = s.schools[schoolIndex];
    const author = staff.registrars[schoolIndex];
    if (school === undefined || author === undefined) {
      throw new Error(ERRORS.announcementWithoutSchoolOrAuthor);
    }
    const id = newId();
    announcements.push({
      id, network_id: s.networkId, school_id: school.id, title: announcement.title,
      body: ANNOUNCEMENT_BODY(announcement.title, school.name),
      author_user_id: author,
      published_at: new Date(Date.now() - announcement.days * TIME.msPerDay).toISOString(),
    });
    const fromSchool = population.guardiansBySchool[schoolIndex] ?? [];
    const readerCount = Math.round(fromSchool.length * READ_RATE);
    const cumulative = (upTo: number): number =>
      Math.floor((upTo * readerCount) / fromSchool.length);
    fromSchool.forEach((guardianId, position) => {
      const read = cumulative(position) < cumulative(position + 1);
      const when = new Date(Date.now() - between(1, announcement.days) * TIME.msPerDay);
      recipients.push({
        network_id: s.networkId, announcement_id: id, guardian_id: guardianId,
        read_at: read ? when.toISOString() : null,
      });
    });
  });
  await insert(sql, TABLE.announcement, announcements);
  await insert(sql, TABLE.announcementRecipient, recipients);
}

const SUMMARY_TABLES = [
  TABLE.school, TABLE.user, TABLE.userRole, TABLE.academicYear, TABLE.subject,
  TABLE.classGroup, TABLE.classGroupSubject, TABLE.student, TABLE.guardian,
  TABLE.studentGuardian, TABLE.enrollment, TABLE.grade, TABLE.attendance,
  TABLE.termClosing, TABLE.announcement, TABLE.announcementRecipient,
];

const COLUMNS = { email: 38, cpf: 14, role: 12, table: 24, total: 7 } as const;

const GUARDIAN_SAMPLE = 3;

const OUTPUT = {
  summaryByTable: '\nSummary by table',
  header: { email: 'E-MAIL', cpf: 'CPF', role: 'ROLE', school: 'SCHOOL' },
  access: (slug: string, password: string): string =>
    `\nAccess — network "${slug}", password "${password}" for everyone\n`,
  guardianPortal: 'guardian portal',
  moreGuardians: (count: number): string =>
    `  … and ${count} more guardians, same password.`,
  networkRecreated: (slug: string, seconds: string): string =>
    `\nNetwork "${slug}" recreated in ${seconds} s.`,
  incompleteTerm:
    'Term 3 is incomplete on purpose: closing it refuses and lists what is missing.',
  seedFailure: (detail: string): string => `Seed failed: ${detail}`,
} as const;

async function printSummary(sql: Connection, networkId: string): Promise<void> {
  console.log(OUTPUT.summaryByTable);
  for (const table of SUMMARY_TABLES) {
    const rows: { total: number }[] = await sql`
      SELECT count(*)::int AS total FROM ${sql(table)} WHERE network_id = ${networkId}`;
    console.log(
      `  ${table.padEnd(COLUMNS.table)} `
        + `${String(rows[0]?.total ?? 0).padStart(COLUMNS.total)}`,
    );
  }
}

function printCredentials(staff: Staff, guardians: { email: string; cpf: string }[]): void {
  console.log(OUTPUT.access(SLUG, PASSWORD));
  console.log(
    `  ${OUTPUT.header.email.padEnd(COLUMNS.email)} `
      + `${OUTPUT.header.cpf.padEnd(COLUMNS.cpf)} `
      + `${OUTPUT.header.role.padEnd(COLUMNS.role)} ${OUTPUT.header.school}`,
  );
  for (const row of staff.credentials) {
    console.log(
      `  ${row.email.padEnd(COLUMNS.email)} `
        + `${formatCpf(row.cpf).padEnd(COLUMNS.cpf)} `
        + `${row.role.padEnd(COLUMNS.role)} ${row.where}`,
    );
  }
  for (const account of guardians.slice(0, GUARDIAN_SAMPLE)) {
    console.log(
      `  ${account.email.padEnd(COLUMNS.email)} `
        + `${formatCpf(account.cpf).padEnd(COLUMNS.cpf)} `
        + `${ROLE.guardian.padEnd(COLUMNS.role)} ${OUTPUT.guardianPortal}`,
    );
  }
  const remaining = guardians.length - GUARDIAN_SAMPLE;
  console.log(OUTPUT.moreGuardians(remaining));
}

async function runSeed(): Promise<void> {
  if (config.environment === PRODUCTION_ENV) {
    throw new Error(ERRORS.productionEnvironment);
  }
  const year = new Date().getUTCFullYear();
  const hash = await Bun.password.hash(PASSWORD);
  const start = Date.now();
  const { networkId, staff, guardians } = await unitOfWork(async ({ sql }) => {
    const existing: { id: string }[] = await sql`SELECT id FROM network WHERE slug = ${SLUG}`;
    if (existing[0] !== undefined) await deleteDemoNetwork(sql, existing[0].id);
    const structure = await createStructure(sql, year);
    const createdStaff = await createStaff(sql, structure, hash);
    const population = await createPeople(sql, structure, hash);
    const assignments = await assign(sql, structure, createdStaff.teachers);
    await postGrades(sql, structure, population, assignments, createdStaff.teachers);
    await recordAttendance(sql, structure, population);
    await publishAnnouncements(sql, structure, population, createdStaff);
    return { networkId: structure.networkId, staff: createdStaff, guardians: population.accounts };
  });

  printCredentials(staff, guardians);
  await printSummary(writer(), networkId);
  const seconds = ((Date.now() - start) / TIME.msPerSecond).toFixed(1);
  console.log(OUTPUT.networkRecreated(SLUG, seconds));
  console.log(OUTPUT.incompleteTerm);
}

try {
  await runSeed();
} catch (error) {
  console.error(OUTPUT.seedFailure(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
