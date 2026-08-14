import type { Conexao } from '../../shared/db';
import { recorte, type Faixa } from '../../shared/paginacao';
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

/**
 * Sem faixa devolve a turma inteira: o diário de classe lança nota e chamada da turma toda em uma
 * submissão, e uma lista recortada ali gravaria ausência para quem não coube na página.
 */
export async function ativasDaTurma(
  sql: Conexao,
  redeId: string,
  turmaId: string,
  faixa?: Faixa,
): Promise<Matricula[]> {
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.rede_id, m.aluno_id, a.nome AS aluno_nome, m.turma_id, t.nome AS turma_nome,
           t.unidade_id, m.ano_letivo_id, al.ano,
           to_char(m.data_matricula, 'YYYY-MM-DD') AS data_matricula, m.situacao
      FROM matricula m
      JOIN aluno a ON a.id = m.aluno_id AND a.rede_id = m.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = m.rede_id
      JOIN ano_letivo al ON al.id = m.ano_letivo_id AND al.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId} AND m.turma_id = ${turmaId} AND m.situacao = 'ativa'
     ORDER BY a.nome
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraMatricula);
}

export async function contarAtivasDaTurma(
  sql: Conexao,
  redeId: string,
  turmaId: string,
): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM matricula
     WHERE rede_id = ${redeId} AND turma_id = ${turmaId} AND situacao = 'ativa'`;
  return linhas[0]?.total ?? 0;
}

/**
 * O histórico do aluno recortado pelas unidades que quem consulta alcança.
 *
 * Antes esta lista era derivada em memória: as matrículas de cada responsável do aluno, ou as
 * ativas de cada turma da secretaria, unidas e filtradas depois. O caminho pelo vínculo mostrava
 * todas as situações, e o caminho sem vínculo só as ativas — duas respostas para a mesma pergunta.
 * Uma consulta só resolve as duas coisas: o alcance vira condição, e o recorte passa a caber.
 */
export async function doAlunoNasUnidades(
  sql: Conexao,
  redeId: string,
  alunoId: string,
  unidadeIds: readonly string[],
  faixa?: Faixa,
): Promise<Matricula[]> {
  if (unidadeIds.length === 0) return [];
  const { limite, deslocamento } = recorte(faixa);
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.rede_id, m.aluno_id, a.nome AS aluno_nome, m.turma_id, t.nome AS turma_nome,
           t.unidade_id, m.ano_letivo_id, al.ano,
           to_char(m.data_matricula, 'YYYY-MM-DD') AS data_matricula, m.situacao
      FROM matricula m
      JOIN aluno a ON a.id = m.aluno_id AND a.rede_id = m.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = m.rede_id
      JOIN ano_letivo al ON al.id = m.ano_letivo_id AND al.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId}
       AND m.aluno_id = ${alunoId}
       AND t.unidade_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     ORDER BY al.ano DESC, m.data_matricula DESC
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraMatricula);
}

export async function contarDoAlunoNasUnidades(
  sql: Conexao,
  redeId: string,
  alunoId: string,
  unidadeIds: readonly string[],
): Promise<number> {
  if (unidadeIds.length === 0) return 0;
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM matricula m
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId}
       AND m.aluno_id = ${alunoId}
       AND t.unidade_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])`;
  return linhas[0]?.total ?? 0;
}

/**
 * Se o aluno tem matrícula em algum lugar da rede. É o que separa "aluno recém-cadastrado, ainda
 * de todas as secretarias" de "aluno de outra unidade", que para esta secretaria não existe.
 */
export async function temAlgumaMatricula(
  sql: Conexao,
  redeId: string,
  alunoId: string,
): Promise<boolean> {
  const linhas: { existe: number }[] = await sql`
    SELECT 1 AS existe
      FROM matricula
     WHERE rede_id = ${redeId} AND aluno_id = ${alunoId}
     LIMIT 1`;
  return linhas.length > 0;
}

/** Matriculados ativos por unidade, em uma consulta só — a mesma razão de `contarPorUnidade`. */
export async function contarAtivasPorUnidade(
  sql: Conexao,
  redeId: string,
  unidadeIds: readonly string[],
): Promise<Map<string, number>> {
  if (unidadeIds.length === 0) return new Map<string, number>();
  const linhas: { unidade_id: string; total: number }[] = await sql`
    SELECT t.unidade_id, count(*)::int AS total
      FROM matricula m
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId}
       AND m.situacao = 'ativa'
       AND t.unidade_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     GROUP BY t.unidade_id`;
  return new Map(linhas.map((linha): [string, number] => [linha.unidade_id, linha.total]));
}

/**
 * A matrícula ativa de cada aluno de uma lista, dentro das unidades alcançadas.
 *
 * A busca da secretaria mostra a turma ao lado do nome. Descobrir isso percorrendo as matrículas
 * de todas as turmas do alcance era uma leitura da rede inteira para enfeitar vinte linhas.
 */
export async function ativasDosAlunos(
  sql: Conexao,
  redeId: string,
  alunoIds: readonly string[],
  unidadeIds: readonly string[],
): Promise<Matricula[]> {
  if (alunoIds.length === 0 || unidadeIds.length === 0) return [];
  const linhas: LinhaDeMatricula[] = await sql`
    SELECT m.id, m.rede_id, m.aluno_id, a.nome AS aluno_nome, m.turma_id, t.nome AS turma_nome,
           t.unidade_id, m.ano_letivo_id, al.ano,
           to_char(m.data_matricula, 'YYYY-MM-DD') AS data_matricula, m.situacao
      FROM matricula m
      JOIN aluno a ON a.id = m.aluno_id AND a.rede_id = m.rede_id
      JOIN turma t ON t.id = m.turma_id AND t.rede_id = m.rede_id
      JOIN ano_letivo al ON al.id = m.ano_letivo_id AND al.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId}
       AND m.situacao = 'ativa'
       AND m.aluno_id = ANY(${sql.array([...alunoIds], 'TEXT')}::uuid[])
       AND t.unidade_id = ANY(${sql.array([...unidadeIds], 'TEXT')}::uuid[])
     ORDER BY al.ano DESC`;
  return linhas.map(paraMatricula);
}

/** O portal do responsável mostra o histórico dos filhos, não só o ano corrente. */
export async function doResponsavel(
  sql: Conexao,
  redeId: string,
  responsavelId: string,
  faixa?: Faixa,
): Promise<Matricula[]> {
  const { limite, deslocamento } = recorte(faixa);
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
     ORDER BY al.ano DESC, a.nome
     LIMIT ${limite}::int OFFSET ${deslocamento}::int`;
  return linhas.map(paraMatricula);
}

export async function contarDoResponsavel(
  sql: Conexao,
  redeId: string,
  responsavelId: string,
): Promise<number> {
  const linhas: { total: number }[] = await sql`
    SELECT count(*)::int AS total
      FROM matricula m
      JOIN aluno_responsavel av ON av.aluno_id = m.aluno_id AND av.rede_id = m.rede_id
     WHERE m.rede_id = ${redeId} AND av.responsavel_id = ${responsavelId}`;
  return linhas[0]?.total ?? 0;
}
