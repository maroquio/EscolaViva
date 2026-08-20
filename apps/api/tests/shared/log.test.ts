/*
 * I17: the log carries identifiers, never content. A student is a minor — name, date of birth,
 * grade and guardian contact must not appear in a log line, at any depth. These tests are the gate
 * on the item "no log contains a name, an e-mail, a CPF or a grade".
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
  /*
   * The English spellings are the ones the code emits today; the Portuguese ones are what a
   * database restored from before the translation, or a log line written by an older build,
   * still carries. The denylist holds both, and both are exercised here — a case for one
   * spelling alone would let the other half be deleted without a single test turning red.
   */
  test('strips the fields the code emits today: name, password, phone, grade', () => {
    const fields = {
      name: 'Ana Beatriz Souza',
      email: 'ana@escola.test',
      password: 'teste-1234',
      password_hash: '$argon2id$v=19$m=65536',
      cpf: '123.456.789-09',
      phone: '(27) 99999-0000',
      grade: 9.5,
      birth_date: '2014-03-08',
      title: 'Reunião de pais',
      body: 'A reunião acontece no dia 20.',
    };

    const safe = redact(fields);

    expect(safe).toEqual({
      name: REDACTED,
      email: REDACTED,
      password: REDACTED,
      password_hash: REDACTED,
      cpf: REDACTED,
      phone: REDACTED,
      grade: REDACTED,
      birth_date: REDACTED,
      title: REDACTED,
      body: REDACTED,
    });
  });

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

/*
 * The key list only ever catches what somebody thought to name. A CPF quoted back inside a driver's
 * error message, or a guardian's address pasted into a free-text field, arrives under a key nobody
 * put on the list — `message`, `stack`, `reason` — and used to travel straight through. These cases
 * are the second gate: the value is read, not just the key it sits under.
 */
describe('redact — what the key list could not have foreseen', () => {
  test('strips a CPF out of free text, formatted or bare', () => {
    const redacted = redact({
      reason: 'duplicate key value violates unique constraint: cpf 52998224725 já existe',
      detail: 'o responsável informou 529.982.247-25 no balcão',
    });

    expect(redacted.reason).toBe(
      `duplicate key value violates unique constraint: cpf ${REDACTED} já existe`,
    );
    expect(redacted.detail).toBe(`o responsável informou ${REDACTED} no balcão`);
  });

  /*
   * The connection string is the one secret that arrives already formatted. `database_url` is on the
   * key denylist, which covers the config report — but when the driver fails it puts the whole URL
   * inside `message`, under a key nobody listed, and there only the value patterns act. The e-mail
   * pattern happened to cover a host with a dot in it and nothing else: `localhost` and `database`,
   * the two hosts this repository actually documents, went through with the password intact.
   */
  test('strips the credentials out of a connection string, whatever the host looks like', () => {
    const hosts = ['localhost:5442', 'database:5432', 'db.interno:5432'];

    const redacted = hosts.map((host) =>
      String(
        redact({ message: `falha ao conectar em postgres://escolaviva:senha-secreta@${host}/ev` })
          .message,
      ),
    );

    expect(redacted.filter((line) => line.includes('senha-secreta'))).toEqual([]);
    expect(redacted[0]).toBe(`falha ao conectar em postgres://${REDACTED}@localhost:5442/ev`);
  });

  test('and keeps the host, which is what makes the line worth logging', () => {
    const line = String(
      redact({ message: 'postgres://escolaviva:senha@database:5432/ev recusou a conexão' }).message,
    );

    expect(line).toContain('database:5432');
    expect(line).toContain('recusou a conexão');
  });

  test('strips an e-mail out of free text', () => {
    const redacted = redact({ message: 'falha ao contatar mae.da.ana@familia.br agora' });

    expect(redacted.message).toBe(`falha ao contatar ${REDACTED} agora`);
  });

  test('strips them from a stack trace, at the depth an error arrives with', () => {
    const redacted = redact({
      error: { name: 'PostgresError', stack: 'at insert (cpf=52998224725)\n  at save' },
    });
    const error = redacted.error as { stack: string };

    expect(error.stack).toBe(`at insert (cpf=${REDACTED})\n  at save`);
  });

  test('keeps the part of the line that is worth having', () => {
    const redacted = redact({ message: 'rota /api/v1/registrar/guardians recusou 52998224725' });

    expect(redacted.message).toContain('/api/v1/registrar/guardians');
    expect(redacted.message).not.toContain('52998224725');
  });

  /*
   * The patterns run on every string, so an identifier that merely looks numeric must survive them
   * — otherwise the log loses exactly what I17 says it should keep.
   */
  test('leaves a uuid and an ISO date alone', () => {
    const identifier = '550e8400-e29b-41d4-a716-446655440000';
    const redacted = redact({ student_id: identifier, occurred_on: '2026-08-18' });

    expect(redacted.student_id).toBe(identifier);
    expect(redacted.occurred_on).toBe('2026-08-18');
  });
});

describe('redact — what stays in the log', () => {
  test('keeps student_id, user_id, network_id and correlation_id', () => {
    const fields = {
      student_id: '3f1b',
      user_id: '9c2d',
      network_id: '77aa',
      correlation_id: 'c-1234',
    };

    const safe = redact(fields);

    expect(safe).toEqual(fields);
  });

  test('keeps an identifier sitting next to a forbidden field, on the same line', () => {
    const fields = { student_id: '3f1b', nome: 'Ana Beatriz', class_group_id: '55cc' };

    const safe = redact(fields);

    expect(safe).toEqual({ student_id: '3f1b', nome: REDACTED, class_group_id: '55cc' });
  });

  test('keeps numbers, nulls and dates that are not under a forbidden key', () => {
    const when = new Date('2026-03-10T12:00:00.000Z');
    const fields = { duration_ms: 42, ip: null, when: when };

    const safe = redact(fields);

    expect(safe).toEqual({ duration_ms: 42, ip: null, when: when });
  });
});

describe('redact — depth and shape', () => {
  test('redacts inside a nested object', () => {
    const fields = { event: 'enrollment', student: { student_id: '3f1b', nome: 'Ana Beatriz' } };

    const safe = redact(fields);

    expect(safe).toEqual({ event: 'enrollment', student: { student_id: '3f1b', nome: REDACTED } });
  });

  test('redacts inside an array of objects', () => {
    const fields = {
      rows: [
        { enrollment_id: 'm1', nota: 9 },
        { enrollment_id: 'm2', nota: 4 },
      ],
    };

    const safe = redact(fields);

    expect(safe).toEqual({
      rows: [
        { enrollment_id: 'm1', nota: REDACTED },
        { enrollment_id: 'm2', nota: REDACTED },
      ],
    });
  });

  test('redacts in an array inside an object inside an array', () => {
    const fields = { class_groups: [{ class_group_id: 't1', students: [{ student_id: 'a1', nome: 'Ana' }] }] };

    const safe = redact(fields);

    expect(safe).toEqual({
      class_groups: [{ class_group_id: 't1', students: [{ student_id: 'a1', nome: REDACTED }] }],
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
      student_id: '3f1b',
      nome: 'Ana Beatriz',
      guardian: { email: 'mae@escola.test' },
      rows: [{ nota: 9 }],
    };
    const copy = structuredClone(fields);

    redact(fields);

    expect(fields).toEqual(copy);
  });

  test('gives back a fresh object, not the input itself', () => {
    const fields = { student_id: '3f1b' };

    const safe = redact(fields);

    expect(safe).not.toBe(fields);
    expect(safe).toEqual(fields);
  });

  test('does not blow up on a cyclic object', () => {
    const cyclic: Record<string, unknown> = { student_id: '3f1b', nome: 'Ana Beatriz' };
    cyclic.self = cyclic;

    const redactCyclic = (): unknown => redact(cyclic);

    expect(redactCyclic).not.toThrow();
  });

  test('a cyclic object still leaks no forbidden field', () => {
    const cyclic: Record<string, unknown> = { student_id: '3f1b', nome: 'Ana Beatriz' };
    cyclic.self = cyclic;

    const safe = redact(cyclic);

    expect(safe.nome).toBe(REDACTED);
    expect(safe.student_id).toBe('3f1b');
  });

  test('a cyclic array does not blow up either', () => {
    const list: unknown[] = [{ student_id: '3f1b' }];
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
  const SOURCE_PATTERNS = [
    'apps/api/src/**/*.ts',
    'apps/api/src/**/*.eta',
    'migrations/*.sql',
  ] as const;

  const escapeForRegex = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const readSources = async (): Promise<string> => {
    const root = fileURLToPath(new URL('../../../..', import.meta.url));
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
