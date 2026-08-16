/*
 * The reading screens of the network, the account and the sign-in — one by one.
 *
 * The neighbouring suites reach these addresses sideways: authorization measures the status,
 * pagination measures the slice, the form-page suite measures the `action`. None of them asks
 * whether the screen that arrived is the right screen. That is what happens here: every GET
 * registered in `routes/network.ts`, `routes/account.ts` and `routes/login.ts` is opened under the
 * role it belongs to, and the response has to carry what only that screen carries — the dashboard
 * card, the table `caption`, the form field.
 *
 * The addresses appear written out in full, rather than imported from a production constant:
 * renaming a route has to break the test, not follow it along in silence.
 *
 * What the POST-Redirect-GET return message says is screen too: `?ok=` is a short code in the URL,
 * and the sentence the person reads is born on the server side. Opening the list with the code and
 * not finding the sentence means the list went mute after a successful write.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { formatCpf, generateCpf } from '../../src/shared/document';
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

/** The number sitting on the card with that label — and not just any number on the page. */
const cardNumber = (page: string, label: string): string => {
  const pattern = new RegExp(
    `<span class="card__label">${label}</span>\\s*<span class="card__number">(\\d+)</span>`,
  );
  return pattern.exec(page)?.[1] ?? 'cartão ausente';
};

/* --- GET /network ----------------------------------------------------------- */

describe('the network dashboard', () => {
  test('opens with the four numbers of the network and the year in force', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain(`<h1 class="page__title">${scenario.network.name}</h1>`);
    expect(cardNumber(page, 'Unidades')).toBe(String(scenario.schools.length));
    // ADR 0006: the accounts are the three of the staff plus one per guardian of the scenario.
    expect(cardNumber(page, 'Usuários')).toBe(String(3 + scenario.guardians.length));
    expect(cardNumber(page, 'Turmas')).toBe(String(scenario.classGroups.length));
    expect(cardNumber(page, 'Matriculados')).toBe(String(scenario.enrollments.length));
    expect(page).toContain(`<dd class="number">${scenario.academicYear.year}</dd>`);
  });

  /**
   * A freshly created network is the path where `countNetwork` has no academic year to query: class
   * groups and enrolled students are not "not computed yet", they are zero, and the screen has to
   * say what is missing.
   */
  test('with no academic year defined, it counts zero class groups and points at the next step', async () => {
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

/* --- GET /network/schools and /network/schools/new -------------------------- */

describe('the schools of the network', () => {
  test('the list carries the school table, with name, INEP code and status', async () => {
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

  test('the list reads the code out of the redirect and shows the sentence about the creation', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const page = await html('/network/schools?ok=school-created', cookie);

    expect(page).toContain('class="notice notice--success"');
    expect(page).toContain('Unidade criada.');
  });

  test('the creation page carries the school form, not the table', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/schools/new', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1 class="page__title">Criar unidade</h1>');
    expect(page).toContain('name="name"');
    expect(page).toContain('name="inepCode"');
    expect(page).not.toContain('<caption>Unidades cadastradas</caption>');
  });
});

/* --- GET /network/users and /network/users/new ------------------------------ */

describe('the users of the network', () => {
  test('the list shows who has access, with CPF, e-mail and role at the school', async () => {
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
    // The role shows up under its screen name, and always glued to the school it holds at.
    expect(page).toContain(`Administração da rede · ${scenario.schools[0].name}`);
  });

  /**
   * The provisional password does not travel in the URL: it crosses the redirect in a signed cookie,
   * and the list is what reads it and wipes it. Without session *and* invitation cookie together the
   * block does not exist — which is why this is the only test in the file that has to write before
   * it reads.
   */
  test('right after the invitation, the list publishes the provisional password and throws the cookie away', async () => {
    const scenario = await fullScenario();
    const session = await signInAs(scenario, 'admin');

    const creation = await send(
      '/network/users',
      {
        name: 'Nova Secretária',
        email: 'nova.secretaria@escolaviva.test',
        cpf: generateCpf(424_242),
        'schools[]': scenario.schools[0].id,
        'roles[]': 'registrar',
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
    expect(page).toContain('<code class="code">');
    // ADR 0004: the CPF is what signs in. The panel used to point at the e-mail, which the
    // login screen stopped accepting — it told whoever received the password the wrong door.
    expect(page).toContain(`entre com o CPF\n    <strong>${formatCpf(generateCpf(424_242))}</strong>`);
    // Once read, the password must not stay tucked away in the browser for the next visit.
    expect(response.headers.get('Set-Cookie') ?? '').toContain('ev_invite=;');
  });

  test('without the invitation cookie, the very same list publishes no password at all', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const page = await html('/network/users', cookie);

    expect(page).not.toContain('Senha provisória de');
    expect(page).not.toContain('<code class="code">');
  });

  test('the invitation page carries the three assignment rows and the school list in full', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/users/new', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1 class="page__title">Convidar usuário</h1>');
    expect(page).toContain('name="schools[]"');
    expect(page).toContain('name="roles[]"');
    // ADR 0006: there is no guardian record left to tie the account to, so the field is gone.
    expect(page).not.toContain('name="guardianId"');
    expect(page).not.toContain(scenario.guardians[4].name);
    // With no JavaScript on the client, the rows are fixed: three, no more and no less.
    expect(page).toContain('id="school-2"');
    expect(page).not.toContain('id="school-3"');
    // The school list is not sliced: choosing requires seeing everything.
    expect(page).toContain(`>${scenario.schools[1].name}</option>`);
  });
});

/* --- GET /network/academic-years and /network/academic-years/new ------------ */

describe('the academic years of the network', () => {
  test('the list carries the calendar with year, start and end', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/academic-years', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<caption>Calendário letivo da rede</caption>');
    expect(page).toContain('<th scope="col">Início</th>');
    expect(page).toContain('<th scope="col">Término</th>');
    expect(page).toContain(`<th scope="row" class="number">${scenario.academicYear.year}</th>`);
  });

  test('the list reads the code out of the redirect and shows the sentence about the definition', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const page = await html('/network/academic-years?ok=year-defined', cookie);

    expect(page).toContain('class="notice notice--success"');
    expect(page).toContain('Ano letivo definido.');
  });

  test('the definition page carries the three fields of the span', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');

    const response = await open('/network/academic-years/new', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1 class="page__title">Definir ano letivo</h1>');
    expect(page).toContain('name="year"');
    expect(page).toContain('name="startDate"');
    expect(page).toContain('name="endDate"');
    expect(page).not.toContain('<caption>Calendário letivo da rede</caption>');
  });
});

/* --- GET /account/password -------------------------------------------------- */

describe('changing one\'s own password', () => {
  test('the screen asks for the current password, the new one and the confirmation', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await open('/account/password', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1 class="page__title">Trocar senha</h1>');
    expect(page).toContain('name="currentPassword"');
    expect(page).toContain('name="newPassword"');
    expect(page).toContain('name="passwordConfirmation"');
  });

  test('the return from the change becomes a sentence, not the code that came in the URL', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');

    const response = await open('/account/password?ok=password-changed', cookie);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('class="notice notice--success"');
    expect(page).toContain('Senha alterada. Use a senha nova no próximo acesso.');
    expect(page).not.toContain('>password-changed<');
  });
});

/* --- GET /login ------------------------------------------------------------- */

describe('the sign-in screen', () => {
  test('opens with no session, carrying the three fields of the form', async () => {
    const response = await open('/login');
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<h1>Entrar</h1>');
    expect(page).toContain('name="networkSlug"');
    expect(page).toContain('name="cpf"');
    expect(page).toContain('name="password"');
  });

  test('the message coming back from the logout shows up in the notice at the top', async () => {
    const response = await open(`/login?ok=${encodeURIComponent('Sessão encerrada.')}`);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('class="notice notice--success"');
    expect(page).toContain('Sessão encerrada.');
  });
});
