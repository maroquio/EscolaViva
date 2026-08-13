/*
 * Toda consulta daqui filtra por `rede_id` primeiro, na mesma ordem do índice
 * `nota (rede_id, turma_disciplina_id, bimestre)`: é o isolamento de tenant e o plano de acesso na
 * mesma cláusula.
 *
 * `numeric` chega do driver como texto para não perder precisão; o `::float8` fixa o tipo em
 * número já na fronteira do banco, e duas casas até 10 cabem exatas em um double.
 */

import type { Conexao } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';

export type NotaDaMatricula = { turmaDisciplinaId: string; bimestre: number; valor: number };

export type NotaParaGravar = { matriculaId: string; valor: number };

export async function porTurmaDisciplinaEBimestre(
  sql: Conexao,
  redeId: string,
  turmaDisciplinaId: string,
  bimestre: number,
): Promise<Map<string, number>> {
  const linhas: { matricula_id: string; valor: number }[] = await sql`
    SELECT matricula_id, valor::float8 AS valor
      FROM nota
     WHERE rede_id = ${redeId}
       AND turma_disciplina_id = ${turmaDisciplinaId}
       AND bimestre = ${bimestre}`;
  return new Map(linhas.map((linha): [string, number] => [linha.matricula_id, linha.valor]));
}

export async function porMatricula(
  sql: Conexao,
  redeId: string,
  matriculaId: string,
): Promise<NotaDaMatricula[]> {
  const linhas: { turma_disciplina_id: string; bimestre: number; valor: number }[] = await sql`
    SELECT turma_disciplina_id, bimestre, valor::float8 AS valor
      FROM nota
     WHERE rede_id = ${redeId}
       AND matricula_id = ${matriculaId}`;
  return linhas.map((linha) => ({
    turmaDisciplinaId: linha.turma_disciplina_id,
    bimestre: linha.bimestre,
    valor: linha.valor,
  }));
}

/**
 * Quantas notas já existem em cada disciplina da turma no bimestre, contadas só entre as
 * matrículas informadas — nota de aluno transferido não conta como lançamento feito.
 */
export async function contagemPorDisciplina(
  sql: Conexao,
  redeId: string,
  turmaDisciplinaIds: string[],
  bimestre: number,
  matriculaIds: string[],
): Promise<Map<string, number>> {
  const linhas: { turma_disciplina_id: string; total: number }[] = await sql`
    SELECT turma_disciplina_id, count(*)::int AS total
      FROM nota
     WHERE rede_id = ${redeId}
       AND turma_disciplina_id = ANY(${sql.array(turmaDisciplinaIds, 'TEXT')}::uuid[])
       AND bimestre = ${bimestre}
       AND matricula_id = ANY(${sql.array(matriculaIds, 'TEXT')}::uuid[])
     GROUP BY turma_disciplina_id`;
  return new Map(
    linhas.map((linha): [string, number] => [linha.turma_disciplina_id, linha.total]),
  );
}

/**
 * O lançamento inteiro vai num `INSERT` só. `ON CONFLICT` faz da tela uma operação repetível: o
 * professor que corrige um valor e reenvia substitui a nota, não cria uma segunda.
 */
export async function gravarEmLote(
  sql: Conexao,
  lancamento: {
    redeId: string;
    turmaDisciplinaId: string;
    bimestre: number;
    lancadaPor: string;
    notas: NotaParaGravar[];
  },
): Promise<number> {
  const linhas = lancamento.notas.map((nota) => ({
    id: idGeneratorUuid.novo(),
    rede_id: lancamento.redeId,
    matricula_id: nota.matriculaId,
    turma_disciplina_id: lancamento.turmaDisciplinaId,
    bimestre: lancamento.bimestre,
    valor: nota.valor,
    lancada_por: lancamento.lancadaPor,
  }));
  const gravadas: { id: string }[] = await sql`
    INSERT INTO nota ${sql(linhas)}
    ON CONFLICT (matricula_id, turma_disciplina_id, bimestre)
    DO UPDATE SET valor = EXCLUDED.valor,
                  lancada_por = EXCLUDED.lancada_por,
                  lancada_em = now()
    RETURNING id`;
  return gravadas.length;
}

/** Campo em branco na tela é uma decisão do professor: a nota daquele aluno deixa de existir. */
export async function apagarEmLote(
  sql: Conexao,
  redeId: string,
  turmaDisciplinaId: string,
  bimestre: number,
  matriculaIds: string[],
): Promise<number> {
  const apagadas: { id: string }[] = await sql`
    DELETE FROM nota
     WHERE rede_id = ${redeId}
       AND turma_disciplina_id = ${turmaDisciplinaId}
       AND bimestre = ${bimestre}
       AND matricula_id = ANY(${sql.array(matriculaIds, 'TEXT')}::uuid[])
    RETURNING id`;
  return apagadas.length;
}
