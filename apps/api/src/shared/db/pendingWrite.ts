import { AsyncLocalStorage } from 'node:async_hooks';
import { INTERNAL_REASONS } from '../constants';
import type { Connection } from './connection';

export type PendingWrite = {
  readonly key: string;
  readonly route: string;
  readonly userId: string;
  claimedByThisRequest: boolean;
  claimedByAnEarlierRequest: boolean;
};

const scope = new AsyncLocalStorage<PendingWrite>();

export class RepeatedWrite extends Error {
  constructor(readonly key: string) {
    super(INTERNAL_REASONS.repeatedWrite);
    this.name = RepeatedWrite.name;
  }
}

export const pendingWrite = (key: string, route: string, userId: string): PendingWrite => ({
  key,
  route,
  userId,
  claimedByThisRequest: false,
  claimedByAnEarlierRequest: false,
});

export function withPendingWrite<T>(pending: PendingWrite, fn: () => Promise<T>): Promise<T> {
  return scope.run(pending, fn);
}

export async function claimPendingWriteInTransaction(sql: Connection): Promise<boolean> {
  const pending = scope.getStore();
  if (pending === undefined || pending.claimedByThisRequest) return false;

  const claimed = await sql<{ idempotency_key: string }[]>`
    INSERT INTO idempotent_request (idempotency_key, route, user_id, response_hash, response_location)
    VALUES (${pending.key}, ${pending.route}, ${pending.userId}, '', '')
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING idempotency_key`;

  if (claimed.length === 0) {
    pending.claimedByAnEarlierRequest = true;
    throw new RepeatedWrite(pending.key);
  }
  return true;
}

export function markClaimSurvivedTheCommit(): void {
  const pending = scope.getStore();
  if (pending !== undefined) pending.claimedByThisRequest = true;
}
