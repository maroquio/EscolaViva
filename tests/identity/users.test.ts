/*
 * Who exists in the network and what each one may do. The invitation, the school, and the queries
 * the rest of the product puts to identity — including the question "is this person a teacher at
 * this school?", which is the boundary academics comes in through.
 *
 * E-mail uniqueness is PER NETWORK, not global: two city halls can carry the same registrar on
 * record, and that is what makes it possible to sell the same person to two accounts.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { identity } from '../../src/identity';
import { generateCpf } from '../../src/shared/document';
import type { ApplicationError, Result } from '../../src/shared/result';
import { clearDatabase, testSql } from '../support/database';
import {
  fullScenario,
  createNetwork,
  createGuardian,
  createSchool as createTestSchool,
  createUser,
  twoNetworks,
} from '../support/factories';

function valueOfResult<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

function errorsOf(result: Result<unknown>): ApplicationError[] {
  if (result.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return result.errors;
}

beforeEach(clearDatabase);

describe('inviteUser', () => {
  test('creates the user with the roles asked for and hands back the provisional password', async () => {
    const network = await createNetwork({ slug: 'convite' });
    const center = await createTestSchool({ networkId: network.id, name: 'Escola Centro' });
    const beach = await createTestSchool({ networkId: network.id, name: 'Escola Praia' });

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Ana Souza',
      email: 'ana.souza@convite.br',
      cpf: generateCpf(3),
      roleAssignments: [
        { schoolId: center.id, role: 'teacher' },
        { schoolId: beach.id, role: 'registrar' },
      ],
    });

    const { userId, temporaryPassword } = valueOfResult(result);
    expect(temporaryPassword).toHaveLength(12);
    const users = await identity.listUsers(network.id);
    expect(users).toEqual([
      {
        id: userId,
        name: 'Ana Souza',
        email: 'ana.souza@convite.br',
        cpf: generateCpf(3),
        active: true,
        roles: [
          { schoolId: center.id, schoolName: 'Escola Centro', role: 'teacher' },
          { schoolId: beach.id, schoolName: 'Escola Praia', role: 'registrar' },
        ],
      },
    ]);
  });

  test('the provisional password handed back really does authenticate', async () => {
    const network = await createNetwork({ slug: 'provisoria' });
    const school = await createTestSchool({ networkId: network.id });
    const invitation = await identity.inviteUser({
      networkId: network.id,
      name: 'Bia Nunes',
      email: 'bia@provisoria.br',
      cpf: generateCpf(4),
      roleAssignments: [{ schoolId: school.id, role: 'registrar' }],
    });

    const authenticated = await identity.authenticate({
      networkSlug: 'provisoria',
      loginIdentifier: generateCpf(4),
      password: valueOfResult(invitation).temporaryPassword,
      ip: '',
    });

    expect(valueOfResult(authenticated).user.id).toBe(valueOfResult(invitation).userId);
  });

  test('the e-mail is stored normalized and authenticates in any case', async () => {
    const network = await createNetwork({ slug: 'normalizado' });
    const school = await createTestSchool({ networkId: network.id });

    const invitation = await identity.inviteUser({
      networkId: network.id,
      name: 'Carlos Lima',
      email: '  Carlos.LIMA@Escola.BR  ',
      cpf: generateCpf(5),
      roleAssignments: [{ schoolId: school.id, role: 'teacher' }],
    });

    const users = await identity.listUsers(network.id);
    expect(users[0]?.email).toBe('carlos.lima@escola.br');
    const authenticated = await identity.authenticate({
      networkSlug: 'normalizado',
      loginIdentifier: generateCpf(5),
      password: valueOfResult(invitation).temporaryPassword,
      ip: '',
    });
    expect(authenticated.ok).toBe(true);
  });

  test('refuses an e-mail already in use within the same network', async () => {
    const network = await createNetwork();
    const school = await createTestSchool({ networkId: network.id });
    await createUser({ networkId: network.id, email: 'ocupado@escola.br' });

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Outra Pessoa',
      email: 'ocupado@escola.br',
      cpf: generateCpf(6),
      roleAssignments: [{ schoolId: school.id, role: 'teacher' }],
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'email',
        code: 'email_in_use',
        message: 'já existe usuário com este e-mail na rede',
      },
    ]);
    expect(await identity.listUsers(network.id)).toHaveLength(1);
  });

  test('the duplicate e-mail check sees through a difference in case', async () => {
    const network = await createNetwork();
    const school = await createTestSchool({ networkId: network.id });
    await createUser({ networkId: network.id, email: 'ocupado@escola.br' });

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Outra Pessoa',
      email: 'OCUPADO@Escola.BR',
      cpf: generateCpf(7),
      roleAssignments: [{ schoolId: school.id, role: 'teacher' }],
    });

    expect(errorsOf(result)[0]?.code).toBe('email_in_use');
  });

  test('accepts the same e-mail in a different network: uniqueness is per network', async () => {
    const cityHallNetwork = await createNetwork({ slug: 'prefeitura' });
    const collegeNetwork = await createNetwork({ slug: 'colegio' });
    const cityHallSchool = await createTestSchool({ networkId: cityHallNetwork.id });
    const collegeSchool = await createTestSchool({ networkId: collegeNetwork.id });
    await createUser({ networkId: cityHallNetwork.id, email: 'ana.souza@escola.br' });

    const result = await identity.inviteUser({
      networkId: collegeNetwork.id,
      name: 'Ana Souza',
      email: 'ana.souza@escola.br',
      cpf: generateCpf(8),
      roleAssignments: [{ schoolId: collegeSchool.id, role: 'registrar' }],
    });

    expect(result.ok).toBe(true);
    expect(await identity.listUsers(cityHallNetwork.id)).toHaveLength(1);
    expect(await identity.listUsers(collegeNetwork.id)).toHaveLength(1);
    expect(cityHallSchool.networkId).not.toBe(collegeSchool.networkId);
  });

  test('a guardian role with no guardian record behind it is refused', async () => {
    const network = await createNetwork();
    const school = await createTestSchool({ networkId: network.id });

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Mãe da Ana',
      email: 'mae.da.ana@familia.br',
      cpf: generateCpf(9),
      roleAssignments: [{ schoolId: school.id, role: 'guardian' }],
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'guardianId',
        code: 'guardian_required',
        message:
          'quem entra como responsável precisa estar ligado a um cadastro de responsável',
      },
    ]);
    expect(await identity.listUsers(network.id)).toHaveLength(0);
  });

  test('a guardian role with the record tied in gets through and carries the link into the session', async () => {
    const network = await createNetwork({ slug: 'portal' });
    const school = await createTestSchool({ networkId: network.id });
    const guardian = await createGuardian({ networkId: network.id });

    const invitation = await identity.inviteUser({
      networkId: network.id,
      name: 'Mãe da Ana',
      email: 'mae.da.ana@familia.br',
      cpf: generateCpf(10),
      roleAssignments: [{ schoolId: school.id, role: 'guardian' }],
      guardianId: guardian.id,
    });

    const authenticated = await identity.authenticate({
      networkSlug: 'portal',
      loginIdentifier: generateCpf(10),
      password: valueOfResult(invitation).temporaryPassword,
      ip: '',
    });
    expect(valueOfResult(authenticated).user.guardianId).toBe(guardian.id);
  });

  test('refuses a school from another network without creating the user', async () => {
    const ours = await createNetwork();
    const foreign = await createNetwork();
    const otherSchool = await createTestSchool({ networkId: foreign.id });

    const result = await identity.inviteUser({
      networkId: ours.id,
      name: 'Intrusa',
      email: 'intrusa@escola.br',
      cpf: generateCpf(11),
      roleAssignments: [{ schoolId: otherSchool.id, role: 'network_admin' }],
    });

    expect(errorsOf(result)).toEqual([
      {
        field: 'roleAssignments',
        code: 'school_from_another_network',
        message: 'unidade não pertence a esta rede',
      },
    ]);
    expect(await identity.listUsers(ours.id)).toHaveLength(0);
  });

  test('an invitation with no assignment at all is refused', async () => {
    const network = await createNetwork();

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Sem Papel',
      email: 'sem.papel@escola.br',
      cpf: generateCpf(12),
      roleAssignments: [],
    });

    expect(errorsOf(result)[0]?.field).toBe('roleAssignments');
  });

  test('an invalid e-mail is refused before the database is touched', async () => {
    const network = await createNetwork();
    const school = await createTestSchool({ networkId: network.id });

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Ana Souza',
      email: 'ana-arroba-nada',
      cpf: generateCpf(13),
      roleAssignments: [{ schoolId: school.id, role: 'teacher' }],
    });

    expect(errorsOf(result)[0]?.field).toBe('email');
    expect(await identity.listUsers(network.id)).toHaveLength(0);
  });

  test('the same school-and-role pair repeated on the form becomes a single row', async () => {
    const network = await createNetwork();
    const school = await createTestSchool({ networkId: network.id, name: 'Escola Única' });

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Ana Souza',
      email: 'ana@escola.br',
      cpf: generateCpf(14),
      roleAssignments: [
        { schoolId: school.id, role: 'teacher' },
        { schoolId: school.id, role: 'teacher' },
      ],
    });

    expect(result.ok).toBe(true);
    const users = await identity.listUsers(network.id);
    expect(users[0]?.roles).toEqual([
      { schoolId: school.id, schoolName: 'Escola Única', role: 'teacher' },
    ]);
  });

  test('refuses an invitation carrying an invalid CPF', async () => {
    const network = await createNetwork({});
    const school = await createTestSchool({ networkId: network.id });

    const invitation = await identity.inviteUser({
      networkId: network.id,
      name: 'Rui Barbosa Neto',
      email: 'rui@escolaviva.test',
      cpf: '11111111111',
      roleAssignments: [{ schoolId: school.id, role: 'registrar' }],
    });

    expect(invitation.ok).toBe(false);
    if (!invitation.ok) expect(invitation.errors[0]?.field).toBe('cpf');
  });

  test('refuses a CPF already used by another user of the same network', async () => {
    const network = await createNetwork({});
    const school = await createTestSchool({ networkId: network.id });
    await createUser({ networkId: network.id, cpf: '52998224725', roles: [] });

    const invitation = await identity.inviteUser({
      networkId: network.id,
      name: 'Outra Pessoa',
      email: 'outra@escolaviva.test',
      cpf: '52998224725',
      roleAssignments: [{ schoolId: school.id, role: 'registrar' }],
    });

    expect(invitation.ok).toBe(false);
    if (!invitation.ok) expect(invitation.errors[0]?.field).toBe('cpf');
  });

  test('the same CPF in another network is accepted — uniqueness is per tenant', async () => {
    const a = await createNetwork({});
    const b = await createNetwork({});
    const schoolB = await createTestSchool({ networkId: b.id });
    await createUser({ networkId: a.id, cpf: '52998224725', roles: [] });

    const invitation = await identity.inviteUser({
      networkId: b.id,
      name: 'Homônimo de Outra Rede',
      email: 'homonimo@escolaviva.test',
      cpf: '52998224725',
      roleAssignments: [{ schoolId: schoolB.id, role: 'registrar' }],
    });

    expect(invitation.ok).toBe(true);
  });

  test('refuses when the CPF typed in diverges from the guardian record', async () => {
    const network = await createNetwork({});
    const school = await createTestSchool({ networkId: network.id });
    const guardian = await createGuardian({ networkId: network.id, cpf: '52998224725' });

    const invitation = await identity.inviteUser({
      networkId: network.id,
      name: 'Mãe do Aluno',
      email: 'mae@escolaviva.test',
      cpf: generateCpf(1),
      guardianId: guardian.id,
      registeredCpf: guardian.cpf,
      registeredName: guardian.name,
      roleAssignments: [{ schoolId: school.id, role: 'guardian' }],
    });

    expect(invitation.ok).toBe(false);
    if (!invitation.ok) {
      expect(invitation.errors[0]?.field).toBe('cpf');
      expect(invitation.errors[0]?.message).toContain(guardian.name);
      expect(invitation.errors[0]?.message).not.toContain(guardian.cpf);
    }
  });

  /* During the window the older records still carry no CPF; demanding one would block a flow that
     used to work, which is the opposite of what compatibility promises. */
  test('accepts when the guardian record has no CPF yet', async () => {
    const network = await createNetwork({});
    const school = await createTestSchool({ networkId: network.id });
    const guardian = await createGuardian({ networkId: network.id, cpf: null });

    const invitation = await identity.inviteUser({
      networkId: network.id,
      name: 'Pai do Aluno',
      email: 'pai@escolaviva.test',
      cpf: generateCpf(2),
      guardianId: guardian.id,
      registeredCpf: null,
      registeredName: guardian.name,
      roleAssignments: [{ schoolId: school.id, role: 'guardian' }],
    });

    expect(invitation.ok).toBe(true);
  });

  test('the CPF written down at invitation time comes back when the user is read', async () => {
    const network = await createNetwork({});
    const school = await createTestSchool({ networkId: network.id });

    const invitation = await identity.inviteUser({
      networkId: network.id,
      name: 'Marina Alves Correia',
      email: 'marina@escolaviva.test',
      cpf: '52998224725',
      roleAssignments: [{ schoolId: school.id, role: 'registrar' }],
    });
    if (!invitation.ok) throw new Error('convite recusado no cenário');
    // `identity` exposes no lookup of a user by id, and opening a public door just to satisfy a
    // test would be scope nobody asked for. `checklist.test.ts` already states "the row landed in
    // the database" in exactly this way.
    const rows = await testSql()<{ cpf: string }[]>`
      SELECT cpf FROM app_user WHERE id = ${invitation.value.userId}`;

    expect(rows[0]?.cpf).toBe('52998224725');
  });
});

describe('the schools of the network', () => {
  test('createSchool records the school as active and it shows up in the listing', async () => {
    const network = await createNetwork();

    const result = await identity.createSchool({
      networkId: network.id,
      name: 'Escola Municipal Aurora',
      inepCode: '32012345',
    });

    const school = valueOfResult(result);
    expect(school).toEqual({
      id: school.id,
      networkId: network.id,
      name: 'Escola Municipal Aurora',
      inepCode: '32012345',
      active: true,
    });
    expect(await identity.listSchools(network.id)).toEqual([school]);
  });

  test('a blank INEP code becomes the absence of a code', async () => {
    const network = await createNetwork();

    const result = await identity.createSchool({
      networkId: network.id,
      name: 'Escola Sem INEP',
      inepCode: '',
    });

    expect(valueOfResult(result).inepCode).toBeNull();
  });

  test('refuses a school whose name is already in use within the network', async () => {
    const network = await createNetwork();
    await createTestSchool({ networkId: network.id, name: 'Escola Centro' });

    const result = await identity.createSchool({ networkId: network.id, name: 'Escola Centro' });

    expect(errorsOf(result)).toEqual([
      {
        field: 'name',
        code: 'name_in_use',
        message: 'já existe unidade com este nome na rede',
      },
    ]);
    expect(await identity.listSchools(network.id)).toHaveLength(1);
  });

  test('the same school name is accepted in another network', async () => {
    const first = await createNetwork();
    const second = await createNetwork();
    await createTestSchool({ networkId: first.id, name: 'Escola Centro' });

    const result = await identity.createSchool({ networkId: second.id, name: 'Escola Centro' });

    expect(result.ok).toBe(true);
  });

  test('a school with no name is refused', async () => {
    const network = await createNetwork();

    const result = await identity.createSchool({ networkId: network.id, name: '   ' });

    expect(errorsOf(result)[0]?.field).toBe('name');
  });

  test('schoolById gives back the network\'s school, and null for an unknown id', async () => {
    const network = await createNetwork();
    const school = await createTestSchool({ networkId: network.id, name: 'Escola Centro' });

    const found = await identity.schoolById(network.id, school.id);

    expect(found?.name).toBe('Escola Centro');
    expect(await identity.schoolById(network.id, crypto.randomUUID())).toBeNull();
  });

  test('an id outside the format gives back null and an empty list instead of a cast error', async () => {
    const network = await createNetwork();
    await createTestSchool({ networkId: network.id });

    const found = await identity.schoolById(network.id, 'nao-e-uuid');

    expect(found).toBeNull();
    expect(await identity.listSchools('nao-e-uuid')).toEqual([]);
    expect(await identity.listUsers('nao-e-uuid')).toEqual([]);
  });
});

describe('the teachers of a school', () => {
  test('isTeacherAtSchool confirms only whoever holds the role at that very school', async () => {
    const scenario = await fullScenario();
    const [center, beach] = scenario.schools;

    const atTheRightSchool = await identity.isTeacherAtSchool(
      scenario.network.id, scenario.teacher.id, center.id,
    );

    expect(atTheRightSchool).toBe(true);
    expect(
      await identity.isTeacherAtSchool(scenario.network.id, scenario.teacher.id, beach.id),
    ).toBe(false);
  });

  test('whoever holds another role at the school is no teacher there', async () => {
    const scenario = await fullScenario();
    const [center] = scenario.schools;

    const registrarIsAlsoTeacher = await identity.isTeacherAtSchool(
      scenario.network.id, scenario.registrar.id, center.id,
    );

    expect(registrarIsAlsoTeacher).toBe(false);
  });

  test('schoolTeachers brings only that school\'s teachers, in name order', async () => {
    const network = await createNetwork();
    const center = await createTestSchool({ networkId: network.id, name: 'Escola Centro' });
    const beach = await createTestSchool({ networkId: network.id, name: 'Escola Praia' });
    const bruna = await createUser({
      networkId: network.id, name: 'Bruna Alves', roles: [{ schoolId: center.id, role: 'teacher' }],
    });
    const alice = await createUser({
      networkId: network.id, name: 'Alice Reis', roles: [{ schoolId: center.id, role: 'teacher' }],
    });
    await createUser({
      networkId: network.id, name: 'Carla Dias', roles: [{ schoolId: beach.id, role: 'teacher' }],
    });
    await createUser({
      networkId: network.id, name: 'Dina Melo', roles: [{ schoolId: center.id, role: 'registrar' }],
    });

    const teachers = await identity.schoolTeachers(network.id, center.id);

    expect(teachers).toEqual([
      { id: alice.id, name: 'Alice Reis' },
      { id: bruna.id, name: 'Bruna Alves' },
    ]);
  });

  test('a deactivated teacher drops out of the school list', async () => {
    const network = await createNetwork();
    const center = await createTestSchool({ networkId: network.id });
    await createUser({
      networkId: network.id, name: 'Fora Daqui', active: false,
      roles: [{ schoolId: center.id, role: 'teacher' }],
    });

    const teachers = await identity.schoolTeachers(network.id, center.id);

    expect(teachers).toEqual([]);
  });
});

describe('the supporting queries', () => {
  test('networkBySlug gives back the network behind the login screen, and null for an unknown slug', async () => {
    const network = await createNetwork({ name: 'Rede Serra', slug: 'serra' });

    const found = await identity.networkBySlug('serra');

    expect(found).toEqual({ id: network.id, name: 'Rede Serra', slug: 'serra', status: 'active' });
    expect(await identity.networkBySlug('nao-existe')).toBeNull();
  });

  test('userNames resolves the names asked for into a map', async () => {
    const network = await createNetwork();
    const ana = await createUser({ networkId: network.id, name: 'Ana Souza' });
    const bia = await createUser({ networkId: network.id, name: 'Bia Nunes' });

    const names = await identity.userNames(network.id, [ana.id, bia.id, ana.id]);

    expect(names).toEqual(new Map([[ana.id, 'Ana Souza'], [bia.id, 'Bia Nunes']]));
  });

  test('userNames shrugs off an id outside the format and an empty list', async () => {
    const network = await createNetwork();
    const ana = await createUser({ networkId: network.id, name: 'Ana Souza' });

    const names = await identity.userNames(network.id, ['lixo', ana.id]);

    expect(names).toEqual(new Map([[ana.id, 'Ana Souza']]));
    expect(await identity.userNames(network.id, [])).toEqual(new Map());
  });

  test('listUsers brings the deactivated ones too, marked as such', async () => {
    const network = await createNetwork();
    await createUser({ networkId: network.id, name: 'Ana Souza' });
    await createUser({ networkId: network.id, name: 'Zeca Paz', active: false });

    const users = await identity.listUsers(network.id);

    expect(users.map((u) => [u.name, u.active])).toEqual([
      ['Ana Souza', true],
      ['Zeca Paz', false],
    ]);
  });
});

describe('tenant isolation', () => {
  test('no identity query on network A gives back a row from network B', async () => {
    const { a, b } = await twoNetworks();
    const idsOfB = [b.admin.id, b.registrar.id, b.teacher.id];

    const schools = await identity.listSchools(a.network.id);
    const users = await identity.listUsers(a.network.id);
    const names = await identity.userNames(a.network.id, idsOfB);

    expect(schools.every((school) => school.networkId === a.network.id)).toBe(true);
    expect(schools.map((school) => school.id)).not.toContain(b.schools[0].id);
    expect(users.map((user) => user.id)).not.toContain(b.admin.id);
    expect(users.every((user) => !user.email.includes(b.admin.email))).toBe(true);
    expect(names.size).toBe(0);
  });

  test('a school and a role from another network are not reachable by id', async () => {
    const { a, b } = await twoNetworks();

    const otherSchool = await identity.schoolById(a.network.id, b.schools[0].id);

    expect(otherSchool).toBeNull();
    expect(
      await identity.isTeacherAtSchool(a.network.id, b.teacher.id, b.schools[0].id),
    ).toBe(false);
    expect(await identity.schoolTeachers(a.network.id, b.schools[0].id)).toEqual([]);
  });

  test('the roles loaded into the session are only those of the user\'s own network', async () => {
    const { a, b } = await twoNetworks();

    const authenticated = await identity.authenticate({
      networkSlug: a.network.slug, loginIdentifier: a.admin.cpf, password: a.password, ip: '',
    });

    const roles = valueOfResult(authenticated).user.roles;
    const schoolsOfB = [b.schools[0].id, b.schools[1].id];
    expect(roles.every((role) => !schoolsOfB.includes(role.schoolId))).toBe(true);
    expect(roles).toHaveLength(2);
  });
});
