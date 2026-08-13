import { escrita } from '../db';

/**
 * I20: o job roda em uma instância por vez. Com um servidor o lock é redundante; com seis é o
 * que impede o mesmo expurgo de rodar seis vezes no mesmo minuto.
 * A conexão é reservada porque `pg_try_advisory_lock` e `pg_advisory_unlock` precisam acontecer
 * na mesma sessão do Postgres, e o pool não garante isso entre duas consultas.
 * Devolve `null` quando a chave já está tomada — não é erro, é a outra instância trabalhando.
 */
export async function comLockExclusivo<T>(chave: number, fn: () => Promise<T>): Promise<T | null> {
  const conexao = await escrita().reserve();
  try {
    // `::bigint` fixa a sobrecarga da função de lock, que também existe em duas metades int4.
    const [linha] = await conexao<
      { obtido: boolean }[]
    >`SELECT pg_try_advisory_lock(${chave}::bigint) AS obtido`;
    if (linha?.obtido !== true) return null;
    try {
      return await fn();
    } finally {
      await conexao`SELECT pg_advisory_unlock(${chave}::bigint)`;
    }
  } finally {
    conexao.release();
  }
}
