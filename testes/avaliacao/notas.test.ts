/*
 * Lançamento de notas contra o PostgreSQL de verdade. As duas validações que importam — bimestre
 * de 1 a 4 e nota de 0 a 10 — são exercidas nos dois lugares onde existem: na aplicação, que
 * devolve erro de campo para a tela do professor, e no banco, que barra qualquer caminho de
 * escrita que tente contorná-la (I8).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { avaliacao } from '../../src/avaliacao';
import { bimestreValido, valorDeNotaValido } from '../../src/avaliacao/dominio/nota';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  ANO_PADRAO,
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarMatricula,
  criarRede,
  criarTurma,
  criarUnidade,
  type Cenario,
} from '../apoio/fabricas';

let cenario: Cenario;

beforeEach(async () => {
  await limparBanco();
  cenario = await cenarioCompleto();
});

/** Quantas linhas de nota existem na rede — a contagem que separa "atualizou" de "duplicou". */
async function contarNotas(redeId: string): Promise<number> {
  const linhas = await sqlDeTeste()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM grade WHERE network_id = ${redeId}`;
  return linhas[0]?.total ?? 0;
}

/** Uma matrícula ativa em uma rede completamente separada, para o teste de isolamento. */
async function matriculaDeOutraRede(): Promise<string> {
  const rede = await criarRede({});
  const unidade = await criarUnidade({ networkId: rede.id });
  const anoLetivo = await criarAnoLetivo({ networkId: rede.id });
  const turma = await criarTurma({
    networkId: rede.id,
    schoolId: unidade.id,
    academicYearId: anoLetivo.id,
  });
  const aluno = await criarAluno({ networkId: rede.id });
  const matricula = await criarMatricula({
    networkId: rede.id,
    studentId: aluno.id,
    classGroupId: turma.id,
    academicYearId: anoLetivo.id,
  });
  return matricula.id;
}

describe('nota (domínio)', () => {
  test('aceita os quatro bimestres e recusa qualquer outro número', () => {
    const aceitos = [1, 2, 3, 4].map(bimestreValido);
    const recusados = [0, 5, -1, 2.5, Number.NaN].map(bimestreValido);

    expect(aceitos).toEqual([true, true, true, true]);
    expect(recusados).toEqual([false, false, false, false, false]);
  });

  test('aceita nota de 0 a 10, inclusive nas pontas, e recusa fora do intervalo', () => {
    const aceitos = [0, 5.5, 10].map(valorDeNotaValido);
    const recusados = [-0.1, 10.1, Number.NaN, Number.POSITIVE_INFINITY].map(valorDeNotaValido);

    expect(aceitos).toEqual([true, true, true]);
    expect(recusados).toEqual([false, false, false, false]);
  });
});

describe('lancarNotas', () => {
  test('grava o lote inteiro da disciplina no bimestre', async () => {
    const notas = cenario.matriculas.map((matricula, posicao) => ({
      matriculaId: matricula.id,
      valor: posicao + 5,
    }));

    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas,
    });

    expect(resultado).toEqual({ ok: true, valor: 5 });
    const gravadas = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      1,
    );
    expect(gravadas.size).toBe(5);
    expect(gravadas.get(cenario.matriculas[0].id)).toBe(5);
    expect(gravadas.get(cenario.matriculas[4].id)).toBe(9);
  });

  test('relançar a mesma disciplina atualiza a nota em vez de duplicar a linha', async () => {
    const lancamento = {
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
    };
    await avaliacao.lancarNotas({
      ...lancamento,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 8 }],
    });

    const resultado = await avaliacao.lancarNotas({
      ...lancamento,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 9.5 }],
    });

    expect(resultado).toEqual({ ok: true, valor: 1 });
    expect(await contarNotas(cenario.rede.id)).toBe(1);
    const gravadas = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      1,
    );
    expect(gravadas.get(cenario.matriculas[0].id)).toBe(9.5);
  });

  test('valor nulo apaga a nota daquele aluno e preserva as demais', async () => {
    const lancamento = {
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 2,
      lancadaPor: cenario.professor.id,
    };
    await avaliacao.lancarNotas({
      ...lancamento,
      notas: [
        { matriculaId: cenario.matriculas[0].id, valor: 8 },
        { matriculaId: cenario.matriculas[1].id, valor: 7 },
      ],
    });

    const resultado = await avaliacao.lancarNotas({
      ...lancamento,
      notas: [
        { matriculaId: cenario.matriculas[0].id, valor: null },
        { matriculaId: cenario.matriculas[1].id, valor: 7 },
      ],
    });

    expect(resultado).toEqual({ ok: true, valor: 1 });
    const gravadas = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      2,
    );
    expect(gravadas.has(cenario.matriculas[0].id)).toBe(false);
    expect(gravadas.get(cenario.matriculas[1].id)).toBe(7);
  });

  test('um lote só de valores nulos apaga tudo e não grava nota nenhuma', async () => {
    const lancamento = {
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
    };
    await avaliacao.lancarNotas({
      ...lancamento,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 6 }],
    });

    const resultado = await avaliacao.lancarNotas({
      ...lancamento,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: null }],
    });

    expect(resultado).toEqual({ ok: true, valor: 0 });
    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('recusa nota acima de 10', async () => {
    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 10.5 }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'A nota precisa ficar entre 0 e 10.' })],
    });
    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('recusa nota negativa', async () => {
    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: -1 }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'A nota precisa ficar entre 0 e 10.' })],
    });
  });

  test('recusa bimestre fora de 1 a 4', async () => {
    const base = {
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 7 }],
    };

    const quinto = await avaliacao.lancarNotas({ ...base, bimestre: 5 });
    const zero = await avaliacao.lancarNotas({ ...base, bimestre: 0 });

    expect(quinto).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'bimestre' })],
    });
    expect(zero).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'bimestre' })],
    });
    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('recusa lote vazio', async () => {
    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'Nenhuma nota foi enviada.' })],
    });
  });

  test('recusa disciplina de turma que não é desta rede', async () => {
    const outra = await cenarioCompleto();

    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: outra.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 7 }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'turmaDisciplinaId', codigo: 'nao_encontrada' })],
    });
  });

  test('recusa o lote com matrícula de outra turma', async () => {
    const aluno = await criarAluno({ networkId: cenario.rede.id });
    const forasteira = await criarMatricula({
      networkId: cenario.rede.id,
      studentId: aluno.id,
      classGroupId: cenario.turmas[1].id,
      academicYearId: cenario.anoLetivo.id,
    });

    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [
        { matriculaId: cenario.matriculas[0].id, valor: 7 },
        { matriculaId: forasteira.id, valor: 8 },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'notas', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('recusa o lote com matrícula de outra rede', async () => {
    const deOutraRede = await matriculaDeOutraRede();

    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [
        { matriculaId: cenario.matriculas[0].id, valor: 7 },
        { matriculaId: deOutraRede, valor: 8 },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'notas', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('recusa o lote com o mesmo aluno duas vezes', async () => {
    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [
        { matriculaId: cenario.matriculas[0].id, valor: 7 },
        { matriculaId: cenario.matriculas[0].id, valor: 8 },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'notas', codigo: 'matricula_repetida' })],
    });
    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('mantém as notas de bimestres diferentes lado a lado', async () => {
    const base = {
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 6 }],
    };

    await avaliacao.lancarNotas({ ...base, bimestre: 1 });
    await avaliacao.lancarNotas({
      ...base,
      bimestre: 2,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 9 }],
    });

    const primeiro = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      1,
    );
    const segundo = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      2,
    );
    expect(primeiro.get(cenario.matriculas[0].id)).toBe(6);
    expect(segundo.get(cenario.matriculas[0].id)).toBe(9);
    expect(await contarNotas(cenario.rede.id)).toBe(2);
  });
});

describe('constraints da tabela nota', () => {
  /** O INSERT direto contorna a aplicação de propósito: é o que prova que a regra vive no banco. */
  function inserirNotaCrua(bimestre: number, valor: number): Promise<void> {
    const sql = sqlDeTeste();
    return (async () => {
      await sql`
        INSERT INTO grade (id, network_id, enrollment_id, class_group_subject_id,
                          term, value, posted_by)
        VALUES (${crypto.randomUUID()}, ${cenario.rede.id}, ${cenario.matriculas[0].id},
                ${cenario.turmaDisciplinas[0].id}, ${bimestre}, ${valor},
                ${cenario.professor.id})`;
    })();
  }

  test('o banco barra nota acima de 10 mesmo por INSERT direto', async () => {
    await expect(inserirNotaCrua(1, 11)).rejects.toThrow(/value_valid/);

    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('o banco barra nota negativa mesmo por INSERT direto', async () => {
    await expect(inserirNotaCrua(1, -1)).rejects.toThrow(/value_valid/);

    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('o banco barra bimestre fora de 1 a 4 mesmo por INSERT direto', async () => {
    await expect(inserirNotaCrua(5, 7)).rejects.toThrow(/term_valid/);

    expect(await contarNotas(cenario.rede.id)).toBe(0);
  });

  test('o banco barra a segunda nota do mesmo aluno na mesma disciplina e bimestre', async () => {
    await inserirNotaCrua(1, 7);

    await expect(inserirNotaCrua(1, 8)).rejects.toThrow(/grade_unique/);

    expect(await contarNotas(cenario.rede.id)).toBe(1);
  });

  test('a nota nasce presa ao ano letivo do cenário e à rede que a criou', async () => {
    await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 7 }],
    });

    const deOutraRede = await avaliacao.notasDaTurmaDisciplina(
      crypto.randomUUID(),
      cenario.turmaDisciplinas[0].id,
      1,
    );

    expect(cenario.anoLetivo.year).toBe(ANO_PADRAO);
    expect(deOutraRede.size).toBe(0);
  });
});
