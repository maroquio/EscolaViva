import { escrita, type Conexao } from './conexao';

export type UnidadeDeTrabalho = { sql: Conexao };

/**
 * I21 (preparação): este é o ÚNICO ponto de commit da aplicação. Todo caso de uso que muda
 * estado passa por aqui — abre transação, executa, comita; qualquer exceção desfaz tudo.
 * O INSERT na outbox de eventos, quando existir, entra nesta função e em nenhum outro lugar:
 * é o que impede que a publicação de evento vire uma alteração espalhada por dezenas de casos
 * de uso.
 */
export async function unidadeDeTrabalho<T>(fn: (uow: UnidadeDeTrabalho) => Promise<T>): Promise<T> {
  return await escrita().begin(async (tx) => fn({ sql: tx }));
}
