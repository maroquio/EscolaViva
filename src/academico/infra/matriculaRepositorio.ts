import type { Conexao } from '../../shared/db';
import { situacaoValida, type Matricula, type SituacaoMatricula } from '../dominio/matricula';

type LinhaDeMatricula = {
  id: string;
  rede_id: string;
  aluno_id: string;
  aluno_nome: string;
  turma_id: string;
  turma_nome: string;
  unidade_id: string;
  ano_letivo_id: string;
  ano: number;
  data_matricula: string;
  situacao: string;
};

/** O CHECK `situacao_valida` garante o conjunto no banco; aqui ele volta a ser tipo. */
function paraSituacao(valor: string): SituacaoMatricula {
  if (!situacaoValida(valor)) throw new Error(`situação de matrícula desconhecida: ${valor}`);
  return valor;
}

const paraMatricula = (linha: LinhaDeMatricula): Matricula => ({
  id: linha.id,
  redeId: linha.rede_id,
  alunoId: linha.aluno_id,
  alunoNome: linha.aluno_nome,
  turmaId: linha.turma_id,
  turmaNome: linha.turma_nome,
  unidadeId: linha.unidade_id,
  anoLetivoId: linha.ano_letivo_id,
  ano: linha.ano,
  dataMatricula: linha.data_matricula,
  situacao: paraSituacao(linha.situacao),
});

/**
 * `ON CONFLICT ... DO NOTHING` devolve zero linhas no lugar de estourar a violação do índice
 * único parcial `matricula_ativa_unica_por_ano` (SQLSTATE 23505). É o que permite recusar a
 * matrícula com uma mensagem de campo: o erro cru abortaria a transação inteira e chegaria à
 * tela como falha do sistema, quando é apenas um aluno que já está matriculado neste ano.
 */
export async function inserir(sql: Conexao, matricula: Matricula): Promise<boolean> {
  const criadas: { id: string }[] = await sql`
    INSERT INTO matricula (id, rede_id, aluno_id, turma_id, ano_letivo_id, data_matricula, situacao)
    VALUES (${matricula.id}, ${matricula.redeId}, ${matricula.alunoId}, ${matricula.turmaId},
            ${matricula.anoLetivoId}, ${matricula.dataMatricula}, ${matricula.situacao})
    ON CONFLICT (aluno_id, ano_letivo_id) WHERE situacao = 'ativa' DO NOTHING
    RETURNING id`;
  return criadas.length === 1;
}

/**
 * A condição `situacao = 'ativa'` na cláusula WHERE é a trava da transferência: se outra
 * requisição encerrou a mesma matrícula primeiro, nenhuma linha é atualizada e o caso de uso
 * recusa em vez de abrir uma segunda matrícula ativa para o mesmo aluno no ano.
 */
export async function marcarComoTransferida(
  sql: Conexao,
  redeId: string,
  id: string,
): Promise<boolean> {
  const atualizadas: { id: string }[] = await sql`
    UPDATE matricula
       SET situacao = 'transferida'
     WHERE rede_id = ${redeId} AND id = ${id} AND situacao = 'ativa'
     RETURNING id`;
  return atualizadas.length === 1;
}

export async function porId(sql: Conexao, redeId: string, id: string): Promise<Matricula | null> {
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.rede_id, m.aluno_id, a.nome AS aluno_nome, m.turma_id, t.nome AS turma_nome,
           t.unidade_id, m.ano_letivo_id, al.ano,
           to_char(m.data_matricula, 'YYYY-MM-DD') AS data_matricula, m.situacao
      FROM matricula m
      JOIN aluno a ON a.id = m.aluno_id AND a.rede_id = m.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = m.rede_id
      JOIN ano_letivo al ON al.id = m.ano_letivo_id AND al.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId} AND m.id = ${id}`;
  const linha = linhas[0];
  return linha === undefined ? null : paraMatricula(linha);
}

export async function ativasDaTurma(
  sql: Conexao,
  redeId: string,
  turmaId: string,
): Promise<Matricula[]> {
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.rede_id, m.aluno_id, a.nome AS aluno_nome, m.turma_id, t.nome AS turma_nome,
           t.unidade_id, m.ano_letivo_id, al.ano,
           to_char(m.data_matricula, 'YYYY-MM-DD') AS data_matricula, m.situacao
      FROM matricula m
      JOIN aluno a ON a.id = m.aluno_id AND a.rede_id = m.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = m.rede_id
      JOIN ano_letivo al ON al.id = m.ano_letivo_id AND al.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId} AND m.turma_id = ${turmaId} AND m.situacao = 'ativa'
     ORDER BY a.nome`;
  return linhas.map(paraMatricula);
}

/** O portal do responsável mostra o histórico dos filhos, não só o ano corrente. */
export async function doResponsavel(
  sql: Conexao,
  redeId: string,
  responsavelId: string,
): Promise<Matricula[]> {
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.rede_id, m.aluno_id, a.nome AS aluno_nome, m.turma_id, t.nome AS turma_nome,
           t.unidade_id, m.ano_letivo_id, al.ano,
           to_char(m.data_matricula, 'YYYY-MM-DD') AS data_matricula, m.situacao
      FROM matricula m
      JOIN aluno a ON a.id = m.aluno_id AND a.rede_id = m.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = m.rede_id
      JOIN ano_letivo al ON al.id = m.ano_letivo_id AND al.rede_id = m.rede_id
      JOIN aluno_responsavel av ON av.aluno_id = m.aluno_id AND av.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId} AND av.responsavel_id = ${responsavelId}
     ORDER BY al.ano DESC, a.nome`;
  return linhas.map(paraMatricula);
}
