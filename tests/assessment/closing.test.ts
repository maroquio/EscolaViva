/*
 * O fechamento de bimestre é a operação síncrona que planta a dor do Estágio 05: ela confere toda
 * matrícula ativa contra toda disciplina alocada antes de gravar, e recusa dizendo exatamente o que
 * falta. Depois de fechado, o bimestre não aceita mais nota — item 15 da Seção 9.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { assessment } from '../../src/assessment';
import {
  allTermsClosed,
  closingPendingItems,
  closingStates,
  pendingItemsMessage,
} from '../../src/assessment/domain/termClosing';
import { clearDatabase, testSql } from '../support/database';
import { fullScenario, createClassGroupSubject, type Scenario } from '../support/factories';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

let scenario: Scenario;

beforeEach(async () => {
  await clearDatabase();
  scenario = await fullScenario();
});

/** Lança `valor` para todas as matrículas em todas as disciplinas da turma no bimestre. */
async function postEverything(term: number, value = 7): Promise<void> {
  for (const classGroupSubject of scenario.classGroupSubjects) {
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: classGroupSubject.id,
      term,
      postedBy: scenario.teacher.id,
      grades: scenario.enrollments.map((enrollment) => ({ enrollmentId: enrollment.id, value })),
    });
  }
}

function close(term: number, classGroupId = scenario.classGroups[0].id): ReturnType<
  typeof assessment.closeTerm
> {
  return assessment.closeTerm({
    networkId: scenario.network.id,
    classGroupId,
    term,
    closedBy: scenario.teacher.id,
  });
}

function messageOf(result: { ok: boolean } & Record<string, unknown>): string {
  const errors = result.ok ? [] : ((result.erros ?? []) as { mensagem: string }[]);
  return errors[0]?.mensagem ?? '';
}

describe('fechamentoBimestre (domínio)', () => {
  test('expande a grade dos quatro bimestres tratando a ausência como bimestre aberto', () => {
    const saved = [{ term: 2, closedAt: '2026-05-10T12:00:00Z' }];

    const states = closingStates(saved);

    expect(states).toEqual([
      { term: 1, closed: false, closedAt: null },
      { term: 2, closed: true, closedAt: '2026-05-10T12:00:00Z' },
      { term: 3, closed: false, closedAt: null },
      { term: 4, closed: false, closedAt: null },
    ]);
  });

  test('turma sem fechamento nenhum tem os quatro bimestres abertos', () => {
    const states = closingStates([]);

    expect(states).toHaveLength(4);
    expect(states.every((state) => !state.closed)).toBe(true);
  });

  test('só considera o ano encerrado quando os quatro bimestres estão fechados', () => {
    const threeClosed = closingStates([1, 2, 3].map((term) => ({
      term,
      closedAt: '2026-05-10T12:00:00Z',
    })));
    const fourClosed = closingStates([1, 2, 3, 4].map((term) => ({
      term,
      closedAt: '2026-05-10T12:00:00Z',
    })));

    expect(allTermsClosed(threeClosed)).toBe(false);
    expect(allTermsClosed(fourClosed)).toBe(true);
  });

  test('lista só as disciplinas que ainda impedem o fechamento', () => {
    const subjects = [
      { id: 'a', subjectName: 'Matemática' },
      { id: 'b', subjectName: 'História' },
    ];

    const pendingItems = closingPendingItems(subjects, 5, new Map([['a', 5], ['b', 2]]));

    expect(pendingItems).toEqual([{ subjectName: 'História', missing: 3 }]);
  });

  test('a disciplina sem lançamento nenhum falta a turma inteira', () => {
    const subjects = [{ id: 'a', subjectName: 'Matemática' }];

    const pendingItems = closingPendingItems(subjects, 5, new Map());

    expect(pendingItems).toEqual([{ subjectName: 'Matemática', missing: 5 }]);
  });

  test('a mensagem de uma pendência única fica no singular', () => {
    const message = pendingItemsMessage([{ subjectName: 'História', missing: 1 }]);

    expect(message).toBe('Falta 1 nota para fechar o bimestre: História (1).');
  });

  test('a mensagem soma as pendências e nomeia cada disciplina', () => {
    const message = pendingItemsMessage([
      { subjectName: 'História', missing: 3 },
      { subjectName: 'Matemática', missing: 4 },
    ]);

    expect(message).toBe('Faltam 7 notas para fechar o bimestre: História (3), Matemática (4).');
  });
});

describe('closeTerm', () => {
  test('recusa enquanto falta nota e diz quantas são e em quais disciplinas', async () => {
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: scenario.enrollments.map((enrollment) => ({ enrollmentId: enrollment.id, value: 7 })),
    });

    const result = await close(1);

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'term', codigo: 'fechamento_incompleto' })],
    });
    const message = messageOf(result);
    expect(message).toContain('Faltam 10 notas para fechar o bimestre');
    expect(message).toContain(`${scenario.subjects[1].name} (5)`);
    expect(message).toContain(`${scenario.subjects[2].name} (5)`);
  });

  test('a recusa por uma única nota faltando fica no singular e aponta a disciplina', async () => {
    await postEverything(1);
    await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[2].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: null }],
    });

    const result = await close(1);

    expect(messageOf(result)).toBe(
      `Falta 1 nota para fechar o bimestre: ${scenario.subjects[2].name} (1).`,
    );
  });

  test('fecha quando toda matrícula ativa tem nota em toda disciplina alocada', async () => {
    await postEverything(1);

    const result = await close(1);

    expect(result).toEqual({ ok: true, valor: undefined });
    const states = await assessment.closingState(scenario.network.id, scenario.classGroups[0].id);
    expect(states[0]).toEqual({
      term: 1,
      closed: true,
      closedAt: expect.stringMatching(ISO_INSTANT),
    });
    expect(states.slice(1).every((state) => !state.closed)).toBe(true);
  });

  test('recusa fechar o mesmo bimestre duas vezes', async () => {
    await postEverything(1);
    await close(1);

    const result = await close(1);

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'term', codigo: 'ja_fechado' })],
    });
  });

  test('depois de fechado o bimestre não aceita mais lançamento de nota', async () => {
    await postEverything(1);
    await close(1);

    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 1,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 10 }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'term', codigo: 'bimestre_fechado' })],
    });
    const grades = await assessment.classGroupSubjectGrades(
      scenario.network.id,
      scenario.classGroupSubjects[0].id,
      1,
    );
    expect(grades.get(scenario.enrollments[0].id)).toBe(7);
  });

  test('o bimestre fechado não trava os outros três', async () => {
    await postEverything(1);
    await close(1);

    const result = await assessment.postGrades({
      networkId: scenario.network.id,
      classGroupSubjectId: scenario.classGroupSubjects[0].id,
      term: 2,
      postedBy: scenario.teacher.id,
      grades: [{ enrollmentId: scenario.enrollments[0].id, value: 9 }],
    });

    expect(result).toEqual({ ok: true, valor: 1 });
  });

  test('o fechamento de uma turma não fecha o bimestre da turma vizinha', async () => {
    await createClassGroupSubject({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[1].id,
      subjectId: scenario.subjects[0].id,
      teacherUserId: scenario.teacher.id,
    });
    await postEverything(1);
    await close(1);

    const states = await assessment.closingState(scenario.network.id, scenario.classGroups[1].id);

    expect(states.every((state) => !state.closed)).toBe(true);
  });

  test('nota de aluno transferido não conta como pendência', async () => {
    const transferred = scenario.enrollments[4];
    for (const classGroupSubject of scenario.classGroupSubjects) {
      await assessment.postGrades({
        networkId: scenario.network.id,
        classGroupSubjectId: classGroupSubject.id,
        term: 1,
        postedBy: scenario.teacher.id,
        grades: scenario.enrollments
          .filter((enrollment) => enrollment.id !== transferred.id)
          .map((enrollment) => ({ enrollmentId: enrollment.id, value: 7 })),
      });
    }
    await testSql()`
      UPDATE enrollment SET status = 'transferred' WHERE id = ${transferred.id}`;

    const result = await close(1);

    expect(result).toEqual({ ok: true, valor: undefined });
  });

  test('recusa turma sem disciplina alocada', async () => {
    const result = await close(1, scenario.classGroups[1].id);

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'classGroupId', codigo: 'sem_disciplina' })],
    });
  });

  test('recusa turma sem matrícula ativa', async () => {
    await createClassGroupSubject({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[1].id,
      subjectId: scenario.subjects[0].id,
      teacherUserId: scenario.teacher.id,
    });

    const result = await close(1, scenario.classGroups[1].id);

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'classGroupId', codigo: 'sem_matricula_ativa' })],
    });
  });

  test('recusa turma que não é desta rede', async () => {
    const other = await fullScenario();

    const result = await close(1, other.classGroups[0].id);

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'classGroupId', codigo: 'nao_encontrada' })],
    });
  });

  test('recusa bimestre fora de 1 a 4', async () => {
    const result = await close(5);

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'term' })],
    });
  });

  test('fecha os quatro bimestres da turma, um a um', async () => {
    for (const term of [1, 2, 3, 4]) {
      await postEverything(term);
      await close(term);
    }

    const states = await assessment.closingState(scenario.network.id, scenario.classGroups[0].id);

    expect(allTermsClosed(states)).toBe(true);
  });
});
