import type { Connection } from './connection';

export async function lockTermForWriting(
  sql: Connection,
  classGroupId: string,
  term: number,
): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${classGroupId}:${term}`}, 0))`;
}
