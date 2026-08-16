import type { Connection } from '../../shared/db';
import { toNetworkStatus, type Network } from '../domain/network';

type NetworkRow = { id: string; name: string; slug: string; status: string };

const toNetwork = (row: NetworkRow): Network => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  status: toNetworkStatus(row.status),
});

export async function bySlug(sql: Connection, slug: string): Promise<Network | null> {
  const rows = await sql<NetworkRow[]>`
    SELECT id, name, slug, status
    FROM network
    WHERE slug = ${slug}
  `;
  const row = rows[0];
  return row === undefined ? null : toNetwork(row);
}
