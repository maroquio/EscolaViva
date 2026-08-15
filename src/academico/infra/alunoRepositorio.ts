import type { Conexao } from '../../shared/db';
import type { Faixa } from '../../shared/paginacao';
import { LIMITES } from '../constantes';
import type { Aluno } from '../dominio/aluno';

type LinhaDeAluno = {
  id: string;
  rede_id: string;
  nome: string;
  data_nascimento: string;
};

const paraAluno = (linha: LinhaDeAluno): Aluno => ({
  id: linha.id,
  redeId: linha.rede_id,
  nome: linha.nome,
  dataNascimento: linha.data_nascimento,
});

const escaparCuringas = (termo: string): string =>
  termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);

export async function inserir(sql: Conexao, aluno: Aluno): Promise<void> {
  await sql`
    INSERT INTO aluno (id, rede_id, nome, data_nascimento)
    VALUES (${aluno.id}, ${aluno.redeId}, ${aluno.nome}, ${aluno.dataNascimento})`;
}

export async function porId(sql: Conexao, redeId: string, id: string): Promise<Aluno | null> {
  const linhas: LinhaDeAluno[] = await sql`
    SELECT id, rede_id, nome, to_char(data_nascimento, 'YYYY-MM-DD') AS data_nascimento
      FROM aluno
     WHERE rede_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraAluno(linha);
}

export async function buscar(
  sql: Conexao,
  redeId: string,
  termo: string,
  faixa?: Faixa,
): Promise<Aluno[]> {
  const padrao = `%${escaparCuringas(termo.trim())}%`;
  const linhas: LinhaDeAluno[] = await sql`
    SELECT id, rede_id, nome, to_char(data_nascimento, 'YYYY-MM-DD') AS data_nascimento
      FROM aluno
     WHERE rede_id = ${redeId} AND nome ILIKE ${padrao}
     ORDER BY nome
     LIMIT ${faixa?.limite ?? LIMITES.aluno.linhasDaBusca} OFFSET ${faixa?.deslocamento ?? 0}`;
  return linhas.map(paraAluno);
}

export async function contarBusca(sql: Conexao, redeId: string, termo: string): Promise<number> {
  const padrao = `%${escaparCuringas(termo.trim())}%`;
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM aluno
     WHERE rede_id = ${redeId} AND nome ILIKE ${padrao}`;
  return linhas[0]?.total ?? 0;
}
