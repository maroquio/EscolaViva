/*
 * The compatibility window of ADR 0003, turned into a gate.
 *
 * The rule — never drop what the previous version still reads — used to live only as prose in
 * `docs/ADR/0003-migration-compatibility-window.md`, demonstrated by a pair of migrations that
 * two consolidations have since erased from `migrations/`. Prose is honoured by whoever
 * remembers it; a gate is honoured by everyone.
 *
 * Three shapes compress the window into a single instant, and each one takes down the version
 * that is still up:
 *
 *   1. A RENAME. It is steps "add" and "drop" fused: the old name stops existing the moment the
 *      new one starts. ADR 0003 forbids it by name.
 *   2. An ADD COLUMN sharing a file with a DROP COLUMN, a DROP TABLE or a SET NOT NULL. Opening
 *      and closing in one deploy leaves no interval in which both versions can read.
 *   3. An ADD COLUMN NOT NULL with no DEFAULT. The old version does not know how to fill the
 *      field, so its next INSERT fails.
 *
 * The second half of this file matters as much as the first: it feeds the checker sources that
 * DO break the rule and demands that it accuse each one. Without that, a checker that always
 * returned "no violation" would pass every case above it.
 */

import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { existingPath } from '../support/paths';

const MIGRATIONS_DIRECTORY = 'migrations';
const BASELINE = '0001_initial_schema.sql';

const PROJECT_ROOT = join(import.meta.dir, '..', '..');

/*
 * `$$ ... $$` first, because a function body carries its own `;` and would break the split into
 * statements. Comments next, and they are the reason this order exists at all: the baseline
 * explains in prose that it holds no ALTER and no DROP, and a checker that read comments would
 * accuse the file for describing the rule it obeys.
 */
const withoutDollarQuoted = (sql: string): string => sql.replace(/\$\$[\s\S]*?\$\$/g, ' ');

const withoutComments = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

const statementsOf = (sql: string): string[] =>
  withoutComments(withoutDollarQuoted(sql))
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter((statement) => statement !== '');

const RENAME = /^ALTER\s+TABLE\b.*\bRENAME\b/;
const ADD_COLUMN = /\bADD\s+COLUMN\b/;
const DROP_COLUMN = /\bDROP\s+COLUMN\b/;
const DROP_TABLE = /^DROP\s+TABLE\b/;
const SET_NOT_NULL = /\bSET\s+NOT\s+NULL\b/;
/** The clause of one ADD COLUMN, cut at the comma that starts the next one. */
const ADD_COLUMN_CLAUSE = /\bADD\s+COLUMN\b[^,]*/g;
const NOT_NULL = /\bNOT\s+NULL\b/;
const DEFAULT_VALUE = /\bDEFAULT\b/;

const WHY = {
  rename:
    'um RENAME é os passos "adicionar" e "remover" fundidos num instante só: o nome antigo deixa ' +
    'de existir no momento em que o novo passa a existir, e a versão que ainda está no ar lendo o ' +
    'antigo cai. A ADR 0003 proíbe pelo nome — a sequência é sempre coluna nova, backfill, parar ' +
    'de escrever na velha, e só então remover.',
  bothHalves:
    'abrir e fechar a janela no mesmo arquivo não deixa intervalo nenhum em que as duas versões do ' +
    'código leiam o mesmo banco. Separe em duas migrações e dois deploys: uma que só adiciona e ' +
    'preenche, outra que só aperta e remove, depois que nenhuma instância da versão anterior está ' +
    'de pé.',
  notNullWithoutDefault:
    'a versão anterior não sabe preencher a coluna nova, então o próximo INSERT dela falha. ' +
    'Adicione anulável ou com DEFAULT, preencha, e só depois aperte com SET NOT NULL, em outra ' +
    'migração.',
} as const;

function windowViolations(name: string, sql: string): string[] {
  const statements = statementsOf(sql);
  const accusations: string[] = [];

  if (statements.some((statement) => RENAME.test(statement))) {
    accusations.push(`${name} renomeia — ${WHY.rename}`);
  }

  const opens = statements.some((statement) => ADD_COLUMN.test(statement));
  const closes = statements.some(
    (statement) =>
      DROP_COLUMN.test(statement) || DROP_TABLE.test(statement) || SET_NOT_NULL.test(statement),
  );
  if (opens && closes) {
    accusations.push(`${name} abre e fecha a janela no mesmo arquivo — ${WHY.bothHalves}`);
  }

  for (const statement of statements) {
    for (const clause of statement.match(ADD_COLUMN_CLAUSE) ?? []) {
      if (NOT_NULL.test(clause) && !DEFAULT_VALUE.test(clause)) {
        accusations.push(
          `${name} adiciona coluna NOT NULL sem DEFAULT — ${WHY.notNullWithoutDefault}`,
        );
      }
    }
  }

  return accusations;
}

/*
 * Guarding the baseline by path is what keeps this file from passing over an empty directory:
 * `Bun.Glob` on a folder that moved finds nothing and reports no violation, which reads exactly
 * like a clean sweep.
 */
const migrationFiles = async (): Promise<string[]> => {
  await existingPath(join(MIGRATIONS_DIRECTORY, BASELINE));
  const names: string[] = [];
  const directory = join(PROJECT_ROOT, MIGRATIONS_DIRECTORY);
  for await (const name of new Bun.Glob('*.sql').scan({ cwd: directory })) names.push(name);
  return names.sort();
};

const readMigration = async (name: string): Promise<string> =>
  await Bun.file(join(PROJECT_ROOT, MIGRATIONS_DIRECTORY, name)).text();

/* ------------------------------------------------------------------------- */

describe('every migration respects the compatibility window of ADR 0003', () => {
  test('no file in migrations/ compresses the window', async () => {
    const names = await migrationFiles();
    expect(names.length).toBeGreaterThan(0);

    const accusations = (
      await Promise.all(names.map(async (name) => windowViolations(name, await readMigration(name))))
    ).flat();

    expect(accusations).toEqual([]);
  });

  /*
   * The baseline passes the three rules for a reason that is worth stating out loud: a
   * consolidated starting point only creates. If an ALTER ever shows up in it, the file stopped
   * being a starting point and became a step — and the gate above starts having an opinion.
   */
  test('the consolidated baseline holds no ALTER and no DROP at all', async () => {
    const [first] = await migrationFiles();
    expect(first).toBe(BASELINE);

    const statements = statementsOf(await readMigration(first ?? ''));

    expect(statements.filter((statement) => /^(ALTER|DROP)\b/.test(statement))).toEqual([]);
    expect(statements.some((statement) => /^CREATE\s+TABLE\b/.test(statement))).toBe(true);
  });
});

/* ------------------------------------------------------------------------- */

describe('the check does accuse a file that breaks the rule', () => {
  test('a RENAME is reported, even alone in the file', () => {
    const accusations = windowViolations(
      '0002_renomeia.sql',
      'ALTER TABLE app_user RENAME COLUMN phone TO telefone;',
    );

    expect(accusations).toHaveLength(1);
    expect(accusations[0]).toContain('renomeia');
    expect(accusations[0]).toContain(WHY.rename);
  });

  test('opening and closing in the same file is reported', () => {
    const accusations = windowViolations(
      '0002_abre_e_fecha.sql',
      `ALTER TABLE app_user ADD COLUMN nickname text;
       UPDATE app_user SET nickname = name;
       ALTER TABLE app_user ALTER COLUMN nickname SET NOT NULL;
       ALTER TABLE app_user DROP COLUMN name;`,
    );

    expect(accusations).toHaveLength(1);
    expect(accusations[0]).toContain('abre e fecha a janela no mesmo arquivo');
  });

  test('a DROP TABLE alongside an ADD COLUMN is reported too', () => {
    const accusations = windowViolations(
      '0002_derruba_tabela.sql',
      `ALTER TABLE app_user ADD COLUMN phone text;
       DROP TABLE guardian;`,
    );

    expect(accusations).toHaveLength(1);
    expect(accusations[0]).toContain('abre e fecha a janela no mesmo arquivo');
  });

  test('an ADD COLUMN NOT NULL with no DEFAULT is reported', () => {
    const accusations = windowViolations(
      '0002_aperta_cedo.sql',
      'ALTER TABLE app_user ADD COLUMN phone text NOT NULL;',
    );

    expect(accusations).toHaveLength(1);
    expect(accusations[0]).toContain('NOT NULL sem DEFAULT');
  });

  test('the very same column with a DEFAULT gets through', () => {
    const accusations = windowViolations(
      '0002_aperta_com_default.sql',
      "ALTER TABLE app_user ADD COLUMN phone text NOT NULL DEFAULT '';",
    );

    expect(accusations).toEqual([]);
  });

  test('the half that only opens gets through, and so does the half that only closes', () => {
    const opening = windowViolations(
      '0002_abre.sql',
      `ALTER TABLE student_guardian ADD COLUMN user_id uuid REFERENCES app_user(id);
       UPDATE student_guardian SET user_id = (SELECT id FROM app_user LIMIT 1);`,
    );
    const closing = windowViolations(
      '0003_fecha.sql',
      `ALTER TABLE student_guardian ALTER COLUMN user_id SET NOT NULL;
       ALTER TABLE student_guardian DROP COLUMN guardian_id;`,
    );

    expect([...opening, ...closing]).toEqual([]);
  });

  /*
   * The rule reads SQL, not prose. Without this case the baseline would accuse itself: its
   * header explains, in a comment, exactly the shapes the gate refuses.
   */
  test('mentioning a forbidden shape inside a comment is not a violation', () => {
    const accusations = windowViolations(
      '0002_so_comentario.sql',
      `-- Never ALTER TABLE ... RENAME COLUMN, and never an ADD COLUMN sharing a file
       -- with a DROP TABLE or a NOT NULL with no DEFAULT.
       /* ALTER TABLE app_user DROP COLUMN cpf; */
       CREATE TABLE nota_fiscal (id uuid PRIMARY KEY);`,
    );

    expect(accusations).toEqual([]);
  });

  test('a function body does not break the split into statements', () => {
    const accusations = windowViolations(
      '0002_com_funcao.sql',
      `CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         NEW.updated_at := now();
         RETURN NEW;
       END;
       $$;
       ALTER TABLE app_user ADD COLUMN phone text;`,
    );

    expect(accusations).toEqual([]);
  });
});
