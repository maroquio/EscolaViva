import type { Connection } from '../../shared/db';
import { toNetworkStatus, type Network } from '../domain/network';
import type { Session } from '../domain/session';
import type { User } from '../domain/user';

export type SessionWithOwner = { session: Session; network: Network; user: User };

type SessionRow = {
  id: string;
  network_id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  ip: string | null;
  network_name: string;
  network_slug: string;
  network_status: string;
  user_name: string;
  user_email: string;
  user_cpf: string;
  user_phone: string | null;
  user_active: boolean;
};

const toSessionWithOwner = (row: SessionRow): SessionWithOwner => ({
  session: {
    id: row.id,
    networkId: row.network_id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ip: row.ip,
  },
  network: {
    id: row.network_id,
    name: row.network_name,
    slug: row.network_slug,
    status: toNetworkStatus(row.network_status),
  },
  user: {
    id: row.user_id,
    networkId: row.network_id,
    name: row.user_name,
    email: row.user_email,
    cpf: row.user_cpf,
    phone: row.user_phone,
    active: row.user_active,
  },
});

export async function byId(sql: Connection, sessionId: string): Promise<SessionWithOwner | null> {
  const rows = await sql<SessionRow[]>`
    SELECT s.id, s.network_id, s.user_id, s.created_at, s.expires_at, s.ip,
           n.name AS network_name, n.slug AS network_slug, n.status AS network_status,
           u.name AS user_name, u.email AS user_email, u.cpf AS user_cpf,
           u.phone AS user_phone, u.active AS user_active
    FROM session s
    JOIN network n ON n.id = s.network_id
    JOIN app_user u ON u.id = s.user_id AND u.network_id = s.network_id
    WHERE s.id = ${sessionId}
  `;
  const row = rows[0];
  return row === undefined ? null : toSessionWithOwner(row);
}

export async function insert(sql: Connection, session: Session): Promise<void> {
  await sql`
    INSERT INTO session (id, network_id, user_id, created_at, expires_at, ip)
    VALUES (
      ${session.id}, ${session.networkId}, ${session.userId},
      ${session.createdAt}, ${session.expiresAt}, ${session.ip}
    )
  `;
}

export async function remove(sql: Connection, sessionId: string): Promise<void> {
  await sql`DELETE FROM session WHERE id = ${sessionId}`;
}

export async function purgeExpired(sql: Connection): Promise<number> {
  const rows = await sql<{ total: number }[]>`
    WITH expired AS (
      DELETE FROM session WHERE expires_at < now() RETURNING 1
    )
    SELECT count(*)::int AS total FROM expired
  `;
  return rows[0]?.total ?? 0;
}
