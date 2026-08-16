import { escrita } from '../db';

export async function comLockExclusivo<T>(chave: number, fn: () => Promise<T>): Promise<T | null> {
  const conexao = await escrita().reserve();
  try {
    const [linha] = await conexao<
      { acquired: boolean }[]
    >`SELECT pg_try_advisory_lock(${chave}::bigint) AS acquired`;
    if (linha?.acquired !== true) return null;
    try {
      return await fn();
    } finally {
      await conexao`SELECT pg_advisory_unlock(${chave}::bigint)`;
    }
  } finally {
    conexao.release();
  }
}
