import { SQL } from 'bun';
import { config } from '../config';
import { BANCO } from '../constants';

export type Conexao = SQL;

let pool: SQL | undefined;

function primario(): Conexao {
  pool ??= new SQL({
    url: config.databaseUrl,
    max: BANCO.maxConexoes,
    idleTimeout: BANCO.tempoOciosoSegundos,
    connectionTimeout: BANCO.tempoDeConexaoSegundos,
  });
  return pool;
}

export function leitura(): Conexao {
  return primario();
}

export function escrita(): Conexao {
  return primario();
}

export async function verificarBanco(timeoutMs: number): Promise<boolean> {
  let prazo: ReturnType<typeof setTimeout> | undefined;
  const expirou = new Promise<boolean>((resolver) => {
    prazo = setTimeout(() => resolver(false), timeoutMs);
  });
  const respondeu = leitura()`SELECT 1`.then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([respondeu, expirou]);
  } finally {
    clearTimeout(prazo);
  }
}

export async function encerrar(): Promise<void> {
  if (pool === undefined) return;
  await pool.close();
}
