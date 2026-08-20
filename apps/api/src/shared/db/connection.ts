import { SQL } from 'bun';
import { config } from '../config';
import { PROCESS_MESSAGES } from '../constants';
import { logger, redact } from '../log';
import { DATABASE } from './constants';

export type Connection = SQL;

let pool: SQL | undefined;

function primary(): Connection {
  pool ??= new SQL({
    url: config.databaseUrl,
    max: DATABASE.maxConnections,
    idleTimeout: DATABASE.idleTimeoutSeconds,
    connectionTimeout: DATABASE.connectionTimeoutSeconds,
  });
  return pool;
}

export function reader(): Connection {
  return primary();
}

export function readerFresh(): Connection {
  return primary();
}

export function writer(): Connection {
  return primary();
}

export async function checkDatabase(timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(DATABASE.timedOutReason), timeoutMs);
  });
  const responded = reader()`SELECT 1`.then(
    () => null,
    (error: unknown) => String(error),
  );
  try {
    const failure = await Promise.race([responded, timedOut]);
    if (failure === null) return true;
    logger.error(redact({ reason: failure }), PROCESS_MESSAGES.databaseUnavailable);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool === undefined) return;
  await pool.close();
}
