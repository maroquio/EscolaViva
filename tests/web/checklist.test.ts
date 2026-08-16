/*
 * A Seção 8 do documento do Estágio 01, item a item, executável.
 *
 * A lista original é de caixas de marcar, e caixa de marcar é promessa. Aqui cada item é uma
 * verificação que roda: a regra de dependência quebra mesmo quando alguém a viola, o processo
 * morre mesmo quando falta variável, a saúde responde 503 mesmo com o banco fora do ar. É este
 * arquivo, e não a leitura do documento, que autoriza dizer que o estágio está pronto.
 *
 * Três itens do documento não cabem em teste automatizado e ficam de fora de propósito: a
 * restauração do dump em outro banco (`scripts/restore-test.sh`), e os quatro números de medição
 * da Seção 5, que são observações anotadas por quem executa, não asserções.
 */

import { SQL } from 'bun';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'bun:test';
import { config } from '../../src/shared/config';
import { generateCpf } from '../../src/shared/document';
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
import {
  PROJECT_ROOT,
  open,
  captureLogOfAFlow,
  signIn,
  send,
  post,
  runProcess,
  healthWithDatabaseDown,
  logValues,
} from './support';

const PROCESS_DEADLINE_MS = 60_000;

/* ------------------------------------------------------------------------- */

describe('`bun run check` falha se um módulo importar arquivo interno de outro', () => {
  type Violation = { rule: string; path: string; content: string };

  /*
   * As três regras nomeiam os quatro módulos numa alternância de regex. Plantar a violação
   * em um módulo só provava que a alternância casa aquele nome — um erro de digitação em
   * qualquer um dos outros três ('assesment', 'comunication') deixaria aquele módulo sem
   * regra nenhuma e a saída continuaria verde. Por isso cada regra é plantada nos quatro.
   *
   * A lista sai do disco, e não de literais: durante a conversão do repositório para inglês
   * cada módulo troca de nome numa fase diferente, e uma lista escrita à mão passaria a
   * plantar violação em pasta inexistente — o depcruise reprovaria por outro motivo e o teste
   * continuaria "vermelho certo pelo motivo errado", ou pior, verde por não achar nada.
   * O mesmo vale para a pasta de domínio, que é `dominio` antes da fase do módulo e `domain`
   * depois dela.
   */
  const domainModules = (): readonly string[] =>
    readdirSync(join(PROJECT_ROOT, 'src'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== 'shared' && name !== 'web')
      .filter((name) => existsSync(join(PROJECT_ROOT, 'src', name, 'index.ts')))
      .sort();

  const domainFolder = (module: string): string =>
    existsSync(join(PROJECT_ROOT, 'src', module, 'domain')) ? 'domain' : 'dominio';

  /** Um arquivo interno de OUTRO módulo: é o atalho que a regra proíbe. */
  const internalTarget = (module: string, modules: readonly string[]): string => {
    const other = modules.find((candidate) => candidate !== module) ?? module;
    const folder = domainFolder(other);
    const file = readdirSync(join(PROJECT_ROOT, 'src', other, folder))
      .filter((name) => name.endsWith('.ts'))
      .sort()[0];
    return `${other}/${folder}/${(file ?? '').replace(/\.ts$/, '')}`;
  };

  const MODULES = domainModules();

  const VIOLATIONS: readonly Violation[] = MODULES.flatMap((module) => [
    {
      rule: 'no-cross-module-shortcut',
      path: `src/${module}/_violacao_de_teste.ts`,
      content:
        `import type * as Internal from '../${internalTarget(module, MODULES)}';\n` +
        'export type Shortcut = keyof typeof Internal;\n',
    },
    {
      rule: 'pure-domain',
      path: `src/${module}/${domainFolder(module)}/_violacao_de_teste.ts`,
      content:
        "import { reader } from '../../shared/db';\n" +
        'export const connection = (): unknown => reader();\n',
    },
    {
      rule: 'shared-knows-no-domain',
      path: `src/shared/_violacao_de_teste_${module}.ts`,
      content:
        `import * as imported from '../${module}';\n` +
        'export const port = (): unknown => imported;\n',
    },
  ]);

  test('a lista de módulos veio do disco e não está vazia', () => {
    expect(MODULES.length).toBeGreaterThanOrEqual(4);
  });

  const runCheck = (): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
    runProcess(['x', 'depcruise', 'src', '--config', 'config/.dependency-cruiser.js'], {});

  /** O arquivo em falta some no `finally`: uma suíte que deixa lixo em `src/` quebra a seguinte. */
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

  test('o grafo limpo passa, e é esse o ponto de partida', async () => {
    const { exitCode } = await runCheck();

    expect(exitCode).toBe(0);
  }, PROCESS_DEADLINE_MS);

  for (const violation of VIOLATIONS) {
    test(`a regra ${violation.rule} derruba a verificação em ${violation.path}`, async () => {
      const { exitCode, stdout } = await checkWith(violation);

      expect(exitCode).not.toBe(0);
      expect(stdout).toContain(violation.rule);
      expect(stdout).toContain(violation.path);
    }, PROCESS_DEADLINE_MS);
  }

  test('o arquivo em falta não sobra depois do teste', async () => {
    const leftovers = await Promise.all(
      VIOLATIONS.map((violation) => Bun.file(join(PROJECT_ROOT, violation.path)).exists()),
    );

    expect(leftovers).toEqual(VIOLATIONS.map(() => false));
  });
});

/* ------------------------------------------------------------------------- */

describe('nenhum arquivo é escrito em disco pela aplicação', () => {
  const PATTERNS: readonly { name: string; expression: RegExp }[] = [
    { name: 'writeFile', expression: /\bwriteFile(?:Sync)?\s*\(/ },
    { name: 'appendFile', expression: /\bappendFile(?:Sync)?\s*\(/ },
    { name: 'createWriteStream', expression: /\bcreateWriteStream\s*\(/ },
    { name: 'Bun.write', expression: /\bBun\s*\.\s*write\b/ },
    { name: 'fs.', expression: /\bfs\s*\./ },
  ];

  const diskWrites = async (): Promise<string[]> => {
    const sourceRoot = join(PROJECT_ROOT, 'src');
    const found: string[] = [];
    for await (const relative of new Bun.Glob('**/*.ts').scan({ cwd: sourceRoot })) {
      const rows = (await Bun.file(join(sourceRoot, relative)).text()).split('\n');
      rows.forEach((row, index) => {
        for (const pattern of PATTERNS) {
          if (pattern.expression.test(row)) {
            found.push(`src/${relative}:${index + 1} usa ${pattern.name}`);
          }
        }
      });
    }
    return found;
  };

  test('nenhum módulo de `src/` grava arquivo', async () => {
    const found = await diskWrites();

    expect(found).toEqual([]);
  });

  test('a varredura de fato leu o código, e não uma pasta vazia', async () => {
    const files: string[] = [];
    for await (const relative of new Bun.Glob('**/*.ts').scan({ cwd: join(PROJECT_ROOT, 'src') })) {
      files.push(relative);
    }

    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('web/app.ts');
  });
});

/* ------------------------------------------------------------------------- */

describe('derrubar o container e subir outro não perde nada além de sessões', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /** Uma conexão nova, fora do pool da aplicação: é o que um segundo contêiner teria. */
  const anotherConnection = async <T>(use: (sql: SQL) => Promise<T>): Promise<T> => {
    const sql = new SQL({ url: config.databaseUrl, max: 1 });
    try {
      return await use(sql);
    } finally {
      await sql.close();
    }
  };

  test('o que uma requisição grava, outra conexão lê', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    await send('/secretaria/disciplinas', { nome: 'Sociologia' }, cookie);
    const saved = await anotherConnection((sql) =>
      sql<{ name: string }[]>`
        SELECT name FROM subject WHERE network_id = ${scenario.network.id} AND name = 'Sociologia'`,
    );

    expect(saved.map((row) => row.name)).toEqual(['Sociologia']);
  });

  test('o processo não guarda sessão em memória: apagar a linha derruba o acesso', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const before = await open('/secretaria', cookie);
    await anotherConnection((sql) => sql`DELETE FROM session WHERE user_id = ${scenario.registrar.id}`);
    const after = await open('/secretaria', cookie);

    expect(before.status).toBe(200);
    expect(after.status).toBe(303);
    expect(after.headers.get('Location')).toBe('/login');
  });

  test('nenhuma tabela além de `sessao` guarda estado de usuário conectado', async () => {
    const withValidity = await testSql()<{ tableName: string }[]>`
      SELECT table_name AS "tableName"
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'expires_at'
      ORDER BY table_name`;

    expect(withValidity.map((row) => row.tableName)).toEqual(['session']);
  });
});

/* ------------------------------------------------------------------------- */

describe('toda tabela de negócio tem `rede_id` e FK declarada', () => {
  /** `network` é a própria dona; as outras duas são plataforma, e não pertencem a rede nenhuma. */
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

  /** A exceção fica fora da consulta, escrita à mão e visível: é a lista que precisa ser lida. */
  const catalog = async (): Promise<CatalogRow[]> =>
    (await allTables()).filter((row) => !OUTSIDE_THE_RULE.includes(row.tableName));

  test('nenhuma tabela de negócio fica sem a coluna `rede_id`', async () => {
    const rows = await catalog();

    const withoutColumn = rows.filter((row) => !row.hasColumn).map((row) => row.tableName);

    expect(rows.length).toBeGreaterThan(10);
    expect(withoutColumn).toEqual([]);
  });

  test('nenhuma tabela de negócio fica sem a chave estrangeira para `rede`', async () => {
    const rows = await catalog();

    const withoutKey = rows.filter((row) => !row.hasForeignKey).map((row) => row.tableName);

    expect(withoutKey).toEqual([]);
  });

  test('as tabelas de junção também carregam a rede, e não só as principais', async () => {
    const rows = await catalog();

    const names = rows.map((row) => row.tableName);

    expect(names).toContain('user_role');
    expect(names).toContain('student_guardian');
    expect(names).toContain('announcement_recipient');
  });
});

/* ------------------------------------------------------------------------- */

describe('enviar o mesmo formulário duas vezes cria um registro', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('dois envios com a mesma chave produzem uma linha só', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const fields = { _chave: crypto.randomUUID(), nome: 'Educação Física' };

    await post('/secretaria/disciplinas', fields, cookie);
    await post('/secretaria/disciplinas', fields, cookie);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM subject
       WHERE network_id = ${scenario.network.id} AND name = 'Educação Física'`;

    expect(Number(rows[0]?.total ?? '0')).toBe(1);
  });

  test('dois envios com chaves distintas produzem duas linhas', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    await send('/secretaria/disciplinas', { nome: 'Educação Física' }, cookie);
    await send('/secretaria/disciplinas', { nome: 'Educação Artística' }, cookie);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM subject
       WHERE network_id = ${scenario.network.id} AND name LIKE 'Educação%'`;

    expect(Number(rows[0]?.total ?? '0')).toBe(2);
  });
});

/* ------------------------------------------------------------------------- */

describe('rota autenticada responde `Cache-Control: private, no-store`', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('toda tela com sessão recusa cache compartilhado', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const screens = await Promise.all(
      ['/secretaria', '/secretaria/turmas', '/secretaria/disciplinas', '/conta/senha'].map(
        (path) => open(path, cookie),
      ),
    );

    expect(screens.map((screen) => screen.headers.get('Cache-Control'))).toEqual([
      'private, no-store',
      'private, no-store',
      'private, no-store',
      'private, no-store',
    ]);
    expect(screens.map((screen) => screen.headers.get('Vary'))).toEqual([
      'Cookie',
      'Cookie',
      'Cookie',
      'Cookie',
    ]);
  });

  test('o boletim do responsável, que é o pior caso, também recusa cache', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.guardian.cpf,
      password: scenario.password,
    });

    const reportCard = await open(
      `/responsavel/matriculas/${scenario.enrollments[0].id}/boletim`,
      cookie,
    );

    expect(reportCard.status).toBe(200);
    expect(reportCard.headers.get('Cache-Control')).toBe('private, no-store');
  });

  test('o arquivo publicado, cujo nome carrega o hash, pode ser guardado para sempre', async () => {
    const response = await open('/publico/app.2a17037a.css');

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  test('a tela de entrada, sem sessão, também não vai para cache nenhum', async () => {
    const response = await open('/login');

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

/* ------------------------------------------------------------------------- */

describe('`/health` responde 503 com o banco parado', () => {
  test('com o banco de pé, a saúde é 200 e a vida é 200', async () => {
    const health = await open('/health');
    const liveness = await open('/health/live');

    expect([health.status, liveness.status]).toEqual([200, 200]);
  });

  test('com o banco fora do ar, a saúde cai para 503 e a vida continua 200', async () => {
    const withoutDatabase = await healthWithDatabaseDown();

    expect(withoutDatabase.health).toBe(503);
    expect(withoutDatabase.live).toBe(200);
  }, PROCESS_DEADLINE_MS);

  test('nos dois casos as respostas de saúde recusam cache', async () => {
    const withDatabase = await open('/health');
    const withoutDatabase = await healthWithDatabaseDown();

    expect(withDatabase.headers.get('Cache-Control')).toBe('no-store');
    expect(withoutDatabase.healthCache).toBe('no-store');
    expect(withoutDatabase.liveCache).toBe('no-store');
  }, PROCESS_DEADLINE_MS);
});

/* ------------------------------------------------------------------------- */

describe('falta uma variável de ambiente e o processo não sobe', () => {
  const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

  /** Variável declarada vazia vence o `.env` do projeto: é assim que a falta é simulada. */
  const runMain = (
    environment: Record<string, string>,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
    runProcess(['src/main.ts'], { APP_ENV: 'test', PORT: '45671', ...environment });

  test('sem DATABASE_URL o boot morre citando a variável', async () => {
    const { exitCode, stderr } = await runMain({ DATABASE_URL: '', SESSION_SECRET: SECRET });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('DATABASE_URL');
    expect(stderr).toContain('o processo não sobe');
  }, PROCESS_DEADLINE_MS);

  test('sem SESSION_SECRET o boot morre citando a variável', async () => {
    const { exitCode, stderr } = await runMain({
      DATABASE_URL: Bun.env.DATABASE_URL ?? '',
      SESSION_SECRET: '',
    });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('SESSION_SECRET');
  }, PROCESS_DEADLINE_MS);

  test('a falta é apontada de uma vez, e não uma variável por reinício', async () => {
    const { stderr } = await runMain({ DATABASE_URL: '', SESSION_SECRET: '' });

    expect(stderr).toContain('DATABASE_URL');
    expect(stderr).toContain('SESSION_SECRET');
  }, PROCESS_DEADLINE_MS);

  test('segredo curto demais também impede o boot', async () => {
    const { exitCode, stderr } = await runMain({
      DATABASE_URL: Bun.env.DATABASE_URL ?? '',
      SESSION_SECRET: 'curto-demais',
    });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('SESSION_SECRET');
  }, PROCESS_DEADLINE_MS);
});

/* ------------------------------------------------------------------------- */

describe('nenhum log contém nome, e-mail, CPF ou nota', () => {
  const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;

  const TEACHER_NAME = 'Ludmila Vasconcelos Trindade';
  const TEACHER_EMAIL = 'ludmila.trindade@escolaviva.test';
  /** Semente própria, e não o contador global das fábricas: aqui o valor precisa ser previsível. */
  const TEACHER_CPF = generateCpf(910_827);
  const STUDENT_NAME = 'Anastácio Quintiliano Bragança';
  const SLUG = 'rede-do-teste-de-log';
  const GRADE = 7.3;
  const TERM = 1;

  beforeEach(async () => {
    await clearDatabase();
  });

  /** Um cenário com nomes próprios inconfundíveis: qualquer vazamento aparece por igualdade. */
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

  test('o fluxo de fato produziu log — o teste não passa por silêncio', async () => {
    const captured = await captureLogOfAFlow(await scenarioWithProperNames());

    expect(captured.rows.length).toBeGreaterThanOrEqual(3);
    expect(captured.rows.every((row) => typeof row['msg'] === 'string')).toBe(true);
  }, PROCESS_DEADLINE_MS);

  test('nenhum valor pessoal do cenário aparece em linha de log', async () => {
    const scenario = await scenarioWithProperNames();

    const captured = await captureLogOfAFlow(scenario);
    const values = captured.rows.flatMap(logValues);
    const forbidden: unknown[] = [
      TEACHER_NAME, TEACHER_EMAIL, TEACHER_CPF, STUDENT_NAME, GRADE,
    ];

    expect(values.filter((value) => forbidden.includes(value))).toEqual([]);
    expect(captured.raw).not.toContain(TEACHER_EMAIL);
    expect(captured.raw).not.toContain(STUDENT_NAME);
    // Cru, não formatado: é a forma que a coluna grava, e é essa forma que vazaria de verdade.
    expect(captured.raw).not.toContain(TEACHER_CPF);
  }, PROCESS_DEADLINE_MS);

  test('o log guarda identificadores e o desfecho, que é do que a operação precisa', async () => {
    const scenario = await scenarioWithProperNames();

    const captured = await captureLogOfAFlow(scenario);
    const fields = new Set(captured.rows.flatMap((row) => Object.keys(row)));

    expect(fields.has('correlation_id')).toBe(true);
    expect(captured.raw).toContain(SLUG);
    expect(captured.raw).toContain('recusado');
  }, PROCESS_DEADLINE_MS);

  test('nenhuma chave proibida escapa com valor, e nenhum CPF aparece', async () => {
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

  test('a página de erro entrega o código de correlação, e não o detalhe da falha', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });

    const rejected = await post('/secretaria/disciplinas', { nome: 'Xadrez' }, cookie);
    const page = await rejected.text();

    expect(rejected.status).toBe(400);
    expect(page).not.toContain('idempotent_request');
    expect(page).not.toContain(scenario.registrar.email);
  });
});
