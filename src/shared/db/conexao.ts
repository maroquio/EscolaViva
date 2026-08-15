import { SQL } from 'bun';
import { config } from '../config';
import { BANCO } from '../constantes';

/** Conexão com o banco. Todo repositório a recebe como primeiro parâmetro — nunca a obtém sozinho. */
export type Conexao = SQL;

let pool: SQL | undefined;

/** Instância única e preguiçosa: importar este módulo não abre conexão, usar abre. */
function primario(): Conexao {
  pool ??= new SQL({
    url: config.databaseUrl,
    max: BANCO.maxConexoes,
    idleTimeout: BANCO.tempoOciosoSegundos,
    connectionTimeout: BANCO.tempoDeConexaoSegundos,
  });
  return pool;
}

/**
 * I15: leitura e escrita são funções separadas para que cada consulta declare sua intenção.
 * Hoje as duas devolvem o primário; a réplica entra dentro desta função, e nenhuma consulta muda.
 */
export function leitura(): Conexao {
  return primario();
}

/** I15: escrita nunca sai do primário — por isso a escolha é explícita em cada consulta. */
export function escrita(): Conexao {
  return primario();
}

/**
 * I13: `/health` só é verdade se o banco responder. A consulta corre contra um prazo para que
 * um banco fora do ar responda 503 rápido em vez de pendurar a rota.
 */
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

/** Desligamento gracioso: fecha o pool depois que as consultas em curso terminam. */
export async function encerrar(): Promise<void> {
  if (pool === undefined) return;
  await pool.close();
}
