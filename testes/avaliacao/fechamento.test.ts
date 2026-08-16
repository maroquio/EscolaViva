/*
 * O fechamento de bimestre é a operação síncrona que planta a dor do Estágio 05: ela confere toda
 * matrícula ativa contra toda disciplina alocada antes de gravar, e recusa dizendo exatamente o que
 * falta. Depois de fechado, o bimestre não aceita mais nota — item 15 da Seção 9.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { avaliacao } from '../../src/avaliacao';
import {
  estadosDeFechamento,
  mensagemDePendencias,
  pendenciasDoFechamento,
  todosBimestresFechados,
} from '../../src/avaliacao/dominio/fechamentoBimestre';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import { cenarioCompleto, criarTurmaDisciplina, type Cenario } from '../apoio/fabricas';

const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

let cenario: Cenario;

beforeEach(async () => {
  await limparBanco();
  cenario = await cenarioCompleto();
});

/** Lança `valor` para todas as matrículas em todas as disciplinas da turma no bimestre. */
async function lancarTudo(bimestre: number, valor = 7): Promise<void> {
  for (const turmaDisciplina of cenario.turmaDisciplinas) {
    await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: turmaDisciplina.id,
      bimestre,
      lancadaPor: cenario.professor.id,
      notas: cenario.matriculas.map((matricula) => ({ matriculaId: matricula.id, valor })),
    });
  }
}

function fechar(bimestre: number, turmaId = cenario.turmas[0].id): ReturnType<
  typeof avaliacao.fecharBimestre
> {
  return avaliacao.fecharBimestre({
    redeId: cenario.rede.id,
    turmaId,
    bimestre,
    fechadoPor: cenario.professor.id,
  });
}

function mensagemDe(resultado: { ok: boolean } & Record<string, unknown>): string {
  const erros = resultado.ok ? [] : ((resultado.erros ?? []) as { mensagem: string }[]);
  return erros[0]?.mensagem ?? '';
}

describe('fechamentoBimestre (domínio)', () => {
  test('expande a grade dos quatro bimestres tratando a ausência como bimestre aberto', () => {
    const gravados = [{ bimestre: 2, fechadoEm: '2026-05-10T12:00:00Z' }];

    const estados = estadosDeFechamento(gravados);

    expect(estados).toEqual([
      { bimestre: 1, fechado: false, fechadoEm: null },
      { bimestre: 2, fechado: true, fechadoEm: '2026-05-10T12:00:00Z' },
      { bimestre: 3, fechado: false, fechadoEm: null },
      { bimestre: 4, fechado: false, fechadoEm: null },
    ]);
  });

  test('turma sem fechamento nenhum tem os quatro bimestres abertos', () => {
    const estados = estadosDeFechamento([]);

    expect(estados).toHaveLength(4);
    expect(estados.every((estado) => !estado.fechado)).toBe(true);
  });

  test('só considera o ano encerrado quando os quatro bimestres estão fechados', () => {
    const tresFechados = estadosDeFechamento([1, 2, 3].map((bimestre) => ({
      bimestre,
      fechadoEm: '2026-05-10T12:00:00Z',
    })));
    const quatroFechados = estadosDeFechamento([1, 2, 3, 4].map((bimestre) => ({
      bimestre,
      fechadoEm: '2026-05-10T12:00:00Z',
    })));

    expect(todosBimestresFechados(tresFechados)).toBe(false);
    expect(todosBimestresFechados(quatroFechados)).toBe(true);
  });

  test('lista só as disciplinas que ainda impedem o fechamento', () => {
    const disciplinas = [
      { id: 'a', disciplinaNome: 'Matemática' },
      { id: 'b', disciplinaNome: 'História' },
    ];

    const pendencias = pendenciasDoFechamento(disciplinas, 5, new Map([['a', 5], ['b', 2]]));

    expect(pendencias).toEqual([{ disciplinaNome: 'História', faltando: 3 }]);
  });

  test('a disciplina sem lançamento nenhum falta a turma inteira', () => {
    const disciplinas = [{ id: 'a', disciplinaNome: 'Matemática' }];

    const pendencias = pendenciasDoFechamento(disciplinas, 5, new Map());

    expect(pendencias).toEqual([{ disciplinaNome: 'Matemática', faltando: 5 }]);
  });

  test('a mensagem de uma pendência única fica no singular', () => {
    const mensagem = mensagemDePendencias([{ disciplinaNome: 'História', faltando: 1 }]);

    expect(mensagem).toBe('Falta 1 nota para fechar o bimestre: História (1).');
  });

  test('a mensagem soma as pendências e nomeia cada disciplina', () => {
    const mensagem = mensagemDePendencias([
      { disciplinaNome: 'História', faltando: 3 },
      { disciplinaNome: 'Matemática', faltando: 4 },
    ]);

    expect(mensagem).toBe('Faltam 7 notas para fechar o bimestre: História (3), Matemática (4).');
  });
});

describe('fecharBimestre', () => {
  test('recusa enquanto falta nota e diz quantas são e em quais disciplinas', async () => {
    await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: cenario.matriculas.map((matricula) => ({ matriculaId: matricula.id, valor: 7 })),
    });

    const resultado = await fechar(1);

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'bimestre', codigo: 'fechamento_incompleto' })],
    });
    const mensagem = mensagemDe(resultado);
    expect(mensagem).toContain('Faltam 10 notas para fechar o bimestre');
    expect(mensagem).toContain(`${cenario.disciplinas[1].name} (5)`);
    expect(mensagem).toContain(`${cenario.disciplinas[2].name} (5)`);
  });

  test('a recusa por uma única nota faltando fica no singular e aponta a disciplina', async () => {
    await lancarTudo(1);
    await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[2].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: null }],
    });

    const resultado = await fechar(1);

    expect(mensagemDe(resultado)).toBe(
      `Falta 1 nota para fechar o bimestre: ${cenario.disciplinas[2].name} (1).`,
    );
  });

  test('fecha quando toda matrícula ativa tem nota em toda disciplina alocada', async () => {
    await lancarTudo(1);

    const resultado = await fechar(1);

    expect(resultado).toEqual({ ok: true, valor: undefined });
    const estados = await avaliacao.estadoDeFechamento(cenario.rede.id, cenario.turmas[0].id);
    expect(estados[0]).toEqual({
      bimestre: 1,
      fechado: true,
      fechadoEm: expect.stringMatching(INSTANTE_ISO),
    });
    expect(estados.slice(1).every((estado) => !estado.fechado)).toBe(true);
  });

  test('recusa fechar o mesmo bimestre duas vezes', async () => {
    await lancarTudo(1);
    await fechar(1);

    const resultado = await fechar(1);

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'bimestre', codigo: 'ja_fechado' })],
    });
  });

  test('depois de fechado o bimestre não aceita mais lançamento de nota', async () => {
    await lancarTudo(1);
    await fechar(1);

    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 10 }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'bimestre', codigo: 'bimestre_fechado' })],
    });
    const notas = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      1,
    );
    expect(notas.get(cenario.matriculas[0].id)).toBe(7);
  });

  test('o bimestre fechado não trava os outros três', async () => {
    await lancarTudo(1);
    await fechar(1);

    const resultado = await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 2,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 9 }],
    });

    expect(resultado).toEqual({ ok: true, valor: 1 });
  });

  test('o fechamento de uma turma não fecha o bimestre da turma vizinha', async () => {
    await criarTurmaDisciplina({
      networkId: cenario.rede.id,
      classGroupId: cenario.turmas[1].id,
      subjectId: cenario.disciplinas[0].id,
      teacherUserId: cenario.professor.id,
    });
    await lancarTudo(1);
    await fechar(1);

    const estados = await avaliacao.estadoDeFechamento(cenario.rede.id, cenario.turmas[1].id);

    expect(estados.every((estado) => !estado.fechado)).toBe(true);
  });

  test('nota de aluno transferido não conta como pendência', async () => {
    const transferida = cenario.matriculas[4];
    for (const turmaDisciplina of cenario.turmaDisciplinas) {
      await avaliacao.lancarNotas({
        redeId: cenario.rede.id,
        turmaDisciplinaId: turmaDisciplina.id,
        bimestre: 1,
        lancadaPor: cenario.professor.id,
        notas: cenario.matriculas
          .filter((matricula) => matricula.id !== transferida.id)
          .map((matricula) => ({ matriculaId: matricula.id, valor: 7 })),
      });
    }
    await sqlDeTeste()`
      UPDATE enrollment SET status = 'transferred' WHERE id = ${transferida.id}`;

    const resultado = await fechar(1);

    expect(resultado).toEqual({ ok: true, valor: undefined });
  });

  test('recusa turma sem disciplina alocada', async () => {
    const resultado = await fechar(1, cenario.turmas[1].id);

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'turmaId', codigo: 'sem_disciplina' })],
    });
  });

  test('recusa turma sem matrícula ativa', async () => {
    await criarTurmaDisciplina({
      networkId: cenario.rede.id,
      classGroupId: cenario.turmas[1].id,
      subjectId: cenario.disciplinas[0].id,
      teacherUserId: cenario.professor.id,
    });

    const resultado = await fechar(1, cenario.turmas[1].id);

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'turmaId', codigo: 'sem_matricula_ativa' })],
    });
  });

  test('recusa turma que não é desta rede', async () => {
    const outra = await cenarioCompleto();

    const resultado = await fechar(1, outra.turmas[0].id);

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'turmaId', codigo: 'nao_encontrada' })],
    });
  });

  test('recusa bimestre fora de 1 a 4', async () => {
    const resultado = await fechar(5);

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'bimestre' })],
    });
  });

  test('fecha os quatro bimestres da turma, um a um', async () => {
    for (const bimestre of [1, 2, 3, 4]) {
      await lancarTudo(bimestre);
      await fechar(bimestre);
    }

    const estados = await avaliacao.estadoDeFechamento(cenario.rede.id, cenario.turmas[0].id);

    expect(todosBimestresFechados(estados)).toBe(true);
  });
});
