/*
 * I20: o job roda em uma instância por vez. O lock é o advisory lock do PostgreSQL de verdade —
 * com mock ele não provaria nada, porque a garantia é de sessão do banco, não de processo.
 * O agendador, por sua vez, existe para que um expurgo que quebra vire linha de log em vez de
 * derrubar o site.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { startScheduler, withExclusiveLock, type Job } from '../../src/shared/jobs';
import { prepareDatabase } from '../support/database';

/** Faixa de chaves só desta suíte: uma por caso, para um teste não disputar o lock do outro. */
const VALUE_KEY = 970_101;
const CONCURRENT_KEY = 970_102;
const OTHER_KEY = 970_103;
const SEQUENCE_KEY = 970_104;
const EXCEPTION_KEY = 970_105;
const PROPAGATION_KEY = 970_106;
const SCHEDULER_KEY = 970_107;
const STOP_KEY = 970_108;
const BROKEN_JOB_KEY = 970_109;
const HEALTHY_JOB_KEY = 970_110;

const INTERVALO_MS = 30;
const DEADLINE_MS = 5000;
const SLACK_MS = 200;

type Latch = { wait: Promise<void>; release: () => void };

/** Deixa o teste segurar o lock aberto enquanto a segunda chamada tenta entrar. */
function latch(): Latch {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

async function until(condition: () => boolean, deadlineMs: number): Promise<void> {
  const limit = Date.now() + deadlineMs;
  while (!condition() && Date.now() < limit) {
    await Bun.sleep(5);
  }
}

beforeAll(prepareDatabase);

describe('withExclusiveLock', () => {
  test('executa a função e devolve o valor dela', async () => {
    const key = VALUE_KEY;

    const returned = await withExclusiveLock(key, async () => 'expurgou 7 sessões');

    expect(returned).toBe('expurgou 7 sessões');
  });

  test('a segunda chamada simultânea com a mesma chave devolve null e não executa a função', async () => {
    const inside = latch();
    const release = latch();
    let ranSecondTime = false;
    const first = withExclusiveLock(CONCURRENT_KEY, async () => {
      inside.release();
      await release.wait;
      return 'primeira';
    });
    await inside.wait;

    const second = await withExclusiveLock(CONCURRENT_KEY, async () => {
      ranSecondTime = true;
      return 'segunda';
    });
    release.release();

    expect(second).toBeNull();
    expect(ranSecondTime).toBe(false);
    expect(await first).toBe('primeira');
  });

  test('chaves diferentes não disputam o mesmo lock', async () => {
    const inside = latch();
    const release = latch();
    const first = withExclusiveLock(CONCURRENT_KEY, async () => {
      inside.release();
      await release.wait;
      return 'primeira';
    });
    await inside.wait;

    const other = await withExclusiveLock(OTHER_KEY, async () => 'outra chave');
    release.release();

    expect(other).toBe('outra chave');
    expect(await first).toBe('primeira');
  });

  test('libera o lock ao terminar: a chamada seguinte com a mesma chave entra', async () => {
    const key = SEQUENCE_KEY;

    const first = await withExclusiveLock(key, async () => 'primeira');
    const second = await withExclusiveLock(key, async () => 'segunda');

    expect(first).toBe('primeira');
    expect(second).toBe('segunda');
  });

  test('libera o lock mesmo quando a função lança', async () => {
    const key = EXCEPTION_KEY;
    const breakIt = withExclusiveLock(key, async () => {
      throw new Error('expurgo falhou');
    });
    await breakIt.catch(() => undefined);

    const after = await withExclusiveLock(key, async () => 'entrou depois da falha');

    expect(after).toBe('entrou depois da falha');
  });

  test('propaga a exceção da função para quem chamou', async () => {
    const original = new Error('expurgo falhou no meio');

    const breakIt = withExclusiveLock(PROPAGATION_KEY, async () => {
      throw original;
    });

    await expect(breakIt).rejects.toThrow('expurgo falhou no meio');
  });
});

describe('startScheduler', () => {
  test('executa o job no intervalo configurado', async () => {
    let runs = 0;
    const job: Job = {
      name: 'job-de-teste',
      lockKey: SCHEDULER_KEY,
      intervalMs: INTERVALO_MS,
      run: async () => {
        runs += 1;
      },
    };

    const scheduler = startScheduler([job]);
    await until(() => runs >= 2, DEADLINE_MS);
    scheduler.stop();

    expect(runs).toBeGreaterThanOrEqual(2);
  });

  test('stop() interrompe as execuções seguintes', async () => {
    let runs = 0;
    const job: Job = {
      name: 'job-que-para',
      lockKey: STOP_KEY,
      intervalMs: INTERVALO_MS,
      run: async () => {
        runs += 1;
      },
    };
    const scheduler = startScheduler([job]);
    await until(() => runs >= 1, DEADLINE_MS);

    scheduler.stop();
    await Bun.sleep(SLACK_MS);
    const onStop = runs;
    await Bun.sleep(INTERVALO_MS * 6);

    expect(onStop).toBeGreaterThanOrEqual(1);
    expect(runs).toBe(onStop);
  });

  test('job que lança não derruba o agendador nem impede os outros jobs', async () => {
    let attemptsOfTheBrokenJob = 0;
    let runsOfTheHealthyJob = 0;
    const broken: Job = {
      name: 'job-quebrado',
      lockKey: BROKEN_JOB_KEY,
      intervalMs: INTERVALO_MS,
      run: async () => {
        attemptsOfTheBrokenJob += 1;
        throw new Error('job quebrado de propósito');
      },
    };
    const healthy: Job = {
      name: 'job-sadio',
      lockKey: HEALTHY_JOB_KEY,
      intervalMs: INTERVALO_MS,
      run: async () => {
        runsOfTheHealthyJob += 1;
      },
    };

    const scheduler = startScheduler([broken, healthy]);
    await until(() => attemptsOfTheBrokenJob >= 2 && runsOfTheHealthyJob >= 2, DEADLINE_MS);
    scheduler.stop();

    expect(attemptsOfTheBrokenJob).toBeGreaterThanOrEqual(2);
    expect(runsOfTheHealthyJob).toBeGreaterThanOrEqual(2);
  });

  test('sem job nenhum o agendador sobe e para sem quebrar', () => {
    const withoutJobs: Job[] = [];

    const startAndStop = (): void => startScheduler(withoutJobs).stop();

    expect(startAndStop).not.toThrow();
  });
});
