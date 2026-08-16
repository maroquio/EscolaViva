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
    const notas = [10, 0, 10, 0];

    const media = subjectAverage(notas);

    expect(media).toBe(5);
  });

  test('não pondera bimestre nenhum: a ordem das notas não muda a média', () => {
    const crescente = [0, 0, 10, 10];
    const decrescente = [10, 10, 0, 0];

    const mediaCrescente = subjectAverage(crescente);
    const mediaDecrescente = subjectAverage(decrescente);

    expect(mediaCrescente).toBe(5);
    expect(mediaDecrescente).toBe(5);
  });

  test('trunca na segunda casa: a média que dá 5,995 vale 5,99 e não 6,00', () => {
    const notas = [5.99, 6, 5.99, 6];

    const media = subjectAverage(notas);

    expect(media).toBe(5.99);
  });

  test('preserva a nota exata quando os quatro bimestres são iguais', () => {
    const notas = [7.45, 7.45, 7.45, 7.45];

    const media = subjectAverage(notas);

    expect(media).toBe(7.45);
  });

  test('devolve null quando algum bimestre está sem nota', () => {
    const notas = [8, null, 7, 9];

    const media = subjectAverage(notas);

    expect(media).toBeNull();
  });

  test('devolve null quando não recebe os quatro bimestres', () => {
    const incompleta = [8, 8, 8];

    const media = subjectAverage(incompleta);

    expect(media).toBeNull();
  });

  test('devolve null para uma lista de notas vazia', () => {
    const nenhuma: (number | null)[] = [];

    const media = subjectAverage(nenhuma);

    expect(media).toBeNull();
  });
});

describe('overallAverage', () => {
  test('é a média simples das médias das disciplinas', () => {
    const medias = [10, 5, 0];

    const geral = overallAverage(medias);

    expect(geral).toBe(5);
  });

  test('trunca na segunda casa em vez de arredondar para cima', () => {
    const medias = [5.99, 6];

    const geral = overallAverage(medias);

    expect(geral).toBe(5.99);
  });

  test('devolve null quando alguma disciplina ainda não tem média', () => {
    const medias = [8, null, 9];

    const geral = overallAverage(medias);

    expect(geral).toBeNull();
  });

  test('devolve null quando o aluno não cursa disciplina nenhuma', () => {
    const nenhuma: (number | null)[] = [];

    const geral = overallAverage(nenhuma);

    expect(geral).toBeNull();
  });
});

describe('termAverages', () => {
  const linha = (disciplinaNome: string, notas: (number | null)[]) => ({
    subjectName: disciplinaNome,
    grades: notas,
    average: subjectAverage(notas),
  });

  test('é a média simples das notas de todas as disciplinas em cada bimestre', () => {
    const linhas = [linha('Arte', [10, 8, 6, 4]), linha('Ciências', [0, 2, 4, 6])];

    const medias = termAverages(linhas);

    expect(medias).toEqual([5, 5, 5, 5]);
  });

  test('trunca na segunda casa, como o resto da regra', () => {
    const linhas = [linha('Arte', [5.99, 10, 10, 10]), linha('Ciências', [6, 10, 10, 10])];

    const medias = termAverages(linhas);

    expect(medias[0]).toBe(5.99);
  });

  test('devolve null no bimestre em que falta nota de alguma disciplina', () => {
    const linhas = [linha('Arte', [7, null, 8, 9]), linha('Ciências', [9, 9, 8, 7])];

    const medias = termAverages(linhas);

    expect(medias).toEqual([8, null, 8, 8]);
  });

  test('devolve os quatro bimestres nulos quando o aluno não cursa disciplina nenhuma', () => {
    const nenhuma: ReturnType<typeof linha>[] = [];

    const medias = termAverages(nenhuma);

    expect(medias).toEqual([null, null, null, null]);
  });
});

describe('attendanceRate', () => {
  test('devolve 0 sem dia registrado, em vez de dividir por zero', () => {
    const semDia = attendanceRate(0, 0);

    expect(semDia).toBe(0);
    expect(Number.isNaN(semDia)).toBe(false);
  });

  test('converte presenças em percentual', () => {
    const percentual = attendanceRate(3, 4);

    expect(percentual).toBe(75);
  });

  test('trunca da terceira casa em diante', () => {
    const percentual = attendanceRate(2, 3);

    expect(percentual).toBe(66.66);
  });

  test('devolve 100 quando o aluno esteve presente em todos os dias', () => {
    const percentual = attendanceRate(180, 180);

    expect(percentual).toBe(100);
  });

  test('devolve 0 quando o aluno faltou a todos os dias registrados', () => {
    const percentual = attendanceRate(0, 200);

    expect(percentual).toBe(0);
  });
});

describe('finalStatus', () => {
  test('reprova a média 5,9 mesmo com frequência integral', () => {
    const situacao = finalStatus(5.9, 100, true);

    expect(situacao).toBe('failed');
  });

  test('aprova a média 6,0 exata', () => {
    const situacao = finalStatus(6, 100, true);

    expect(situacao).toBe('passed');
  });

  test('reprova a frequência de 74,9 % mesmo com média 8,0', () => {
    const situacao = finalStatus(8, 74.9, true);

    expect(situacao).toBe('failed');
  });

  test('aprova na fronteira inclusiva: média 6,0 e frequência 75,0 %', () => {
    const situacao = finalStatus(6, 75, true);

    expect(situacao).toBe('passed');
  });

  test('reprova a média 5,995 porque ela vale 5,99 e não 6,00', () => {
    const situacao = finalStatus(5.995, 100, true);

    expect(situacao).toBe('failed');
  });

  test('deixa em curso enquanto algum bimestre está aberto, mesmo com média alta', () => {
    const situacao = finalStatus(9.5, 100, false);

    expect(situacao).toBe('in_progress');
  });

  test('deixa em curso quando falta nota, nunca reprovado', () => {
    const situacao = finalStatus(null, 100, true);

    expect(situacao).toBe('in_progress');
  });

  test('deixa em curso quando falta nota, mesmo com frequência abaixo do mínimo', () => {
    const situacao = finalStatus(null, 40, true);

    expect(situacao).toBe('in_progress');
  });
});

describe('regra pedagógica de ponta a ponta', () => {
  test('bimestre sem nota deixa a disciplina sem média e o aluno em curso', () => {
    const notasDaDisciplina = [8, null, 9, 10];

    const media = subjectAverage(notasDaDisciplina);
    const geral = overallAverage([media]);
    const situacao = finalStatus(geral, attendanceRate(90, 100), true);

    expect(media).toBeNull();
    expect(geral).toBeNull();
    expect(situacao).toBe('in_progress');
  });

  test('aprova o aluno que fecha o ano em 6,0 com 75 % de presença', () => {
    const notasDaDisciplina = [6, 6, 6, 6];

    const geral = overallAverage([subjectAverage(notasDaDisciplina)]);
    const frequencia = attendanceRate(150, 200);
    const situacao = finalStatus(geral, frequencia, true);

    expect(geral).toBe(6);
    expect(frequencia).toBe(75);
    expect(situacao).toBe('passed');
  });

  test('reprova por frequência o aluno de média 8,0 que faltou demais', () => {
    const notasDaDisciplina = [8, 8, 8, 8];

    const geral = overallAverage([subjectAverage(notasDaDisciplina)]);
    const frequencia = attendanceRate(149, 200);
    const situacao = finalStatus(geral, frequencia, true);

    expect(geral).toBe(8);
    expect(frequencia).toBe(74.5);
    expect(situacao).toBe('failed');
  });
});
