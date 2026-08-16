import type { Conexao } from '../../shared/db';
import { paraStatusDeRede, type Rede } from '../dominio/rede';

type LinhaDeRede = { id: string; name: string; slug: string; status: string };

const paraRede = (linha: LinhaDeRede): Rede => ({
  id: linha.id,
  nome: linha.name,
  slug: linha.slug,
  status: paraStatusDeRede(linha.status),
});

export async function porSlug(sql: Conexao, slug: string): Promise<Rede | null> {
  const linhas = await sql<LinhaDeRede[]>`
    SELECT id, name, slug, status
    FROM network
    WHERE slug = ${slug}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : paraRede(linha);
}
