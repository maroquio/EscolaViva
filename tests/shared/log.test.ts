/*
 * I17: o log carrega identificador, nunca conteúdo. Aluno é menor de idade — nome, nascimento,
 * nota e contato do responsável não podem aparecer em linha de log, em profundidade nenhuma.
 * Estes testes são o portão do item "nenhum log contém nome, e-mail, CPF ou nota".
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_LOG_KEYS, redact } from '../../src/shared/log';

const REDACTED = '[redacted]';

/** O mínimo que o contrato exige de `FORBIDDEN_LOG_KEYS`. */
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

describe('redact — o que sai do log', () => {
  test('remove nome, e-mail, senha, senha_hash, cpf e telefone', () => {
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

  test('remove valor de nota e justificativa de falta', () => {
    const fields = { nota: 9.5, valor: 7, notas: [8, 9], justificativa: 'consulta médica' };

    const safe = redact(fields);

    expect(safe).toEqual({
      nota: REDACTED,
      valor: REDACTED,
      notas: REDACTED,
      justificativa: REDACTED,
    });
  });

  test('remove segredo de sessão, url do banco e cabeçalhos de autenticação', () => {
    const fields = {
      session_secret: 'segredo-de-teste-com-mais-de-32-caracteres',
      database_url: 'postgres://escolaviva:senha@localhost:5442/escolaviva',
      authorization: 'Bearer abc',
      cookie: 'ev_sessao=abc',
      'set-cookie': 'ev_sessao=abc; HttpOnly',
    };

    const safe = redact(fields);

    expect(Object.values(safe)).toEqual([REDACTED, REDACTED, REDACTED, REDACTED, REDACTED]);
  });

  test('a lista de chaves proibidas cobre o mínimo do contrato', () => {
    const declared = new Set(FORBIDDEN_LOG_KEYS);

    const missing = CONTRACT_MINIMUM.filter((key) => !declared.has(key));

    expect(missing).toEqual([]);
  });
});

describe('redact — o que fica no log', () => {
  test('preserva aluno_id, usuario_id, rede_id e correlation_id', () => {
    const fields = {
      aluno_id: '3f1b',
      usuario_id: '9c2d',
      rede_id: '77aa',
      correlation_id: 'c-1234',
    };

    const safe = redact(fields);

    expect(safe).toEqual(fields);
  });

  test('preserva identificador ao lado de campo proibido, na mesma linha', () => {
    const fields = { aluno_id: '3f1b', nome: 'Ana Beatriz', turma_id: '55cc' };

    const safe = redact(fields);

    expect(safe).toEqual({ aluno_id: '3f1b', nome: REDACTED, turma_id: '55cc' });
  });

  test('preserva números, nulos e datas que não estão em chave proibida', () => {
    const when = new Date('2026-03-10T12:00:00.000Z');
    const fields = { duracao_ms: 42, ip: null, quando: when };

    const safe = redact(fields);

    expect(safe).toEqual({ duracao_ms: 42, ip: null, quando: when });
  });
});

describe('redact — profundidade e formato', () => {
  test('redige dentro de objeto aninhado', () => {
    const fields = { evento: 'matricula', aluno: { aluno_id: '3f1b', nome: 'Ana Beatriz' } };

    const safe = redact(fields);

    expect(safe).toEqual({ evento: 'matricula', aluno: { aluno_id: '3f1b', nome: REDACTED } });
  });

  test('redige dentro de array de objetos', () => {
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

  test('redige em array dentro de objeto dentro de array', () => {
    const fields = { turmas: [{ turma_id: 't1', alunos: [{ aluno_id: 'a1', nome: 'Ana' }] }] };

    const safe = redact(fields);

    expect(safe).toEqual({
      turmas: [{ turma_id: 't1', alunos: [{ aluno_id: 'a1', nome: REDACTED }] }],
    });
  });

  test('nada sensível escapa nem em ninho muito mais fundo que o limite', () => {
    const background = { nome: 'Ana Beatriz Souza', cpf: '123.456.789-09' };
    const fields = { n1: { n2: { n3: { n4: { n5: { n6: { n7: { n8: background } } } } } } } };

    const safe = redact(fields);

    expect(JSON.stringify(safe)).not.toContain('Ana Beatriz Souza');
    expect(JSON.stringify(safe)).not.toContain('123.456.789-09');
  });
});

describe('redact — robustez', () => {
  test('não muta a entrada', () => {
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

  test('devolve um objeto novo, e não a própria entrada', () => {
    const fields = { aluno_id: '3f1b' };

    const safe = redact(fields);

    expect(safe).not.toBe(fields);
    expect(safe).toEqual(fields);
  });

  test('não estoura em objeto cíclico', () => {
    const cyclic: Record<string, unknown> = { aluno_id: '3f1b', nome: 'Ana Beatriz' };
    cyclic.proprio = cyclic;

    const redactCyclic = (): unknown => redact(cyclic);

    expect(redactCyclic).not.toThrow();
  });

  test('objeto cíclico continua sem vazar o campo proibido', () => {
    const cyclic: Record<string, unknown> = { aluno_id: '3f1b', nome: 'Ana Beatriz' };
    cyclic.proprio = cyclic;

    const safe = redact(cyclic);

    expect(safe.nome).toBe(REDACTED);
    expect(safe.aluno_id).toBe('3f1b');
  });

  test('array cíclico também não estoura', () => {
    const list: unknown[] = [{ aluno_id: '3f1b' }];
    list.push(list);

    const redactList = (): unknown => redact({ lista: list });

    expect(redactList).not.toThrow();
  });

  test('objeto sem campo nenhum vira objeto sem campo nenhum', () => {
    const fields = {};

    const safe = redact(fields);

    expect(safe).toEqual({});
  });
});

describe('redact — comparação de chave', () => {
  test('é insensível a maiúsculas', () => {
    const fields = { Nome: 'Ana', EMAIL: 'ana@escola.test', SeNhA: 'teste-1234' };

    const safe = redact(fields);

    expect(safe).toEqual({ Nome: REDACTED, EMAIL: REDACTED, SeNhA: REDACTED });
  });

  test('é insensível a maiúsculas também em cabeçalho e em ninho', () => {
    const fields = { requisicao: { Authorization: 'Bearer abc', 'Set-Cookie': 'ev_sessao=abc' } };

    const safe = redact(fields);

    expect(safe).toEqual({ requisicao: { Authorization: REDACTED, 'Set-Cookie': REDACTED } });
  });

  test('chave parecida com proibida, mas diferente, continua passando', () => {
    const fields = { nome_da_rota: 'POST /login', total_de_notas: 12, valor_esperado_id: 'v1' };

    const safe = redact(fields);

    expect(safe).toEqual(fields);
  });
});

/*
 * `MINIMO_DO_CONTRATO` acima é uma segunda lista escrita à mão: renomear as duas juntas
 * mantém os testes verdes enquanto a redação para de acontecer. Este caso ancora a denylist
 * no código real — se um campo passar a se chamar `name` e a denylist continuar dizendo
 * `nome`, a entrada fica órfã e isto reprova. É a única rede do repositório com consequência
 * de privacidade, e ela precisa doer antes do vazamento, não depois.
 */
describe('FORBIDDEN_LOG_KEYS — ancoragem no código real', () => {
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

  test('a varredura enxerga o código — cobertura vazia é falha, não sucesso', async () => {
    const sources = await readSources();

    expect(sources.length).toBeGreaterThan(10_000);
  });

  test('nenhuma chave da denylist ficou órfã', async () => {
    const sources = await readSources();

    const orphans = FORBIDDEN_LOG_KEYS.filter(
      (key) => !new RegExp(`\\b${escapeForRegex(key)}\\b`, 'i').test(sources),
    );

    expect(orphans).toEqual([]);
  });
});
