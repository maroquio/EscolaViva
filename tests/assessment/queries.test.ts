/*
 * As consultas de `assessment` contra o banco real, com o boletim no centro: média, percentual de
 * frequência e situação são calculados a cada leitura (I5) e precisam bater, ponta a ponta, com o
 * que as funções puras de `domain/reportCard.ts` decidem.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { assessment } from '../../src/assessment';
import { limparBanco } from '../support/database';
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
} from '../support/factories';

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
    await assessment.postGrades({
      networkId: minimo.redeId,
      classGroupSubjectId: minimo.turmaDisciplinaId,
      term: bimestre,
      postedBy: minimo.professorId,
      grades: [{ enrollmentId: minimo.matriculaId, value: valor }],
    });
    await assessment.closeTerm({
      networkId: minimo.redeId,
      classGroupId: minimo.turmaId,
      term: bimestre,
      closedBy: minimo.professorId,
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
    await assessment.recordRollCall({
      networkId: minimo.redeId,
      classGroupId: minimo.turmaId,
      date: `${ANO_PADRAO}-03-${String(dia).padStart(2, '0')}`,
      rows: [{ enrollmentId: minimo.matriculaId, present: dia <= presencas }],
    });
  }
}

describe('classGroupSubjectGrades', () => {
  test('devolve as notas do bimestre indexadas por matrícula', async () => {
    const cenario = await cenarioCompleto();
    await assessment.postGrades({
      networkId: cenario.rede.id,
      classGroupSubjectId: cenario.turmaDisciplinas[0].id,
      term: 1,
      postedBy: cenario.professor.id,
      grades: [
        { enrollmentId: cenario.matriculas[0].id, value: 6.5 },
        { enrollmentId: cenario.matriculas[1].id, value: 9 },
      ],
    });

    const notas = await assessment.classGroupSubjectGrades(
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
    await assessment.postGrades({
      networkId: cenario.rede.id,
      classGroupSubjectId: cenario.turmaDisciplinas[0].id,
      term: 1,
      postedBy: cenario.professor.id,
      grades: [{ enrollmentId: cenario.matriculas[0].id, value: 6 }],
    });

    const segundo = await assessment.classGroupSubjectGrades(
      cenario.rede.id,
      cenario.turmaDisciplinas[0].id,
      2,
    );

    expect(segundo.size).toBe(0);
  });

  test('não devolve nota de outra rede', async () => {
    const cenario = await cenarioCompleto();
    const outra = await cenarioCompleto();
    await assessment.postGrades({
      networkId: outra.rede.id,
      classGroupSubjectId: outra.turmaDisciplinas[0].id,
      term: 1,
      postedBy: outra.professor.id,
      grades: [{ enrollmentId: outra.matriculas[0].id, value: 8 }],
    });

    const vistaDaOutraRede = await assessment.classGroupSubjectGrades(
      cenario.rede.id,
      outra.turmaDisciplinas[0].id,
      1,
    );

    expect(vistaDaOutraRede.size).toBe(0);
  });
});

describe('rollCallForDate', () => {
  test('devolve o que já foi registrado naquele dia', async () => {
    const minimo = await cenarioMinimo();
    await assessment.recordRollCall({
      networkId: minimo.redeId,
      classGroupId: minimo.turmaId,
      date: `${ANO_PADRAO}-03-02`,
      rows: [
        { enrollmentId: minimo.matriculaId, present: false, excuse: 'Viagem em família' },
      ],
    });

    const chamada = await assessment.rollCallForDate(
      minimo.redeId,
      minimo.turmaId,
      `${ANO_PADRAO}-03-02`,
    );

    expect(chamada.get(minimo.matriculaId)).toEqual({
      present: false,
      excuse: 'Viagem em família',
    });
  });

  test('não mistura o registro de outro dia', async () => {
    const minimo = await cenarioMinimo();
    await assessment.recordRollCall({
      networkId: minimo.redeId,
      classGroupId: minimo.turmaId,
      date: `${ANO_PADRAO}-03-02`,
      rows: [{ enrollmentId: minimo.matriculaId, present: true }],
    });

    const outroDia = await assessment.rollCallForDate(
      minimo.redeId,
      minimo.turmaId,
      `${ANO_PADRAO}-03-03`,
    );

    expect(outroDia.size).toBe(0);
  });

  test('devolve mapa vazio para turma sem matrícula ativa', async () => {
    const cenario = await cenarioCompleto();

    const chamada = await assessment.rollCallForDate(
      cenario.rede.id,
      cenario.turmas[1].id,
      `${ANO_PADRAO}-03-02`,
    );

    expect(chamada.size).toBe(0);
  });
});

describe('closingState', () => {
  test('devolve os quatro bimestres abertos para turma que ainda não fechou nada', async () => {
    const minimo = await cenarioMinimo();

    const estados = await assessment.closingState(minimo.redeId, minimo.turmaId);

    expect(estados).toEqual([
      { term: 1, closed: false, closedAt: null },
      { term: 2, closed: false, closedAt: null },
      { term: 3, closed: false, closedAt: null },
      { term: 4, closed: false, closedAt: null },
    ]);
  });

  test('não enxerga o fechamento de uma turma de outra rede', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 7, [1]);

    const vistaDeOutraRede = await assessment.closingState(
      crypto.randomUUID(),
      minimo.turmaId,
    );

    expect(vistaDeOutraRede.every((estado) => !estado.closed)).toBe(true);
  });
});

describe('enrollmentAttendance', () => {
  test('devolve o histórico do dia mais recente para o mais antigo', async () => {
    const minimo = await cenarioMinimo();
    await assessment.recordRollCall({
      networkId: minimo.redeId,
      classGroupId: minimo.turmaId,
      date: `${ANO_PADRAO}-03-01`,
      rows: [{ enrollmentId: minimo.matriculaId, present: true }],
    });
    await assessment.recordRollCall({
      networkId: minimo.redeId,
      classGroupId: minimo.turmaId,
      date: `${ANO_PADRAO}-03-05`,
      rows: [{ enrollmentId: minimo.matriculaId, present: false, excuse: 'Gripe' }],
    });

    const historico = await assessment.enrollmentAttendance(minimo.redeId, minimo.matriculaId);

    expect(historico).toEqual([
      { date: `${ANO_PADRAO}-03-05`, present: false, excuse: 'Gripe' },
      { date: `${ANO_PADRAO}-03-01`, present: true, excuse: null },
    ]);
  });

  test('devolve lista vazia para matrícula de outra rede', async () => {
    const minimo = await cenarioMinimo();
    await registrarDias(minimo, 2, 0);

    const historico = await assessment.enrollmentAttendance(
      crypto.randomUUID(),
      minimo.matriculaId,
    );

    expect(historico).toEqual([]);
  });
});

describe('reportCard', () => {
  test('monta uma linha por disciplina da turma, ordenada por nome', async () => {
    const cenario = await cenarioCompleto();
    for (const turmaDisciplina of cenario.turmaDisciplinas) {
      await assessment.postGrades({
        networkId: cenario.rede.id,
        classGroupSubjectId: turmaDisciplina.id,
        term: 1,
        postedBy: cenario.professor.id,
        grades: [{ enrollmentId: cenario.matriculas[0].id, value: 7 }],
      });
    }

    const boletim = await assessment.reportCard(cenario.rede.id, cenario.matriculas[0].id);

    const nomes = boletim?.rows.map((linha) => linha.subjectName) ?? [];
    expect(nomes).toHaveLength(3);
    expect(nomes).toEqual([...nomes].sort());
    expect([...nomes].sort()).toEqual(cenario.disciplinas.map((d) => d.name).sort());
    expect(boletim?.rows[0]).toEqual({
      subjectName: nomes[0] ?? '',
      grades: [7, null, null, null],
      average: null,
    });
  });

  test('deixa o aluno em curso enquanto falta nota, nunca reprovado', async () => {
    const cenario = await cenarioCompleto();

    const boletim = await assessment.reportCard(cenario.rede.id, cenario.matriculas[0].id);

    expect(boletim?.overallAverage).toBeNull();
    expect(boletim?.status).toBe('in_progress');
    expect(boletim?.rows.every((linha) => linha.average === null)).toBe(true);
  });

  test('aprova o aluno de média 6,0 com 75 % de presença quando o ano fecha', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 6);

    await registrarDias(minimo, 3, 1);

    const boletim = await assessment.reportCard(minimo.redeId, minimo.matriculaId);
    expect(boletim).toEqual({
      enrollmentId: minimo.matriculaId,
      studentName: minimo.alunoNome,
      classGroupName: minimo.turmaNome,
      year: ANO_PADRAO,
      rows: [{ subjectName: minimo.disciplinaNome, grades: [6, 6, 6, 6], average: 6 }],
      termAverages: [6, 6, 6, 6],
      overallAverage: 6,
      attendanceRate: 75,
      totalDays: 4,
      presentDays: 3,
      status: 'passed',
    });
  });

  test('reprova por frequência o aluno de média 8,0 que faltou demais', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 8);

    await registrarDias(minimo, 2, 2);

    const boletim = await assessment.reportCard(minimo.redeId, minimo.matriculaId);
    expect(boletim?.overallAverage).toBe(8);
    expect(boletim?.attendanceRate).toBe(50);
    expect(boletim?.status).toBe('failed');
  });

  test('reprova por nota o aluno de média 5,9 com presença integral', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 5.9);

    await registrarDias(minimo, 4, 0);

    const boletim = await assessment.reportCard(minimo.redeId, minimo.matriculaId);
    expect(boletim?.overallAverage).toBe(5.9);
    expect(boletim?.attendanceRate).toBe(100);
    expect(boletim?.status).toBe('failed');
  });

  test('mantém em curso enquanto o quarto bimestre não é fechado, mesmo com média alta', async () => {
    const minimo = await cenarioMinimo();
    await cursarBimestres(minimo, 9, [1, 2, 3]);
    await assessment.postGrades({
      networkId: minimo.redeId,
      classGroupSubjectId: minimo.turmaDisciplinaId,
      term: 4,
      postedBy: minimo.professorId,
      grades: [{ enrollmentId: minimo.matriculaId, value: 9 }],
    });

    const boletim = await assessment.reportCard(minimo.redeId, minimo.matriculaId);

    expect(boletim?.overallAverage).toBe(9);
    expect(boletim?.status).toBe('in_progress');
  });

  test('devolve frequência zero, sem dia nenhum, para turma que ainda não teve chamada', async () => {
    const minimo = await cenarioMinimo();

    const boletim = await assessment.reportCard(minimo.redeId, minimo.matriculaId);

    expect(boletim?.totalDays).toBe(0);
    expect(boletim?.presentDays).toBe(0);
    expect(boletim?.attendanceRate).toBe(0);
  });

  test('devolve null para matrícula de outra rede', async () => {
    const minimo = await cenarioMinimo();
    const outra = await cenarioMinimo();

    const boletim = await assessment.reportCard(minimo.redeId, outra.matriculaId);

    expect(boletim).toBeNull();
  });

  test('devolve null para matrícula que não existe', async () => {
    const minimo = await cenarioMinimo();

    const boletim = await assessment.reportCard(minimo.redeId, crypto.randomUUID());

    expect(boletim).toBeNull();
  });
});
