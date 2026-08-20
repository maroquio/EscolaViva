import { PROCESS_MESSAGES } from '../constants';
import { logger } from '../log';
import { withExclusiveLock } from './lock';

export type Job = {
  name: string;
  lockKey: number;
  intervalMs: number;
  run(): Promise<void>;
};

export function startScheduler(jobs: Job[]): { stop(): Promise<void> } {
  const inFlight = new Set<Promise<void>>();

  const timers = jobs.map((job) => {
    const timer = setInterval(() => {
      const running = runJob(job).finally(() => inFlight.delete(running));
      inFlight.add(running);
    }, job.intervalMs);
    timer.unref();
    return timer;
  });

  return {
    async stop(): Promise<void> {
      for (const timer of timers) clearInterval(timer);
      await Promise.allSettled([...inFlight]);
    },
  };
}

async function runJob(job: Job): Promise<void> {
  try {
    const result = await withExclusiveLock(job.lockKey, () => job.run());
    if (result === null) {
      logger.debug({ job: job.name }, PROCESS_MESSAGES.jobSkipped);
    }
  } catch (error) {
    logger.error({ job: job.name, error: describe(error) }, PROCESS_MESSAGES.jobFailed);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
