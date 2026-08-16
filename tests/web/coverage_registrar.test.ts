/*
 * Toda tela de leitura da secretaria, pelo endereço que o navegador digita.
 *
 * O que este arquivo fecha é uma pergunta só: cada GET de `/secretaria` responde 200 e devolve a
 * SUA tela? Status não basta — uma rota que renderizasse o painel no lugar da lista de disciplinas
 * passaria em qualquer verificação de código. Por isso cada caso afirma também algo que só aquela
 * tela tem: o título da página, a legenda da tabela, o campo do formulário.
 *
 * Os endereços aparecem escritos por extenso, e não importados de uma constante de rota. Um teste
 * que lê o caminho do próprio código que ele verifica deixa de notar quando o caminho muda — e
 * mudar o endereço de uma tela é exatamente o tipo de coisa que quebra o link que alguém guardou.
 *
 * Além das telas em si, ficam aqui os estados que só o GET produz: a busca de alunos antes da
 * primeira busca, o filtro de turmas que vive na URL, e o painel de quem responde por mais de uma
 * unidade — caminhos que nenhuma escrita alcança.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase } from '../support/database';
import {
  fullScenario,
  createStudent,
  createAcademicYear,
  createClassGroup,
  createUser,
  type Scenario,
} from '../support/factories';
import { open, signIn } from './support';

beforeEach(clearDatabase);

const signInAsRegistrar = (scenario: Scenario): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario.registrar.cpf, password: scenario.password });

/** A secretaria do cenário responde por uma unidade só; esta responde pelas duas. */
const signInAsRegistrarOfBothSchools = async (scenario: Scenario): Promise<string> => {
  const user = await createUser({
    networkId: scenario.network.id,
    password: scenario.password,
    roles: [
      { schoolId: scenario.schools[0].id, role: 'registrar' },
      { schoolId: scenario.schools[1].id, role: 'registrar' },
    ],
  });
  return await signIn({ networkSlug: scenario.network.slug, cpf: user.cpf, password: scenario.password });
};

const html = async (path: string, cookie: string): Promise<string> =>
  await (await open(path, cookie)).text();

/** O `h1` da tela — o que distingue uma página da outra dentro do mesmo layout. */
const screenTitle = (title: string): string => `<h1 class="pagina__titulo">${title}</h1>`;

/* ------------------------------------------------------------------------- */

describe('cada endereço de leitura abre a sua própria tela', () => {
  type GoldenScreen = {
    readonly name: string;
    readonly path: (scenario: Scenario) => string;
    readonly title: (scenario: Scenario) => string;
  };

  const SCREENS: readonly GoldenScreen[] = [
    { name: '/secretaria', path: () => '/secretaria', title: () => 'Painel da secretaria' },
    { name: '/secretaria/alunos', path: () => '/secretaria/alunos', title: () => 'Alunos' },
    {
      name: '/secretaria/alunos/novo',
      path: () => '/secretaria/alunos/novo',
      title: () => 'Cadastrar aluno',
    },
    {
      name: '/secretaria/alunos/:id',
      path: (scenario) => `/secretaria/alunos/${scenario.students[0].id}`,
      title: (scenario) => scenario.students[0].name,
    },
    {
      name: '/secretaria/alunos/:id/responsaveis/novo',
      path: (scenario) => `/secretaria/alunos/${scenario.students[0].id}/responsaveis/novo`,
      title: () => 'Vincular responsável',
    },
    {
      name: '/secretaria/alunos/:id/matricular',
      path: (scenario) => `/secretaria/alunos/${scenario.students[0].id}/matricular`,
      title: () => 'Matricular em uma turma',
    },
    {
      name: '/secretaria/matriculas/:id/transferir',
      path: (scenario) => `/secretaria/matriculas/${scenario.enrollments[0].id}/transferir`,
      title: () => 'Transferir de turma',
    },
    {
      name: '/secretaria/responsaveis',
      path: () => '/secretaria/responsaveis',
      title: () => 'Responsáveis',
    },
    {
      name: '/secretaria/responsaveis/novo',
      path: () => '/secretaria/responsaveis/novo',
      title: () => 'Cadastrar responsável',
    },
    { name: '/secretaria/turmas', path: () => '/secretaria/turmas', title: () => 'Turmas' },
    {
      name: '/secretaria/turmas/nova',
      path: () => '/secretaria/turmas/nova',
      title: () => 'Cadastrar turma',
    },
    {
      name: '/secretaria/turmas/:id',
      path: (scenario) => `/secretaria/turmas/${scenario.classGroups[0].id}`,
      title: (scenario) => scenario.classGroups[0].name,
    },
    {
      name: '/secretaria/turmas/:id/disciplinas/nova',
      path: (scenario) => `/secretaria/turmas/${scenario.classGroups[0].id}/disciplinas/nova`,
      title: () => 'Alocar disciplina e professor',
    },
    {
      name: '/secretaria/disciplinas',
      path: () => '/secretaria/disciplinas',
      title: () => 'Disciplinas',
    },
    {
      name: '/secretaria/disciplinas/nova',
      path: () => '/secretaria/disciplinas/nova',
      title: () => 'Cadastrar disciplina',
    },
  ];

  for (const screen of SCREENS) {
    test(`${screen.name} responde 200 com o título da tela`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAsRegistrar(scenario);

      const response = await open(screen.path(scenario), cookie);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain(screenTitle(screen.title(scenario)));
    });
  }
});

/* ------------------------------------------------------------------------- */

describe('a página de cadastrar aluno', () => {
  test('abre com os dois campos que o cadastro pede, e nenhum vínculo', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/secretaria/alunos/novo', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('method="post" action="/secretaria/alunos"');
    expect(page).toContain('name="nome"');
    expect(page).toContain('name="dataNascimento"');
    // Matrícula e responsável são vínculos que se fazem depois, da ficha: não cabem no cadastro.
    expect(page).not.toContain('name="turmaId"');
    expect(page).not.toContain('name="responsavelId"');
  });

  test('nasce vazia — o formulário em branco não traz valor digitado', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const page = await html('/secretaria/alunos/novo', cookie);

    expect(page).toContain('id="nome"');
    expect(page).not.toContain('id="nome-erro"');
    expect(page).not.toContain('id="dataNascimento-erro"');
  });
});

/* ------------------------------------------------------------------------- */

describe('a busca de alunos tem três estados, e todos são GET', () => {
  test('sem termo, a tela pede a busca em vez de despejar a rede inteira', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/secretaria/alunos', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Comece pela busca');
    expect(page).not.toContain('Alunos encontrados para');
    expect(page).not.toContain(scenario.students[0].name);
  });

  test('com termo que acha, a tabela traz o aluno e a situação da matrícula', async () => {
    const scenario = await fullScenario();
    await createStudent({ networkId: scenario.network.id, name: 'Zulmira Peixoto de Andrade' });
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/secretaria/alunos?q=Zulmira', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Alunos encontrados para');
    expect(page).toContain('Zulmira Peixoto de Andrade');
    expect(page).toContain('aluno encontrado');
    // Ninguém a matriculou ainda, e a coluna afirma só o que se sabe.
    expect(page).toContain('Sem matrícula');
  });

  test('com termo que não acha, a tela oferece o cadastro em vez de uma tabela vazia', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/secretaria/alunos?q=Zulmira', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Nenhum aluno com esse nome');
    expect(page).toContain('href="/secretaria/alunos/novo"');
  });
});

/* ------------------------------------------------------------------------- */

describe('o painel conta o que está ao alcance de quem abriu', () => {
  /** Os quatro cartões, na ordem em que a tela os desenha. */
  const cardNumbers = (page: string): number[] =>
    [...page.matchAll(/cartao__numero">(\d+)</g)].map(([, number]) => Number(number));

  test('os cartões trazem os números da unidade em que a pessoa é secretaria', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const page = await html('/secretaria', cookie);

    // Matrículas ativas, turmas, responsáveis e disciplinas: o cenário completo em uma unidade.
    expect(cardNumbers(page)).toEqual([5, 2, 5, 3]);
  });

  test('com uma unidade só, a tabela por unidade não aparece — não há o que comparar', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const page = await html('/secretaria', cookie);

    expect(page).not.toContain('Números de cada unidade sob sua secretaria');
    expect(page).not.toContain(scenario.schools[1].name);
  });

  test('com duas unidades, a tabela aparece e nomeia as duas', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrarOfBothSchools(scenario);

    const response = await open('/secretaria', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Números de cada unidade sob sua secretaria');
    expect(page).toContain(scenario.schools[0].name);
    expect(page).toContain(scenario.schools[1].name);
  });
});

/* ------------------------------------------------------------------------- */

describe('o filtro de turmas vive na URL', () => {
  test('filtrar por unidade recorta a lista às turmas daquela unidade', async () => {
    const scenario = await fullScenario();
    const base = { networkId: scenario.network.id, academicYearId: scenario.academicYear.id };
    await createClassGroup({ ...base, schoolId: scenario.schools[0].id, name: 'Turma Alfa da Central' });
    await createClassGroup({ ...base, schoolId: scenario.schools[1].id, name: 'Turma Beta do Bairro' });
    const cookie = await signInAsRegistrarOfBothSchools(scenario);

    const response = await open(`/secretaria/turmas?unidade=${scenario.schools[1].id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Turma Beta do Bairro');
    expect(page).not.toContain('Turma Alfa da Central');
  });

  test('filtrar por ano letivo recorta a lista àquele ano', async () => {
    const scenario = await fullScenario();
    const otherYear = await createAcademicYear({ networkId: scenario.network.id, year: scenario.academicYear.year + 1 });
    const base = { networkId: scenario.network.id, schoolId: scenario.schools[0].id };
    await createClassGroup({ ...base, academicYearId: scenario.academicYear.id, name: 'Turma Gama do Ano Velho' });
    await createClassGroup({ ...base, academicYearId: otherYear.id, name: 'Turma Delta do Ano Novo' });
    const cookie = await signInAsRegistrar(scenario);

    const response = await open(`/secretaria/turmas?ano=${otherYear.id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Turma Delta do Ano Novo');
    expect(page).not.toContain('Turma Gama do Ano Velho');
  });

  test('unidade fora do alcance vale como “todas as suas”, e não abre a de fora', async () => {
    const scenario = await fullScenario();
    const base = { networkId: scenario.network.id, academicYearId: scenario.academicYear.id };
    await createClassGroup({ ...base, schoolId: scenario.schools[0].id, name: 'Turma Epsilon da Minha' });
    await createClassGroup({ ...base, schoolId: scenario.schools[1].id, name: 'Turma Zeta da Outra' });
    // Esta secretaria só tem papel na primeira unidade: a segunda não é filtro que ela possa pedir.
    const cookie = await signInAsRegistrar(scenario);

    const response = await open(`/secretaria/turmas?unidade=${scenario.schools[1].id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Turma Epsilon da Minha');
    expect(page).not.toContain('Turma Zeta da Outra');
  });

  test('número de página que não existe não vira erro nem tela quebrada', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/secretaria/turmas?p=999', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Turmas das unidades sob sua secretaria');
  });
});

/* ------------------------------------------------------------------------- */

describe('as listagens mostram o que prometem no cabeçalho', () => {
  test('a lista de disciplinas traz a tabela da rede', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/secretaria/disciplinas', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Disciplinas disponíveis para alocar nas turmas');
    expect(page).toContain(scenario.subjects[0].name);
    expect(page).toContain('href="/secretaria/disciplinas/nova"');
  });

  test('a lista de responsáveis traz nome, CPF e e-mail de quem responde pelos alunos', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open('/secretaria/responsaveis', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Responsáveis cadastrados nesta rede');
    expect(page).toContain(scenario.guardians[0].name);
    expect(page).toContain(scenario.guardians[0].email);
  });

  test('a tela da turma lista as disciplinas alocadas e os alunos com matrícula ativa', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open(`/secretaria/turmas/${scenario.classGroups[0].id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Quem leciona o quê nesta turma');
    expect(page).toContain('Alunos com matrícula ativa nesta turma');
    expect(page).toContain(scenario.subjects[0].name);
    expect(page).toContain(scenario.teacher.name);
    expect(page).toContain(scenario.students[0].name);
  });

  test('a ficha do aluno traz os responsáveis vinculados e o histórico de matrículas', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAsRegistrar(scenario);

    const response = await open(`/secretaria/alunos/${scenario.students[0].id}`, cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('Quem responde por este aluno');
    expect(page).toContain('Histórico de matrículas deste aluno');
    expect(page).toContain(scenario.guardians[0].name);
    expect(page).toContain(scenario.classGroups[0].name);
  });
});
