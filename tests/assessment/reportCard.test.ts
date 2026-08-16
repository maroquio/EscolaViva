/*
 * A regra pedagógica do EscolaViva, exercida onde ela mora: quatro funções puras, sem banco e sem
 * cenário. Média aritmética simples dos quatro bimestres, aprovação com média ≥ 6,0 E frequência
 * ≥ 75 %, tudo truncado na segunda casa.
 *
 * Este arquivo é o que impede a regra de virar configuração por acidente: se um dia alguém trocar
 * o truncamento por arredondamento, ou introduzir peso por avaliação, é aqui que a suíte grita.
 */

import { describe, expect, test } from 'bun:test';
import {
  subjectAverage,
  overallAverage,
  termAverages,
  attendanceRate,
  finalStatus,
} from '../../src/assessment/domain/reportCard';

describe('subjectAverage', () => {
  test('calcula a média aritmética simples dos quatro bimestres', () => {
    const grades = [10, 0, 10, 0];

    const average = subjectAverage(grades);

    expect(average).toBe(5);
  });

  test('não pondera bimestre nenhum: a ordem das notas não muda a média', () => {
    const ascending = [0, 0, 10, 10];
    const descending = [10, 10, 0, 0];

    const ascendingAverage = subjectAverage(ascending);
    const descendingAverage = subjectAverage(descending);

    expect(ascendingAverage).toBe(5);
    expect(descendingAverage).toBe(5);
  });

  test('trunca na segunda casa: a média que dá 5,995 vale 5,99 e não 6,00', () => {
    const grades = [5.99, 6, 5.99, 6];

    const average = subjectAverage(grades);

    expect(average).toBe(5.99);
  });

  test('preserva a nota exata quando os quatro bimestres são iguais', () => {
    const grades = [7.45, 7.45, 7.45, 7.45];

    const average = subjectAverage(grades);

    expect(average).toBe(7.45);
  });

  test('devolve null quando algum bimestre está sem nota', () => {
    const grades = [8, null, 7, 9];

    const average = subjectAverage(grades);

    expect(average).toBeNull();
  });

  test('devolve null quando não recebe os quatro bimestres', () => {
    const incomplete = [8, 8, 8];

    const average = subjectAverage(incomplete);

    expect(average).toBeNull();
  });

  test('devolve null para uma lista de notas vazia', () => {
    const none: (number | null)[] = [];

    const average = subjectAverage(none);

    expect(average).toBeNull();
  });
});

describe('overallAverage', () => {
  test('é a média simples das médias das disciplinas', () => {
    const averages = [10, 5, 0];

    const overall = overallAverage(averages);

    expect(overall).toBe(5);
  });

  test('trunca na segunda casa em vez de arredondar para cima', () => {
    const averages = [5.99, 6];

    const overall = overallAverage(averages);

    expect(overall).toBe(5.99);
  });

  test('devolve null quando alguma disciplina ainda não tem média', () => {
    const averages = [8, null, 9];

    const overall = overallAverage(averages);

    expect(overall).toBeNull();
  });

  test('devolve null quando o aluno não cursa disciplina nenhuma', () => {
    const none: (number | null)[] = [];

    const overall = overallAverage(none);

    expect(overall).toBeNull();
  });
});

describe('termAverages', () => {
  const row = (subjectName: string, grades: (number | null)[]) => ({
    subjectName,
    grades,
    average: subjectAverage(grades),
  });

  test('é a média simples das notas de todas as disciplinas em cada bimestre', () => {
    const rows = [row('Arte', [10, 8, 6, 4]), row('Ciências', [0, 2, 4, 6])];

    const averages = termAverages(rows);

    expect(averages).toEqual([5, 5, 5, 5]);
  });

  test('trunca na segunda casa, como o resto da regra', () => {
    const rows = [row('Arte', [5.99, 10, 10, 10]), row('Ciências', [6, 10, 10, 10])];

    const averages = termAverages(rows);

    expect(averages[0]).toBe(5.99);
  });

  test('devolve null no bimestre em que falta nota de alguma disciplina', () => {
    const rows = [row('Arte', [7, null, 8, 9]), row('Ciências', [9, 9, 8, 7])];

    const averages = termAverages(rows);

    expect(averages).toEqual([8, null, 8, 8]);
  });

  test('devolve os quatro bimestres nulos quando o aluno não cursa disciplina nenhuma', () => {
    const none: ReturnType<typeof row>[] = [];

    const averages = termAverages(none);

    expect(averages).toEqual([null, null, null, null]);
  });
});

describe('attendanceRate', () => {
  test('devolve 0 sem dia registrado, em vez de dividir por zero', () => {
    const withoutDay = attendanceRate(0, 0);

    expect(withoutDay).toBe(0);
    expect(Number.isNaN(withoutDay)).toBe(false);
  });

  test('converte presenças em percentual', () => {
    const percentage = attendanceRate(3, 4);

    expect(percentage).toBe(75);
  });

  test('trunca da terceira casa em diante', () => {
    const percentage = attendanceRate(2, 3);

    expect(percentage).toBe(66.66);
  });

  test('devolve 100 quando o aluno esteve presente em todos os dias', () => {
    const percentage = attendanceRate(180, 180);

    expect(percentage).toBe(100);
  });

  test('devolve 0 quando o aluno faltou a todos os dias registrados', () => {
    const percentage = attendanceRate(0, 200);

    expect(percentage).toBe(0);
  });
});

describe('finalStatus', () => {
  test('reprova a média 5,9 mesmo com frequência integral', () => {
    const status = finalStatus(5.9, 100, true);

    expect(status).toBe('failed');
  });

  test('aprova a média 6,0 exata', () => {
    const status = finalStatus(6, 100, true);

    expect(status).toBe('passed');
  });

  test('reprova a frequência de 74,9 % mesmo com média 8,0', () => {
    const status = finalStatus(8, 74.9, true);

    expect(status).toBe('failed');
  });

  test('aprova na fronteira inclusiva: média 6,0 e frequência 75,0 %', () => {
    const status = finalStatus(6, 75, true);

    expect(status).toBe('passed');
  });

  test('reprova a média 5,995 porque ela vale 5,99 e não 6,00', () => {
    const status = finalStatus(5.995, 100, true);

    expect(status).toBe('failed');
  });

  test('deixa em curso enquanto algum bimestre está aberto, mesmo com média alta', () => {
    const status = finalStatus(9.5, 100, false);

    expect(status).toBe('in_progress');
  });

  test('deixa em curso quando falta nota, nunca reprovado', () => {
    const status = finalStatus(null, 100, true);

    expect(status).toBe('in_progress');
  });

  test('deixa em curso quando falta nota, mesmo com frequência abaixo do mínimo', () => {
    const status = finalStatus(null, 40, true);

    expect(status).toBe('in_progress');
  });
});

describe('regra pedagógica de ponta a ponta', () => {
  test('bimestre sem nota deixa a disciplina sem média e o aluno em curso', () => {
    const subjectGrades = [8, null, 9, 10];

    const average = subjectAverage(subjectGrades);
    const overall = overallAverage([average]);
    const status = finalStatus(overall, attendanceRate(90, 100), true);

    expect(average).toBeNull();
    expect(overall).toBeNull();
    expect(status).toBe('in_progress');
  });

  test('aprova o aluno que fecha o ano em 6,0 com 75 % de presença', () => {
    const subjectGrades = [6, 6, 6, 6];

    const overall = overallAverage([subjectAverage(subjectGrades)]);
    const attendance = attendanceRate(150, 200);
    const status = finalStatus(overall, attendance, true);

    expect(overall).toBe(6);
    expect(attendance).toBe(75);
    expect(status).toBe('passed');
  });

  test('reprova por frequência o aluno de média 8,0 que faltou demais', () => {
    const subjectGrades = [8, 8, 8, 8];

    const overall = overallAverage([subjectAverage(subjectGrades)]);
    const attendance = attendanceRate(149, 200);
    const status = finalStatus(overall, attendance, true);

    expect(overall).toBe(8);
    expect(attendance).toBe(74.5);
    expect(status).toBe('failed');
  });
});
