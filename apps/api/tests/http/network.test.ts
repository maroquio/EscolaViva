/*
 * The network administrator, in JSON.
 *
 * Four screens of the SSR became seven endpoints, and the port had to keep three decisions that are
 * easy to lose in a translation. The first is the temporary password: it used to cross a redirect
 * inside a cookie (`INVITE_COOKIE`, `storeInvite`, `takeInvite`) precisely so it would not enter the
 * URL nor the `response_location` column. With JSON it comes back in the 201 body, which removes the
 * cookie but not the requirement — so two cases below scan the log and the idempotency table for it.
 *
 * The second is where each refusal is decided. Shape is the edge's business and answers 400; the
 * uniqueness check inside `identity.inviteUser` (`insertUnlessCpfTaken`) is a rule and answers 422
 * on the field the person typed — and the e-mail carries no such check, because it is contact and
 * not identity.
 * The role of an assignment is deliberately typed as a plain
 * string at the edge: an assignment naming a school and no role is an incomplete assignment, not a
 * malformed body, and the SSR always answered it as a refusal the person could fix in place.
 *
 * The third is the tenant. This front has no `/:id` read — `NETWORK_ROUTES` declares four collection
 * paths and nothing else — so "a target outside the scope" cannot be proven with a 404 here. Its
 * real shape is that the network of the session is the only network there is: another network's
 * schools and users never appear in a list, and a role assignment pointing at a school from another
 * network is refused. Both are below.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { API } from '../../src/http/constants';
import { APPLICATION_MARK, HEADERS } from '../../src/shared/constants';
import { generateCpf } from '../../src/shared/document';
import { clearDatabase, testSql } from '../support/database';
import { createSchool, fullScenario, twoNetworks, type Scenario } from '../support/factories';
import { read, runProcess, signIn, write, writeWithKey } from './support';

const NETWORK = `${API.versionedPrefix}/network`;
const DASHBOARD = `${NETWORK}/dashboard`;
const SCHOOLS = `${NETWORK}/schools`;
const USERS = `${NETWORK}/users`;
const ACADEMIC_YEARS = `${NETWORK}/academic-years`;
const SESSION = `${API.versionedPrefix}/session`;

const PAGE_SIZE = 10;
const PROCESS_DEADLINE_MS = 60_000;
const TEST_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const RESULT_MARK = 'RESULTADO ';

type Refusal = { errors: { field?: string; code: string; message: string }[] };

type Page<T> = { items: T[]; page: number; pages: number; total: number; size: number };

type SchoolInList = { id: string; name: string; inepCode: string | null; active: boolean };
type UserInList = { id: string; name: string; email: string; cpf: string | null };
type AcademicYearInList = { id: string; year: number; startDate: string; endDate: string };

type Dashboard = {
  counts: { schools: number; users: number; classGroups: number; enrolled: number };
  academicYear: AcademicYearInList | null;
  definedYears: number;
};

type Created = { id: string };
type Invitation = { userId: string; temporaryPassword: string };
type Repeated = { repeated: boolean; location: string };

const asAdmin = (scenario: Scenario): Promise<string> =>
  signIn({
    networkSlug: scenario.network.slug,
    cpf: scenario.admin.cpf,
    password: scenario.password,
  });

const asRegistrar = (scenario: Scenario): Promise<string> =>
  signIn({
    networkSlug: scenario.network.slug,
    cpf: scenario.registrar.cpf,
    password: scenario.password,
  });

/* A CPF nobody in the scenarios holds: the factories seed theirs from a counter that starts at one. */
const freeCpf = (seed: number): string => generateCpf(9_000_000 + seed);

type InvitationBody = {
  name: string;
  email: string;
  cpf: string;
  phone: string | null;
  roleAssignments: { schoolId: string; role: string }[];
};

const anInvitation = (school: { id: string }, seed: number): InvitationBody => ({
  name: `Pessoa Convidada ${seed}`,
  email: `convidada${seed}@escolaviva.test`,
  cpf: freeCpf(seed),
  phone: null,
  roleAssignments: [{ schoolId: school.id, role: 'registrar' }],
});

describe('the network dashboard', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('it answers the four counters, the current year and how many years exist', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as Dashboard;

    expect(response.status).toBe(200);
    expect(body.counts.schools).toBe(2);
    expect(body.counts.users).toBe(8);
    expect(body.counts.classGroups).toBe(2);
    expect(body.counts.enrolled).toBe(5);
    expect(body.academicYear?.year).toBe(scenario.academicYear.year);
    expect(body.definedYears).toBe(1);
  });

  /*
   * `enrolled` counts the enrolments of the class groups of the current year, one query per class
   * group. A dashboard that summed every enrolment row in the network would answer the same number
   * on this scenario; the second network exists here so it cannot.
   */
  test('the counters stop at the network of the session', async () => {
    const { a } = await twoNetworks();
    const cookie = await asAdmin(a);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as Dashboard;

    expect(body.counts.schools).toBe(2);
    expect(body.counts.users).toBe(8);
    expect(body.counts.enrolled).toBe(5);
  });

  test('without a session it is 401, and it is a body rather than a login page', async () => {
    const response = await read(DASHBOARD);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(401);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  /*
   * `requireRole` renders an HTML 403 for the SSR. Under `/api` it has to answer a body, and only a
   * request that reaches it with a real session of the wrong role proves the difference.
   */
  test('a registrar has no business here and gets 403 with a body', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await read(DASHBOARD, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(403);
    expect(body.errors[0]?.code).toBe('forbidden');
  });
});

describe('listing the schools', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const withThirteenSchools = async (): Promise<Scenario> => {
    const scenario = await fullScenario();
    for (let number = 0; number < 11; number += 1) {
      await createSchool({
        networkId: scenario.network.id,
        name: `Unidade Paginada ${String(number).padStart(2, '0')}`,
      });
    }
    return scenario;
  };

  test('it answers a page carrying the counters and the school fields', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await read(SCHOOLS, cookie);
    const body = (await response.json()) as Page<SchoolInList>;

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.size).toBe(PAGE_SIZE);
    expect(body.items.map((school) => school.name).sort()).toEqual(
      scenario.schools.map((school) => school.name).sort(),
    );
    expect(body.items[0]?.active).toBe(true);
  });

  test('`?p=` moves to another page, and the two pages share no school', async () => {
    const scenario = await withThirteenSchools();
    const cookie = await asAdmin(scenario);

    const first = (await (await read(SCHOOLS, cookie)).json()) as Page<SchoolInList>;
    const second = (await (
      await read(`${SCHOOLS}?p=2`, cookie)
    ).json()) as Page<SchoolInList>;

    expect(first.page).toBe(1);
    expect(first.items.length).toBe(PAGE_SIZE);
    expect(second.page).toBe(2);
    expect(second.items.length).toBe(3);
    const onFirst = new Set(first.items.map((school) => school.id));
    expect(second.items.some((school) => onFirst.has(school.id))).toBe(false);
  });

  /*
   * `queryPage` clamps an over-range cursor and re-runs the query for the last page. A test that
   * expected an empty page, or a 404, would be specifying a regression.
   */
  test('`?p=999` answers 200 with the last page, not an empty one', async () => {
    const scenario = await withThirteenSchools();
    const cookie = await asAdmin(scenario);

    const response = await read(`${SCHOOLS}?p=999`, cookie);
    const body = (await response.json()) as Page<SchoolInList>;

    expect(response.status).toBe(200);
    expect(body.page).toBe(2);
    expect(body.pages).toBe(2);
    expect(body.items.length).toBe(3);
  });

  test('the schools of another network are not on this list', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await asAdmin(a);

    const body = (await (await read(SCHOOLS, cookie)).json()) as Page<SchoolInList>;

    const ids = new Set(body.items.map((school) => school.id));
    expect(b.schools.every((school) => !ids.has(school.id))).toBe(true);
    expect(body.total).toBe(2);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const registrar = await asRegistrar(scenario);

    const anonymous = await read(SCHOOLS);
    const wrongRole = await read(SCHOOLS, registrar);

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});

describe('creating a school', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('a valid school answers 201 with the id and the Location of the resource', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write('POST', SCHOOLS, { name: 'Escola Nova', inepCode: '12345678' }, cookie);
    const body = (await response.json()) as Created;

    expect(response.status).toBe(201);
    expect(body.id).not.toBe('');
    expect(response.headers.get(HEADERS.location)).toBe(SCHOOLS);
  });

  test('the row really landed, with the network of the session', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const body = (await (
      await write('POST', SCHOOLS, { name: 'Escola Gravada' }, cookie)
    ).json()) as Created;
    const rows = await testSql()<{ network_id: string; name: string }[]>`
      SELECT network_id, name FROM school WHERE id = ${body.id}`;

    expect(rows[0]?.network_id).toBe(scenario.network.id);
    expect(rows[0]?.name).toBe('Escola Gravada');
  });

  test('a body with no name is shape, so 400 with the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write('POST', SCHOOLS, { inepCode: '12345678' }, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('name');
  });

  /*
   * An empty name passes the edge — it is a string, and the shape is right — and dies in
   * `createSchool`, which owns the rule. The two statuses are the whole point of the split.
   */
  test('a name that is only blank is a rule, so 422 with the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write('POST', SCHOOLS, { name: '   ' }, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('name');
  });

  test('a name already used in the network is refused with 422 on the name', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write('POST', SCHOOLS, { name: scenario.schools[0].name }, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('name');
    expect(body.errors[0]?.code).toBe('name_in_use');
  });

  test('a malformed Idempotency-Key is refused with 400 before anything is written', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await writeWithKey(
      'POST',
      SCHOOLS,
      { name: 'Escola Sem Chave' },
      cookie,
      'chave-que-nao-e-uuid',
    );
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM school WHERE name = 'Escola Sem Chave'`;

    expect(response.status).toBe(400);
    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });

  test('an empty Idempotency-Key is the same refusal as no key at all', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await writeWithKey('POST', SCHOOLS, { name: 'Escola Sem Chave' }, cookie, '');

    expect(response.status).toBe(400);
  });

  /*
   * The tap that repeats on bad 4G. The second request must not create a second school, and what it
   * gets back is the path of the one the first request created — which only works because the 201
   * carries a `Location` for the middleware to store.
   */
  test('the same key twice creates one school and the repeat answers the location', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const key = crypto.randomUUID();

    const first = await writeWithKey('POST', SCHOOLS, { name: 'Escola Repetida' }, cookie, key);
    const second = await writeWithKey('POST', SCHOOLS, { name: 'Escola Repetida' }, cookie, key);
    await first.json();
    const repeat = (await second.json()) as Repeated;
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM school WHERE name = 'Escola Repetida'`;

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(repeat.repeated).toBe(true);
    expect(repeat.location).toBe(SCHOOLS);
    expect(Number(rows[0]?.total ?? '0')).toBe(1);
  });

  test('without a session it is 401 and nothing is written', async () => {
    await fullScenario();

    const response = await write('POST', SCHOOLS, { name: 'Escola Anônima' });
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM school WHERE name = 'Escola Anônima'`;

    expect(response.status).toBe(401);
    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });

  test('a registrar attempting to create a school gets 403 and writes nothing', async () => {
    const scenario = await fullScenario();
    const cookie = await asRegistrar(scenario);

    const response = await write('POST', SCHOOLS, { name: 'Escola da Secretaria' }, cookie);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM school WHERE name = 'Escola da Secretaria'`;

    expect(response.status).toBe(403);
    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });
});

describe('listing the users', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('it answers a page with the roles of each user', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await read(USERS, cookie);
    const body = (await response.json()) as Page<UserInList & {
      roles: { schoolId: string; schoolName: string; role: string }[];
    }>;

    expect(response.status).toBe(200);
    expect(body.total).toBe(8);
    const admin = body.items.find((user) => user.id === scenario.admin.id);
    expect(admin?.email).toBe(scenario.admin.email);
    expect(admin?.roles.some((assignment) => assignment.role === 'network_admin')).toBe(true);
    expect(admin?.roles[0]?.schoolName).not.toBe('');
  });

  test('the users of another network are not on this list', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await asAdmin(a);

    const body = (await (await read(USERS, cookie)).json()) as Page<UserInList>;

    const ids = new Set(body.items.map((user) => user.id));
    expect(ids.has(b.admin.id)).toBe(false);
    expect(body.total).toBe(8);
  });

  test('`?p=999` answers 200 with the last page', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await read(`${USERS}?p=999`, cookie);
    const body = (await response.json()) as Page<UserInList>;

    expect(response.status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.items.length).toBe(8);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const registrar = await asRegistrar(scenario);

    expect((await read(USERS)).status).toBe(401);
    expect((await read(USERS, registrar)).status).toBe(403);
  });
});

describe('inviting a user', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('a valid invitation answers 201 with the id and the temporary password', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write('POST', USERS, anInvitation(scenario.schools[0], 1), cookie);
    const body = (await response.json()) as Invitation;

    expect(response.status).toBe(201);
    expect(body.userId).not.toBe('');
    expect(body.temporaryPassword.length).toBeGreaterThan(0);
    expect(response.headers.get(HEADERS.location)).toBe(USERS);
  });

  /*
   * The password that comes back has to be the one that opens the account, otherwise the front shows
   * a string nobody can use and the person is locked out of a user that exists.
   */
  test('the temporary password is what opens the invited person’s first session', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const invitation = anInvitation(scenario.schools[0], 2);

    const body = (await (
      await write('POST', USERS, invitation, cookie)
    ).json()) as Invitation;
    const opened = await write('POST', SESSION, {
      networkSlug: scenario.network.slug,
      cpf: invitation.cpf,
      password: body.temporaryPassword,
    });

    expect(opened.status).toBe(201);
  });

  /*
   * The reason `INVITE_COOKIE` existed. The `Location` is the only thing `idempotent_request` keeps,
   * so pointing it at the resource — and not at anything carrying the secret — is what keeps the
   * temporary password out of a table that outlives the request.
   */
  test('the temporary password does not enter idempotent_request', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const body = (await (
      await write('POST', USERS, anInvitation(scenario.schools[0], 3), cookie)
    ).json()) as Invitation;
    const rows = await testSql()<{ response_location: string }[]>`
      SELECT response_location FROM idempotent_request`;

    expect(rows.length).toBe(1);
    expect(rows[0]?.response_location).toBe(USERS);
    expect(rows.every((row) => !row.response_location.includes(body.temporaryPassword))).toBe(true);
  });

  /*
   * A separate process with the log at its lowest level, because the line under examination has to
   * be the line pino really wrote — capturing inside the test process would prove nothing about what
   * reaches stdout in production. The invitation is made there, so the secret never leaves it except
   * on the marked line the scan removes before looking.
   */
  test(
    'the temporary password does not show up anywhere in the log of the flow',
    async () => {
      const scenario = await fullScenario();
      const invitation = anInvitation(scenario.schools[0], 4);

      const script = `
        const data = ${JSON.stringify({
          sessionPath: SESSION,
          usersPath: USERS,
          networkSlug: scenario.network.slug,
          cpf: scenario.admin.cpf,
          password: scenario.password,
          invitation,
        })};
        const { app } = await import('./apps/api/src/http/app.ts');
        const headers = (cookie) => ({
          [${JSON.stringify(HEADERS.contentType)}]: ${JSON.stringify(API.mediaType)},
          [${JSON.stringify(HEADERS.requestedBy)}]: ${JSON.stringify(APPLICATION_MARK)},
          [${JSON.stringify(HEADERS.idempotencyKey)}]: crypto.randomUUID(),
          ...(cookie === '' ? {} : { Cookie: cookie }),
        });
        const opened = await app.request(data.sessionPath, {
          method: 'POST',
          headers: headers(''),
          body: JSON.stringify({
            networkSlug: data.networkSlug, cpf: data.cpf, password: data.password,
          }),
        });
        const cookie = (opened.headers.get('Set-Cookie') ?? '').split(';')[0];
        const invited = await app.request(data.usersPath, {
          method: 'POST',
          headers: headers(cookie),
          body: JSON.stringify(data.invitation),
        });
        const body = await invited.json();
        console.log(${JSON.stringify(RESULT_MARK)} + JSON.stringify({
          status: invited.status, temporaryPassword: body.temporaryPassword ?? '',
        }));
        process.exit(0);
      `;
      const { exitCode, stdout, stderr } = await runProcess(['-e', script], {
        APP_ENV: 'test',
        SESSION_SECRET: TEST_SECRET,
        LOG_LEVEL: 'debug',
        DATABASE_URL: Bun.env.DATABASE_URL ?? '',
      });
      if (exitCode !== 0) throw new Error(`processo do convite falhou (${exitCode}):\n${stderr}`);

      const lines = stdout.split('\n');
      const marked = lines.find((line) => line.startsWith(RESULT_MARK)) ?? '';
      const result = JSON.parse(marked.slice(RESULT_MARK.length) || '{}') as {
        status?: number;
        temporaryPassword?: string;
      };
      const log = lines.filter((line) => !line.startsWith(RESULT_MARK)).join('\n');

      expect(marked).not.toBe('');
      expect(result.status).toBe(201);
      expect((result.temporaryPassword ?? '').length).toBeGreaterThan(0);
      expect(log).not.toContain(result.temporaryPassword);
      expect(log).toContain('user invited');
    },
    PROCESS_DEADLINE_MS,
  );

  test('repeating the invitation with the same key creates one user and answers the repeat', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const invitation = anInvitation(scenario.schools[0], 5);
    const key = crypto.randomUUID();

    const first = await writeWithKey('POST', USERS, invitation, cookie, key);
    const second = await writeWithKey('POST', USERS, invitation, cookie, key);
    await first.json();
    const repeat = (await second.json()) as Repeated;
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM app_user WHERE email = ${invitation.email}`;

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(repeat.repeated).toBe(true);
    expect(repeat.location).toBe(USERS);
    expect(Number(rows[0]?.total ?? '0')).toBe(1);
  });

  /*
   * The SSR form always rendered three rows and dropped the empty ones, so a row naming a school and
   * no role was the mistake worth an error message. That is a rule about the assignment, not a
   * malformed body: it answers 422 on `roleAssignments`, exactly as the screen did.
   */
  test('an assignment with a school and no role is refused with 422 on roleAssignments', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const invitation = {
      ...anInvitation(scenario.schools[0], 6),
      roleAssignments: [{ schoolId: scenario.schools[0].id, role: '' }],
    };

    const response = await write('POST', USERS, invitation, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('roleAssignments');
    expect(body.errors[0]?.code).toBe('incomplete_role_assignment');
  });

  test('an assignment with a role and no school is refused the same way', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const invitation = {
      ...anInvitation(scenario.schools[0], 7),
      roleAssignments: [{ schoolId: '', role: 'teacher' }],
    };

    const response = await write('POST', USERS, invitation, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('roleAssignments');
  });

  test('an invitation with no assignment at all is refused by the use case', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const invitation = { ...anInvitation(scenario.schools[0], 8), roleAssignments: [] };

    const response = await write('POST', USERS, invitation, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('roleAssignments');
  });

  test('a CPF already used in the network is refused with 422 on the cpf', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const invitation = {
      ...anInvitation(scenario.schools[0], 9),
      cpf: scenario.registrar.cpf,
    };

    const response = await write('POST', USERS, invitation, cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('cpf');
    expect(body.errors[0]?.code).toBe('cpf_in_use');
  });

  test('an e-mail already used in the network is accepted: it identifies nobody', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const invitation = {
      ...anInvitation(scenario.schools[0], 10),
      email: scenario.registrar.email,
    };

    const response = await write('POST', USERS, invitation, cookie);

    expect(response.status).toBe(201);
  });

  /*
   * The tenant, on a write. A school id is a uuid like any other, and nothing in the shape of the
   * body says which network it belongs to — the check lives inside the transaction, and this is the
   * closest this front has to "a target outside the scope".
   */
  test('a school from another network cannot be assigned, and no user is created', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await asAdmin(a);
    const invitation = {
      ...anInvitation(b.schools[0], 11),
      roleAssignments: [{ schoolId: b.schools[0].id, role: 'registrar' }],
    };

    const response = await write('POST', USERS, invitation, cookie);
    const body = (await response.json()) as Refusal;
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM app_user WHERE email = ${invitation.email}`;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('roleAssignments');
    expect(body.errors[0]?.code).toBe('school_from_another_network');
    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });

  test('a body with no cpf is shape, so 400 with the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const { cpf, ...withoutCpf } = anInvitation(scenario.schools[0], 12);

    const response = await write('POST', USERS, withoutCpf, cookie);
    const body = (await response.json()) as Refusal;

    expect(cpf).not.toBe(undefined);
    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('cpf');
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const registrar = await asRegistrar(scenario);
    const invitation = anInvitation(scenario.schools[0], 13);

    const anonymous = await write('POST', USERS, invitation);
    const wrongRole = await write('POST', USERS, invitation, registrar);
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM app_user WHERE email = ${invitation.email}`;

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
    expect(Number(rows[0]?.total ?? '0')).toBe(0);
  });
});

describe('the academic years', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const aYear = (year: number): { year: number; startDate: string; endDate: string } => ({
    year,
    startDate: `${year}-02-01`,
    endDate: `${year}-12-15`,
  });

  test('the list answers a page with the years the network defined', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await read(ACADEMIC_YEARS, cookie);
    const body = (await response.json()) as Page<AcademicYearInList>;

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items[0]?.year).toBe(scenario.academicYear.year);
    expect(body.items[0]?.startDate).toBe(scenario.academicYear.startDate);
  });

  test('`?p=999` answers 200 with the last page', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await read(`${ACADEMIC_YEARS}?p=999`, cookie);
    const body = (await response.json()) as Page<AcademicYearInList>;

    expect(response.status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.items.length).toBe(1);
  });

  test('the years of another network are not on this list', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await asAdmin(a);

    const body = (await (await read(ACADEMIC_YEARS, cookie)).json()) as Page<AcademicYearInList>;

    expect(body.items.every((year) => year.id !== b.academicYear.id)).toBe(true);
    expect(body.total).toBe(1);
  });

  test('a valid year answers 201 with the id and the Location', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write('POST', ACADEMIC_YEARS, aYear(2027), cookie);
    await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get(HEADERS.location)).toBe(ACADEMIC_YEARS);
  });

  /*
   * The SSR read the year out of a form, so it arrived as text and `FOUR_DIGIT_YEAR` was what turned
   * it into a number safely. In JSON the type comes with the value, the regex is gone, and text in
   * that field is a malformed body — 400 rather than the 422 the screen used to answer.
   */
  test('a year sent as text is shape, so 400 with the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write(
      'POST',
      ACADEMIC_YEARS,
      { ...aYear(2027), year: '2027' },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(body.errors[0]?.field).toBe('year');
  });

  test('a year outside the accepted range is a rule, so 422 with the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write('POST', ACADEMIC_YEARS, aYear(1500), cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('year');
  });

  test('a year that already exists is refused with 422 on the year', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write('POST', ACADEMIC_YEARS, aYear(scenario.academicYear.year), cookie);
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('year');
  });

  test('an end date before the start date is refused with 422 on the end date', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await write(
      'POST',
      ACADEMIC_YEARS,
      { year: 2028, startDate: '2028-12-15', endDate: '2028-02-01' },
      cookie,
    );
    const body = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(body.errors[0]?.field).toBe('endDate');
  });

  test('the same key twice defines one year and the repeat answers the location', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);
    const key = crypto.randomUUID();

    const first = await writeWithKey('POST', ACADEMIC_YEARS, aYear(2029), cookie, key);
    const second = await writeWithKey('POST', ACADEMIC_YEARS, aYear(2029), cookie, key);
    await first.json();
    const repeat = (await second.json()) as Repeated;
    const rows = await testSql()<{ total: string }[]>`
      SELECT count(*)::text AS total FROM academic_year WHERE year = 2029`;

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(repeat.location).toBe(ACADEMIC_YEARS);
    expect(Number(rows[0]?.total ?? '0')).toBe(1);
  });

  test('a malformed Idempotency-Key is refused with 400', async () => {
    const scenario = await fullScenario();
    const cookie = await asAdmin(scenario);

    const response = await writeWithKey(
      'POST',
      ACADEMIC_YEARS,
      aYear(2030),
      cookie,
      'chave-que-nao-e-uuid',
    );

    expect(response.status).toBe(400);
  });

  test('without a session it is 401 and with the wrong role it is 403', async () => {
    const scenario = await fullScenario();
    const registrar = await asRegistrar(scenario);

    const anonymous = await write('POST', ACADEMIC_YEARS, aYear(2031));
    const wrongRole = await write('POST', ACADEMIC_YEARS, aYear(2031), registrar);
    const listing = await read(ACADEMIC_YEARS, registrar);

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
    expect(listing.status).toBe(403);
  });
});
