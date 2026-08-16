import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import type { Disciplina } from '../dominio/disciplina';

type LinhaDeDisciplina = {
  id: string;
  network_id: string;
  name: string;
};

const paraDisciplina = (linha: LinhaDeDisciplina): Disciplina => ({
  id: linha.id,
  redeId: linha.network_id,
  nome: linha.name,
});

export async function inserir(sql: Conexao, disciplina: Disciplina): Promise<boolean> {
  const criadas: { id: string }[] = await sql`
    INSERT INTO subject (id, network_id, name)
    VALUES (${disciplina.id}, ${disciplina.redeId}, ${disciplina.nome})
    ON CONFLICT ON CONSTRAINT subject_unique_in_network DO NOTHING
    RETURNING id`;
  return criadas.length === 1;
}

export async function porId(sql: Conexao, redeId: string, id: string): Promise<Disciplina | null> {
  const linhas: LinhaDeDisciplina[] = await sql`
    SELECT id, network_id, name
      FROM subject
     WHERE network_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraDisciplina(linha);
}

export async function listar(
  sql: Conexao,
  redeId: string,
  faixa?: Faixa,
): Promise<Disciplina[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeDisciplina[] = await sql`
    SELECT id, network_id, name
      FROM subject
     WHERE network_id = ${redeId}
     ORDER BY name
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraDisciplina);
}

export async function contar(sql: Conexao, redeId: string): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM subject WHERE network_id = ${redeId}`;
  return linhas[0]?.total ?? 0;
}
