/*
 * As consultas paginadas contra o banco de verdade.
 *
 * O que se prova aqui é que o recorte acontece no SQL, e não depois: a página traz apenas o seu
 * pedaço, o total conta a lista inteira e nenhuma das duas coisas atravessa a fronteira da rede.
 * Um recorte que vazasse tenant seria pior que a lista sem recorte — mostraria pouco, e errado.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import { identity } from '../../src/identity';
import { clearDatabase } from '../support/database';
import {
  DEFAULT_YEAR,
  fullScenario,
  createStudent,
  createAcademicYear,
  createSubject,
  createNetwork,
  createGuardian,
  createClassGroup,
  createSchool,
} from '../support/factories';

beforeEach(clearDatabase);

/** Nomes numerados com zero à esquerda para que a ordem alfabética seja a ordem de criação. */
const numberedName = (position: number): string => `Pessoa ${String(position).padStart(3, '0')}`;

describe('paginaDeResponsaveis', () => {
  test('a primeira página traz o tamanho pedido, e o total conta todos', async () => {
    const network = await createNetwork();
    for (let i = 1; i <= 7; i += 1) {
      await createGuardian({ networkId: network.id, name: numberedName(i) });
    }

    const page = await academics.guardiansPage(network.id, 1, 3);

    expect(page.items.map((r) => r.name)).toEqual([
      numberedName(1), numberedName(2), numberedName(3),
    ]);
    expect(page).toMatchObject({ total: 7, page: 1, size: 3, pages: 3 });
  });

  test('a página seguinte continua de onde a anterior parou, sem repetir nem pular', async () => {
    const network = await createNetwork();
    for (let i = 1; i <= 7; i += 1) {
      await createGuardian({ networkId: network.id, name: numberedName(i) });
    }

    const [first, second, third] = await Promise.all([
      academics.guardiansPage(network.id, 1, 3),
      academics.guardiansPage(network.id, 2, 3),
      academics.guardiansPage(network.id, 3, 3),
    ]);

    const traversed = [...first.items, ...second.items, ...third.items].map((r) => r.name);
    expect(traversed).toEqual(Array.from({ length: 7 }, (_, i) => numberedName(i + 1)));
  });

  test('página além do fim devolve a última, e não uma lista vazia', async () => {
    const network = await createNetwork();
    for (let i = 1; i <= 5; i += 1) {
      await createGuardian({ networkId: network.id, name: numberedName(i) });
    }

    const page = await academics.guardiansPage(network.id, 99, 2);

    expect(page.page).toBe(3);
    expect(page.items.map((r) => r.name)).toEqual([numberedName(5)]);
  });

  test('o total nunca conta responsável de outra rede', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    await createGuardian({ networkId: ours.id, name: numberedName(1) });
    const fromOutside = await createGuardian({ networkId: foreign.id, name: numberedName(2) });

    const page = await academics.guardiansPage(ours.id, 1, 50);

    expect(page.total).toBe(1);
    expect(page.items.map((r) => r.id)).not.toContain(fromOutside.id);
  });
});

describe('paginaDeAlunos', () => {
  test('recorta os achados da busca e conta todos os que casam com o termo', async () => {
    const network = await createNetwork();
    for (let i = 1; i <= 6; i += 1) {
      await createStudent({ networkId: network.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }
    await createStudent({ networkId: network.id, name: 'Outro Sobrenome' });

    const page = await academics.studentsPage(network.id, 'Silva', 2, 4);

    expect(page.total).toBe(6);
    expect(page.items).toHaveLength(2);
    expect(page.items.every((student) => student.name.startsWith('Silva'))).toBe(true);
  });

  test('a busca paginada não alcança aluno de outra rede', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    await createStudent({ networkId: ours.id, name: 'Ana Silva' });
    await createStudent({ networkId: foreign.id, name: 'Ana Silva' });

    const page = await academics.studentsPage(ours.id, 'Ana Silva', 1, 20);

    expect(page.total).toBe(1);
    expect(page.items[0]?.networkId).toBe(ours.id);
  });
});

describe('paginaDeTurmas', () => {
  test('o alcance entra como condição: só as turmas das unidades informadas', async () => {
    const network = await createNetwork();
    const [inScope, outside] = await Promise.all([
      createSchool({ networkId: network.id }),
      createSchool({ networkId: network.id }),
    ]);
    const academicYear = await createAcademicYear({ networkId: network.id });
    await createClassGroup({
      networkId: network.id, schoolId: inScope.id, academicYearId: academicYear.id, name: 'Da minha unidade',
    });
    await createClassGroup({
      networkId: network.id, schoolId: outside.id, academicYearId: academicYear.id, name: 'Da outra unidade',
    });

    const page = await academics.classGroupsPage(network.id, { schoolIds: [inScope.id] }, 1, 20);

    expect(page.items.map((classGroup) => classGroup.name)).toEqual(['Da minha unidade']);
    expect(page.total).toBe(1);
  });

  test('lista de unidades vazia significa nenhuma turma, e nunca todas', async () => {
    const scenario = await fullScenario();

    const page = await academics.classGroupsPage(scenario.network.id, { schoolIds: [] }, 1, 20);

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  test('o filtro de ano letivo continua valendo junto com o alcance', async () => {
    const scenario = await fullScenario();
    const otherYear = await createAcademicYear({ networkId: scenario.network.id, year: DEFAULT_YEAR + 1 });
    await createClassGroup({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id,
      academicYearId: otherYear.id, name: 'Turma do ano que vem',
    });

    const page = await academics.classGroupsPage(
      scenario.network.id,
      { schoolIds: [scenario.schools[0].id], academicYearId: otherYear.id },
      1,
      20,
    );

    expect(page.items.map((classGroup) => classGroup.name)).toEqual(['Turma do ano que vem']);
  });
});

describe('paginaDeMatriculasDoAluno', () => {
  test('traz o histórico do aluno restrito às unidades alcançadas', async () => {
    const scenario = await fullScenario();
    const [student] = scenario.students;

    const page = await academics.studentEnrollmentsPage(
      scenario.network.id, student.id, [scenario.schools[0].id], 1, 20,
    );

    expect(page.total).toBe(1);
    expect(page.items[0]?.studentId).toBe(student.id);
  });

  test('unidade fora do alcance não devolve matrícula nenhuma', async () => {
    const scenario = await fullScenario();
    const [student] = scenario.students;

    const page = await academics.studentEnrollmentsPage(
      scenario.network.id, student.id, [scenario.schools[1].id], 1, 20,
    );

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

describe('contagens que substituíram as listas', () => {
  test('alunoTemMatricula separa o aluno novo do aluno de outra unidade', async () => {
    const scenario = await fullScenario();
    const newlyRegistered = await createStudent({ networkId: scenario.network.id });

    expect(await academics.studentHasEnrollment(scenario.network.id, scenario.students[0].id)).toBe(true);
    expect(await academics.studentHasEnrollment(scenario.network.id, newlyRegistered.id)).toBe(false);
  });

  test('contagensPorUnidade devolve turmas, matriculados e responsáveis de cada unidade', async () => {
    const scenario = await fullScenario();

    const bySchool = await academics.countsBySchool(
      scenario.network.id, scenario.schools.map((school) => school.id),
    );

    // O cenário monta as duas turmas e as cinco matrículas na primeira unidade.
    expect(bySchool.get(scenario.schools[0].id)).toEqual({
      classGroups: 2, enrollments: 5, guardians: 5,
    });
    expect(bySchool.get(scenario.schools[1].id)).toEqual({
      classGroups: 0, enrollments: 0, guardians: 0,
    });
  });

  test('totaisDoAlcance conta cada responsável uma vez, mesmo com filhos em duas unidades', async () => {
    const scenario = await fullScenario();
    await createSubject({ networkId: scenario.network.id });

    const totals = await academics.scopeTotals(
      scenario.network.id, scenario.schools.map((school) => school.id),
    );

    expect(totals.classGroups).toBe(2);
    expect(totals.enrollments).toBe(5);
    expect(totals.guardians).toBe(5);
    expect(totals.subjects).toBe(scenario.subjects.length + 1);
  });
});

describe('paginaDeUsuarios', () => {
  test('os papéis vêm só dos usuários da página, e chegam completos', async () => {
    const scenario = await fullScenario();

    const page = await identity.usersPage(scenario.network.id, 1, 2);

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(4);
    const admin = page.items.find((user) => user.id === scenario.admin.id);
    if (admin !== undefined) expect(admin.roles).toHaveLength(2);
  });

  test('rede com id malformado devolve página vazia em vez de estourar', async () => {
    const page = await identity.usersPage('nao-e-uuid', 1, 20);

    expect(page).toMatchObject({ items: [], total: 0, page: 1 });
  });
});
