import type { Conexao } from '../../shared/db';
import { paraStatusDeRede, type Rede } from '../dominio/rede';

type LinhaDeRede = { id: string; nome: string; slug: string; status: string };

const paraRede = (linha: LinhaDeRede): Rede => ({
  id: linha.id,
  nome: linha.nome,
  slug: linha.slug,
  status: paraStatusDeRede(linha.status),
});

/**
 * Única consulta do módulo que não filtra por `rede_id`: é ela quem descobre a rede a partir do
 * slug digitado na tela de login. Daí em diante todo filtro parte do id encontrado aqui.
 */
export async function porSlug(sql: Conexao, slug: string): Promise<Rede | null> {
  const linhas = await sql<LinhaDeRede[]>`
    SELECT id, nome, slug, status
    FROM rede
    WHERE slug = ${slug}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : paraRede(linha);
}
