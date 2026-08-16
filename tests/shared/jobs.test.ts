/*
 * I20: o job roda em uma instância por vez. O lock é o advisory lock do PostgreSQL de verdade —
 * com mock ele não provaria nada, porque a garantia é de sessão do banco, não de processo.
 * O agendador, por sua vez, existe para que um expurgo que quebra vire linha de log em vez de
 * derrubar o site.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { startScheduler, withExclusiveLock, type Job } from '../../src/shared/jobs';
import { prepararBanco } from '../support/database';

/** Faixa de chaves só desta suíte: uma por caso, para um teste não disputar o lock do outro. */
const CHAVE_VALOR = 970_101;
const CHAVE_CONCORRENTE = 970_102;
const CHAVE_OUTRA = 970_103;
const CHAVE_SEQUENCIA = 970_104;
const CHAVE_EXCECAO = 970_105;
const CHAVE_PROPAGA = 970_106;
const CHAVE_AGENDADOR = 970_107;
const CHAVE_PARADA = 970_108;
const CHAVE_JOB_QUEBRADO = 970_109;
const CHAVE_JOB_SADIO = 970_110;

const INTERVALO_MS = 30;
const PRAZO_MS = 5000;
const FOLGA_MS = 200;

type Trava = { esperar: Promise<void>; liberar: () => void };

/** Deixa o teste segurar o lock aberto enquanto a segunda chamada tenta entrar. */
function trava(): Trava {
  let liberar: () => void = () => undefined;
  const esperar = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  return { esperar, liberar };
}

async function ateQue(condicao: () => boolean, prazoMs: number): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (!condicao() && Date.now() < limite) {
    await Bun.sleep(5);
  }
}

beforeAll(prepararBanco);

describe('withExclusiveLock', () => {
  test('executa a função e devolve o valor dela', async () => {
    const chave = CHAVE_VALOR;

    const devolvido = await withExclusiveLock(chave, async () => 'expurgou 7 sessões');

    expect(devolvido).toBe('expurgou 7 sessões');
  });

  test('a segunda chamada simultânea com a mesma chave devolve null e não executa a função', async () => {
    const dentro = trava();
    const solte = trava();
    let executouSegunda = false;
    const primeira = withExclusiveLock(CHAVE_CONCORRENTE, async () => {
      dentro.liberar();
      await solte.esperar;
      return 'primeira';
    });
    await dentro.esperar;

    const segunda = await withExclusiveLock(CHAVE_CONCORRENTE, async () => {
      executouSegunda = true;
      return 'segunda';
    });
    solte.liberar();

    expect(segunda).toBeNull();
    expect(executouSegunda).toBe(false);
    expect(await primeira).toBe('primeira');
  });

  test('chaves diferentes não disputam o mesmo lock', async () => {
    const dentro = trava();
    const solte = trava();
    const primeira = withExclusiveLock(CHAVE_CONCORRENTE, async () => {
      dentro.liberar();
      await solte.esperar;
      return 'primeira';
    });
    await dentro.esperar;

    const outra = await withExclusiveLock(CHAVE_OUTRA, async () => 'outra chave');
    solte.liberar();

    expect(outra).toBe('outra chave');
    expect(await primeira).toBe('primeira');
  });

  test('libera o lock ao terminar: a chamada seguinte com a mesma chave entra', async () => {
    const chave = CHAVE_SEQUENCIA;

    const primeira = await withExclusiveLock(chave, async () => 'primeira');
    const segunda = await withExclusiveLock(chave, async () => 'segunda');

    expect(primeira).toBe('primeira');
    expect(segunda).toBe('segunda');
  });

  test('libera o lock mesmo quando a função lança', async () => {
    const chave = CHAVE_EXCECAO;
    const quebrar = withExclusiveLock(chave, async () => {
      throw new Error('expurgo falhou');
    });
    await quebrar.catch(() => undefined);

    const depois = await withExclusiveLock(chave, async () => 'entrou depois da falha');

    expect(depois).toBe('entrou depois da falha');
  });

  test('propaga a exceção da função para quem chamou', async () => {
    const original = new Error('expurgo falhou no meio');

    const quebrar = withExclusiveLock(CHAVE_PROPAGA, async () => {
      throw original;
    });

    await expect(quebrar).rejects.toThrow('expurgo falhou no meio');
  });
});

describe('startScheduler', () => {
  test('executa o job no intervalo configurado', async () => {
    let execucoes = 0;
    const job: Job = {
      name: 'job-de-teste',
      lockKey: CHAVE_AGENDADOR,
      intervalMs: INTERVALO_MS,
      run: async () => {
        execucoes += 1;
      },
    };

    const agendador = startScheduler([job]);
    await ateQue(() => execucoes >= 2, PRAZO_MS);
    agendador.stop();

    expect(execucoes).toBeGreaterThanOrEqual(2);
  });

  test('stop() interrompe as execuções seguintes', async () => {
    let execucoes = 0;
    const job: Job = {
      name: 'job-que-para',
      lockKey: CHAVE_PARADA,
      intervalMs: INTERVALO_MS,
      run: async () => {
        execucoes += 1;
      },
    };
    const agendador = startScheduler([job]);
    await ateQue(() => execucoes >= 1, PRAZO_MS);

    agendador.stop();
    await Bun.sleep(FOLGA_MS);
    const aoParar = execucoes;
    await Bun.sleep(INTERVALO_MS * 6);

    expect(aoParar).toBeGreaterThanOrEqual(1);
    expect(execucoes).toBe(aoParar);
  });

  test('job que lança não derruba o agendador nem impede os outros jobs', async () => {
    let tentativasDoQuebrado = 0;
    let execucoesDoSadio = 0;
    const quebrado: Job = {
      name: 'job-quebrado',
      lockKey: CHAVE_JOB_QUEBRADO,
      intervalMs: INTERVALO_MS,
      run: async () => {
        tentativasDoQuebrado += 1;
        throw new Error('job quebrado de propósito');
      },
    };
    const sadio: Job = {
      name: 'job-sadio',
      lockKey: CHAVE_JOB_SADIO,
      intervalMs: INTERVALO_MS,
      run: async () => {
        execucoesDoSadio += 1;
      },
    };

    const agendador = startScheduler([quebrado, sadio]);
    await ateQue(() => tentativasDoQuebrado >= 2 && execucoesDoSadio >= 2, PRAZO_MS);
    agendador.stop();

    expect(tentativasDoQuebrado).toBeGreaterThanOrEqual(2);
    expect(execucoesDoSadio).toBeGreaterThanOrEqual(2);
  });

  test('sem job nenhum o agendador sobe e para sem quebrar', () => {
    const semJobs: Job[] = [];

    const subirEParar = (): void => startScheduler(semJobs).stop();

    expect(subirEParar).not.toThrow();
  });
});
