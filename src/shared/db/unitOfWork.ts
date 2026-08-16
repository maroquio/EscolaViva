import { writer, type Connection } from './connection';

export type UnitOfWork = { sql: Connection };

export async function unitOfWork<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T> {
  return await writer().begin(async (tx) => fn({ sql: tx }));
}
