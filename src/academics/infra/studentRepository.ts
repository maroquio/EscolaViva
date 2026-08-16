import type { Connection } from '../../shared/db';
import type { Range } from '../../shared/pagination';
import { LIMITES } from '../constants';
import type { Aluno } from '../domain/student';

type LinhaDeAluno = {
  id: string;
  network_id: string;
  name: string;
  birth_date: string;
};

const paraAluno = (linha: LinhaDeAluno): Aluno => ({
  id: linha.id,
  redeId: linha.network_id,
  nome: linha.name,
  dataNascimento: linha.birth_date,
});

const escaparCuringas = (termo: string): string =>
  termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);

export async function inserir(sql: Connection, aluno: Aluno): Promise<void> {
  await sql`
    INSERT INTO student (id, network_id, name, birth_date)
    VALUES (${aluno.id}, ${aluno.redeId}, ${aluno.nome}, ${aluno.dataNascimento})`;
}

export async function porId(sql: Connection, redeId: string, id: string): Promise<Aluno | null> {
  const linhas: LinhaDeAluno[] = await sql`
    SELECT id, network_id, name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date
      FROM student
     WHERE network_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraAluno(linha);
}

export async function buscar(
  sql: Connection,
  redeId: string,
  termo: string,
  faixa?: Range,
): Promise<Aluno[]> {
  const padrao = `%${escaparCuringas(termo.trim())}%`;
  const linhas: LinhaDeAluno[] = await sql`
    SELECT id, network_id, name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date
      FROM student
     WHERE network_id = ${redeId} AND name ILIKE ${padrao}
     ORDER BY name
     LIMIT ${faixa?.limit ?? LIMITES.aluno.linhasDaBusca} OFFSET ${faixa?.offset ?? 0}`;
  return linhas.map(paraAluno);
}

export async function contarBusca(sql: Connection, redeId: string, termo: string): Promise<number> {
  const padrao = `%${escaparCuringas(termo.trim())}%`;
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM student
     WHERE network_id = ${redeId} AND name ILIKE ${padrao}`;
  return linhas[0]?.total ?? 0;
}
