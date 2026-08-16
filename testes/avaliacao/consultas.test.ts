/*
 * As consultas de `avaliacao` contra o banco real, com o boletim no centro: média, percentual de
 * frequência e situação são calculados a cada leitura (I5) e precisam bater, ponta a ponta, com o
 * que as funções puras de `dominio/boletim.ts` decidem.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { avaliacao } from '../../src/assessment';
import { limparBanco } from '../apoio/banco';
import {
  ANO_PADRAO,
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarDisciplina,
  criarMatricula,
  criarRede,
  criarTurma,
  criarTurmaDisciplina,
  criarUnidade,
  criarUsuario,
} from '../apoio/fabricas';

const BIMESTRES = [1, 2, 3, 4];

type CenarioMinimo = {
  redeId: string;
  turmaId: string;
  turmaNome: string;
  turmaDisciplinaId: string;
  disciplinaNome: string;
  matriculaId: string;
  alunoNome: string;
  professorId: string;
};

beforeEach(limparBanco);

/** Uma turma com um aluno e uma disciplina: o menor cenário em que um boletim inteiro cabe. */
async function cenarioMinimo(): Promise<CenarioMinimo> {
  const rede = await criarRede({});
  const unidade = await criarUnidade({ networkId: rede.id });
  const anoLetivo = await criarAnoLetivo({ networkId: rede.id });
  const turma = await criarTurma({
    networkId: rede.id,
    schoolId: unidade.id,
    academicYearId: anoLetivo.id,
  });
  const disciplina = await criarDisciplina({ networkId: rede.id });
  const professor = await criarUsuario({
    networkId: rede.id,
    papeis: [{ schoolId: unidade.id, role: 'teacher' }],
  });
  const turmaDisciplina = await criarTurmaDisciplina({
    networkId: rede.id,
    classGroupId: turma.id,
    subjectId: disciplina.id,
    teacherUserId: professor.id,
  });
  const aluno = await criarAluno({ networkId: rede.id });
  const matricula = await criarMatricula({
    networkId: rede.id,
    studentId: aluno.id,
    classGroupId: turma.id,
    academicYearId: anoLetivo.id,
  });
  return {
    redeId: rede.id,
    turmaId: turma.id,
    turmaNome: turma.name,
    turmaDisciplinaId: turmaDisciplina.id,
    disciplinaNome: disciplina.name,
    matriculaId: matricula.id,
    alunoNome: aluno.name,
    professorId: professor.id,
  };
}

/** Lança a mesma nota nos bimestres indicados e fecha cada um deles. */
async function cursarBimestres(
  minimo: CenarioMinimo,
  valor: number,
  bimestres: number[] = BIMESTRES,
): Promise<void> {
  for (const bimestre of bimestres) {
    await avaliacao.lancarNotas({
      redeId: minimo.redeId,
      turmaDisciplinaId: minimo.turmaDisciplinaId,
      bimestre,
      lancadaPor: minimo.professorId,
      notas: [{ matriculaId: minimo.matriculaId, valor }],
    });
    await avaliacao.fecharBimestre({
      redeId: minimo.redeId,
      turmaId: minimo.turmaId,
      bimestre,
      fechadoPor: minimo.professorId,
    });
  }
}

/** Registra `presencas` dias de presença seguidos de `faltas` dias de falta, em março. */
async function registrarDias(
  minimo: CenarioMinimo,
  presencas: number,
  faltas: number,
): Promise<void> {
  const total = presencas + faltas;
  for (let dia = 1; dia <= total; dia += 1) {
    await avaliacao.registrarChamada({
      redeId: minimo.redeId,
      turmaId: minimo.turmaId,
      data: `${ANO_PADRAO}-03-${String(dia).padStart(2, '0')}`,
      linhas: [{ matriculaId: minimo.matriculaId, presente: dia <= presencas }],
    });
  }
}

describe('notasDaTurmaDisciplina', () => {
  test('devolve as notas do bimestre indexadas por matrícula', async () => {
    const cenario = await cenarioCompleto();
    await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [
        { matriculaId: cenario.matriculas[0].id, valor: 6.5 },
        { matriculaId: cenario.matriculas[1].id, valor: 9 },
      ],
    });

    const notas = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      1,
    );

    expect(notas.size).toBe(2);
    expect(notas.get(cenario.matriculas[0].id)).toBe(6.5);
    expect(notas.get(cenario.matriculas[1].id)).toBe(9);
  });

  test('não mistura a nota de outro bimestre', async () => {
    const cenario = await cenarioCompleto();
    await avaliacao.lancarNotas({
      redeId: cenario.rede.id,
      turmaDisciplinaId: cenario.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: cenario.professor.id,
      notas: [{ matriculaId: cenario.matriculas[0].id, valor: 6 }],
    });

    const segundo = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      2,
    );

    expect(segundo.size).toBe(0);
  });

  test('não devolve nota de outra rede', async () => {
    const cenario = await cenarioCompleto();
    const outra = await cenarioCompleto();
    await avaliacao.lancarNotas({
      redeId: outra.rede.id,
      turmaDisciplinaId: outra.turmaDisciplinas[0].id,
      bimestre: 1,
      lancadaPor: outra.professor.id,
      notas: [{ matriculaId: outra.matriculas[0].id, valor: 8 }],
    });

    const vistaDaOutraRede = await avaliacao.notasDaTurmaDisciplina(
      cenario.rede.id,
      outra.turmaDisciplinas[0].id,
      1,
    );

    expect(vistaDaOutraRede.size).toBe(0);
  });
});

describe('chamadaDoDia', () => {
  test('devolve o que já foi registrado naquele dia', async () => {
    const minimo = await cenarioMinimo();
    await avaliacao.registrarChamada({
      redeId: minimo.redeId,
      turmaId: minimo.turmaId,
      data: `${ANO_PADRAO}-03-02`,
      linhas: [
        { matriculaId: minimo.matriculaId, presente: false, justificativa: 'Viagem em família' },
      ],
    });

    const chamada = await avaliacao.chamadaDoDia(
      minimo.redeId,
      minimo.turmaId,
      `${ANO_PADRAO}-03-02`,
    );

    expect(chamada.get(minimo.matriculaId)).toEqual({
      presente: false,
      justificativa: 'Viagem em família',
    });
  });

  test('não mistura o registro de outro dia', async () => {
    const minimo = await cenarioMinimo();
    await avaliacao.registrarChamada({
      redeId: minimo.redeId,
      turmaId: minimo.turmaId,
      data: `${ANO_PADRAO}-03-02`,
      linhas: [{ matriculaId: minimo.matriculaId, presente: true }],
    });

    const outroDia = await avaliacao.chamadaDoDia(
      minimo.redeId,
      minimo.turmaId,
      `${ANO_PADRAO}-03-03`,
    );

    expect(outroDia.size).toBe(0);
  });

  test('devolve mapa vazio para turma sem matrícula ativa', async () => {
    const cenario = await cenarioCompleto();

    const chamada = await avaliacao.chamadaDoDia(
      cenario.rede.id,
      cenario.turmas[1].id,
      `${ANO_PADRAO}-03-02`,
    );

    expect(chamada.size).toBe(0);
  });
});

describe('estadoDeFechamento', () => {
  test('devolve os quatro bimestres abertos para turma que ainda não fechou nada', async () => {
    const minimo = await cenarioMinimo();

    const estados = await avaliacao.estadoDeFechamento(minimo.redeId, minimo.turmaId);

    expect(estados).toEqual([
      { bimestre: 1, fechado: false, fechadoEm: null },
      { bimestre: 2, fechado: false, fechadoEm: null },
      { bimestre: 3, fechado: false, fechadoEm: null },
      { bimestre: 4, fechado: false, fechadoEm: null },
    ]);
  });

  test('não enxerga o fechamento de uma turma de outra rede', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 7, [1]);

    const vistaDeOutraRede = await avaliacao.estadoDeFechamento(
      crypto.randomUUID(),
      minimo.turmaId,
    );

    expect(vistaDeOutraRede.every((estado) => !estado.fechado)).toBe(true);
  });
});

describe('frequenciaDaMatricula', () => {
  test('devolve o histórico do dia mais recente para o mais antigo', async () => {
    const minimo = await cenarioMinimo();
    await avaliacao.registrarChamada({
      redeId: minimo.redeId,
      turmaId: minimo.turmaId,
      data: `${ANO_PADRAO}-03-01`,
      linhas: [{ matriculaId: minimo.matriculaId, presente: true }],
    });
    await avaliacao.registrarChamada({
      redeId: minimo.redeId,
      turmaId: minimo.turmaId,
      data: `${ANO_PADRAO}-03-05`,
      linhas: [{ matriculaId: minimo.matriculaId, presente: false, justificativa: 'Gripe' }],
    });

    const historico = await avaliacao.frequenciaDaMatricula(minimo.redeId, minimo.matriculaId);

    expect(historico).toEqual([
      { data: `${ANO_PADRAO}-03-05`, presente: false, justificativa: 'Gripe' },
      { data: `${ANO_PADRAO}-03-01`, presente: true, justificativa: null },
    ]);
  });

  test('devolve lista vazia para matrícula de outra rede', async () => {
    const minimo = await cenarioMinimo();
    await registrarDias(minimo, 2, 0);

    const historico = await avaliacao.frequenciaDaMatricula(
      crypto.randomUUID(),
      minimo.matriculaId,
    );

    expect(historico).toEqual([]);
  });
});

describe('boletim', () => {
  test('monta uma linha por disciplina da turma, ordenada por nome', async () => {
    const cenario = await cenarioCompleto();
    for (const turmaDisciplina of cenario.turmaDisciplinas) {
      await avaliacao.lancarNotas({
        redeId: cenario.rede.id,
        turmaDisciplinaId: turmaDisciplina.id,
        bimestre: 1,
        lancadaPor: cenario.professor.id,
        notas: [{ matriculaId: cenario.matriculas[0].id, valor: 7 }],
      });
    }

    const boletim = await avaliacao.boletim(cenario.rede.id, cenario.matriculas[0].id);

    const nomes = boletim?.linhas.map((linha) => linha.disciplinaNome) ?? [];
    expect(nomes).toHaveLength(3);
    expect(nomes).toEqual([...nomes].sort());
    expect([...nomes].sort()).toEqual(cenario.disciplinas.map((d) => d.name).sort());
    expect(boletim?.linhas[0]).toEqual({
      disciplinaNome: nomes[0] ?? '',
      notas: [7, null, null, null],
      media: null,
    });
  });

  test('deixa o aluno em curso enquanto falta nota, nunca reprovado', async () => {
    const cenario = await cenarioCompleto();

    const boletim = await avaliacao.boletim(cenario.rede.id, cenario.matriculas[0].id);

    expect(boletim?.mediaGeral).toBeNull();
    expect(boletim?.situacao).toBe('in_progress');
    expect(boletim?.linhas.every((linha) => linha.media === null)).toBe(true);
  });

  test('aprova o aluno de média 6,0 com 75 % de presença quando o ano fecha', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 6);

    await registrarDias(minimo, 3, 1);

    const boletim = await avaliacao.boletim(minimo.redeId, minimo.matriculaId);
    expect(boletim).toEqual({
      matriculaId: minimo.matriculaId,
      alunoNome: minimo.alunoNome,
      turmaNome: minimo.turmaNome,
      ano: ANO_PADRAO,
      linhas: [{ disciplinaNome: minimo.disciplinaNome, notas: [6, 6, 6, 6], media: 6 }],
      mediasPorBimestre: [6, 6, 6, 6],
      mediaGeral: 6,
      percentualFrequencia: 75,
      totalDias: 4,
      presencas: 3,
      situacao: 'passed',
    });
  });

  test('reprova por frequência o aluno de média 8,0 que faltou demais', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 8);

    await registrarDias(minimo, 2, 2);

    const boletim = await avaliacao.boletim(minimo.redeId, minimo.matriculaId);
    expect(boletim?.mediaGeral).toBe(8);
    expect(boletim?.percentualFrequencia).toBe(50);
    expect(boletim?.situacao).toBe('failed');
  });

  test('reprova por nota o aluno de média 5,9 com presença integral', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 5.9);

    await registrarDias(minimo, 4, 0);

    const boletim = await avaliacao.boletim(minimo.redeId, minimo.matriculaId);
    expect(boletim?.mediaGeral).toBe(5.9);
    expect(boletim?.percentualFrequencia).toBe(100);
    expect(boletim?.situacao).toBe('failed');
  });

  test('mantém em curso enquanto o quarto bimestre não é fechado, mesmo com média alta', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 9, [1, 2, 3]);
    await avaliacao.lancarNotas({
      redeId: minimo.redeId,
      turmaDisciplinaId: minimo.turmaDisciplinaId,
      bimestre: 4,
      lancadaPor: minimo.professorId,
      notas: [{ matriculaId: minimo.matriculaId, valor: 9 }],
    });

    const boletim = await avaliacao.boletim(minimo.redeId, minimo.matriculaId);

    expect(boletim?.mediaGeral).toBe(9);
    expect(boletim?.situacao).toBe('in_progress');
  });

  test('devolve frequência zero, sem dia nenhum, para turma que ainda não teve chamada', async () => {
    const minimo = await cenarioMinimo();

    const boletim = await avaliacao.boletim(minimo.redeId, minimo.matriculaId);

    expect(boletim?.totalDias).toBe(0);
    expect(boletim?.presencas).toBe(0);
    expect(boletim?.percentualFrequencia).toBe(0);
  });

  test('devolve null para matrícula de outra rede', async () => {
    const minimo = await cenarioMinimo();
    const outra = await cenarioMinimo();

    const boletim = await avaliacao.boletim(minimo.redeId, outra.matriculaId);

    expect(boletim).toBeNull();
  });

  test('devolve null para matrícula que não existe', async () => {
    const minimo = await cenarioMinimo();

    const boletim = await avaliacao.boletim(minimo.redeId, crypto.randomUUID());

    expect(boletim).toBeNull();
  });
});
