import type { Conexao } from '../../shared/db';
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

export async function listar(sql: Conexao, redeId: string): Promise<Disciplina[]> {
  const linhas: LinhaDeDisciplina[] = await sql`
    SELECT id, rede_id, nome
      FROM disciplina
     WHERE rede_id = ${redeId}
     ORDER BY nome`;
  return linhas.map(paraDisciplina);
}
