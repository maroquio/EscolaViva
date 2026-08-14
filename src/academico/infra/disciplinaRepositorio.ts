import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import type { Disciplina } from '../dominio/disciplina';

type LinhaDeDisciplina = {
  id: string;
  rede_id: string;
  nome: string;
};

const paraDisciplina = (linha: LinhaDeDisciplina): Disciplina => ({
  id: linha.id,
  redeId: linha.rede_id,
  nome: linha.nome,
});

export async function inserir(sql: Conexao, disciplina: Disciplina): Promise<boolean> {
  const criadas: { id: string }[] = await sql`
    INSERT INTO disciplina (id, rede_id, nome)
    VALUES (${disciplina.id}, ${disciplina.redeId}, ${disciplina.nome})
    ON CONFLICT ON CONSTRAINT disciplina_unica_na_rede DO NOTHING
    RETURNING id`;
  return criadas.length === 1;
}

export async function porId(sql: Conexao, redeId: string, id: string): Promise<Disciplina | null> {
  const linhas: LinhaDeDisciplina[] = await sql`
    SELECT id, rede_id, nome
      FROM disciplina
     WHERE rede_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraDisciplina(linha);
}

/** Sem faixa devolve a rede inteira — a alocação de professor escolhe de uma lista completa. */
export async function listar(
  sql: Conexao,
  redeId: string,
  faixa?: Faixa,
): Promise<Disciplina[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeDisciplina[] = await sql`
    SELECT id, rede_id, nome
      FROM disciplina
     WHERE rede_id = ${redeId}
     ORDER BY nome
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraDisciplina);
}

export async function contar(sql: Conexao, redeId: string): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM disciplina WHERE rede_id = ${redeId}`;
  return linhas[0]?.total ?? 0;
}
