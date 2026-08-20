/*
 * I20: the job runs on one instance at a time. The lock is PostgreSQL's real advisory lock — with
 * a mock it would prove nothing, because the guarantee belongs to the database session, not to the
 * process. The scheduler, in turn, exists so that a purge that breaks becomes a log line instead
 * of taking the site down.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { startScheduler, withExclusiveLock, type Job } from '../../src/shared/jobs';
import { prepareDatabase } from '../support/database';

/** A key range for this suite alone: one per case, so no test fights another for the lock. */
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

/** Lets the test hold the lock open while the second call tries to get in. */
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
  test('runs the function and gives back its value', async () => {
    const key = VALUE_KEY;

    const returned = await withExclusiveLock(key, async () => 'expurgou 7 sessões');

    expect(returned).toBe('expurgou 7 sessões');
  });

  test('a second simultaneous call with the same key gives back null and never runs the function', async () => {
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

  test('different keys do not fight over the same lock', async () => {
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

  test('releases the lock on the way out: the next call with the same key gets in', async () => {
    const key = SEQUENCE_KEY;

    const first = await withExclusiveLock(key, async () => 'primeira');
    const second = await withExclusiveLock(key, async () => 'segunda');

    expect(first).toBe('primeira');
    expect(second).toBe('segunda');
  });

  test('releases the lock even when the function throws', async () => {
    const key = EXCEPTION_KEY;
    const breakIt = withExclusiveLock(key, async () => {
      throw new Error('expurgo falhou');
    });
    await breakIt.catch(() => undefined);

    const after = await withExclusiveLock(key, async () => 'entrou depois da falha');

    expect(after).toBe('entrou depois da falha');
  });

  test('propagates the function\'s exception up to the caller', async () => {
    const original = new Error('expurgo falhou no meio');

    const breakIt = withExclusiveLock(PROPAGATION_KEY, async () => {
      throw original;
    });

    await expect(breakIt).rejects.toThrow('expurgo falhou no meio');
  });
});

describe('startScheduler', () => {
  test('runs the job on the configured interval', async () => {
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

  test('stop() halts the runs that would come next', async () => {
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

  test('a job that throws neither takes the scheduler down nor holds back the other jobs', async () => {
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

  test('with no job at all the scheduler starts and stops without breaking', async () => {
    const withoutJobs: Job[] = [];

    const startAndStop = async (): Promise<void> => {
      await startScheduler(withoutJobs).stop();
    };

    await expect(startAndStop()).resolves.toBeUndefined();
  });

  /*
   * Stopping is not only clearing the timers: a job already running holds a reserved connection and
   * an open transaction, and the shutdown that follows closes the pool. Waiting is what keeps the
   * purge from being cut in half by a deploy.
   */
  test('stopping waits for a job that is already running', async () => {
    let finished = false;
    const slow: Job = {
      name: 'lento',
      lockKey: 987_654,
      intervalMs: 5,
      run: async () => {
        await Bun.sleep(60);
        finished = true;
      },
    };

    const scheduler = startScheduler([slow]);
    await Bun.sleep(20);
    await scheduler.stop();

    expect(finished).toBe(true);
  });
});
