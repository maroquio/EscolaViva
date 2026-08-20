import { ACTIVE_ENROLLMENT_STATUS, SHIFTS } from '../apps/api/src/academics';
import { ACTIVE_NETWORK_STATUS } from '../apps/api/src/identity';
import { config } from '../apps/api/src/shared/config';
import { LOCALE, PRODUCTION_ENV, TIME, WEEK_DAYS } from '../apps/api/src/shared/constants';
import { closeDatabase, writer, type Connection } from '../apps/api/src/shared/db';

const SLUG = 'volume';
const NETWORK_NAME = 'Rede de Volume (carga sintética)';
const DEFAULT_STUDENTS = 18_000;
const SCHOOL_COUNT = 55;
const STUDENTS_PER_CLASS_GROUP = 30;
const SCHOOL_DAYS = 200;
const ABSENCE_RATE = 0.06;
const ENROLLMENTS_PER_BATCH = 1_000;

const SHIFT_ARRANGEMENT = `{${SHIFTS.join(',')}}`;

const CALENDAR = {
  start: (year: number): string => `${year}-02-01`,
  end: (year: number): string => `${year}-12-15`,
  enrollment: (year: number): string => `${year}-02-05`,
} as const;

const OPTIONS = {
  year: '--ano',
  students: '--alunos',
  yes: '--sim',
  purge: '--apagar',
} as const;

const FIRST_USER_ARG = 2;

const COLUMNS = { progress: 7, table: 12, count: 12 } as const;

type Args = { year: number; students: number; confirmed: boolean; purge: boolean };

const now = (): number => Date.now();
const inSeconds = (since: number): string => ((now() - since) / TIME.msPerSecond).toFixed(1);
const withSeparator = (value: number): string => value.toLocaleString(LOCALE);

const MESSAGES = {
  positiveInteger: (label: string): string =>
    `${label} takes a positive integer right after it.`,
  unknownArgument: (argument: string): string =>
    `Unknown argument: ${argument}. Use ${Object.values(OPTIONS).join(', ')}.`,
  productionRefused: 'APP_ENV=production: synthetic load does not go into a production database.',
  noLoadNetwork: `There is no '${SLUG}' network. Nothing to erase.`,
  tableCleared: (table: string, rows: number): string => {
    const count = withSeparator(rows).padStart(COLUMNS.count);
    return `  ${table.padEnd(COLUMNS.table)} ${count} rows`;
  },
  networkRemoved: `Network '${SLUG}' removed.`,
  confirmPurge:
    `${OPTIONS.purge} removes the whole '${SLUG}' network. Confirm with ${OPTIONS.yes}. ` +
    'Nothing was erased.',
  forecast: (rows: number, year: number): string =>
    `About to write ~${withSeparator(rows)} rows into 'attendance', year ${year}:`,
  dimensions: (students: number): string =>
    `${withSeparator(students)} students, ${SCHOOL_COUNT} schools, ${SCHOOL_DAYS} days.`,
  confirmWrite: `Confirm with ${OPTIONS.yes}. Nothing was written.`,
  yearAlreadyLoaded: (year: number): string =>
    `Year ${year} has already been loaded. Use another ${OPTIONS.year}, or start over with ` +
    `${OPTIONS.purge} ${OPTIONS.yes}.`,
  header: (year: number, students: number): string =>
    `Network '${SLUG}' · year ${year} · ${withSeparator(students)} students`,
  structureReady: (schools: number, students: number, seconds: string): string =>
    `  ${schools} schools and ${withSeparator(students)} students (${seconds} s)`,
  scenarioReady: (classGroups: number, enrollments: number): string =>
    `  ${classGroups} class groups and ${withSeparator(enrollments)} active enrollments`,
  progress: (done: number, total: number, rows: number, seconds: string): string =>
    `  ${String(done).padStart(COLUMNS.progress)}/${total} enrollments` +
    ` · ${withSeparator(rows)} rows · ${seconds} s`,
  loadFinished: (rows: number, seconds: string): string =>
    `\n${withSeparator(rows)} rows written in ${seconds} s.`,
  tableTotal: (rows: number): string =>
    `'attendance' now holds ${withSeparator(rows)} rows in total.`,
  analyze: 'Run ANALYZE attendance; before measuring — the planner needs the fresh statistics.',
  measurementSignal:
    '\nMeasurement signal — the three queries to note down by hand once a week:',
  failure: (detail: string): string => `Load failed: ${detail}`,
} as const;

function readArgs(argv: readonly string[]): Args {
  const remaining = [...argv];
  let year = new Date().getUTCFullYear();
  let students = DEFAULT_STUDENTS;
  let confirmed = false;
  let purge = false;

  const integer = (label: string): number => {
    const raw = remaining.shift();
    const value = Number(raw);
    if (raw === undefined || !Number.isInteger(value) || value <= 0) {
      throw new Error(MESSAGES.positiveInteger(label));
    }
    return value;
  };

  while (remaining.length > 0) {
    const argument = remaining.shift();
    if (argument === OPTIONS.year) year = integer(OPTIONS.year);
    else if (argument === OPTIONS.students) students = integer(OPTIONS.students);
    else if (argument === OPTIONS.yes) confirmed = true;
    else if (argument === OPTIONS.purge) purge = true;
    else {
      throw new Error(MESSAGES.unknownArgument(String(argument)));
    }
  }
  return { year, students, confirmed, purge };
}

async function ensureNetwork(sql: Connection): Promise<string> {
  const existing: { id: string }[] = await sql`SELECT id FROM network WHERE slug = ${SLUG}`;
  const found = existing[0];
  if (found !== undefined) return found.id;
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO network (id, name, slug, status)
    VALUES (${id}, ${NETWORK_NAME}, ${SLUG}, ${ACTIVE_NETWORK_STATUS})`;
  return id;
}

async function ensureSchools(sql: Connection, networkId: string): Promise<number> {
  const count: { total: number }[] =
    await sql`SELECT count(*)::int AS total FROM school WHERE network_id = ${networkId}`;
  const existing = count[0]?.total ?? 0;
  if (existing >= SCHOOL_COUNT) return existing;
  await sql`
    INSERT INTO school (id, network_id, name)
    SELECT gen_random_uuid(), ${networkId}, 'Unidade ' || lpad(i::text, 3, '0')
      FROM generate_series(${existing + 1}, ${SCHOOL_COUNT}) AS i`;
  return SCHOOL_COUNT;
}

async function ensureStudents(sql: Connection, networkId: string, students: number): Promise<void> {
  const count: { total: number }[] =
    await sql`SELECT count(*)::int AS total FROM student WHERE network_id = ${networkId}`;
  const existing = count[0]?.total ?? 0;
  if (existing >= students) return;
  await sql`
    INSERT INTO student (id, network_id, name, birth_date)
    SELECT gen_random_uuid(), ${networkId}, 'Aluno de carga ' || lpad(i::text, 6, '0'),
           (current_date - ((3650 + (i % 2555)) || ' days')::interval)::date
      FROM generate_series(${existing + 1}, ${students}) AS i`;
}

type LoadScenario = { academicYearId: string; classGroups: number; enrollments: number };

async function buildAcademicYear(
  sql: Connection, networkId: string, year: number, students: number,
): Promise<LoadScenario> {
  const academicYearId = crypto.randomUUID();
  const classGroups = Math.ceil(students / STUDENTS_PER_CLASS_GROUP);
  await sql`
    INSERT INTO academic_year (id, network_id, year, start_date, end_date)
    VALUES (${academicYearId}, ${networkId}, ${year},
            ${CALENDAR.start(year)}, ${CALENDAR.end(year)})`;
  await sql`
    INSERT INTO class_group (id, network_id, school_id, academic_year_id, name, grade_level, shift)
    SELECT gen_random_uuid(), ${networkId}, u.id, ${academicYearId},
           'Turma ' || lpad(i::text, 4, '0'), ((i % 9) + 1) || 'º ano',
           (${SHIFT_ARRANGEMENT}::text[])[(i % ${SHIFTS.length}) + 1]
      FROM generate_series(1, ${classGroups}) AS i
      JOIN LATERAL (
        SELECT id FROM school WHERE network_id = ${networkId} ORDER BY name
         OFFSET (i - 1) % ${SCHOOL_COUNT} LIMIT 1
      ) AS u ON true`;
  await sql`
    INSERT INTO enrollment
           (id, network_id, student_id, class_group_id, academic_year_id, enrollment_date, status)
    SELECT gen_random_uuid(), ${networkId}, a.student_id, t.id, ${academicYearId},
           ${CALENDAR.enrollment(year)}::date, ${ACTIVE_ENROLLMENT_STATUS}
      FROM (SELECT student_id, position FROM (
              SELECT id AS student_id, row_number() OVER (ORDER BY name) AS position
                FROM student WHERE network_id = ${networkId}) AS numbered
             WHERE position <= ${students}) AS a
      JOIN (SELECT id, row_number() OVER (ORDER BY name) AS position
              FROM class_group
             WHERE network_id = ${networkId} AND academic_year_id = ${academicYearId}) AS t
        ON t.position = ((a.position - 1) / ${STUDENTS_PER_CLASS_GROUP}) + 1`;
  const total: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM enrollment
     WHERE network_id = ${networkId} AND academic_year_id = ${academicYearId}`;
  return { academicYearId, classGroups, enrollments: total[0]?.total ?? 0 };
}

async function fillAttendance(
  sql: Connection, networkId: string, scenario: LoadScenario, year: number,
): Promise<number> {
  const start = now();
  let saved = 0;
  for (
    let offset = 0;
    offset < scenario.enrollments;
    offset += ENROLLMENTS_PER_BATCH
  ) {
    const batch: { count: number } = await sql`
      WITH days AS (
        SELECT d::date AS attendance_date
          FROM generate_series(${CALENDAR.start(year)}::date,
                               ${CALENDAR.end(year)}::date, '1 day') AS d
         WHERE extract(isodow FROM d) < ${WEEK_DAYS.firstWeekendDayIso}
         ORDER BY d
         LIMIT ${SCHOOL_DAYS}
      ), batch AS (
        SELECT id FROM enrollment
         WHERE network_id = ${networkId} AND academic_year_id = ${scenario.academicYearId}
         ORDER BY id OFFSET ${offset} LIMIT ${ENROLLMENTS_PER_BATCH}
      )
      INSERT INTO attendance (id, network_id, enrollment_id, attendance_date, present)
      SELECT gen_random_uuid(), ${networkId}, batch.id, days.attendance_date,
             random() >= ${ABSENCE_RATE}
        FROM batch CROSS JOIN days`;
    saved += batch.count;
    const progress = Math.min(offset + ENROLLMENTS_PER_BATCH, scenario.enrollments);
    console.log(MESSAGES.progress(progress, scenario.enrollments, saved, inSeconds(start)));
  }
  return saved;
}

const MEASUREMENT_SQL = `
-- 1. Biggest table: the count the document says to note down (~3.6 million per academic year).
SELECT count(*) AS attendance_rows FROM attendance;

-- 2. Approximate p95 per query. pg_stat_statements does NOT keep a percentile: 'mean + 2 stddev'
--    is the approximation used, and 'max' is the real ceiling observed. Run once, in week one:
--      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--    and clear the window with SELECT pg_stat_statements_reset(); before each weekly measurement.
SELECT substring(query, 1, 70)                              AS statement,
       calls,
       round(mean_exec_time::numeric, 1)                    AS mean_ms,
       round((mean_exec_time + 2 * stddev_exec_time)::numeric, 1) AS p95_approx_ms,
       round(max_exec_time::numeric, 1)                     AS worst_ms
  FROM pg_stat_statements
 WHERE query ILIKE '%grade%' OR query ILIKE '%attendance%'
 ORDER BY mean_exec_time DESC
 LIMIT 10;

-- 3. What the database is doing right now: connections by state and the oldest query in flight.
--    Container CPU: docker stats --no-stream $(docker compose ps -q database)
SELECT state,
       count(*)                             AS connections,
       max(now() - query_start)             AS oldest
  FROM pg_stat_activity
 WHERE datname = current_database()
 GROUP BY state
 ORDER BY connections DESC;
`;

function printMeasurementSql(): void {
  console.log(MESSAGES.measurementSignal);
  console.log(MEASUREMENT_SQL);
}

const DELETE_IN_ORDER = [
  'attendance', 'grade', 'enrollment', 'class_group', 'academic_year', 'student', 'school',
];

async function deleteLoadNetwork(sql: Connection): Promise<void> {
  const existing: { id: string }[] = await sql`SELECT id FROM network WHERE slug = ${SLUG}`;
  const network = existing[0];
  if (network === undefined) {
    console.log(MESSAGES.noLoadNetwork);
    return;
  }
  for (const table of DELETE_IN_ORDER) {
    const deleted: { count: number } =
      await sql`DELETE FROM ${sql(table)} WHERE network_id = ${network.id}`;
    console.log(MESSAGES.tableCleared(table, deleted.count));
  }
  await sql`DELETE FROM network WHERE id = ${network.id}`;
  console.log(MESSAGES.networkRemoved);
}

async function load(): Promise<void> {
  if (config.environment === PRODUCTION_ENV) {
    throw new Error(MESSAGES.productionRefused);
  }
  const { year, students, confirmed, purge } = readArgs(Bun.argv.slice(FIRST_USER_ARG));
  if (purge) {
    if (!confirmed) {
      console.log(MESSAGES.confirmPurge);
      return;
    }
    await deleteLoadNetwork(writer());
    return;
  }

  const forecastRows = students * SCHOOL_DAYS;
  if (!confirmed) {
    console.log(MESSAGES.forecast(forecastRows, year));
    console.log(MESSAGES.dimensions(students));
    console.log(MESSAGES.confirmWrite);
    return;
  }

  const sql = writer();
  const start = now();
  const networkId = await ensureNetwork(sql);
  const alreadyLoaded: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM academic_year
     WHERE network_id = ${networkId} AND year = ${year}`;
  if ((alreadyLoaded[0]?.total ?? 0) > 0) {
    throw new Error(MESSAGES.yearAlreadyLoaded(year));
  }

  console.log(MESSAGES.header(year, students));
  const schools = await ensureSchools(sql, networkId);
  await ensureStudents(sql, networkId, students);
  console.log(MESSAGES.structureReady(schools, students, inSeconds(start)));
  const scenario = await buildAcademicYear(sql, networkId, year, students);
  console.log(MESSAGES.scenarioReady(scenario.classGroups, scenario.enrollments));
  const rows = await fillAttendance(sql, networkId, scenario, year);

  const total: { total: number }[] = await sql`SELECT count(*)::int AS total FROM attendance`;
  console.log(MESSAGES.loadFinished(rows, inSeconds(start)));
  console.log(MESSAGES.tableTotal(total[0]?.total ?? 0));
  console.log(MESSAGES.analyze);
  printMeasurementSql();
}

try {
  await load();
} catch (error) {
  console.error(MESSAGES.failure(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
