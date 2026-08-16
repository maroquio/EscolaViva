/*
 * As telas de leitura da rede, da conta e da entrada — uma a uma.
 *
 * As suítes vizinhas alcançam estes endereços de lado: a autorização mede o status, a paginação
 * mede o recorte, as páginas de formulário medem o `action`. Nenhuma delas pergunta se a tela que
 * chegou é a tela certa. É o que se faz aqui: cada GET registrado em `rotas/rede.ts`,
 * `rotas/conta.ts` e `rotas/login.ts` é aberto com o papel que lhe cabe, e a resposta precisa
 * trazer o que só aquela tela traz — o cartão do painel, o `caption` da tabela, o campo do
 * formulário.
 *
 * Os endereços aparecem escritos por extenso, e não importados de uma constante do código de
 * produção: renomear uma rota tem de quebrar o teste, e não acompanhá-lo em silêncio.
 *
 * O que a mensagem de retorno do POST-Redirect-GET diz também é tela: `?ok=` é um código curto na
 * URL, e a frase que a pessoa lê nasce no lado do servidor. Abrir a lista com o código e não achar
 * a frase é a lista muda depois de uma gravação bem-sucedida.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { generateCpf } from '../../src/shared/document';
import { clearDatabase } from '../support/database';
import {
  DEFAULT_PASSWORD,
  fullScenario,
  createNetwork,
  createSchool,
  createUser,
  type Scenario,
} from '../support/factories';
import { open, cookieFromResponse, signIn, send } from './support';

beforeEach(clearDatabase);

const signInAs = (
  scenario: Scenario,
  who: 'admin' | 'registrar' | 'teacher',
): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario[who].cpf, password: scenario.password });

const html = async (path: string, cookie = ''): Promise<string> =>
  await (await open(path, cookie)).text();

/** O número que está no cartão daquele rótulo — e não um número qualquer da página. */
const cardNumber = (page: string, label: string): string => {
  const pattern = new RegExp(
    `<span class="cartao__rotulo">${label}</span>\\s*<span class="cartao__numero">(\\d+)</span>`,
  );
  return pattern.exec(page)?.[1] ?? 'cartão ausente';
};

/* --- GET /rede -------------------------------------------------------------- */

describe('o painel da rede', () => {
  test('abre com os quatro números da rede e o ano em vigor', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain(`<h1 class="pagina__titulo">${scenario.network.name}</h1>`);
    expect(cardNumber(page, 'Unidades')).toBe(String(scenario.schools.length));
    // As quatro contas do cenário: administração, secretaria, professor e responsável.
    expect(cardNumber(page, 'Usuários')).toBe('4');
    expect(cardNumber(page, 'Turmas')).toBe(String(scenario.classGroups.length));
    expect(cardNumber(page, 'Matriculados')).toBe(String(scenario.enrollments.length));
    expect(page).toContain(`<dd class="numero">${scenario.academicYear.year}</dd>`);
  });

  /**
   * Rede recém-criada é o caminho em que `contarRede` não tem ano letivo para consultar: turmas e
   * matriculados não são "ainda não calculados", são zero, e a tela precisa dizer o que falta.
   */
  test('sem ano letivo definido, conta zero turmas e aponta o próximo passo', async () => {
    const network = await createNetwork();
    const school = await createSchool({ networkId: network.id });
    const admin = await createUser({
      networkId: network.id,
      roles: [{ schoolId: school.id, role: 'network_admin' }],
    });
    const cookie = await signIn({ networkSlug: network.slug, cpf: admin.cpf, password: DEFAULT_PASSWORD });

    const response = await open('/network', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(cardNumber(page, 'Turmas')).toBe('0');
    expect(cardNumber(page, 'Matriculados')).toBe('0');
    expect(page).toContain('0 ano(s) definido(s)');
    expect(page).toContain('Nenhum ano letivo definido');
  });
});

/* --- GET /rede/unidades e /rede/unidades/nova ------------------------------- */

describe('as unidades da rede', () => {
  test('a lista traz a tabela de unidades, com nome, INEP e situação', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/schools', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<caption>Unidades cadastradas</caption>');
    expect(page).toContain('<th scope="col">Código INEP</th>');
    expect(page).toContain('<th scope="col">Situação</th>');
    expect(page).toContain(`<th scope="row">${scenario.schools[0].name}</th>`);
    expect(page).toContain(`<th scope="row">${scenario.schools[1].name}</th>`);
    expect(page).toContain(`>${scenario.schools.length} no total<`);
  });

  test('a lista lê o código do redirecionamento e mostra a frase da criação', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const page = await html('/network/schools?ok=school-created', cookie);

    expect(page).toContain('class="aviso aviso--sucesso"');
    expect(page).toContain('Unidade criada.');
  });

  test('a página de criação traz o formulário de unidade, e não a tabela', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/schools/new', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1 class="pagina__titulo">Criar unidade</h1>');
    expect(page).toContain('name="nome"');
    expect(page).toContain('name="codigoInep"');
    expect(page).not.toContain('<caption>Unidades cadastradas</caption>');
  });
});

/* --- GET /rede/usuarios e /rede/usuarios/novo ------------------------------- */

describe('os usuários da rede', () => {
  test('a lista mostra quem tem acesso, com CPF, e-mail e papel na unidade', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/users', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<caption>Usuários da rede</caption>');
    expect(page).toContain('<th scope="col">CPF</th>');
    expect(page).toContain('<th scope="col">Papéis</th>');
    expect(page).toContain(`<th scope="row">${scenario.admin.name}</th>`);
    expect(page).toContain(scenario.registrar.email);
    // O papel aparece traduzido para o nome de tela, e sempre colado à unidade em que vale.
    expect(page).toContain(`Administração da rede · ${scenario.schools[0].name}`);
  });

  /**
   * A senha provisória não viaja na URL: ela atravessa o redirecionamento em cookie assinado, e a
   * lista é quem a lê e a apaga. Sem sessão *e* cookie do convite juntos, o bloco não existe — e é
   * por isso que este é o único teste do arquivo que precisa fazer uma escrita antes de ler.
   */
  test('logo depois do convite, a lista publica a senha provisória e descarta o cookie', async () => {
    const scenario = await fullScenario();
    const session = await signInAs(scenario, 'admin');

    const creation = await send(
      '/network/users',
      {
        nome: 'Nova Secretária',
        email: 'nova.secretaria@escolaviva.test',
        cpf: generateCpf(424_242),
        'unidade[]': scenario.schools[0].id,
        'papel[]': 'registrar',
      },
      session,
    );
    const invitation = cookieFromResponse(creation);

    const response = await open('/network/users?ok=user-invited', `${session}; ${invitation}`);
    const page = await response.text();

    expect(creation.status).toBe(303);
    expect(response.status).toBe(200);
    expect(page).toContain('Usuário criado. A senha provisória está logo abaixo.');
    expect(page).toContain('Senha provisória de Nova Secretária');
    expect(page).toContain('<code class="codigo">');
    // Lida uma vez, a senha não pode continuar guardada no navegador para a próxima visita.
    expect(response.headers.get('Set-Cookie') ?? '').toContain('ev_convite=;');
  });

  test('sem o cookie do convite, a mesma lista não publica senha nenhuma', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const page = await html('/network/users', cookie);

    expect(page).not.toContain('Senha provisória de');
    expect(page).not.toContain('<code class="codigo">');
  });

  test('a página do convite traz as três linhas de atribuição e as duas listas inteiras', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/users/new', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1 class="pagina__titulo">Convidar usuário</h1>');
    expect(page).toContain('name="unidade[]"');
    expect(page).toContain('name="papel[]"');
    expect(page).toContain('name="responsavelId"');
    // Sem JavaScript no cliente, as linhas são fixas: três, nem mais nem menos.
    expect(page).toContain('id="unidade-2"');
    expect(page).not.toContain('id="unidade-3"');
    // Nem a lista de unidades nem a de responsáveis é recortada: escolher exige ver tudo.
    expect(page).toContain(`>${scenario.schools[1].name}</option>`);
    expect(page).toContain(scenario.guardians[4].name);
  });
});

/* --- GET /rede/anos-letivos e /rede/anos-letivos/novo ----------------------- */

describe('os anos letivos da rede', () => {
  test('a lista traz o calendário com ano, início e término', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/academic-years', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<caption>Calendário letivo da rede</caption>');
    expect(page).toContain('<th scope="col">Início</th>');
    expect(page).toContain('<th scope="col">Término</th>');
    expect(page).toContain(`<th scope="row" class="numero">${scenario.academicYear.year}</th>`);
  });

  test('a lista lê o código do redirecionamento e mostra a frase da definição', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const page = await html('/network/academic-years?ok=year-defined', cookie);

    expect(page).toContain('class="aviso aviso--sucesso"');
    expect(page).toContain('Ano letivo definido.');
  });

  test('a página de definição traz os três campos do período', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/academic-years/new', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1 class="pagina__titulo">Definir ano letivo</h1>');
    expect(page).toContain('name="ano"');
    expect(page).toContain('name="dataInicio"');
    expect(page).toContain('name="dataFim"');
    expect(page).not.toContain('<caption>Calendário letivo da rede</caption>');
  });
});

/* --- GET /conta/senha ------------------------------------------------------- */

describe('a troca da própria senha', () => {
  test('a tela pede a senha atual, a nova e a confirmação', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await open('/account/password', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1 class="pagina__titulo">Trocar senha</h1>');
    expect(page).toContain('name="senhaAtual"');
    expect(page).toContain('name="senhaNova"');
    expect(page).toContain('name="senhaConfirmacao"');
  });

  test('o retorno da troca vira frase, e não o código que veio na URL', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');

    const response = await open('/account/password?ok=password-changed', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('class="aviso aviso--sucesso"');
    expect(page).toContain('Senha alterada. Use a senha nova no próximo acesso.');
    expect(page).not.toContain('>password-changed<');
  });
});

/* --- GET /login ------------------------------------------------------------- */

describe('a tela de entrada', () => {
  test('abre sem sessão com os três campos do formulário', async () => {
    const response = await open('/login');
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1>Entrar</h1>');
    expect(page).toContain('name="redeSlug"');
    expect(page).toContain('name="cpf"');
    expect(page).toContain('name="senha"');
  });

  test('a mensagem que volta do logout aparece no aviso do topo', async () => {
    const response = await open(`/login?ok=${encodeURIComponent('Sessão encerrada.')}`);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('class="aviso aviso--sucesso"');
    expect(page).toContain('Sessão encerrada.');
  });
});
