/*
 * Cadastro e listagem em páginas separadas.
 *
 * A regra é uma só e vale para as dez telas de escrita: quem lista não escreve, e quem escreve não
 * lista. O que se verifica aqui é isso, dos dois lados — a página de formulário existe, responde
 * 200 e traz o `form` com o `action` certo; a listagem correspondente não traz mais nenhum.
 *
 * O terceiro grupo é o que a separação poderia ter quebrado sem ninguém notar: o formulário
 * recusado precisa voltar para a própria página de formulário, com o que foi digitado, e não para
 * a lista. O quarto é o alcance: as páginas novas são portas novas, e cada uma responde 404 para
 * registro de fora da rede como as antigas respondiam.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { generateCpf } from '../../src/shared/document';
import { clearDatabase } from '../support/database';
import { fullScenario, twoNetworks, type Scenario } from '../support/factories';
import { open, signIn, send } from './support';

const signInAs = (scenario: Scenario, who: 'admin' | 'registrar'): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario[who].cpf, password: scenario.password });

/** O `form` de escrita daquela página, e não o de sair da conta que vem no cabeçalho. */
const hasFormFor = (html: string, target: string): boolean =>
  html.includes(`method="post" action="${target}"`);

beforeEach(async () => {
  await clearDatabase();
});

/* ------------------------------------------------------------------------- */

// Fora dos quatro grupos do arquivo — não é cadastro, listagem, recusa nem alcance —, mas é a
// mesma família de verificação: a página abre e traz o campo que a fase atual promete. A janela do
// CPF fechou (ADR 0004): o campo chama-se `cpf`, e o rótulo não menciona mais e-mail — só a
// primeira checagem passaria com a tela ainda dizendo "CPF ou e-mail" acima de um campo renomeado
// por baixo, a segunda é o que garante que a tela também parou de prometer o que já não aceita.
test('a tela de entrada pede CPF, e não mais e-mail', async () => {
  const html = await (await open('/login')).text();

  expect(html).toContain('name="cpf"');
  expect(html).not.toContain('e-mail');
});

/* ------------------------------------------------------------------------- */

describe('cada cadastro tem a sua página, e ela traz o formulário', () => {
  type Page = { path: string; target: string };

  const NETWORK_PAGES: readonly Page[] = [
    { path: '/network/schools/new', target: '/network/schools' },
    { path: '/network/academic-years/new', target: '/network/academic-years' },
    { path: '/network/users/new', target: '/network/users' },
  ];

  const REGISTRAR_PAGES: readonly Page[] = [
    { path: '/registrar/subjects/new', target: '/registrar/subjects' },
    { path: '/registrar/guardians/new', target: '/registrar/guardians' },
    { path: '/registrar/class-groups/new', target: '/registrar/class-groups' },
  ];

  for (const page of NETWORK_PAGES) {
    test(`${page.path} abre com o formulário que grava em ${page.target}`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAs(scenario, 'admin');

      const response = await open(page.path, cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(hasFormFor(html, page.target)).toBe(true);
    });
  }

  for (const page of REGISTRAR_PAGES) {
    test(`${page.path} abre com o formulário que grava em ${page.target}`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAs(scenario, 'registrar');

      const response = await open(page.path, cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(hasFormFor(html, page.target)).toBe(true);
    });
  }

  test('cadastro de responsável traz o campo de CPF', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const html = await (await open('/registrar/guardians/new', cookie)).text();

    expect(html).toContain('name="cpf"');
  });

  test('vincular responsável tem página própria, fora da ficha', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const studentId = scenario.students[0].id;

    const response = await open(`/registrar/students/${studentId}/guardians/new`, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, `/registrar/students/${studentId}/guardians`)).toBe(true);
  });

  test('matricular tem página própria, fora da ficha', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await open(`/registrar/students/${scenario.students[0].id}/enroll`, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, '/registrar/enrollments')).toBe(true);
  });

  test('transferir tem página própria, e ela conhece a matrícula ativa', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const enrollmentId = scenario.enrollments[0].id;

    const response = await open(`/registrar/enrollments/${enrollmentId}/transfer`, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, `/registrar/enrollments/${enrollmentId}/transfer`)).toBe(true);
  });

  test('alocar disciplina tem página própria, fora da tela da turma', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const classGroupId = scenario.classGroups[0].id;

    const response = await open(`/registrar/class-groups/${classGroupId}/subjects/new`, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, `/registrar/class-groups/${classGroupId}/subjects`)).toBe(true);
  });
});

/* ------------------------------------------------------------------------- */

describe('a listagem virou só a tabela', () => {
  const NETWORK_PAGES = ['/network/schools', '/network/academic-years', '/network/users'] as const;
  const REGISTRAR_PAGES = [
    '/registrar/subjects',
    '/registrar/guardians',
    '/registrar/class-groups',
  ] as const;

  for (const path of NETWORK_PAGES) {
    test(`${path} não grava mais nada`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAs(scenario, 'admin');

      const response = await open(path, cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(hasFormFor(html, path)).toBe(false);
    });
  }

  for (const path of REGISTRAR_PAGES) {
    test(`${path} não grava mais nada`, async () => {
      const scenario = await fullScenario();
      const cookie = await signInAs(scenario, 'registrar');

      const response = await open(path, cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(hasFormFor(html, path)).toBe(false);
    });
  }

  test('o filtro das turmas continua de pé — ele lê, e por isso é GET', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const html = await (await open('/registrar/class-groups', cookie)).text();

    expect(html).toContain('method="get" action="/registrar/class-groups"');
  });

  test('a ficha do aluno perdeu os três formulários e ganhou os três caminhos', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const studentId = scenario.students[0].id;

    const html = await (await open(`/registrar/students/${studentId}`, cookie)).text();

    expect(hasFormFor(html, `/registrar/students/${studentId}/guardians`)).toBe(false);
    expect(hasFormFor(html, '/registrar/enrollments')).toBe(false);
    expect(html).toContain(`href="/registrar/students/${studentId}/guardians/new"`);
    expect(html).toContain(`href="/registrar/students/${studentId}/enroll"`);
    expect(html).toContain(`href="/registrar/enrollments/${scenario.enrollments[0].id}/transfer"`);
  });

  test('a tela da turma perdeu o formulário de alocação e ganhou o caminho', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const classGroupId = scenario.classGroups[0].id;

    const html = await (await open(`/registrar/class-groups/${classGroupId}`, cookie)).text();

    expect(hasFormFor(html, `/registrar/class-groups/${classGroupId}/subjects`)).toBe(false);
    expect(html).toContain(`href="/registrar/class-groups/${classGroupId}/subjects/new"`);
  });
});

/* ------------------------------------------------------------------------- */

describe('o formulário recusado volta para o formulário, não para a lista', () => {
  test('disciplina sem nome volta com o erro no campo', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await send('/registrar/subjects', { nome: '' }, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, '/registrar/subjects')).toBe(true);
    expect(html).toContain('id="nome-erro"');
    expect(html).not.toContain('Disciplinas disponíveis para alocar nas turmas');
  });

  test('turma recusada volta com o que já tinha sido digitado', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await send(
      '/registrar/class-groups',
      { nome: 'Turma Rejeitada', serie: '', turno: '', unidadeId: '', anoLetivoId: '' },
      cookie,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, '/registrar/class-groups')).toBe(true);
    expect(html).toContain('value="Turma Rejeitada"');
    expect(html).not.toContain('Turmas das unidades sob sua secretaria');
  });

  test('unidade sem nome volta para a página de criar unidade', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await send('/network/schools', { nome: '', codigoInep: '123' }, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, '/network/schools')).toBe(true);
    expect(html).toContain('value="123"');
    expect(html).not.toContain('Unidades cadastradas');
  });

  test('o convite recusa CPF que diverge do cadastro, sem publicar o número', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');
    const guardian = scenario.guardians[0];

    const response = await send('/network/users', {
      nome: 'Mãe do Aluno', email: 'mae@escolaviva.test', cpf: generateCpf(987_654),
      responsavelId: guardian.id, 'unidade[]': scenario.schools[0].id, 'papel[]': 'guardian',
    }, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="cpf-erro"');
    expect(html).toContain(guardian.name);
    expect(html).not.toContain(guardian.cpf);
  });

  test('CPF inválido no cadastro de responsável volta com o erro ancorado no campo', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await send('/registrar/guardians', {
      nome: 'Responsável Sem Acesso', email: 'sem.acesso@escolaviva.test', cpf: '52998224724',
    }, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="cpf-erro"');
    expect(html).toContain('value="52998224724"');
  });

  test('responsavelId fora do formato não derruba o convite com erro de conversão', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await send('/network/users', {
      nome: 'Sem Cadastro', email: 'sem.cadastro@escolaviva.test', cpf: generateCpf(987_655),
      responsavelId: 'nao-e-uuid', 'unidade[]': scenario.schools[0].id, 'papel[]': 'registrar',
    }, cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('id="responsavelId-erro"');
  });

  test('vínculo recusado volta para a página do vínculo, sem a ficha inteira', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const studentId = scenario.students[0].id;

    const response = await send(
      `/registrar/students/${studentId}/guardians`,
      { responsavelId: '', parentesco: '' },
      cookie,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(hasFormFor(html, `/registrar/students/${studentId}/guardians`)).toBe(true);
    expect(html).not.toContain('Histórico de matrículas deste aluno');
  });
});

/* ------------------------------------------------------------------------- */

describe('as páginas novas respeitam o alcance da secretaria', () => {
  test('aluno de outra rede não abre a página de vínculo', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await open(`/registrar/students/${b.students[0].id}/guardians/new`, cookie);

    expect(response.status).toBe(404);
  });

  test('aluno de outra rede não abre a página de matrícula', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await open(`/registrar/students/${b.students[0].id}/enroll`, cookie);

    expect(response.status).toBe(404);
  });

  test('matrícula de outra rede não abre a página de transferência', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await open(`/registrar/enrollments/${b.enrollments[0].id}/transfer`, cookie);

    expect(response.status).toBe(404);
  });

  test('turma de outra rede não abre a página de alocação', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await open(`/registrar/class-groups/${b.classGroups[0].id}/subjects/new`, cookie);

    expect(response.status).toBe(404);
  });

  test('identificador que não é uuid responde 404, e não erro de conversão', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await open('/registrar/students/nao-e-uuid/enroll', cookie);

    expect(response.status).toBe(404);
  });
});
