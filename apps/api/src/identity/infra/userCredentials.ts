import type { Connection } from '../../shared/db';
import type { User } from '../domain/user';
import type { UserRow } from './userRepository';

export type Credentials = { user: User; passwordHash: string };

type CredentialsRow = UserRow & { password_hash: string };

const toUser = (row: UserRow): User => ({
  id: row.id,
  networkId: row.network_id,
  name: row.name,
  email: row.email,
  cpf: row.cpf,
  phone: row.phone,
  active: row.active,
});

const credentials = (sql: Connection) => sql`
    SELECT id, network_id, name, email, cpf, phone, active, password_hash
    FROM app_user`;

export async function credentialsByCpf(
  sql: Connection,
  networkId: string,
  cpf: string,
): Promise<Credentials | null> {
  const rows = await sql<CredentialsRow[]>`${credentials(sql)}
    WHERE network_id = ${networkId} AND cpf = ${cpf} AND active
  `;
  const row = rows[0];
  return row === undefined ? null : { user: toUser(row), passwordHash: row.password_hash };
}

export async function credentialsById(
  sql: Connection,
  networkId: string,
  userId: string,
): Promise<Credentials | null> {
  const rows = await sql<CredentialsRow[]>`${credentials(sql)}
    WHERE network_id = ${networkId} AND id = ${userId} AND active
  `;
  const row = rows[0];
  return row === undefined ? null : { user: toUser(row), passwordHash: row.password_hash };
}

export async function updatePassword(
  sql: Connection,
  networkId: string,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await sql`
    UPDATE app_user
    SET password_hash = ${passwordHash}
    WHERE network_id = ${networkId} AND id = ${userId}
  `;
}
