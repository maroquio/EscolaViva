/*
 * I17: the log carries identifiers, never content. A student is a minor — name, date of birth,
 * grade and guardian contact must not appear in a log line, at any depth. These tests are the gate
 * on the item "nenhum log contém nome, e-mail, CPF ou nota".
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_LOG_KEYS, redact } from '../../src/shared/log';

const REDACTED = '[redacted]';

/** The least the contract demands of `FORBIDDEN_LOG_KEYS`. */
const CONTRACT_MINIMUM = [
  'nome',
  'name',
  'nome_completo',
  'full_name',
  'aluno_nome',
  'student_name',
  'email',
  'senha',
  'password',
  'senha_hash',
  'password_hash',
  'senha_provisoria',
  'temporary_password',
  'cpf',
  'telefone',
  'phone',
  'valor',
  'value',
  'nota',
  'grade',
  'notas',
  'grades',
  'justificativa',
  'excuse',
  'titulo',
  'title',
  'corpo',
  'body',
  'data_nascimento',
  'birth_date',
  'authorization',
  'cookie',
  'set-cookie',
  'session_secret',
  'database_url',
];

describe('redact — what leaves the log', () => {
  test('strips name, e-mail, password, password hash, CPF and phone', () => {
    const fields = {
      nome: 'Ana Beatriz Souza',
      email: 'ana@escola.test',
      senha: 'teste-1234',
      senha_hash: '$argon2id$v=19$m=65536',
      cpf: '123.456.789-09',
      telefone: '(27) 99999-0000',
    };

    const safe = redact(fields);

    expect(safe).toEqual({
      nome: REDACTED,
      email: REDACTED,
      senha: REDACTED,
      senha_hash: REDACTED,
      cpf: REDACTED,
      telefone: REDACTED,
    });
  });

  test('strips the value of a grade and the excuse for an absence', () => {
    const fields = { nota: 9.5, valor: 7, notas: [8, 9], justificativa: 'consulta médica' };

    const safe = redact(fields);

    expect(safe).toEqual({
      nota: REDACTED,
      valor: REDACTED,
      notas: REDACTED,
      justificativa: REDACTED,
    });
  });

  test('strips the session secret, the database url and the authentication headers', () => {
    const fields = {
      session_secret: 'segredo-de-teste-com-mais-de-32-caracteres',
      database_url: 'postgres://escolaviva:senha@localhost:5442/escolaviva',
      authorization: 'Bearer abc',
      cookie: 'ev_session=abc',
      'set-cookie': 'ev_session=abc; HttpOnly',
    };

    const safe = redact(fields);

    expect(Object.values(safe)).toEqual([REDACTED, REDACTED, REDACTED, REDACTED, REDACTED]);
  });

  test('the list of forbidden keys covers the contract minimum', () => {
    const declared = new Set(FORBIDDEN_LOG_KEYS);

    const missing = CONTRACT_MINIMUM.filter((key) => !declared.has(key));

    expect(missing).toEqual([]);
  });
});

describe('redact — what stays in the log', () => {
  test('keeps aluno_id, usuario_id, rede_id and correlation_id', () => {
    const fields = {
      aluno_id: '3f1b',
      usuario_id: '9c2d',
      rede_id: '77aa',
      correlation_id: 'c-1234',
    };

    const safe = redact(fields);

    expect(safe).toEqual(fields);
  });

  test('keeps an identifier sitting next to a forbidden field, on the same line', () => {
    const fields = { aluno_id: '3f1b', nome: 'Ana Beatriz', turma_id: '55cc' };

    const safe = redact(fields);

    expect(safe).toEqual({ aluno_id: '3f1b', nome: REDACTED, turma_id: '55cc' });
  });

  test('keeps numbers, nulls and dates that are not under a forbidden key', () => {
    const when = new Date('2026-03-10T12:00:00.000Z');
    const fields = { duracao_ms: 42, ip: null, quando: when };

    const safe = redact(fields);

    expect(safe).toEqual({ duracao_ms: 42, ip: null, quando: when });
  });
});

describe('redact — depth and shape', () => {
  test('redacts inside a nested object', () => {
    const fields = { evento: 'matricula', aluno: { aluno_id: '3f1b', nome: 'Ana Beatriz' } };

    const safe = redact(fields);

    expect(safe).toEqual({ evento: 'matricula', aluno: { aluno_id: '3f1b', nome: REDACTED } });
  });

  test('redacts inside an array of objects', () => {
    const fields = {
      linhas: [
        { matricula_id: 'm1', nota: 9 },
        { matricula_id: 'm2', nota: 4 },
      ],
    };

    const safe = redact(fields);

    expect(safe).toEqual({
      linhas: [
        { matricula_id: 'm1', nota: REDACTED },
        { matricula_id: 'm2', nota: REDACTED },
      ],
    });
  });

  test('redacts in an array inside an object inside an array', () => {
    const fields = { turmas: [{ turma_id: 't1', alunos: [{ aluno_id: 'a1', nome: 'Ana' }] }] };

    const safe = redact(fields);

    expect(safe).toEqual({
      turmas: [{ turma_id: 't1', alunos: [{ aluno_id: 'a1', nome: REDACTED }] }],
    });
  });

  test('nothing sensitive escapes, not even from a nest far deeper than the limit', () => {
    const background = { nome: 'Ana Beatriz Souza', cpf: '123.456.789-09' };
    const fields = { n1: { n2: { n3: { n4: { n5: { n6: { n7: { n8: background } } } } } } } };

    const safe = redact(fields);

    expect(JSON.stringify(safe)).not.toContain('Ana Beatriz Souza');
    expect(JSON.stringify(safe)).not.toContain('123.456.789-09');
  });
});

describe('redact — robustness', () => {
  test('does not mutate the input', () => {
    const fields = {
      aluno_id: '3f1b',
      nome: 'Ana Beatriz',
      responsavel: { email: 'mae@escola.test' },
      linhas: [{ nota: 9 }],
    };
    const copy = structuredClone(fields);

    redact(fields);

    expect(fields).toEqual(copy);
  });

  test('gives back a fresh object, not the input itself', () => {
    const fields = { aluno_id: '3f1b' };

    const safe = redact(fields);

    expect(safe).not.toBe(fields);
    expect(safe).toEqual(fields);
  });

  test('does not blow up on a cyclic object', () => {
    const cyclic: Record<string, unknown> = { aluno_id: '3f1b', nome: 'Ana Beatriz' };
    cyclic.proprio = cyclic;

    const redactCyclic = (): unknown => redact(cyclic);

    expect(redactCyclic).not.toThrow();
  });

  test('a cyclic object still leaks no forbidden field', () => {
    const cyclic: Record<string, unknown> = { aluno_id: '3f1b', nome: 'Ana Beatriz' };
    cyclic.proprio = cyclic;

    const safe = redact(cyclic);

    expect(safe.nome).toBe(REDACTED);
    expect(safe.aluno_id).toBe('3f1b');
  });

  test('a cyclic array does not blow up either', () => {
    const list: unknown[] = [{ aluno_id: '3f1b' }];
    list.push(list);

    const redactList = (): unknown => redact({ lista: list });

    expect(redactList).not.toThrow();
  });

  test('an object with no field at all becomes an object with no field at all', () => {
    const fields = {};

    const safe = redact(fields);

    expect(safe).toEqual({});
  });
});

describe('redact — how keys are compared', () => {
  test('is case-insensitive', () => {
    const fields = { Nome: 'Ana', EMAIL: 'ana@escola.test', SeNhA: 'teste-1234' };

    const safe = redact(fields);

    expect(safe).toEqual({ Nome: REDACTED, EMAIL: REDACTED, SeNhA: REDACTED });
  });

  test('is case-insensitive in headers and inside nests too', () => {
    const fields = { requisicao: { Authorization: 'Bearer abc', 'Set-Cookie': 'ev_session=abc' } };

    const safe = redact(fields);

    expect(safe).toEqual({ requisicao: { Authorization: REDACTED, 'Set-Cookie': REDACTED } });
  });

  test('a key that merely looks like a forbidden one still gets through', () => {
    const fields = { nome_da_rota: 'POST /login', total_de_notas: 12, valor_esperado_id: 'v1' };

    const safe = redact(fields);

    expect(safe).toEqual(fields);
  });
});

/*
 * `CONTRACT_MINIMUM` above is a second list written by hand: renaming both together keeps the
 * tests green while the redaction quietly stops happening. This case anchors the denylist to the
 * real code — if a field comes to be called `name` and the denylist keeps saying `nome`, the entry
 * is orphaned and this fails. It is the only net in the repository with a privacy consequence, and
 * it has to hurt before the leak, not after.
 */
describe('FORBIDDEN_LOG_KEYS — anchored to the real code', () => {
  const SOURCE_PATTERNS = ['src/**/*.ts', 'src/**/*.eta', 'migrations/*.sql'] as const;

  const escapeForRegex = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const readSources = async (): Promise<string> => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const parts: string[] = [];
    for (const pattern of SOURCE_PATTERNS) {
      for await (const file of new Bun.Glob(pattern).scan({ cwd: root })) {
        parts.push(await Bun.file(join(root, file)).text());
      }
    }
    return parts.join('\n');
  };

  test('the sweep does see the code — an empty sweep is a failure, not a success', async () => {
    const sources = await readSources();

    expect(sources.length).toBeGreaterThan(10_000);
  });

  test('no key in the denylist was left orphaned', async () => {
    const sources = await readSources();

    const orphans = FORBIDDEN_LOG_KEYS.filter(
      (key) => !new RegExp(`\\b${escapeForRegex(key)}\\b`, 'i').test(sources),
    );

    expect(orphans).toEqual([]);
  });
});
