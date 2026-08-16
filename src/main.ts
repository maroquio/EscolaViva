import { IDENTITY_LOG_EVENTS, SESSION_PURGE, identity } from './identity';
import { config } from './shared/config';
import { LOCK_KEYS, MINUTE_MS, PROCESS_MESSAGES, SERVER, TIME } from './shared/constants';
import { closeDatabase } from './shared/db';
import { startScheduler, type Job } from './shared/jobs';
import { logger } from './shared/log';
import { app } from './web/app';

const DRAIN_OUTCOME = { drained: 'drained', timedOut: 'timedOut' } as const;

const sessionPurge: Job = {
  name: SESSION_PURGE.name,
  lockKey: LOCK_KEYS.sessionPurge,
  intervalMs: SESSION_PURGE.intervalInMinutes * MINUTE_MS,
  async run(): Promise<void> {
    const removed = await identity.purgeExpiredSessions();
    logger.info(
      { job: SESSION_PURGE.name, removed },
      IDENTITY_LOG_EVENTS.expiredSessionsRemoved,
    );
  },
};

const idleSeconds = (timeoutMs: number): number =>
  Math.min(
    Math.max(1, Math.ceil(timeoutMs / TIME.msPerSecond)),
    SERVER.maxIdleSeconds,
  );

const server = Bun.serve({
  port: config.port,
  idleTimeout: idleSeconds(config.httpTimeoutMs),
  fetch: app.fetch,
});

const scheduler = startScheduler([sessionPurge]);

logger.info(
  {
    port: server.port,
    environment: config.environment,
    idle_s: idleSeconds(config.httpTimeoutMs),
    jobs: [sessionPurge.name],
  },
  PROCESS_MESSAGES.up,
);

async function awaitDrain(drain: Promise<void>): Promise<void> {
  const deadline = config.httpTimeoutMs + SERVER.drainGraceMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<typeof DRAIN_OUTCOME.timedOut>((resolve) => {
    timer = setTimeout(() => resolve(DRAIN_OUTCOME.timedOut), deadline);
  });

  try {
    const outcome = await Promise.race([
      drain.then(() => DRAIN_OUTCOME.drained),
      timedOut,
    ]);
    if (outcome === DRAIN_OUTCOME.drained) return;
  } finally {
    clearTimeout(timer);
  }

  logger.warn(
    { pending: server.pendingRequests, deadline_ms: deadline },
    PROCESS_MESSAGES.drainTimedOut,
  );
  await server.stop(true);
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(
    { signal, pending: server.pendingRequests },
    PROCESS_MESSAGES.shutdownStarted,
  );

  const drain = server.stop(false);
  scheduler.stop();
  await awaitDrain(drain);
  await closeDatabase();

  logger.info({ signal }, PROCESS_MESSAGES.shutdownCompleted);
  process.exit(0);
}

for (const signal of SERVER.shutdownSignals) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
