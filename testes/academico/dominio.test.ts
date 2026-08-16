/*
 * O domínio acadêmico é feito de decisões que não precisam de banco: qual turno existe, qual
 * situação de matrícula existe, se um período faz sentido e quantos anos o aluno tem numa data.
 */

import { describe, expect, test } from 'bun:test';
import { idadeEm } from '../../src/academico/dominio/aluno';
import { periodoCoerente } from '../../src/academico/dominio/anoLetivo';
import {
  SITUACOES_DE_MATRICULA,
  podeTransferir,
  situacaoValida,
  type Matricula,
  type SituacaoMatricula,
} from '../../src/academico/dominio/matricula';
import { TURNOS, turnoValido } from '../../src/academico/dominio/turma';

const matriculaCom = (situacao: SituacaoMatricula): Matricula => ({
  id: 'matricula-1',
  redeId: 'rede-1',
  alunoId: 'aluno-1',
  alunoNome: 'Ana Souza',
  turmaId: 'turma-1',
  turmaNome: '6º A',
  unidadeId: 'unidade-1',
  anoLetivoId: 'ano-1',
  ano: 2026,
  dataMatricula: '2026-02-05',
  situacao,
});

describe('turno da turma', () => {
  test('reconhece os quatro turnos que o esquema aceita', () => {
    const conhecidos = [...TURNOS];

    const validos = conhecidos.map(turnoValido);

    expect(validos).toEqual([true, true, true, true]);
  });

  test('não reconhece turno inventado', () => {
    const inventado = 'madrugada';

    const valido = turnoValido(inventado);

    expect(valido).toBe(false);
  });

  test('a comparação é exata: turno com espaço sobrando não passa', () => {
    const comEspaco = 'morning ';

    const valido = turnoValido(comEspaco);

    expect(valido).toBe(false);
  });
});

describe('situação da matrícula', () => {
  test('reconhece as quatro situações que o esquema aceita', () => {
    const conhecidas = [...SITUACOES_DE_MATRICULA];

    const validas = conhecidas.map(situacaoValida);

    expect(validas).toEqual([true, true, true, true]);
  });

  test('não reconhece situação fora do conjunto', () => {
    const forasteira = 'trancada';

    const valida = situacaoValida(forasteira);

    expect(valida).toBe(false);
  });

  test('só a matrícula ativa pode ser transferida', () => {
    const situacoes = [...SITUACOES_DE_MATRICULA].map(matriculaCom);

    const transferiveis = situacoes.map(podeTransferir);

    expect(transferiveis).toEqual([true, false, false, false]);
  });
});

describe('período do ano letivo', () => {
  test('término depois do início é coerente', () => {
    const inicio = '2026-02-01';
    const fim = '2026-12-15';

    const coerente = periodoCoerente(inicio, fim);

    expect(coerente).toBe(true);
  });

  test('término antes do início não é coerente', () => {
    const inicio = '2026-12-15';
    const fim = '2026-02-01';

    const coerente = periodoCoerente(inicio, fim);

    expect(coerente).toBe(false);
  });

  test('período de um dia só, com início igual ao fim, não é coerente', () => {
    const mesmoDia = '2026-02-01';

    const coerente = periodoCoerente(mesmoDia, mesmoDia);

    expect(coerente).toBe(false);
  });

  test('a comparação atravessa a virada do ano', () => {
    const inicio = '2026-08-01';
    const fim = '2027-06-30';

    const coerente = periodoCoerente(inicio, fim);

    expect(coerente).toBe(true);
  });
});

describe('idade do aluno numa data', () => {
  test('conta anos completos quando o aniversário já passou no ano', () => {
    const nascimento = '2014-05-10';

    const idade = idadeEm(nascimento, '2026-08-13');

    expect(idade).toBe(12);
  });

  test('no dia do aniversário a idade já é a nova', () => {
    const nascimento = '2014-05-10';

    const idade = idadeEm(nascimento, '2026-05-10');

    expect(idade).toBe(12);
  });

  test('na véspera do aniversário a idade ainda é a anterior', () => {
    const nascimento = '2014-05-10';

    const idade = idadeEm(nascimento, '2026-05-09');

    expect(idade).toBe(11);
  });

  test('nascido em dezembro ainda não fez aniversário em janeiro', () => {
    const nascimento = '2014-12-31';

    const idade = idadeEm(nascimento, '2026-01-01');

    expect(idade).toBe(11);
  });

  test('nascido em 29 de fevereiro completa idade em 1º de março do ano comum', () => {
    const nascimento = '2016-02-29';

    const idade = idadeEm(nascimento, '2026-03-01');

    expect(idade).toBe(10);
  });

  test('data de nascimento no futuro devolve idade negativa', () => {
    const nascimento = '2026-08-20';

    const idade = idadeEm(nascimento, '2026-08-13');

    expect(idade).toBe(-1);
  });

  test('recém-nascido tem zero ano no próprio dia', () => {
    const nascimento = '2026-08-13';

    const idade = idadeEm(nascimento, '2026-08-13');

    expect(idade).toBe(0);
  });
});
