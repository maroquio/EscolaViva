import { SQL } from 'bun';
import { config } from '../config';
import { DATABASE } from '../constants';

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

export function writer(): Connection {
  return primary();
}

export async function checkDatabase(timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const responded = reader()`SELECT 1`.then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([responded, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool === undefined) return;
  await pool.close();
}
