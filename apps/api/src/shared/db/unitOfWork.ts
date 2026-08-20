import { isRefusal } from '../result';
import { writer, type Connection } from './connection';
import { claimPendingWriteInTransaction, markClaimSurvivedTheCommit } from './pendingWrite';

export type UnitOfWork = { sql: Connection };

class RolledBackRefusal extends Error {
  constructor(readonly result: unknown) {
    super(RolledBackRefusal.name);
    this.name = RolledBackRefusal.name;
  }
}

export async function unitOfWork<T>(fn: (uow: UnitOfWork) => Promise<T>): Promise<T> {
  let claimedHere = false;
  try {
    const value = await writer().begin(async (tx) => {
      claimedHere = await claimPendingWriteInTransaction(tx);
      const result = await fn({ sql: tx });
      if (isRefusal(result)) throw new RolledBackRefusal(result);
      return result;
    });
    if (claimedHere) markClaimSurvivedTheCommit();
    return value;
  } catch (error) {
    if (error instanceof RolledBackRefusal) return error.result as T;
    throw error;
  }
}
