import type { Conexao } from '../../shared/db';
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

export async function listar(sql: Conexao, redeId: string): Promise<Responsavel[]> {
  const linhas: LinhaDeResponsavel[] = await sql`
    SELECT id, rede_id, nome, email, telefone
      FROM responsavel
     WHERE rede_id = ${redeId}
     ORDER BY nome`;
  return linhas.map(paraResponsavel);
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
): Promise<VinculoResponsavel[]> {
  const linhas: LinhaDeVinculo[] = await sql`
    SELECT av.responsavel_id, r.nome, r.email, av.parentesco, av.financeiro
      FROM aluno_responsavel av
      JOIN responsavel r ON r.id = av.responsavel_id AND r.rede_id = av.rede_id
     WHERE av.rede_id = ${redeId} AND av.aluno_id = ${alunoId}
     ORDER BY r.nome`;
  return linhas.map(paraVinculo);
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
