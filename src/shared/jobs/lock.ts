import { writer } from '../db';

export async function withExclusiveLock<T>(key: number, fn: () => Promise<T>): Promise<T | null> {
  const connection = await writer().reserve();
  try {
    const [row] = await connection<
      { acquired: boolean }[]
    >`SELECT pg_try_advisory_lock(${key}::bigint) AS acquired`;
    if (row?.acquired !== true) return null;
    try {
      return await fn();
    } finally {
      await connection`SELECT pg_advisory_unlock(${key}::bigint)`;
    }
  } finally {
    connection.release();
  }
}
