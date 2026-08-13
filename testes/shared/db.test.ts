/*
 * I15 e I21 contra o PostgreSQL de verdade. `leitura()`/`escrita()` existem para que cada
 * consulta declare sua intenção, e `unidadeDeTrabalho` é o único ponto de commit da aplicação:
 * se ela deixasse escapar uma escrita já comitada quando o caso de uso falha no meio, a
 * transferência criaria a matrícula de destino sem encerrar a de origem.
 */

import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { escrita, leitura, unidadeDeTrabalho, verificarBanco } from '../../src/shared/db';
import { limparBanco, prepararBanco, sqlDeTeste } from '../apoio/banco';
import { criarRede } from '../apoio/fabricas';

const RAIZ = resolve(import.meta.dir, '..', '..');
const MODULO_DB = resolve(RAIZ, 'src', 'shared', 'db', 'index.ts');
/** Porta sem nada escutando: a conexão é recusada na hora. */
const URL_INVALIDA = 'postgres://ninguem:nada@127.0.0.1:5599/inexistente';
/** Endereço que não roteia: a conexão fica pendurada até o prazo vencer. */
const URL_SEM_RESPOSTA = 'postgres://ninguem:nada@10.255.255.1:5432/inexistente';
const PRAZO_CURTO_MS = 300;
const PRAZO_FOLGADO_MS = 5000;

/**
 * Alguns comportamentos só aparecem com outra configuração de banco ou fechando o pool — as
 * duas coisas contaminariam os arquivos de teste seguintes, que rodam no mesmo processo. Por
 * isso este punhado de casos roda em um processo separado, com o ambiente que o caso precisa.
 */
async function rodarComOutroBanco(codigo: string, databaseUrl: string): Promise<string> {
  // O processo auxiliar termina sozinho: a tentativa de conexão pendurada de um banco que não
  // responde continua viva depois de `verificarBanco` já ter devolvido — é justamente o que
  // prova que a verificação não espera pela conexão.
  const programa = [
    `const db = await import(${JSON.stringify(MODULO_DB)});`,
    codigo,
    'process.exit(0);',
  ].join('\n');
  const processo = Bun.spawn({
    cmd: ['bun', '-e', programa],
    cwd: RAIZ,
    env: { ...Bun.env, DATABASE_URL: databaseUrl, APP_ENV: 'test' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const saida = await new Response(processo.stdout).text();
  const erro = await new Response(processo.stderr).text();
  const codigoDeSaida = await processo.exited;
  if (codigoDeSaida !== 0) {
    throw new Error(`processo auxiliar terminou em ${codigoDeSaida}: ${erro}`);
  }
  return saida.trim();
}

async function existeRede(id: string): Promise<boolean> {
  const linhas = await sqlDeTeste()<{ id: string }[]>`SELECT id FROM rede WHERE id = ${id}`;
  return linhas.length === 1;
}

async function existeUnidade(id: string): Promise<boolean> {
  const linhas = await sqlDeTeste()<{ id: string }[]>`SELECT id FROM unidade WHERE id = ${id}`;
  return linhas.length === 1;
}

async function nomeDaRede(id: string): Promise<string | null> {
  const linhas = await sqlDeTeste()<{ nome: string }[]>`SELECT nome FROM rede WHERE id = ${id}`;
  return linhas[0]?.nome ?? null;
}

/** Devolve o erro que a função lançou; falha o teste se ela tiver funcionado. */
async function capturarErro(executar: () => Promise<unknown>): Promise<Error> {
  try {
    await executar();
  } catch (erro) {
    return erro instanceof Error ? erro : new Error(String(erro));
  }
  throw new Error('a operação foi concluída quando deveria ter falhado');
}

beforeAll(prepararBanco);
beforeEach(limparBanco);

describe('leitura e escrita', () => {
  test('leitura() responde uma consulta', async () => {
    const conexao = leitura();

    const linhas = await conexao<{ um: number }[]>`SELECT 1 AS um`;

    expect(linhas[0]?.um).toBe(1);
  });

  test('escrita() responde uma consulta', async () => {
    const conexao = escrita();

    const linhas = await conexao<{ um: number }[]>`SELECT 1 AS um`;

    expect(linhas[0]?.um).toBe(1);
  });

  test('no estágio 01 as duas apontam para o mesmo primário', () => {
    const deLeitura = leitura();

    const deEscrita = escrita();

    expect(deLeitura).toBe(deEscrita);
  });

  test('escrita() enxerga o que a suíte gravou no banco', async () => {
    const rede = await criarRede({ nome: 'Rede da Conexão' });

    const linhas = await escrita()<{ nome: string }[]>`SELECT nome FROM rede WHERE id = ${rede.id}`;

    expect(linhas[0]?.nome).toBe('Rede da Conexão');
  });
});

describe('verificarBanco', () => {
  test('devolve true com o banco de pé', async () => {
    const prazo = PRAZO_FOLGADO_MS;

    const respondeu = await verificarBanco(prazo);

    expect(respondeu).toBe(true);
  });

  test('devolve false quando a URL do banco é inválida e o prazo é curto', async () => {
    const prazo = PRAZO_CURTO_MS;

    const saida = await rodarComOutroBanco(
      `console.log(await db.verificarBanco(${prazo}));`,
      URL_INVALIDA,
    );

    expect(saida).toBe('false');
  });

  test('não pendura a rota quando o banco não responde: vence o prazo', async () => {
    const medir = [
      'const inicio = Date.now();',
      `const respondeu = await db.verificarBanco(${PRAZO_CURTO_MS});`,
      'console.log(JSON.stringify({ respondeu, ms: Date.now() - inicio }));',
    ].join('\n');

    const saida = await rodarComOutroBanco(medir, URL_SEM_RESPOSTA);

    const medicao = JSON.parse(saida) as { respondeu: boolean; ms: number };
    expect(medicao.respondeu).toBe(false);
    expect(medicao.ms).toBeLessThan(PRAZO_FOLGADO_MS);
  });
});

describe('encerrar', () => {
  test('fecha o pool sem erro, mesmo chamado duas vezes', async () => {
    const encerrarDuasVezes = 'await db.encerrar(); await db.encerrar(); console.log("encerrado");';

    const saida = await rodarComOutroBanco(encerrarDuasVezes, URL_INVALIDA);

    expect(saida).toBe('encerrado');
  });
});

describe('unidadeDeTrabalho — caminho feliz', () => {
  test('comita o que a função escreveu', async () => {
    const redeId = crypto.randomUUID();

    await unidadeDeTrabalho(async ({ sql }) => {
      await sql`INSERT INTO rede (id, nome, slug) VALUES (${redeId}, 'Rede Comitada', 'rede-comitada')`;
    });

    expect(await existeRede(redeId)).toBe(true);
  });

  test('devolve o valor produzido pela função', async () => {
    const esperado = { matriculaId: 'm-1', situacao: 'ativa' };

    const devolvido = await unidadeDeTrabalho(async () => esperado);

    expect(devolvido).toEqual(esperado);
  });

  test('comita escritas em duas tabelas diferentes de uma vez só', async () => {
    const redeId = crypto.randomUUID();
    const unidadeId = crypto.randomUUID();

    await unidadeDeTrabalho(async ({ sql }) => {
      await sql`INSERT INTO rede (id, nome, slug) VALUES (${redeId}, 'Rede Dupla', 'rede-dupla')`;
      await sql`INSERT INTO unidade (id, rede_id, nome) VALUES (${unidadeId}, ${redeId}, 'Escola Central')`;
    });

    expect(await existeRede(redeId)).toBe(true);
    expect(await existeUnidade(unidadeId)).toBe(true);
  });

  test('a escrita só fica visível para outra conexão depois do commit', async () => {
    const redeId = crypto.randomUUID();
    let visivelDuranteATransacao = true;

    await unidadeDeTrabalho(async ({ sql }) => {
      await sql`INSERT INTO rede (id, nome, slug) VALUES (${redeId}, 'Rede em Voo', 'rede-em-voo')`;
      visivelDuranteATransacao = await existeRede(redeId);
    });

    expect(visivelDuranteATransacao).toBe(false);
    expect(await existeRede(redeId)).toBe(true);
  });
});

describe('unidadeDeTrabalho — rollback', () => {
  test('desfaz as escritas em DUAS tabelas quando a função lança', async () => {
    const redeId = crypto.randomUUID();
    const unidadeId = crypto.randomUUID();

    const erro = await capturarErro(() =>
      unidadeDeTrabalho(async ({ sql }) => {
        await sql`INSERT INTO rede (id, nome, slug) VALUES (${redeId}, 'Rede Desfeita', 'rede-desfeita')`;
        await sql`INSERT INTO unidade (id, rede_id, nome) VALUES (${unidadeId}, ${redeId}, 'Escola Desfeita')`;
        throw new Error('falhou depois de escrever nas duas tabelas');
      }),
    );

    expect(erro.message).toBe('falhou depois de escrever nas duas tabelas');
    expect(await existeRede(redeId)).toBe(false);
    expect(await existeUnidade(unidadeId)).toBe(false);
  });

  test('desfaz também a alteração de linha que já existia antes da transação', async () => {
    const rede = await criarRede({ nome: 'Nome Original' });
    const unidadeId = crypto.randomUUID();

    await capturarErro(() =>
      unidadeDeTrabalho(async ({ sql }) => {
        await sql`UPDATE rede SET nome = 'Nome Trocado' WHERE id = ${rede.id}`;
        await sql`INSERT INTO unidade (id, rede_id, nome) VALUES (${unidadeId}, ${rede.id}, 'Escola Nova')`;
        throw new Error('falhou depois do update e do insert');
      }),
    );

    expect(await nomeDaRede(rede.id)).toBe('Nome Original');
    expect(await existeUnidade(unidadeId)).toBe(false);
  });

  test('propaga a exceção original de quem chamou, sem trocá-la por outra', async () => {
    const original = new Error('matrícula ativa já existe no ano letivo');

    const erro = await capturarErro(() =>
      unidadeDeTrabalho(async () => {
        throw original;
      }),
    );

    expect(erro).toBe(original);
  });

  test('desfaz tudo quando quem lança é o próprio banco, por violação de constraint', async () => {
    const redeId = crypto.randomUUID();
    const existente = await criarRede({ slug: 'slug-disputado' });

    const erro = await capturarErro(() =>
      unidadeDeTrabalho(async ({ sql }) => {
        await sql`INSERT INTO rede (id, nome, slug) VALUES (${redeId}, 'Rede Nova', 'rede-nova')`;
        await sql`INSERT INTO rede (id, nome, slug) VALUES (${crypto.randomUUID()}, 'Rede Repetida', ${existente.slug})`;
      }),
    );

    expect(erro.message).toContain('rede_slug_unico');
    expect(await existeRede(redeId)).toBe(false);
  });

  test('uma transação que falha não leva embora o que outra já comitou', async () => {
    const comitada = crypto.randomUUID();
    const desfeita = crypto.randomUUID();

    await unidadeDeTrabalho(async ({ sql }) => {
      await sql`INSERT INTO rede (id, nome, slug) VALUES (${comitada}, 'Rede Firme', 'rede-firme')`;
    });
    await capturarErro(() =>
      unidadeDeTrabalho(async ({ sql }) => {
        await sql`INSERT INTO rede (id, nome, slug) VALUES (${desfeita}, 'Rede Frágil', 'rede-fragil')`;
        throw new Error('falhou depois da outra transação ter comitado');
      }),
    );

    expect(await existeRede(comitada)).toBe(true);
    expect(await existeRede(desfeita)).toBe(false);
  });
});
