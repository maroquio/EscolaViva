/*
 * Section 8 of the Stage 01 document, item by item, made executable.
 *
 * The original list is made of check boxes, and a check box is a promise. Here every item is a
 * check that runs: the dependency rule really does break when someone violates it, the process
 * really does die when a variable is missing, health really does answer 503 with the database down.
 * It is this file, and not a reading of the document, that authorizes saying the stage is done.
 *
 * Three items of the document do not fit into an automated test and are left out on purpose: the
 * restore of the dump into another database (`scripts/restore-test.sh`), and the four measurement
 * numbers of Section 5, which are observations noted down by whoever runs them, not assertions.
 */

import { SQL } from 'bun';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'bun:test';
import { config } from '../../src/shared/config';
import { generateCpf } from '../../src/shared/document';
import { HTTP_LOG_EVENTS } from '../../src/shared/constants';
import { FORBIDDEN_LOG_KEYS } from '../../src/shared/log';
import { clearDatabase, testSql } from '../support/database';
import {
  DEFAULT_PASSWORD,
  fullScenario,
  createStudent,
  createAcademicYear,
  createSubject,
  createEnrollment,
  createNetwork,
  createClassGroup,
  createClassGroupSubject,
  createSchool,
  createUser,
} from '../support/factories';
import { API } from '../../src/http/constants';
import {
  PROJECT_ROOT,
  captureLogOfAFlow,
  signIn,
  read,
  write,
  writeWithKey,
  runProcess,
  healthWithDatabaseDown,
  logValues,
} from './support';

const SUBJECTS = `${API.versionedPrefix}/registrar/subjects`;

const PROCESS_DEADLINE_MS = 60_000;

/** pino's numeric level for `error`. */
const PINO_ERROR_LEVEL = 50;

/* ------------------------------------------------------------------------- */

describe('`bun run check` fails if one module imports another module\'s internal file', () => {
  type Violation = { rule: string; path: string; content: string };

  /*
   * The rules name the four modules inside a regex alternation. Planting the violation in one
   * module alone would only prove that the alternation matches that one name — a typo in any of the
   * other three ('assesment', 'comunication') would leave that module with no rule at all and the
   * output would stay green. That is why each rule is planted in all four.
   *
   * The list comes off disk rather than from literals. It was written that way during the
   * conversion to English, when each module changed name in a different phase and a hand-written
   * list would have planted violations in folders that did not exist yet. It is kept because the
   * reason outlives the conversion: a module added or renamed later keeps being covered without
   * anyone remembering to add it here.
   */
  const domainModules = (): readonly string[] =>
    readdirSync(join(PROJECT_ROOT, 'apps/api/src'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== 'shared' && name !== 'web')
      .filter((name) => existsSync(join(PROJECT_ROOT, 'apps/api/src', name, 'index.ts')))
      .sort();

  const DOMAIN_FOLDER = 'domain';

  const APPLICATION_FOLDER = 'application';

  /** An internal file of ANOTHER module: the shortcut the rule forbids. */
  const internalTarget = (module: string, modules: readonly string[]): string => {
    const other = modules.find((candidate) => candidate !== module) ?? module;
    const file = readdirSync(join(PROJECT_ROOT, 'apps/api/src', other, DOMAIN_FOLDER))
      .filter((name) => name.endsWith('.ts'))
      .sort()[0];
    return `${other}/${DOMAIN_FOLDER}/${(file ?? '').replace(/\.ts$/, '')}`;
  };

  const MODULES = domainModules();

  const VIOLATIONS: readonly Violation[] = MODULES.flatMap((module) => [
    {
      rule: 'no-cross-module-shortcut',
      path: `apps/api/src/${module}/_test_violation.ts`,
      content:
        `import type * as Internal from '../${internalTarget(module, MODULES)}';\n` +
        'export type Shortcut = keyof typeof Internal;\n',
    },
    {
      rule: 'pure-domain',
      path: `apps/api/src/${module}/${DOMAIN_FOLDER}/_test_violation.ts`,
      content:
        "import { reader } from '../../shared/db';\n" +
        'export const connection = (): unknown => reader();\n',
    },
    /*
     * The rule is a permission, and this is the half a denylist could not have caught. Nobody would
     * have thought to forbid `shared/pagination` by name — which is exactly why naming what is
     * allowed is the stronger shape.
     */
    {
      rule: 'pure-domain',
      path: `apps/api/src/${module}/${DOMAIN_FOLDER}/_test_violation_unlisted.ts`,
      content:
        "import { rangeParams } from '../../shared/pagination';\n" +
        'export const paging = (): unknown => rangeParams;\n',
    },
    /*
     * I3 says the Stage 04 `Mailer` is born in `ports/` "because that is the only place it fits".
     * `pure-domain` alone does not make that true — it leaves the use case free to import the
     * provider directly, which is where a send site would actually be written. `pino` stands in for
     * that provider here: it is a real dependency, it is not `zod`, and it has no business being
     * named by a use case.
     */
    {
      rule: 'no-sdk-in-application',
      path: `apps/api/src/${module}/${APPLICATION_FOLDER}/_test_violation.ts`,
      content:
        "import pino from 'pino';\n" + 'export const logging = (): unknown => pino;\n',
    },
    {
      rule: 'shared-knows-no-domain',
      path: `apps/api/src/shared/_test_violation_${module}.ts`,
      content:
        `import * as imported from '../${module}';\n` +
        'export const port = (): unknown => imported;\n',
    },
  ]);

  test('the module list came off disk and is not empty', () => {
    expect(MODULES.length).toBeGreaterThanOrEqual(4);
  });

  const runCheck = (): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
    runProcess(['x', 'depcruise', 'apps/api/src', '--config', 'apps/api/.dependency-cruiser.js'], {});

  /** The offending file disappears in the `finally`: a suite that leaves rubbish in `src/` breaks the next one. */
  const checkWith = async (violation: Violation): Promise<{ exitCode: number; stdout: string }> => {
    const path = join(PROJECT_ROOT, violation.path);
    await Bun.write(path, violation.content);
    try {
      const { exitCode, stdout, stderr } = await runCheck();
      return { exitCode, stdout: `${stdout}${stderr}` };
    } finally {
      await unlink(path);
    }
  };

  test('the clean graph passes, and that is the starting point', async () => {
    const { exitCode } = await runCheck();

    expect(exitCode).toBe(0);
  }, PROCESS_DEADLINE_MS);

  for (const violation of VIOLATIONS) {
    test(`the ${violation.rule} rule brings the check down at ${violation.path}`, async () => {
      const { exitCode, stdout } = await checkWith(violation);

      expect(exitCode).not.toBe(0);
      expect(stdout).toContain(violation.rule);
      expect(stdout).toContain(violation.path);
    }, PROCESS_DEADLINE_MS);
  }

  test('the offending file is not left behind after the test', async () => {
    const leftovers = await Promise.all(
      VIOLATIONS.map((violation) => Bun.file(join(PROJECT_ROOT, violation.path)).exists()),
    );

    expect(leftovers).toEqual(VIOLATIONS.map(() => false));
  });

  /*
   * The other half of the boundary, and it has its own config because a cruise reports on what it
   * is pointed at. The rule is written as a permission — `apps/web/` and the contracts, nothing
   * else — so what it has to prove is not only that `shared/db` is refused, but that a file the
   * server keeps outside `src/` is refused too. A ban on `apps/api/src/` would let that one in.
   */
  const WEB_PROBE = 'apps/web/src/_test_violation.ts';

  const checkWebWith = async (content: string): Promise<{ exitCode: number; stdout: string }> => {
    const path = join(PROJECT_ROOT, WEB_PROBE);
    await Bun.write(path, content);
    try {
      const { exitCode, stdout, stderr } = await runProcess(
        ['x', 'depcruise', 'apps/web/src', '--config', 'apps/web/.dependency-cruiser.js'],
        {},
      );
      return { exitCode, stdout: `${stdout}${stderr}` };
    } finally {
      await unlink(path);
    }
  };

  const WEB_VIOLATIONS: readonly { what: string; content: string }[] = [
    {
      what: 'a server module',
      content:
        "import { reader } from '../../api/src/shared/db';\n" +
        'export const connection = (): unknown => reader();\n',
    },
    {
      what: 'a server test factory, which lives outside apps/api/src',
      content:
        "import { createUser } from '../../api/tests/support/factories';\n" +
        'export const make = (): unknown => createUser;\n',
    },
    {
      what: 'a script the server runs by hand',
      content:
        "import * as constants from '../../../scripts/constants';\n" +
        'export const named = (): unknown => constants;\n',
    },
  ];

  for (const violation of WEB_VIOLATIONS) {
    test(`the front is refused ${violation.what}`, async () => {
      const { exitCode, stdout } = await checkWebWith(violation.content);

      expect(exitCode).not.toBe(0);
      expect(stdout).toContain('web-sees-only-contracts');
    }, PROCESS_DEADLINE_MS);
  }

  test('and the contracts, which are the one thing it may import, still pass', async () => {
    const { exitCode } = await checkWebWith(
      "import type { SessionUserAsJson } from '@escolaviva/contracts';\n" +
        'export type Echo = SessionUserAsJson;\n',
    );

    expect(exitCode).toBe(0);
  }, PROCESS_DEADLINE_MS);
});

/* ------------------------------------------------------------------------- */

describe('the application writes no file to disk', () => {
  const PATTERNS: readonly { name: string; expression: RegExp }[] = [
    { name: 'writeFile', expression: /\bwriteFile(?:Sync)?\s*\(/ },
    { name: 'appendFile', expression: /\bappendFile(?:Sync)?\s*\(/ },
    { name: 'createWriteStream', expression: /\bcreateWriteStream\s*\(/ },
    { name: 'Bun.write', expression: /\bBun\s*\.\s*write\b/ },
    { name: 'fs.', expression: /\bfs\s*\./ },
  ];

  const diskWrites = async (): Promise<string[]> => {
    const sourceRoot = join(PROJECT_ROOT, 'apps/api/src');
    const found: string[] = [];
    for await (const relative of new Bun.Glob('**/*.ts').scan({ cwd: sourceRoot })) {
      const rows = (await Bun.file(join(sourceRoot, relative)).text()).split('\n');
      rows.forEach((row, index) => {
        for (const pattern of PATTERNS) {
          if (pattern.expression.test(row)) {
            found.push(`apps/api/src/${relative}:${index + 1} uses ${pattern.name}`);
          }
        }
      });
    }
    return found;
  };

  test('no module under `src/` writes a file', async () => {
    const found = await diskWrites();

    expect(found).toEqual([]);
  });

  test('the sweep really did read the code, and not an empty folder', async () => {
    const files: string[] = [];
    for await (const relative of new Bun.Glob('**/*.ts').scan({ cwd: join(PROJECT_ROOT, 'apps/api/src') })) {
      files.push(relative);
    }

    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('http/app.ts');
  });
});

/* ------------------------------------------------------------------------- */

describe('tearing the container down and bringing another up loses nothing but sessions', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /** A fresh connection, outside the application pool: what a second container would have. */
  const anotherConnection = async <T>(use: (sql: SQL) => Promise<T>): Promise<T> => {
    const sql = new SQL({ url: config.databaseUrl, max: 1 });
    try {
      return await use(sql);
    } finally {
      await sql.close();
    }
  };

  test('what one request writes, another connection reads', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    await write('POST', SUBJECTS, { name: 'Sociologia' }, cookie);
    const saved = await anotherConnection((sql) =>
      sql<{ name: string }[]>`
        SELECT name FROM subject WHERE network_id = ${scenario.network.id} AND name = 'Sociologia'`,
    );

    expect(saved.map((row) => row.name)).toEqual(['Sociologia']);
  });

  test('the process keeps no session in memory: erasing the row drops the access', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const before = await read(SUBJECTS, cookie);
    await anotherConnection((sql) => sql`DELETE FROM session WHERE user_id = ${scenario.registrar.id}`);
    const after = await read(SUBJECTS, cookie);

    expect(before.status).toBe(200);
    expect(after.status).toBe(401);
  });

  test('no table other than `session` holds the state of a signed-in user', async () => {
    const withValidity = await testSql()<{ tableName: string }[]>`
      SELECT table_name AS "tableName"
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'expires_at'
      ORDER BY table_name`;

    expect(withValidity.map((row) => row.tableName)).toEqual(['session']);
  });
});

/* ------------------------------------------------------------------------- */

describe('every business table has a `network_id` and a declared FK', () => {
  /** `network` is the owner itself; the other two are platform, and belong to no network at all. */
  const OUTSIDE_THE_RULE = ['network', 'idempotent_request', 'schema_migrations'];

  type CatalogRow = { tableName: string; hasColumn: boolean; hasForeignKey: boolean };

  const allTables = (): Promise<CatalogRow[]> => testSql()<CatalogRow[]>`
    SELECT t.table_name AS "tableName",
           EXISTS (
             SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = t.table_schema
               AND c.table_name = t.table_name
               AND c.column_name = 'network_id'
           ) AS "hasColumn",
           EXISTS (
             SELECT 1
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage k
               ON k.constraint_schema = tc.constraint_schema
              AND k.constraint_name = tc.constraint_name
             JOIN information_schema.constraint_column_usage r
               ON r.constraint_schema = tc.constraint_schema
              AND r.constraint_name = tc.constraint_name
             WHERE tc.table_schema = t.table_schema
               AND tc.table_name = t.table_name
               AND tc.constraint_type = 'FOREIGN KEY'
               AND k.column_name = 'network_id'
               AND r.table_name = 'network'
           ) AS "hasForeignKey"
    FROM information_schema.tables t
    WHERE t.table_schema = current_schema()
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name`;

  /** The exception stays outside the query, hand-written and visible: it is the list that has to be read. */
  const catalog = async (): Promise<CatalogRow[]> =>
    (await allTables()).filter((row) => !OUTSIDE_THE_RULE.includes(row.tableName));

  test('no business table is left without the `network_id` column', async () => {
    const rows = await catalog();

    const withoutColumn = rows.filter((row) => !row.hasColumn).map((row) => row.tableName);

    expect(rows.length).toBeGreaterThan(10);
    expect(withoutColumn).toEqual([]);
  });

  test('no business table is left without the foreign key to `network`', async () => {
    const rows = await catalog();

    const withoutKey = rows.filter((row) => !row.hasForeignKey).map((row) => row.tableName);

    expect(withoutKey).toEqual([]);
  });

  test('the join tables carry the network too, not only the main ones', async () => {
    const rows = await catalog();

    const names = rows.map((row) => row.tableName);

    expect(names).toContain('user_role');
    expect(names).toContain('student_guardian');
    expect(names).toContain('announcement_recipient');
  });
});

/* ------------------------------------------------------------------------- */

describe('sending the same write twice creates one record', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('two submissions under the same key produce a single row', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const key = crypto.randomUUID();

    await writeWithKey('POST', SUBJECTS, { name: 'Educação Física' }, cookie, key);
    await writeWithKey('POST', SUBJECTS, { name: 'Educação Física' }, cookie, key);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM subject
       WHERE network_id = ${scenario.network.id} AND name = 'Educação Física'`;

    expect(Number(rows[0]?.total ?? '0')).toBe(1);
  });

  test('two submissions under distinct keys produce two rows', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    await write('POST', SUBJECTS, { name: 'Educação Física' }, cookie);
    await write('POST', SUBJECTS, { name: 'Educação Artística' }, cookie);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM subject
       WHERE network_id = ${scenario.network.id} AND name LIKE 'Educação%'`;

    expect(Number(rows[0]?.total ?? '0')).toBe(2);
  });
});

/* ------------------------------------------------------------------------- */

describe('an authenticated route answers `Cache-Control: private, no-store`', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('every resource behind a session refuses shared caching', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const resources = await Promise.all(
      [
        `${API.versionedPrefix}/session`,
        `${API.versionedPrefix}/registrar/class-groups`,
        SUBJECTS,
        `${API.versionedPrefix}/registrar/students`,
      ].map((path) => read(path, cookie)),
    );

    expect(resources.map((resource) => resource.status)).toEqual([200, 200, 200, 200]);
    expect(resources.map((resource) => resource.headers.get('Cache-Control'))).toEqual([
      'private, no-store',
      'private, no-store',
      'private, no-store',
      'private, no-store',
    ]);
    expect(resources.map((resource) => resource.headers.get('Vary'))).toEqual([
      'Cookie',
      'Cookie',
      'Cookie',
      'Cookie',
    ]);
  });

  test('the guardian report card, which is the worst case, refuses caching too', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.guardian.cpf,
      password: scenario.password,
    });

    const reportCard = await read(
      `${API.versionedPrefix}/guardian/enrollments/${scenario.enrollments[0].id}/report-card`,
      cookie,
    );

    expect(reportCard.status).toBe(200);
    expect(reportCard.headers.get('Cache-Control')).toBe('private, no-store');
  });

  /*
   * The two halves of I10 in one place. The document is what knows this build's bundle names, so it
   * may never be kept; the bundle carries the hash in its own name, so it may be kept forever.
   * `tests/api/static.test.ts` proves both against a `dist` it builds itself, with the status
   * asserted before the header — the order that matters, because `cacheControlMiddleware` decides
   * by URL prefix and would answer `immutable` on a 404 just as happily as on a 200. Here the
   * question is the one only the assembled application can answer: that the document really is
   * what an unknown path receives, and that it receives it with no cache.
   */
  test('the application document, which every screen path lands on, goes into no cache', async () => {
    const response = await read(`/registrar/students/${crypto.randomUUID()}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

/* ------------------------------------------------------------------------- */

describe('`/health` answers 503 with the database stopped', () => {
  test('with the database up, health is 200 and liveness is 200', async () => {
    const health = await read('/health');
    const liveness = await read('/health/live');

    expect([health.status, liveness.status]).toEqual([200, 200]);
  });

  test('with the database down, health falls to 503 and liveness stays 200', async () => {
    const withoutDatabase = await healthWithDatabaseDown();

    expect(withoutDatabase.health).toBe(503);
    expect(withoutDatabase.live).toBe(200);
    /*
     * And it says why, which it used to keep to itself. `checkDatabase` swallowed the rejection to
     * answer a boolean, so the most important operational event this system has — the database is
     * not answering — produced no line at any level. The probe saw a 503 and whoever was called in
     * had nothing to read.
     */
    expect(
      withoutDatabase.logged.filter((row) => Number(row['level']) >= PINO_ERROR_LEVEL),
    ).not.toEqual([]);
  }, PROCESS_DEADLINE_MS);

  test('in both cases the health responses refuse caching', async () => {
    const withDatabase = await read('/health');
    const withoutDatabase = await healthWithDatabaseDown();

    expect(withDatabase.headers.get('Cache-Control')).toBe('no-store');
    expect(withoutDatabase.healthCache).toBe('no-store');
    expect(withoutDatabase.liveCache).toBe('no-store');
  }, PROCESS_DEADLINE_MS);
});

/* ------------------------------------------------------------------------- */

describe('one environment variable is missing and the process does not start', () => {
  const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

  /** A variable declared empty beats the project `.env`: that is how the absence is staged. */
  const runMain = (
    environment: Record<string, string>,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
    runProcess(['apps/api/src/main.ts'], { APP_ENV: 'test', PORT: '45671', ...environment });

  test('without DATABASE_URL the boot dies naming the variable', async () => {
    const { exitCode, stderr } = await runMain({ DATABASE_URL: '', SESSION_SECRET: SECRET });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('DATABASE_URL');
    expect(stderr).toContain('the process does not start');
  }, PROCESS_DEADLINE_MS);

  test('without SESSION_SECRET the boot dies naming the variable', async () => {
    const { exitCode, stderr } = await runMain({
      DATABASE_URL: Bun.env.DATABASE_URL ?? '',
      SESSION_SECRET: '',
    });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('SESSION_SECRET');
  }, PROCESS_DEADLINE_MS);

  test('the absences are pointed out all at once, not one variable per restart', async () => {
    const { stderr } = await runMain({ DATABASE_URL: '', SESSION_SECRET: '' });

    expect(stderr).toContain('DATABASE_URL');
    expect(stderr).toContain('SESSION_SECRET');
  }, PROCESS_DEADLINE_MS);

  test('a secret that is too short blocks the boot as well', async () => {
    const { exitCode, stderr } = await runMain({
      DATABASE_URL: Bun.env.DATABASE_URL ?? '',
      SESSION_SECRET: 'curto-demais',
    });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('SESSION_SECRET');
  }, PROCESS_DEADLINE_MS);
});

/* ------------------------------------------------------------------------- */

describe('no log holds a name, an e-mail, a CPF or a grade', () => {
  const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;

  const TEACHER_NAME = 'Ludmila Vasconcelos Trindade';
  const TEACHER_EMAIL = 'ludmila.trindade@escolaviva.test';
  /** A seed of its own, not the factories' global counter: here the value has to be predictable. */
  const TEACHER_CPF = generateCpf(910_827);
  const STUDENT_NAME = 'Anastácio Quintiliano Bragança';
  const SLUG = 'rede-do-teste-de-log';
  const GRADE = 7.3;
  const TERM = 1;

  beforeEach(async () => {
    await clearDatabase();
  });

  /** A scenario with unmistakable proper names: any leak shows up by plain equality. */
  const scenarioWithProperNames = async (): Promise<{
    networkSlug: string;
    email: string;
    cpf: string;
    password: string;
    classGroupSubjectId: string;
    enrollmentIds: string[];
    term: number;
    grade: number;
  }> => {
    const network = await createNetwork({ name: 'Rede do Teste de Log', slug: SLUG });
    const school = await createSchool({ networkId: network.id });
    const academicYear = await createAcademicYear({ networkId: network.id });
    const classGroup = await createClassGroup({
      networkId: network.id,
      schoolId: school.id,
      academicYearId: academicYear.id,
    });
    const subject = await createSubject({ networkId: network.id });
    const teacher = await createUser({
      networkId: network.id,
      name: TEACHER_NAME,
      email: TEACHER_EMAIL,
      cpf: TEACHER_CPF,
      password: DEFAULT_PASSWORD,
      roles: [{ schoolId: school.id, role: 'teacher' }],
    });
    const classGroupSubject = await createClassGroupSubject({
      networkId: network.id,
      classGroupId: classGroup.id,
      subjectId: subject.id,
      teacherUserId: teacher.id,
    });
    const student = await createStudent({ networkId: network.id, name: STUDENT_NAME });
    const enrollment = await createEnrollment({
      networkId: network.id,
      studentId: student.id,
      classGroupId: classGroup.id,
      academicYearId: academicYear.id,
    });

    return {
      networkSlug: network.slug,
      email: teacher.email,
      cpf: TEACHER_CPF,
      password: DEFAULT_PASSWORD,
      classGroupSubjectId: classGroupSubject.id,
      enrollmentIds: [enrollment.id],
      term: TERM,
      grade: GRADE,
    };
  };

  test('the flow really did produce a log — the test does not pass on silence', async () => {
    const captured = await captureLogOfAFlow(await scenarioWithProperNames());

    expect(captured.rows.length).toBeGreaterThanOrEqual(3);
    expect(captured.rows.every((row) => typeof row['msg'] === 'string')).toBe(true);
  }, PROCESS_DEADLINE_MS);

  test('no personal value from the scenario shows up in a log line', async () => {
    const scenario = await scenarioWithProperNames();

    const captured = await captureLogOfAFlow(scenario);
    const values = captured.rows.flatMap(logValues);
    const forbidden: unknown[] = [
      TEACHER_NAME, TEACHER_EMAIL, TEACHER_CPF, STUDENT_NAME, GRADE,
    ];

    expect(values.filter((value) => forbidden.includes(value))).toEqual([]);
    expect(captured.raw).not.toContain(TEACHER_EMAIL);
    expect(captured.raw).not.toContain(STUDENT_NAME);
    // Raw, not formatted: it is the shape the column stores, and that shape is the one that would really leak.
    expect(captured.raw).not.toContain(TEACHER_CPF);
  }, PROCESS_DEADLINE_MS);

  /*
   * The other way a log line can be wrong.
   *
   * Everything above asks what the log must not CONTAIN. This asks what it must not CLAIM: a flow
   * where nothing broke may not report that something did. The distinction has already cost this
   * repository once — a repeated submission answered the browser a correct 200 while writing an
   * `error` line at 500 with a stack trace, and every test passed, because every test was looking
   * at the response. An error level is a promise to whoever is on call at Stage 11, and a promise
   * kept only when somebody remembers is not one.
   *
   * The flow includes a refused sign-in on purpose: a wrong password is a rejection, not a failure,
   * and it belongs below the error level with everything else the product handles.
   */
  test('a flow where nothing broke writes no line above the warning level', async () => {
    const captured = await captureLogOfAFlow(await scenarioWithProperNames());
    const levels = captured.rows.map((row) => Number(row['level']));

    expect(levels.length).toBeGreaterThan(0);
    expect(captured.rows.filter((row) => Number(row['level']) >= PINO_ERROR_LEVEL)).toEqual([]);
    expect(captured.raw).not.toContain(HTTP_LOG_EVENTS.requestFailed);
  }, PROCESS_DEADLINE_MS);

  test('the log keeps identifiers and the outcome, which is what operations needs', async () => {
    const scenario = await scenarioWithProperNames();

    const captured = await captureLogOfAFlow(scenario);
    const fields = new Set(captured.rows.flatMap((row) => Object.keys(row)));

    expect(fields.has('correlation_id')).toBe(true);
    expect(captured.raw).toContain(SLUG);
    expect(captured.raw).toContain('rejected');
  }, PROCESS_DEADLINE_MS);

  test('no forbidden key escapes carrying a value, and no CPF appears', async () => {
    const scenario = await scenarioWithProperNames();

    const captured = await captureLogOfAFlow(scenario);
    const leaking = captured.rows.flatMap((row) =>
      Object.entries(row).filter(
        ([key, value]) => FORBIDDEN_LOG_KEYS.includes(key) && value !== '[redacted]',
      ),
    );

    expect(leaking).toEqual([]);
    expect(CPF.test(captured.raw)).toBe(false);
  }, PROCESS_DEADLINE_MS);

  test('the refusal hands over the correlation code, not the detail of the failure', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const rejected = await writeWithKey('POST', SUBJECTS, { name: 'Xadrez' }, cookie, '');
    const answer = await rejected.text();

    expect(rejected.status).toBe(400);
    expect(answer).not.toContain('idempotent_request');
    expect(answer).not.toContain(scenario.registrar.email);
  });
});
