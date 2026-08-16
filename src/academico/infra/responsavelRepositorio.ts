import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import type { Responsavel, VinculoResponsavel } from '../dominio/responsavel';

type LinhaDeResponsavel = {
  id: string;
  network_id: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
};

type LinhaDeVinculo = {
  guardian_id: string;
  name: string;
  email: string;
  relationship: string;
  financially_responsible: boolean;
};

const paraResponsavel = (linha: LinhaDeResponsavel): Responsavel => ({
  id: linha.id,
  redeId: linha.network_id,
  nome: linha.name,
  email: linha.email,
  cpf: linha.cpf,
  telefone: linha.phone,
});

const paraVinculo = (linha: LinhaDeVinculo): VinculoResponsavel => ({
  responsavelId: linha.guardian_id,
  nome: linha.name,
  email: linha.email,
  parentesco: linha.relationship,
  financeiro: linha.financially_responsible,
});

export async function inserir(sql: Conexao, responsavel: Responsavel): Promise<boolean> {
  const criados: { id: string }[] = await sql`
    INSERT INTO guardian (id, network_id, name, email, cpf, phone)
    VALUES (${responsavel.id}, ${responsavel.redeId}, ${responsavel.nome},
            ${responsavel.email}, ${responsavel.cpf}, ${responsavel.telefone})
    ON CONFLICT ON CONSTRAINT guardian_email_unique_in_network DO NOTHING
    RETURNING id`;
  return criados.length === 1;
}

export async function porId(
  sql: Conexao,
  redeId: string,
  id: string,
): Promise<Responsavel | null> {
  const linhas: LinhaDeResponsavel[] = await sql`
    SELECT id, network_id, name, email, cpf, phone
      FROM guardian
     WHERE network_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraResponsavel(linha);
}

export async function listar(
  sql: Conexao,
  redeId: string,
  faixa?: Faixa,
): Promise<Responsavel[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeResponsavel[] = await sql`
    SELECT id, network_id, name, email, cpf, phone
      FROM guardian
     WHERE network_id = ${redeId}
     ORDER BY name
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraResponsavel);
}

export async function contar(sql: Conexao, redeId: string): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM guardian WHERE network_id = ${redeId}`;
  return linhas[0]?.total ?? 0;
}

export async function vincular(
  sql: Conexao,
  vinculo: {
    redeId: string;
    alunoId: string;
    responsavelId: string;
    parentesco: string;
    financeiro: boolean;
  },
): Promise<boolean> {
  const criados: { guardian_id: string }[] = await sql`
    INSERT INTO student_guardian (network_id, student_id, guardian_id, relationship,
                                  financially_responsible)
    VALUES (${vinculo.redeId}, ${vinculo.alunoId}, ${vinculo.responsavelId},
            ${vinculo.parentesco}, ${vinculo.financeiro})
    ON CONFLICT (student_id, guardian_id) DO NOTHING
    RETURNING guardian_id`;
  return criados.length === 1;
}

export async function doAluno(
  sql: Conexao,
  redeId: string,
  alunoId: string,
  faixa?: Faixa,
): Promise<VinculoResponsavel[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeVinculo[] = await sql`
    SELECT av.guardian_id, r.name, r.email, av.relationship, av.financially_responsible
      FROM student_guardian av
      JOIN guardian r ON r.id = av.guardian_id AND r.network_id = av.network_id
     WHERE av.network_id = ${redeId} AND av.student_id = ${alunoId}
     ORDER BY r.name
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraVinculo);
}

export async function contarDoAluno(
  sql: Conexao,
  redeId: string,
  alunoId: string,
): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM student_guardian
     WHERE network_id = ${redeId} AND student_id = ${alunoId}`;
  return linhas[0]?.total ?? 0;
}

export async function contarNasUnidades(
  sql: Conexao,
  redeId: string,
  unidadeIds: readonly string[],
): Promise<number> {
  if (unidadeIds.length === 0) return 0;
  const linhas: { total: number }[] = await sql`
    SELECT count(DISTINCT r.id)::int AS total
      FROM guardian r
      JOIN student_guardian av ON av.guardian_id = r.id AND av.network_id = r.network_id
      JOIN enrollment m ON m.student_id = av.student_id AND m.network_id = r.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = r.network_id
     WHERE r.network_id = ${redeId}
       AND m.status = 'active'
       AND t.school_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])`;
  return linhas[0]?.total ?? 0;
}

export async function contarPorUnidade(
  sql: Conexao,
  redeId: string,
  unidadeIds: readonly string[],
): Promise<Map<string, number>> {
  if (unidadeIds.length === 0) return new Map<string, number>();
  const linhas: { school_id: string; total: number }[] = await sql`
    SELECT t.school_id, count(DISTINCT r.id)::int AS total
      FROM guardian r
      JOIN student_guardian av ON av.guardian_id = r.id AND av.network_id = r.network_id
      JOIN enrollment m ON m.student_id = av.student_id AND m.network_id = r.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = r.network_id
     WHERE r.network_id = ${redeId}
       AND m.status = 'active'
       AND t.school_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     GROUP BY t.school_id`;
  return new Map(linhas.map((linha): [string, number] => [linha.school_id, linha.total]));
}

export async function daUnidade(
  sql: Conexao,
  redeId: string,
  unidadeId: string,
): Promise<{ id: string; nome: string }[]> {
  const linhas: { id: string; name: string }[] = await sql`
    SELECT DISTINCT r.id, r.name
      FROM guardian r
      JOIN student_guardian av ON av.guardian_id = r.id AND av.network_id = r.network_id
      JOIN enrollment m ON m.student_id = av.student_id AND m.network_id = r.network_id
      JOIN class_group t ON t.id = m.class_group_id AND t.network_id = r.network_id
     WHERE r.network_id = ${redeId} AND t.school_id = ${unidadeId} AND m.status = 'active'
     ORDER BY r.name`;
  return linhas.map((linha) => ({ id: linha.id, nome: linha.name }));
}
