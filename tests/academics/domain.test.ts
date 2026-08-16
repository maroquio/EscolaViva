/*
 * O domínio acadêmico é feito de decisões que não precisam de banco: qual turno existe, qual
 * situação de matrícula existe, se um período faz sentido e quantos anos o aluno tem numa data.
 */

import { describe, expect, test } from 'bun:test';
import { ageOn } from '../../src/academics/domain/student';
import { isCoherentPeriod } from '../../src/academics/domain/academicYear';
import {
  ENROLLMENT_STATUSES,
  canTransfer,
  isValidEnrollmentStatus,
  type Enrollment,
  type EnrollmentStatus,
} from '../../src/academics/domain/enrollment';
import { SHIFTS, isValidShift } from '../../src/academics/domain/classGroup';

const enrollmentWith = (status: EnrollmentStatus): Enrollment => ({
  id: 'matricula-1',
  networkId: 'rede-1',
  studentId: 'aluno-1',
  studentName: 'Ana Souza',
  classGroupId: 'turma-1',
  classGroupName: '6º A',
  schoolId: 'unidade-1',
  academicYearId: 'ano-1',
  year: 2026,
  enrollmentDate: '2026-02-05',
  status,
});

describe('turno da turma', () => {
  test('reconhece os quatro turnos que o esquema aceita', () => {
    const known = [...SHIFTS];

    const valid = known.map(isValidShift);

    expect(valid).toEqual([true, true, true, true]);
  });

  test('não reconhece turno inventado', () => {
    const madeUp = 'madrugada';

    const valid = isValidShift(madeUp);

    expect(valid).toBe(false);
  });

  test('a comparação é exata: turno com espaço sobrando não passa', () => {
    const withSpace = 'morning ';

    const valid = isValidShift(withSpace);

    expect(valid).toBe(false);
  });
});

describe('situação da matrícula', () => {
  test('reconhece as quatro situações que o esquema aceita', () => {
    const known = [...ENROLLMENT_STATUSES];

    const valid = known.map(isValidEnrollmentStatus);

    expect(valid).toEqual([true, true, true, true]);
  });

  test('não reconhece situação fora do conjunto', () => {
    const outsider = 'trancada';

    const valid = isValidEnrollmentStatus(outsider);

    expect(valid).toBe(false);
  });

  test('só a matrícula ativa pode ser transferida', () => {
    const statuses = [...ENROLLMENT_STATUSES].map(enrollmentWith);

    const transferable = statuses.map(canTransfer);

    expect(transferable).toEqual([true, false, false, false]);
  });
});

describe('período do ano letivo', () => {
  test('término depois do início é coerente', () => {
    const start = '2026-02-01';
    const end = '2026-12-15';

    const coherent = isCoherentPeriod(start, end);

    expect(coherent).toBe(true);
  });

  test('término antes do início não é coerente', () => {
    const start = '2026-12-15';
    const end = '2026-02-01';

    const coherent = isCoherentPeriod(start, end);

    expect(coherent).toBe(false);
  });

  test('período de um dia só, com início igual ao fim, não é coerente', () => {
    const sameDay = '2026-02-01';

    const coherent = isCoherentPeriod(sameDay, sameDay);

    expect(coherent).toBe(false);
  });

  test('a comparação atravessa a virada do ano', () => {
    const start = '2026-08-01';
    const end = '2027-06-30';

    const coherent = isCoherentPeriod(start, end);

    expect(coherent).toBe(true);
  });
});

describe('idade do aluno numa data', () => {
  test('conta anos completos quando o aniversário já passou no ano', () => {
    const birth = '2014-05-10';

    const age = ageOn(birth, '2026-08-13');

    expect(age).toBe(12);
  });

  test('no dia do aniversário a idade já é a nova', () => {
    const birth = '2014-05-10';

    const age = ageOn(birth, '2026-05-10');

    expect(age).toBe(12);
  });

  test('na véspera do aniversário a idade ainda é a anterior', () => {
    const birth = '2014-05-10';

    const age = ageOn(birth, '2026-05-09');

    expect(age).toBe(11);
  });

  test('nascido em dezembro ainda não fez aniversário em janeiro', () => {
    const birth = '2014-12-31';

    const age = ageOn(birth, '2026-01-01');

    expect(age).toBe(11);
  });

  test('nascido em 29 de fevereiro completa idade em 1º de março do ano comum', () => {
    const birth = '2016-02-29';

    const age = ageOn(birth, '2026-03-01');

    expect(age).toBe(10);
  });

  test('data de nascimento no futuro devolve idade negativa', () => {
    const birth = '2026-08-20';

    const age = ageOn(birth, '2026-08-13');

    expect(age).toBe(-1);
  });

  test('recém-nascido tem zero ano no próprio dia', () => {
    const birth = '2026-08-13';

    const age = ageOn(birth, '2026-08-13');

    expect(age).toBe(0);
  });
});
