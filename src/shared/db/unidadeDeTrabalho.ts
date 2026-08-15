import { escrita, type Conexao } from './conexao';

export type UnidadeDeTrabalho = { sql: Conexao };

export async function unidadeDeTrabalho<T>(fn: (uow: UnidadeDeTrabalho) => Promise<T>): Promise<T> {
  return await escrita().begin(async (tx) => fn({ sql: tx }));
}
