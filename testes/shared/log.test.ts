/*
 * I17: o log carrega identificador, nunca conteúdo. Aluno é menor de idade — nome, nascimento,
 * nota e contato do responsável não podem aparecer em linha de log, em profundidade nenhuma.
 * Estes testes são o portão do item "nenhum log contém nome, e-mail, CPF ou nota".
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAVES_PROIBIDAS, redigir } from '../../src/shared/log';

const REDIGIDO = '[redigido]';

/** O mínimo que o contrato exige de `CHAVES_PROIBIDAS`. */
const MINIMO_DO_CONTRATO = [
  'nome',
  'nome_completo',
  'email',
  'senha',
  'senha_hash',
  'cpf',
  'telefone',
  'valor',
  'nota',
  'notas',
  'justificativa',
  'titulo',
  'corpo',
  'data_nascimento',
  'authorization',
  'cookie',
  'set-cookie',
  'session_secret',
  'database_url',
];

describe('redigir — o que sai do log', () => {
  test('remove nome, e-mail, senha, senha_hash, cpf e telefone', () => {
    const campos = {
      nome: 'Ana Beatriz Souza',
      email: 'ana@escola.test',
      senha: 'teste-1234',
      senha_hash: '$argon2id$v=19$m=65536',
      cpf: '123.456.789-09',
      telefone: '(27) 99999-0000',
    };

    const seguros = redigir(campos);

    expect(seguros).toEqual({
      nome: REDIGIDO,
      email: REDIGIDO,
      senha: REDIGIDO,
      senha_hash: REDIGIDO,
      cpf: REDIGIDO,
      telefone: REDIGIDO,
    });
  });

  test('remove valor de nota e justificativa de falta', () => {
    const campos = { nota: 9.5, valor: 7, notas: [8, 9], justificativa: 'consulta médica' };

    const seguros = redigir(campos);

    expect(seguros).toEqual({
      nota: REDIGIDO,
      valor: REDIGIDO,
      notas: REDIGIDO,
      justificativa: REDIGIDO,
    });
  });

  test('remove segredo de sessão, url do banco e cabeçalhos de autenticação', () => {
    const campos = {
      session_secret: 'segredo-de-teste-com-mais-de-32-caracteres',
      database_url: 'postgres://escolaviva:senha@localhost:5442/escolaviva',
      authorization: 'Bearer abc',
      cookie: 'ev_sessao=abc',
      'set-cookie': 'ev_sessao=abc; HttpOnly',
    };

    const seguros = redigir(campos);

    expect(Object.values(seguros)).toEqual([REDIGIDO, REDIGIDO, REDIGIDO, REDIGIDO, REDIGIDO]);
  });

  test('a lista de chaves proibidas cobre o mínimo do contrato', () => {
    const declaradas = new Set(CHAVES_PROIBIDAS);

    const faltando = MINIMO_DO_CONTRATO.filter((chave) => !declaradas.has(chave));

    expect(faltando).toEqual([]);
  });
});

describe('redigir — o que fica no log', () => {
  test('preserva aluno_id, usuario_id, rede_id e correlacao_id', () => {
    const campos = {
      aluno_id: '3f1b',
      usuario_id: '9c2d',
      rede_id: '77aa',
      correlacao_id: 'c-1234',
    };

    const seguros = redigir(campos);

    expect(seguros).toEqual(campos);
  });

  test('preserva identificador ao lado de campo proibido, na mesma linha', () => {
    const campos = { aluno_id: '3f1b', nome: 'Ana Beatriz', turma_id: '55cc' };

    const seguros = redigir(campos);

    expect(seguros).toEqual({ aluno_id: '3f1b', nome: REDIGIDO, turma_id: '55cc' });
  });

  test('preserva números, nulos e datas que não estão em chave proibida', () => {
    const quando = new Date('2026-03-10T12:00:00.000Z');
    const campos = { duracao_ms: 42, ip: null, quando };

    const seguros = redigir(campos);

    expect(seguros).toEqual({ duracao_ms: 42, ip: null, quando });
  });
});

describe('redigir — profundidade e formato', () => {
  test('redige dentro de objeto aninhado', () => {
    const campos = { evento: 'matricula', aluno: { aluno_id: '3f1b', nome: 'Ana Beatriz' } };

    const seguros = redigir(campos);

    expect(seguros).toEqual({ evento: 'matricula', aluno: { aluno_id: '3f1b', nome: REDIGIDO } });
  });

  test('redige dentro de array de objetos', () => {
    const campos = {
      linhas: [
        { matricula_id: 'm1', nota: 9 },
        { matricula_id: 'm2', nota: 4 },
      ],
    };

    const seguros = redigir(campos);

    expect(seguros).toEqual({
      linhas: [
        { matricula_id: 'm1', nota: REDIGIDO },
        { matricula_id: 'm2', nota: REDIGIDO },
      ],
    });
  });

  test('redige em array dentro de objeto dentro de array', () => {
    const campos = { turmas: [{ turma_id: 't1', alunos: [{ aluno_id: 'a1', nome: 'Ana' }] }] };

    const seguros = redigir(campos);

    expect(seguros).toEqual({
      turmas: [{ turma_id: 't1', alunos: [{ aluno_id: 'a1', nome: REDIGIDO }] }],
    });
  });

  test('nada sensível escapa nem em ninho muito mais fundo que o limite', () => {
    const fundo = { nome: 'Ana Beatriz Souza', cpf: '123.456.789-09' };
    const campos = { n1: { n2: { n3: { n4: { n5: { n6: { n7: { n8: fundo } } } } } } } };

    const seguros = redigir(campos);

    expect(JSON.stringify(seguros)).not.toContain('Ana Beatriz Souza');
    expect(JSON.stringify(seguros)).not.toContain('123.456.789-09');
  });
});

describe('redigir — robustez', () => {
  test('não muta a entrada', () => {
    const campos = {
      aluno_id: '3f1b',
      nome: 'Ana Beatriz',
      responsavel: { email: 'mae@escola.test' },
      linhas: [{ nota: 9 }],
    };
    const copia = structuredClone(campos);

    redigir(campos);

    expect(campos).toEqual(copia);
  });

  test('devolve um objeto novo, e não a própria entrada', () => {
    const campos = { aluno_id: '3f1b' };

    const seguros = redigir(campos);

    expect(seguros).not.toBe(campos);
    expect(seguros).toEqual(campos);
  });

  test('não estoura em objeto cíclico', () => {
    const ciclico: Record<string, unknown> = { aluno_id: '3f1b', nome: 'Ana Beatriz' };
    ciclico.proprio = ciclico;

    const redigirCiclico = (): unknown => redigir(ciclico);

    expect(redigirCiclico).not.toThrow();
  });

  test('objeto cíclico continua sem vazar o campo proibido', () => {
    const ciclico: Record<string, unknown> = { aluno_id: '3f1b', nome: 'Ana Beatriz' };
    ciclico.proprio = ciclico;

    const seguros = redigir(ciclico);

    expect(seguros.nome).toBe(REDIGIDO);
    expect(seguros.aluno_id).toBe('3f1b');
  });

  test('array cíclico também não estoura', () => {
    const lista: unknown[] = [{ aluno_id: '3f1b' }];
    lista.push(lista);

    const redigirLista = (): unknown => redigir({ lista });

    expect(redigirLista).not.toThrow();
  });

  test('objeto sem campo nenhum vira objeto sem campo nenhum', () => {
    const campos = {};

    const seguros = redigir(campos);

    expect(seguros).toEqual({});
  });
});

describe('redigir — comparação de chave', () => {
  test('é insensível a maiúsculas', () => {
    const campos = { Nome: 'Ana', EMAIL: 'ana@escola.test', SeNhA: 'teste-1234' };

    const seguros = redigir(campos);

    expect(seguros).toEqual({ Nome: REDIGIDO, EMAIL: REDIGIDO, SeNhA: REDIGIDO });
  });

  test('é insensível a maiúsculas também em cabeçalho e em ninho', () => {
    const campos = { requisicao: { Authorization: 'Bearer abc', 'Set-Cookie': 'ev_sessao=abc' } };

    const seguros = redigir(campos);

    expect(seguros).toEqual({ requisicao: { Authorization: REDIGIDO, 'Set-Cookie': REDIGIDO } });
  });

  test('chave parecida com proibida, mas diferente, continua passando', () => {
    const campos = { nome_da_rota: 'POST /login', total_de_notas: 12, valor_esperado_id: 'v1' };

    const seguros = redigir(campos);

    expect(seguros).toEqual(campos);
  });
});

/*
 * `MINIMO_DO_CONTRATO` acima é uma segunda lista escrita à mão: renomear as duas juntas
 * mantém os testes verdes enquanto a redação para de acontecer. Este caso ancora a denylist
 * no código real — se um campo passar a se chamar `name` e a denylist continuar dizendo
 * `nome`, a entrada fica órfã e isto reprova. É a única rede do repositório com consequência
 * de privacidade, e ela precisa doer antes do vazamento, não depois.
 */
describe('CHAVES_PROIBIDAS — ancoragem no código real', () => {
  const PADROES_DE_FONTE = ['src/**/*.ts', 'src/**/*.eta', 'migrations/*.sql'] as const;

  const escaparParaRegex = (texto: string): string => texto.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const lerFontes = async (): Promise<string> => {
    const raiz = fileURLToPath(new URL('../..', import.meta.url));
    const partes: string[] = [];
    for (const padrao of PADROES_DE_FONTE) {
      for await (const arquivo of new Bun.Glob(padrao).scan({ cwd: raiz })) {
        partes.push(await Bun.file(join(raiz, arquivo)).text());
      }
    }
    return partes.join('\n');
  };

  test('a varredura enxerga o código — cobertura vazia é falha, não sucesso', async () => {
    const fontes = await lerFontes();

    expect(fontes.length).toBeGreaterThan(10_000);
  });

  test('nenhuma chave da denylist ficou órfã', async () => {
    const fontes = await lerFontes();

    const orfas = CHAVES_PROIBIDAS.filter(
      (chave) => !new RegExp(`\\b${escaparParaRegex(chave)}\\b`, 'i').test(fontes),
    );

    expect(orfas).toEqual([]);
  });
});
