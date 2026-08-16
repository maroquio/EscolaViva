/*
 * Quem existe na rede e o que cada um pode. O convite, a unidade e as consultas que o restante
 * do produto faz a identidade — inclusive a pergunta "esta pessoa é professora nesta unidade?",
 * que é a fronteira pela qual o acadêmico entra aqui.
 *
 * A unicidade de e-mail é POR REDE, não global: duas prefeituras podem ter a mesma secretária
 * cadastrada, e é isso que permite vender a mesma pessoa para duas contas.
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
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(result.erros)}`);
  }
  return result.valor;
}

function errorsOf(result: Result<unknown>): ApplicationError[] {
  if (result.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return result.erros;
}

beforeEach(clearDatabase);

describe('convidarUsuario', () => {
  test('cria o usuário com os papéis pedidos e devolve a senha provisória', async () => {
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

  test('a senha provisória devolvida realmente autentica', async () => {
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

  test('o e-mail é guardado normalizado e autentica em qualquer caixa', async () => {
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

  test('recusa e-mail já usado na mesma rede', async () => {
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
        campo: 'email',
        codigo: 'email_em_uso',
        mensagem: 'já existe usuário com este e-mail na rede',
      },
    ]);
    expect(await identity.listUsers(network.id)).toHaveLength(1);
  });

  test('a checagem de e-mail duplicado enxerga a diferença de caixa', async () => {
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

    expect(errorsOf(result)[0]?.codigo).toBe('email_em_uso');
  });

  test('aceita o mesmo e-mail em rede diferente: a unicidade é por rede', async () => {
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

  test('papel de responsável sem cadastro de responsável é recusado', async () => {
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
        campo: 'responsavelId',
        codigo: 'responsavel_obrigatorio',
        mensagem:
          'quem entra como responsável precisa estar ligado a um cadastro de responsável',
      },
    ]);
    expect(await identity.listUsers(network.id)).toHaveLength(0);
  });

  test('papel de responsável com cadastro ligado entra e carrega o vínculo na sessão', async () => {
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

  test('recusa unidade de outra rede sem criar o usuário', async () => {
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
        campo: 'atribuicoes',
        codigo: 'unidade_de_outra_rede',
        mensagem: 'unidade não pertence a esta rede',
      },
    ]);
    expect(await identity.listUsers(ours.id)).toHaveLength(0);
  });

  test('convite sem nenhuma atribuição é recusado', async () => {
    const network = await createNetwork();

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Sem Papel',
      email: 'sem.papel@escola.br',
      cpf: generateCpf(12),
      roleAssignments: [],
    });

    expect(errorsOf(result)[0]?.campo).toBe('atribuicoes');
  });

  test('e-mail inválido é recusado antes de tocar no banco', async () => {
    const network = await createNetwork();
    const school = await createTestSchool({ networkId: network.id });

    const result = await identity.inviteUser({
      networkId: network.id,
      name: 'Ana Souza',
      email: 'ana-arroba-nada',
      cpf: generateCpf(13),
      roleAssignments: [{ schoolId: school.id, role: 'teacher' }],
    });

    expect(errorsOf(result)[0]?.campo).toBe('email');
    expect(await identity.listUsers(network.id)).toHaveLength(0);
  });

  test('o mesmo par unidade e papel repetido no formulário vira uma única linha', async () => {
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

  test('recusa convite com CPF inválido', async () => {
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
    if (!invitation.ok) expect(invitation.erros[0]?.campo).toBe('cpf');
  });

  test('recusa CPF já usado por outro usuário da mesma rede', async () => {
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
    if (!invitation.ok) expect(invitation.erros[0]?.campo).toBe('cpf');
  });

  test('o mesmo CPF em outra rede é aceito — a unicidade é por tenant', async () => {
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

  test('recusa quando o CPF digitado diverge do cadastro do responsável', async () => {
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
      expect(invitation.erros[0]?.campo).toBe('cpf');
      expect(invitation.erros[0]?.mensagem).toContain(guardian.name);
      expect(invitation.erros[0]?.mensagem).not.toContain(guardian.cpf);
    }
  });

  /* Durante a janela os cadastros antigos ainda não têm CPF; exigi-lo bloquearia um fluxo que
     funcionava, que é o oposto do que a compatibilidade promete. */
  test('aceita quando o cadastro do responsável ainda não tem CPF', async () => {
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

  test('o CPF gravado no convite volta na leitura do usuário', async () => {
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
    // `identity` não expõe consulta de usuário por id, e criar uma porta pública só para
    // satisfazer um teste seria escopo que ninguém pediu. `checklist.test.ts` já afirma "a linha
    // caiu no banco" exatamente assim.
    const rows = await testSql()<{ cpf: string }[]>`
      SELECT cpf FROM app_user WHERE id = ${invitation.valor.userId}`;

    expect(rows[0]?.cpf).toBe('52998224725');
  });
});

describe('unidades da rede', () => {
  test('criarUnidade grava a unidade ativa e ela aparece na listagem', async () => {
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

  test('código INEP em branco vira ausência de código', async () => {
    const network = await createNetwork();

    const result = await identity.createSchool({
      networkId: network.id,
      name: 'Escola Sem INEP',
      inepCode: '',
    });

    expect(valueOfResult(result).inepCode).toBeNull();
  });

  test('recusa unidade com nome já usado na rede', async () => {
    const network = await createNetwork();
    await createTestSchool({ networkId: network.id, name: 'Escola Centro' });

    const result = await identity.createSchool({ networkId: network.id, name: 'Escola Centro' });

    expect(errorsOf(result)).toEqual([
      {
        campo: 'nome',
        codigo: 'nome_em_uso',
        mensagem: 'já existe unidade com este nome na rede',
      },
    ]);
    expect(await identity.listSchools(network.id)).toHaveLength(1);
  });

  test('o mesmo nome de unidade é aceito em outra rede', async () => {
    const first = await createNetwork();
    const second = await createNetwork();
    await createTestSchool({ networkId: first.id, name: 'Escola Centro' });

    const result = await identity.createSchool({ networkId: second.id, name: 'Escola Centro' });

    expect(result.ok).toBe(true);
  });

  test('unidade sem nome é recusada', async () => {
    const network = await createNetwork();

    const result = await identity.createSchool({ networkId: network.id, name: '   ' });

    expect(errorsOf(result)[0]?.campo).toBe('nome');
  });

  test('unidadePorId devolve a unidade da rede e nulo para id desconhecido', async () => {
    const network = await createNetwork();
    const school = await createTestSchool({ networkId: network.id, name: 'Escola Centro' });

    const found = await identity.schoolById(network.id, school.id);

    expect(found?.name).toBe('Escola Centro');
    expect(await identity.schoolById(network.id, crypto.randomUUID())).toBeNull();
  });

  test('id fora do formato devolve nulo e lista vazia em vez de erro de conversão', async () => {
    const network = await createNetwork();
    await createTestSchool({ networkId: network.id });

    const found = await identity.schoolById(network.id, 'nao-e-uuid');

    expect(found).toBeNull();
    expect(await identity.listSchools('nao-e-uuid')).toEqual([]);
    expect(await identity.listUsers('nao-e-uuid')).toEqual([]);
  });
});

describe('professores da unidade', () => {
  test('ehProfessorNaUnidade só confirma quem tem o papel naquela unidade', async () => {
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

  test('quem tem outro papel na unidade não é professor ali', async () => {
    const scenario = await fullScenario();
    const [center] = scenario.schools;

    const registrarIsAlsoTeacher = await identity.isTeacherAtSchool(
      scenario.network.id, scenario.registrar.id, center.id,
    );

    expect(registrarIsAlsoTeacher).toBe(false);
  });

  test('professoresDaUnidade traz só os professores daquela unidade, em ordem de nome', async () => {
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

  test('professor desativado sai da lista da unidade', async () => {
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

describe('consultas de apoio', () => {
  test('redePorSlug devolve a rede da tela de login e nulo para slug desconhecido', async () => {
    const network = await createNetwork({ name: 'Rede Serra', slug: 'serra' });

    const found = await identity.networkBySlug('serra');

    expect(found).toEqual({ id: network.id, name: 'Rede Serra', slug: 'serra', status: 'active' });
    expect(await identity.networkBySlug('nao-existe')).toBeNull();
  });

  test('nomesDeUsuarios resolve os nomes pedidos em um mapa', async () => {
    const network = await createNetwork();
    const ana = await createUser({ networkId: network.id, name: 'Ana Souza' });
    const bia = await createUser({ networkId: network.id, name: 'Bia Nunes' });

    const names = await identity.userNames(network.id, [ana.id, bia.id, ana.id]);

    expect(names).toEqual(new Map([[ana.id, 'Ana Souza'], [bia.id, 'Bia Nunes']]));
  });

  test('nomesDeUsuarios ignora id fora do formato e lista vazia', async () => {
    const network = await createNetwork();
    const ana = await createUser({ networkId: network.id, name: 'Ana Souza' });

    const names = await identity.userNames(network.id, ['lixo', ana.id]);

    expect(names).toEqual(new Map([[ana.id, 'Ana Souza']]));
    expect(await identity.userNames(network.id, [])).toEqual(new Map());
  });

  test('listarUsuarios traz também quem está desativado, marcado como tal', async () => {
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

describe('isolamento de tenant', () => {
  test('nenhuma consulta de identidade da rede A devolve linha da rede B', async () => {
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

  test('unidade e papel de outra rede não são alcançáveis pelo id', async () => {
    const { a, b } = await twoNetworks();

    const otherSchool = await identity.schoolById(a.network.id, b.schools[0].id);

    expect(otherSchool).toBeNull();
    expect(
      await identity.isTeacherAtSchool(a.network.id, b.teacher.id, b.schools[0].id),
    ).toBe(false);
    expect(await identity.schoolTeachers(a.network.id, b.schools[0].id)).toEqual([]);
  });

  test('os papéis carregados na sessão são apenas os da rede do usuário', async () => {
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
