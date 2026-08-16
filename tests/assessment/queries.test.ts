/*
 * As consultas de `assessment` contra o banco real, com o boletim no centro: média, percentual de
 * frequência e situação são calculados a cada leitura (I5) e precisam bater, ponta a ponta, com o
 * que as funções puras de `domain/reportCard.ts` decidem.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { assessment } from '../../src/assessment';
import { clearDatabase } from '../support/database';
import {
  DEFAULT_YEAR,
  fullScenario,
  createStudent,
  createAcademicYear,
  createSubject,
  createEnrollment,
  createNetwork,
  createClassGroup,
  createClassGroupSubject,
  createSchool,
  createUser,
} from '../support/factories';

const TERMS = [1, 2, 3, 4];

type MinimalScenario = {
  networkId: string;
  classGroupId: string;
  classGroupName: string;
  classGroupSubjectId: string;
  subjectName: string;
  enrollmentId: string;
  studentName: string;
  teacherId: string;
};

beforeEach(clearDatabase);

/** Uma turma com um aluno e uma disciplina: o menor cenário em que um boletim inteiro cabe. */
async function minimalScenario(): Promise<MinimalScenario> {
  const network = await createNetwork({});
  const school = await createSchool({ networkId: network.id });
  const academicYear = await createAcademicYear({ networkId: network.id });
  const classGroup = await createClassGroup({
    networkId: network.id,
    schoolId: school.id,
    academicYearId: academicYear.id,
  });
  const subject = await createSubject({ networkId: network.id });
  const teacher = await createUser({
    networkId: network.id,
    roles: [{ schoolId: school.id, role: 'teacher' }],
  });
  const classGroupSubject = await createClassGroupSubject({
    networkId: network.id,
    classGroupId: classGroup.id,
    subjectId: subject.id,
    teacherUserId: teacher.id,
  });
  const student = await createStudent({ networkId: network.id });
  const enrollment = await createEnrollment({
    networkId: network.id,
    studentId: student.id,
    classGroupId: classGroup.id,
    academicYearId: academicYear.id,
  });
  return {
    networkId: network.id,
    classGroupId: classGroup.id,
    classGroupName: classGroup.name,
    classGroupSubjectId: classGroupSubject.id,
    subjectName: subject.name,
    enrollmentId: enrollment.id,
    studentName: student.name,
    teacherId: teacher.id,
  };
}

/** Lança a mesma nota nos bimestres indicados e fecha cada um deles. */
async function attendTerms(
  minimal: MinimalScenario,
  value: number,
  terms: number[] = TERMS,
): Promise<void> {
  for (const term of terms) {
    await assessment.postGrades({
      networkId: minimal.networkId,
      classGroupSubjectId: minimal.classGroupSubjectId,
      term,
      postedBy: minimal.teacherId,
      grades: [{ enrollmentId: minimal.enrollmentId, value }],
    });
    await assessment.closeTerm({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      term,
      closedBy: minimal.teacherId,
    });
  }
}

/** Registra `presencas` dias de presença seguidos de `faltas` dias de falta, em março. */
async function recordDays(
  minimal: MinimalScenario,
  presentDays: number,
  absences: number,
): Promise<void> {
  const total = presentDays + absences;
  for (let day = 1; day <= total; day += 1) {
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-${String(day).padStart(2, '0')}`,
      rows: [{ enrollmentId: minimal.enrollmentId, present: day <= presentDays }],
    });
  }
}

describe('classGroupSubjectGrades', () => {
  test('devolve as notas do bimestre indexadas por matrícula', async () => {
    const scenario = await fullScenario();
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [
        { enrollmentId: scenario.enrollments[0].id, value: 6.5 },
        { enrollmentId: scenario.enrollments[1].id, value: 9 },
      ],
    });

    const grades = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      1,
    );

    expect(grades.size).toBe(2);
    expect(grades.get(scenario.enrollments[0].id)).toBe(6.5);
    expect(grades.get(scenario.enrollments[1].id)).toBe(9);
  });

  test('não mistura a nota de outro bimestre', async () => {
    const scenario = await fullScenario();
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 6 }],
    });

    const second = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      2,
    );

    expect(second.size).toBe(0);
  });

  test('não devolve nota de outra rede', async () => {
    const scenario = await fullScenario();
    const other = await fullScenario();
    await assessment.postGrades({
      networkId: other.network.id,
      classGroupSubjectId: other.classGroupSubjects[0].id,
      term: 1,
      postedBy: other.teacher.id,
      grades: [{ enrollmentId: other.enrollments[0].id, value: 8 }],
    });

    const seenFromTheOtherNetwork = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      other.classGroupSubjects[0].id,
      1,
    );

    expect(seenFromTheOtherNetwork.size).toBe(0);
  });
});

describe('rollCallForDate', () => {
  test('devolve o que já foi registrado naquele dia', async () => {
    const minimal = await minimalScenario();
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-02`,
      rows: [
        { enrollmentId: minimal.enrollmentId, present: false, excuse: 'Viagem em família' },
      ],
    });

    const rollCall = await assessment.rollCallForDate(
      minimal.networkId,
      minimal.classGroupId,
      `${DEFAULT_YEAR}-03-02`,
    );

    expect(rollCall.get(minimal.enrollmentId)).toEqual({
      present: false,
      excuse: 'Viagem em família',
    });
  });

  test('não mistura o registro de outro dia', async () => {
    const minimal = await minimalScenario();
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-02`,
      rows: [{ enrollmentId: minimal.enrollmentId, present: true }],
    });

    const anotherDay = await assessment.rollCallForDate(
      minimal.networkId,
      minimal.classGroupId,
      `${DEFAULT_YEAR}-03-03`,
    );

    expect(anotherDay.size).toBe(0);
  });

  test('devolve mapa vazio para turma sem matrícula ativa', async () => {
    const scenario = await fullScenario();

    const rollCall = await assessment.rollCallForDate(
      scenario.network.id,
      scenario.classGroups[1].id,
      `${DEFAULT_YEAR}-03-02`,
    );

    expect(rollCall.size).toBe(0);
  });
});

describe('closingState', () => {
  test('devolve os quatro bimestres abertos para turma que ainda não fechou nada', async () => {
    const minimal = await minimalScenario();

    const states = await assessment.closingState(minimal.networkId, minimal.classGroupId);

    expect(states).toEqual([
      { term: 1, closed: false, closedAt: null },
      { term: 2, closed: false, closedAt: null },
      { term: 3, closed: false, closedAt: null },
      { term: 4, closed: false, closedAt: null },
    ]);
  });

  test('não enxerga o fechamento de uma turma de outra rede', async () => {
    const minimal = await minimalScenario();
    await attendTerms(minimal, 7, [1]);

    const seenFromAnotherNetwork = await assessment.closingState(
      crypto.randomUUID(),
      minimal.classGroupId,
    );

    expect(seenFromAnotherNetwork.every((state) => !state.closed)).toBe(true);
  });
});

describe('enrollmentAttendance', () => {
  test('devolve o histórico do dia mais recente para o mais antigo', async () => {
    const minimal = await minimalScenario();
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-01`,
      rows: [{ enrollmentId: minimal.enrollmentId, present: true }],
    });
    await assessment.recordRollCall({
      networkId: minimal.networkId,
      classGroupId: minimal.classGroupId,
      date: `${DEFAULT_YEAR}-03-05`,
      rows: [{ enrollmentId: minimal.enrollmentId, present: false, excuse: 'Gripe' }],
    });

    const history = await assessment.enrollmentAttendance(minimal.networkId, minimal.enrollmentId);

    expect(history).toEqual([
      { date: `${DEFAULT_YEAR}-03-05`, present: false, excuse: 'Gripe' },
      { date: `${DEFAULT_YEAR}-03-01`, present: true, excuse: null },
    ]);
  });

  test('devolve lista vazia para matrícula de outra rede', async () => {
    const minimal = await minimalScenario();
    await recordDays(minimal, 2, 0);

    const history = await assessment.enrollmentAttendance(
      crypto.randomUUID(),
      minimal.enrollmentId,
    );

    expect(history).toEqual([]);
  });
});

describe('reportCard', () => {
  test('monta uma linha por disciplina da turma, ordenada por nome', async () => {
    const scenario = await fullScenario();
    for (const classGroupSubject of scenario.classGroupSubjects) {
      await assessment.postGrades({
        networkId: scenario.network.id,
        classGroupSubjectId: classGroupSubject.id,
        term: 1,
        postedBy: scenario.teacher.id,
        grades: [{ enrollmentId: scenario.enrollments[0].id, value: 7 }],
      });
    }

    const reportCard = await assessment.reportCard(scenario.network.id, scenario.enrollments[0].id);

    const names = reportCard?.rows.map((row) => row.subjectName) ?? [];
    expect(names).toHaveLength(3);
    expect(names).toEqual([...names].sort());
    expect([...names].sort()).toEqual(scenario.subjects.map((d) => d.name).sort());
    expect(reportCard?.rows[0]).toEqual({
      subjectName: names[0] ?? '',
      grades: [7, null, null, null],
      average: null,
    });
  });

  test('deixa o aluno em curso enquanto falta nota, nunca reprovado', async () => {
    const scenario = await fullScenario();

    const reportCard = await assessment.reportCard(scenario.network.id, scenario.enrollments[0].id);

    expect(reportCard?.overallAverage).toBeNull();
    expect(reportCard?.status).toBe('in_progress');
    expect(reportCard?.rows.every((row) => row.average === null)).toBe(true);
  });

  test('aprova o aluno de média 6,0 com 75 % de presença quando o ano fecha', async () => {
    const minimal = await minimalScenario();
    await attendTerms(minimal, 6);

    await recordDays(minimal, 3, 1);

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);
    expect(reportCard).toEqual({
      enrollmentId: minimal.enrollmentId,
      studentName: minimal.studentName,
      classGroupName: minimal.classGroupName,
      year: DEFAULT_YEAR,
      rows: [{ subjectName: minimal.subjectName, grades: [6, 6, 6, 6], average: 6 }],
      termAverages: [6, 6, 6, 6],
      overallAverage: 6,
      attendanceRate: 75,
      totalDays: 4,
      presentDays: 3,
      status: 'passed',
    });
  });

  test('reprova por frequência o aluno de média 8,0 que faltou demais', async () => {
    const minimal = await minimalScenario();
    await attendTerms(minimal, 8);

    await recordDays(minimal, 2, 2);

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);
    expect(reportCard?.overallAverage).toBe(8);
    expect(reportCard?.attendanceRate).toBe(50);
    expect(reportCard?.status).toBe('failed');
  });

  test('reprova por nota o aluno de média 5,9 com presença integral', async () => {
    const minimal = await minimalScenario();
    await attendTerms(minimal, 5.9);

    await recordDays(minimal, 4, 0);

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);
    expect(reportCard?.overallAverage).toBe(5.9);
    expect(reportCard?.attendanceRate).toBe(100);
    expect(reportCard?.status).toBe('failed');
  });

  test('mantém em curso enquanto o quarto bimestre não é fechado, mesmo com média alta', async () => {
    const minimal = await minimalScenario();
    await attendTerms(minimal, 9, [1, 2, 3]);
    await assessment.postGrades({
      networkId: minimal.networkId,
      classGroupSubjectId: minimal.classGroupSubjectId,
      term: 4,
      postedBy: minimal.teacherId,
      grades: [{ enrollmentId: minimal.enrollmentId, value: 9 }],
    });

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);

    expect(reportCard?.overallAverage).toBe(9);
    expect(reportCard?.status).toBe('in_progress');
  });

  test('devolve frequência zero, sem dia nenhum, para turma que ainda não teve chamada', async () => {
    const minimal = await minimalScenario();

    const reportCard = await assessment.reportCard(minimal.networkId, minimal.enrollmentId);

    expect(reportCard?.totalDays).toBe(0);
    expect(reportCard?.presentDays).toBe(0);
    expect(reportCard?.attendanceRate).toBe(0);
  });

  test('devolve null para matrícula de outra rede', async () => {
    const minimal = await minimalScenario();
    const other = await minimalScenario();

    const reportCard = await assessment.reportCard(minimal.networkId, other.enrollmentId);

    expect(reportCard).toBeNull();
  });

  test('devolve null para matrícula que não existe', async () => {
    const minimal = await minimalScenario();

    const reportCard = await assessment.reportCard(minimal.networkId, crypto.randomUUID());

    expect(reportCard).toBeNull();
  });
});
