import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
import type { Responsavel, VinculoResponsavel } from '../dominio/responsavel';

type LinhaDeResponsavel = {
  id: string;
  rede_id: string;
  nome: string;
  email: string;
  telefone: string | null;
};

type LinhaDeVinculo = {
  responsavel_id: string;
  nome: string;
  email: string;
  parentesco: string;
  financeiro: boolean;
};

const paraResponsavel = (linha: LinhaDeResponsavel): Responsavel => ({
  id: linha.id,
  redeId: linha.rede_id,
  nome: linha.nome,
  email: linha.email,
  telefone: linha.telefone,
});

const paraVinculo = (linha: LinhaDeVinculo): VinculoResponsavel => ({
  responsavelId: linha.responsavel_id,
  nome: linha.nome,
  email: linha.email,
  parentesco: linha.parentesco,
  financeiro: linha.financeiro,
});

export async function inserir(sql: Conexao, responsavel: Responsavel): Promise<boolean> {
  const criados: { id: string }[] = await sql`
    INSERT INTO responsavel (id, rede_id, nome, email, telefone)
    VALUES (${responsavel.id}, ${responsavel.redeId}, ${responsavel.nome},
            ${responsavel.email}, ${responsavel.telefone})
    ON CONFLICT ON CONSTRAINT responsavel_email_unico_na_rede DO NOTHING
    RETURNING id`;
  return criados.length === 1;
}

export async function porId(
  sql: Conexao,
  redeId: string,
  id: string,
): Promise<Responsavel | null> {
  const linhas: LinhaDeResponsavel[] = await sql`
    SELECT id, rede_id, nome, email, telefone
      FROM responsavel
     WHERE rede_id = ${redeId} AND id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraResponsavel(linha);
}

/** Sem faixa devolve a rede inteira — o vínculo na ficha do aluno escolhe de uma lista completa. */
export async function listar(
  sql: Conexao,
  redeId: string,
  faixa?: Faixa,
): Promise<Responsavel[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeResponsavel[] = await sql`
    SELECT id, rede_id, nome, email, telefone
      FROM responsavel
     WHERE rede_id = ${redeId}
     ORDER BY nome
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraResponsavel);
}

export async function contar(sql: Conexao, redeId: string): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total FROM responsavel WHERE rede_id = ${redeId}`;
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
  const criados: { responsavel_id: string }[] = await sql`
    INSERT INTO aluno_responsavel (rede_id, aluno_id, responsavel_id, parentesco, financeiro)
    VALUES (${vinculo.redeId}, ${vinculo.alunoId}, ${vinculo.responsavelId},
            ${vinculo.parentesco}, ${vinculo.financeiro})
    ON CONFLICT (aluno_id, responsavel_id) DO NOTHING
    RETURNING responsavel_id`;
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
    SELECT av.responsavel_id, r.nome, r.email, av.parentesco, av.financeiro
      FROM aluno_responsavel av
      JOIN responsavel r ON r.id = av.responsavel_id AND r.rede_id = av.rede_id
     WHERE av.rede_id = ${redeId} AND av.aluno_id = ${alunoId}
     ORDER BY r.nome
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
      FROM aluno_responsavel
     WHERE rede_id = ${redeId} AND aluno_id = ${alunoId}`;
  return linhas[0]?.total ?? 0;
}

/**
 * Responsáveis distintos alcançados por um conjunto de unidades.
 *
 * Não é a soma das contagens por unidade: quem tem filhos em duas escolas da rede é uma pessoa só,
 * e somar as colunas contaria essa pessoa duas vezes no total da tela.
 */
export async function contarNasUnidades(
  sql: Conexao,
  redeId: string,
  unidadeIds: readonly string[],
): Promise<number> {
  if (unidadeIds.length === 0) return 0;
  const linhas: { total: number }[] = await sql`
    SELECT count(DISTINCT r.id)::int AS total
      FROM responsavel r
      JOIN aluno_responsavel av ON av.responsavel_id = r.id AND av.rede_id = r.rede_id
      JOIN matricula m ON m.aluno_id = av.aluno_id AND m.rede_id = r.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = r.rede_id
     WHERE r.rede_id = ${redeId}
       AND m.situacao = 'ativa'
       AND t.unidade_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])`;
  return linhas[0]?.total ?? 0;
}

/** Quantos responsáveis cada unidade alcança, em uma consulta só, para o painel da secretaria. */
export async function contarPorUnidade(
  sql: Conexao,
  redeId: string,
  unidadeIds: readonly string[],
): Promise<Map<string, number>> {
  if (unidadeIds.length === 0) return new Map<string, number>();
  const linhas: { unidade_id: string; total: number }[] = await sql`
    SELECT t.unidade_id, count(DISTINCT r.id)::int AS total
      FROM responsavel r
      JOIN aluno_responsavel av ON av.responsavel_id = r.id AND av.rede_id = r.rede_id
      JOIN matricula m ON m.aluno_id = av.aluno_id AND m.rede_id = r.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = r.rede_id
     WHERE r.rede_id = ${redeId}
       AND m.situacao = 'ativa'
       AND t.unidade_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     GROUP BY t.unidade_id`;
  return new Map(linhas.map((linha): [string, number] => [linha.unidade_id, linha.total]));
}

/**
 * Quem recebe comunicado de uma unidade: o responsável por aluno com matrícula ativa em turma
 * dela. O vínculo é com o aluno, não com a unidade — por isso o caminho passa pela matrícula.
 */
export async function daUnidade(
  sql: Conexao,
  redeId: string,
  unidadeId: string,
): Promise<{ id: string; nome: string }[]> {
  const linhas: { id: string; nome: string }[] = await sql`
    SELECT DISTINCT r.id, r.nome
      FROM responsavel r
      JOIN aluno_responsavel av ON av.responsavel_id = r.id AND av.rede_id = r.rede_id
      JOIN matricula m ON m.aluno_id = av.aluno_id AND m.rede_id = r.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = r.rede_id
     WHERE r.rede_id = ${redeId} AND t.unidade_id = ${unidadeId} AND m.situacao = 'ativa'
     ORDER BY r.nome`;
  return linhas.map((linha) => ({ id: linha.id, nome: linha.nome }));
}
