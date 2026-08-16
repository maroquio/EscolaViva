/*
 * A paginação como o navegador a vê.
 *
 * O estado da página mora na URL, e é isso que se prova aqui: a segunda página é um endereço, o
 * filtro sobrevive à navegação, e duas tabelas na mesma tela andam sem arrastar uma à outra. Um
 * número inventado na query não vira erro nem tela vazia — vira a página mais próxima que existe.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase } from '../support/database';
import {
  fullScenario,
  createStudent,
  createAnnouncement,
  createEnrollment,
  createGuardian,
  type Scenario,
} from '../support/factories';
import { DEFAULT_PAGE_SIZE } from '../../src/shared/pagination';
import { PARAMS } from '../../src/web/constants';
import { helpId } from '../../src/web/render';
import { open, signIn } from './support';

beforeEach(clearDatabase);

/**
 * O tamanho de página do sistema, lido de onde ele é decidido. Os cenários abaixo são montados em
 * torno dele: mudar a régua muda os números esperados sem reescrever teste nenhum.
 */
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/** Os cinco registros que o cenário completo já traz: a sobra que cai na última página. */
const REMAINDER = 5;

const signInAsRegistrar = (scenario: Scenario): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario.registrar.cpf, password: scenario.password });

const signInAsGuardian = (scenario: Scenario): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario.guardian.cpf, password: scenario.password });

const html = async (path: string, cookie: string): Promise<string> =>
  await (await open(path, cookie)).text();

/** Cada linha de dado tem uma célula-âncora `scope="row"`; o cabeçalho não tem. */
const tableRows = (page: string): number => (page.match(/scope="row"/g) ?? []).length;

const numberedName = (position: number): string => `Pessoa ${String(position).padStart(3, '0')}`;

describe('recorte na tela de responsáveis', () => {
  /** Uma página cheia e uma sobra de cinco: os cinco do cenário mais uma página inteira. */
  const onePageAndARemainder = async (): Promise<Scenario> => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE; i += 1) {
      await createGuardian({ networkId: scenario.network.id, name: numberedName(i) });
    }
    return scenario;
  };

  test('a primeira página traz o tamanho de página, e não a lista inteira', async () => {
    const scenario = await onePageAndARemainder();

    const page = await html('/registrar/guardians', await signInAsRegistrar(scenario));

    expect(tableRows(page)).toBe(PAGE_SIZE);
    expect(page).toContain('class="paginacao"');
    expect(page).toContain('href="/registrar/guardians?p=2"');
  });

  test('a contagem da seção mostra o total, e não o tamanho da página', async () => {
    const scenario = await onePageAndARemainder();

    const page = await html('/registrar/guardians', await signInAsRegistrar(scenario));

    expect(page).toContain(`>${PAGE_SIZE + REMAINDER}</span>`);
  });

  test('a segunda página traz a sobra e oferece a volta', async () => {
    const scenario = await onePageAndARemainder();

    const page = await html('/registrar/guardians?p=2', await signInAsRegistrar(scenario));

    expect(tableRows(page)).toBe(REMAINDER);
    expect(page).toContain('rel="prev"');
    expect(page).not.toContain('rel="next"');
  });

  test('página além do fim serve a última, em vez de uma tela vazia', async () => {
    const scenario = await onePageAndARemainder();

    const page = await html('/registrar/guardians?p=999', await signInAsRegistrar(scenario));

    expect(tableRows(page)).toBe(REMAINDER);
  });

  test('página que não é número cai na primeira, sem erro', async () => {
    const scenario = await onePageAndARemainder();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/registrar/guardians?p=abc', cookie);

    expect(response.status).toBe(200);
    expect(tableRows(await response.text())).toBe(PAGE_SIZE);
  });

  test('lista de uma página só não desenha os controles, mas continua contando', async () => {
    const scenario = await fullScenario();

    const page = await html('/registrar/guardians', await signInAsRegistrar(scenario));

    expect(page).toContain('class="paginacao"');
    expect(page).not.toContain('paginacao__lista');
  });
});

describe('o resto da query sobrevive à navegação', () => {
  test('o termo da busca continua nos links de página', async () => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE + REMAINDER; i += 1) {
      await createStudent({ networkId: scenario.network.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }

    const page = await html('/registrar/students?q=Silva', await signInAsRegistrar(scenario));

    expect(tableRows(page)).toBe(PAGE_SIZE);
    expect(page).toContain('q=Silva&amp;p=2');
  });

  test('voltar à primeira página tira o parâmetro da URL em vez de escrever p=1', async () => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE + REMAINDER; i += 1) {
      await createGuardian({ networkId: scenario.network.id, name: numberedName(i) });
    }

    const page = await html('/registrar/guardians?p=2', await signInAsRegistrar(scenario));

    expect(page).toContain('href="/registrar/guardians"');
    expect(page).not.toContain('p=1"');
  });
});

describe('duas tabelas na mesma tela', () => {
  test('avançar as matrículas não mexe na página das disciplinas', async () => {
    const scenario = await fullScenario();
    const [classGroup] = scenario.classGroups;
    // As matrículas do cenário mais uma página inteira: a turma passa a ter duas páginas de alunos.
    for (let i = 1; i <= PAGE_SIZE; i += 1) {
      const student = await createStudent({ networkId: scenario.network.id, name: numberedName(i) });
      await createEnrollment({
        networkId: scenario.network.id, studentId: student.id, classGroupId: classGroup.id,
        academicYearId: scenario.academicYear.id,
      });
    }

    const page = await html(
      `/registrar/class-groups/${classGroup.id}?pSubjects=1`,
      await signInAsRegistrar(scenario),
    );

    // O link que avança os alunos carrega junto a página em que as disciplinas estão.
    expect(page).toContain('pSubjects=1&amp;pEnrollments=2');
  });
});

describe('portal do responsável', () => {
  test('o mural pagina as duas metades com parâmetros próprios', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    // Um por ler e um já lido: cada metade do mural precisa ter o que contar.
    await createAnnouncement({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: guardian.id }],
    });
    await createAnnouncement({
      networkId: scenario.network.id, schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: guardian.id, readAt: new Date() }],
    });

    const page = await html('/guardian/board', await signInAsGuardian(scenario));

    expect(page).toContain('Paginação de comunicados não lidos');
    expect(page).toContain('Paginação de comunicados lidos');
  });

  test('a frequência do aluno abre paginada', async () => {
    const scenario = await fullScenario();
    const [enrollment] = scenario.enrollments;

    const response = await open(
      `/guardian/enrollments/${enrollment.id}/attendance`,
      await signInAsGuardian(scenario),
    );

    expect(response.status).toBe(200);
  });
});

describe('a ajuda da busca de alunos promete o recorte que a tela entrega', () => {
  const HELP_TEXT = new RegExp(`id="${helpId(PARAMS.search)}"[^>]*>([\\s\\S]*?)</p>`);

  const numbersInHelpText = (page: string): number[] =>
    ((HELP_TEXT.exec(page)?.[1] ?? '').match(/\d+/g) ?? []).map(Number);

  test('o único número da ajuda é o número de linhas que a página traz', async () => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE + REMAINDER; i += 1) {
      await createStudent({ networkId: scenario.network.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }

    const page = await html('/registrar/students?q=Silva', await signInAsRegistrar(scenario));

    expect(numbersInHelpText(page)).toEqual([tableRows(page)]);
    expect(numbersInHelpText(page)).toEqual([PAGE_SIZE]);
  });

  test('a ajuda não promete um teto: a paginação alcança todos os encontrados', async () => {
    const scenario = await fullScenario();
    for (let i = 1; i <= PAGE_SIZE + REMAINDER; i += 1) {
      await createStudent({ networkId: scenario.network.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }
    const cookie = await signInAsRegistrar(scenario);

    const first = await html('/registrar/students?q=Silva', cookie);
    const last = await html('/registrar/students?q=Silva&p=2', cookie);

    const found = tableRows(first) + tableRows(last);
    expect(numbersInHelpText(first)).toEqual(numbersInHelpText(last));
    expect(found).toBeGreaterThan(numbersInHelpText(first)[0] ?? 0);
  });

  test('a tela sem busca declara o mesmo recorte da tela com resultado', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const withoutSearch = await html('/registrar/students', cookie);
    const withSearch = await html('/registrar/students?q=Silva', cookie);

    expect(numbersInHelpText(withoutSearch)).toEqual(numbersInHelpText(withSearch));
    expect(numbersInHelpText(withoutSearch)).toEqual([PAGE_SIZE]);
  });
});
