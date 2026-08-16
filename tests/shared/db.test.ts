/*
 * I15 e I21 contra o PostgreSQL de verdade. `reader()`/`writer()` existem para que cada
 * consulta declare sua intenção, e `unitOfWork` é o único ponto de commit da aplicação:
 * se ela deixasse escapar uma escrita já comitada quando o caso de uso falha no meio, a
 * transferência criaria a matrícula de destino sem encerrar a de origem.
 */

import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { checkDatabase, reader, unitOfWork, writer } from '../../src/shared/db';
import { clearDatabase, prepareDatabase, testSql } from '../support/database';
import { createNetwork } from '../support/factories';

const ROOT = resolve(import.meta.dir, '..', '..');
const DB_MODULE = resolve(ROOT, 'src', 'shared', 'db', 'index.ts');
/** Porta sem nada escutando: a conexão é recusada na hora. */
const INVALID_URL = 'postgres://ninguem:nada@127.0.0.1:5599/inexistente';
/** Endereço que não roteia: a conexão fica pendurada até o prazo vencer. */
const UNRESPONSIVE_URL = 'postgres://ninguem:nada@10.255.255.1:5432/inexistente';
const SHORT_DEADLINE_MS = 300;
const GENEROUS_DEADLINE_MS = 5000;

/**
 * Alguns comportamentos só aparecem com outra configuração de banco ou fechando o pool — as
 * duas coisas contaminariam os arquivos de teste seguintes, que rodam no mesmo processo. Por
 * isso este punhado de casos roda em um processo separado, com o ambiente que o caso precisa.
 */
async function runWithAnotherDatabase(code: string, databaseUrl: string): Promise<string> {
  // O processo auxiliar termina sozinho: a tentativa de conexão pendurada de um banco que não
  // responde continua viva depois de `checkDatabase` já ter devolvido — é justamente o que
  // prova que a verificação não espera pela conexão.
  const program = [
    `const db = await import(${JSON.stringify(DB_MODULE)});`,
    code,
    'process.exit(0);',
  ].join('\n');
  const child = Bun.spawn({
    cmd: ['bun', '-e', program],
    cwd: ROOT,
    env: { ...Bun.env, DATABASE_URL: databaseUrl, APP_ENV: 'test' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`processo auxiliar terminou em ${exitCode}: ${stderr}`);
  }
  return stdout.trim();
}

async function networkExists(id: string): Promise<boolean> {
  const rows = await testSql()<{ id: string }[]>`SELECT id FROM network WHERE id = ${id}`;
  return rows.length === 1;
}

async function schoolExists(id: string): Promise<boolean> {
  const rows = await testSql()<{ id: string }[]>`SELECT id FROM school WHERE id = ${id}`;
  return rows.length === 1;
}

async function networkName(id: string): Promise<string | null> {
  const rows = await testSql()<{ name: string }[]>`SELECT name FROM network WHERE id = ${id}`;
  return rows[0]?.name ?? null;
}

/** Devolve o erro que a função lançou; falha o teste se ela tiver funcionado. */
async function captureError(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error('a operação foi concluída quando deveria ter falhado');
}

beforeAll(prepareDatabase);
beforeEach(clearDatabase);

describe('reader e writer', () => {
  test('reader() responde uma consulta', async () => {
    const connection = reader();

    const rows = await connection<{ one: number }[]>`SELECT 1 AS one`;

    expect(rows[0]?.one).toBe(1);
  });

  test('writer() responde uma consulta', async () => {
    const connection = writer();

    const rows = await connection<{ one: number }[]>`SELECT 1 AS one`;

    expect(rows[0]?.one).toBe(1);
  });

  test('no estágio 01 as duas apontam para o mesmo primário', () => {
    const forReading = reader();

    const forWriting = writer();

    expect(forReading).toBe(forWriting);
  });

  test('writer() enxerga o que a suíte gravou no banco', async () => {
    const network = await createNetwork({ name: 'Rede da Conexão' });

    const rows = await writer()<{ name: string }[]>`SELECT name FROM network WHERE id = ${network.id}`;

    expect(rows[0]?.name).toBe('Rede da Conexão');
  });
});

describe('checkDatabase', () => {
  test('devolve true com o banco de pé', async () => {
    const deadline = GENEROUS_DEADLINE_MS;

    const responded = await checkDatabase(deadline);

    expect(responded).toBe(true);
  });

  test('devolve false quando a URL do banco é inválida e o prazo é curto', async () => {
    const deadline = SHORT_DEADLINE_MS;

    const stdout = await runWithAnotherDatabase(
      `console.log(await db.checkDatabase(${deadline}));`,
      INVALID_URL,
    );

    expect(stdout).toBe('false');
  });

  test('não pendura a rota quando o banco não responde: vence o prazo', async () => {
    const measure = [
      'const start = Date.now();',
      `const responded = await db.checkDatabase(${SHORT_DEADLINE_MS});`,
      'console.log(JSON.stringify({ responded, ms: Date.now() - start }));',
    ].join('\n');

    const stdout = await runWithAnotherDatabase(measure, UNRESPONSIVE_URL);

    const measurement = JSON.parse(stdout) as { responded: boolean; ms: number };
    expect(measurement.responded).toBe(false);
    expect(measurement.ms).toBeLessThan(GENEROUS_DEADLINE_MS);
  });
});

describe('closeDatabase', () => {
  test('fecha o pool sem erro, mesmo chamado duas vezes', async () => {
    const endTwice = 'await db.closeDatabase(); await db.closeDatabase(); console.log("encerrado");';

    const stdout = await runWithAnotherDatabase(endTwice, INVALID_URL);

    expect(stdout).toBe('encerrado');
  });
});

describe('unitOfWork — caminho feliz', () => {
  test('comita o que a função escreveu', async () => {
    const networkId = crypto.randomUUID();

    await unitOfWork(async ({ sql }) => {
      await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede Comitada', 'rede-comitada')`;
    });

    expect(await networkExists(networkId)).toBe(true);
  });

  test('devolve o valor produzido pela função', async () => {
    const expected = { enrollmentId: 'm-1', status: 'active' };

    const returned = await unitOfWork(async () => expected);

    expect(returned).toEqual(expected);
  });

  test('comita escritas em duas tabelas diferentes de uma vez só', async () => {
    const networkId = crypto.randomUUID();
    const schoolId = crypto.randomUUID();

    await unitOfWork(async ({ sql }) => {
      await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede Dupla', 'rede-dupla')`;
      await sql`INSERT INTO school (id, network_id, name) VALUES (${schoolId}, ${networkId}, 'Escola Central')`;
    });

    expect(await networkExists(networkId)).toBe(true);
    expect(await schoolExists(schoolId)).toBe(true);
  });

  test('a escrita só fica visível para outra conexão depois do commit', async () => {
    const networkId = crypto.randomUUID();
    let visibleDuringTheTransaction = true;

    await unitOfWork(async ({ sql }) => {
      await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede em Voo', 'rede-em-voo')`;
      visibleDuringTheTransaction = await networkExists(networkId);
    });

    expect(visibleDuringTheTransaction).toBe(false);
    expect(await networkExists(networkId)).toBe(true);
  });
});

describe('unitOfWork — rollback', () => {
  test('desfaz as escritas em DUAS tabelas quando a função lança', async () => {
    const networkId = crypto.randomUUID();
    const schoolId = crypto.randomUUID();

    const error = await captureError(() =>
      unitOfWork(async ({ sql }) => {
        await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede Desfeita', 'rede-desfeita')`;
        await sql`INSERT INTO school (id, network_id, name) VALUES (${schoolId}, ${networkId}, 'Escola Desfeita')`;
        throw new Error('falhou depois de escrever nas duas tabelas');
      }),
    );

    expect(error.message).toBe('falhou depois de escrever nas duas tabelas');
    expect(await networkExists(networkId)).toBe(false);
    expect(await schoolExists(schoolId)).toBe(false);
  });

  test('desfaz também a alteração de linha que já existia antes da transação', async () => {
    const network = await createNetwork({ name: 'Nome Original' });
    const schoolId = crypto.randomUUID();

    await captureError(() =>
      unitOfWork(async ({ sql }) => {
        await sql`UPDATE network SET name = 'Nome Trocado' WHERE id = ${network.id}`;
        await sql`INSERT INTO school (id, network_id, name) VALUES (${schoolId}, ${network.id}, 'Escola Nova')`;
        throw new Error('falhou depois do update e do insert');
      }),
    );

    expect(await networkName(network.id)).toBe('Nome Original');
    expect(await schoolExists(schoolId)).toBe(false);
  });

  test('propaga a exceção original de quem chamou, sem trocá-la por outra', async () => {
    const original = new Error('matrícula ativa já existe no ano letivo');

    const error = await captureError(() =>
      unitOfWork(async () => {
        throw original;
      }),
    );

    expect(error).toBe(original);
  });

  test('desfaz tudo quando quem lança é o próprio banco, por violação de constraint', async () => {
    const networkId = crypto.randomUUID();
    const existing = await createNetwork({ slug: 'slug-disputado' });

    const error = await captureError(() =>
      unitOfWork(async ({ sql }) => {
        await sql`INSERT INTO network (id, name, slug) VALUES (${networkId}, 'Rede Nova', 'rede-nova')`;
        await sql`INSERT INTO network (id, name, slug) VALUES (${crypto.randomUUID()}, 'Rede Repetida', ${existing.slug})`;
      }),
    );

    expect(error.message).toContain('network_slug_unique');
    expect(await networkExists(networkId)).toBe(false);
  });

  test('uma transação que falha não leva embora o que outra já comitou', async () => {
    const committed = crypto.randomUUID();
    const rolledBack = crypto.randomUUID();

    await unitOfWork(async ({ sql }) => {
      await sql`INSERT INTO network (id, name, slug) VALUES (${committed}, 'Rede Firme', 'rede-firme')`;
    });
    await captureError(() =>
      unitOfWork(async ({ sql }) => {
        await sql`INSERT INTO network (id, name, slug) VALUES (${rolledBack}, 'Rede Frágil', 'rede-fragil')`;
        throw new Error('falhou depois da outra transação ter comitado');
      }),
    );

    expect(await networkExists(committed)).toBe(true);
    expect(await networkExists(rolledBack)).toBe(false);
  });
});
