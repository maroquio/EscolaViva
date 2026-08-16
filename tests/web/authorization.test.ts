/*
 * Quem pode o quê, e por que a resposta muda de código.
 *
 * A regra tem duas metades. A primeira é o papel: uma conta sem o papel da área recebe 403, e o
 * acesso negado fica registrado. A segunda é o alcance dentro do papel — a turma que não é do
 * professor, o boletim que não é do responsável, a rede que não é a da sessão — e essa metade
 * responde 404, nunca 403: dizer "existe, mas não é seu" já é contar que o registro existe, e a
 * existência de um aluno é informação.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase } from '../support/database';
import {
  fullScenario,
  createSubject,
  createClassGroupSubject,
  createUser,
  type Scenario,
} from '../support/factories';
import { open, signIn } from './support';

const signInAs = (
  scenario: Scenario,
  who: 'admin' | 'registrar' | 'teacher' | 'guardian',
): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario[who].cpf, password: scenario.password });

const statusOf = async (path: string, cookie: string): Promise<number> =>
  (await open(path, cookie)).status;

describe('autorização por papel', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('cada papel chega ao painel do seu próprio papel', async () => {
    const scenario = await fullScenario();

    const targets = await Promise.all(
      (['admin', 'registrar', 'teacher', 'guardian'] as const).map(async (who) => {
        const response = await open('/painel', await signInAs(scenario, who));
        return response.headers.get('Location');
      }),
    );

    expect(targets).toEqual(['/rede', '/secretaria', '/professor', '/responsavel']);
  });

  test('cada papel abre a sua própria área', async () => {
    const scenario = await fullScenario();

    const status = await Promise.all([
      statusOf('/rede', await signInAs(scenario, 'admin')),
      statusOf('/secretaria', await signInAs(scenario, 'registrar')),
      statusOf('/professor', await signInAs(scenario, 'teacher')),
      statusOf('/responsavel', await signInAs(scenario, 'guardian')),
    ]);

    expect(status).toEqual([200, 200, 200, 200]);
  });

  test('professor não entra na secretaria nem na administração da rede', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');

    const status = await Promise.all([
      statusOf('/secretaria', cookie),
      statusOf('/secretaria/turmas', cookie),
      statusOf('/rede/usuarios', cookie),
    ]);

    expect(status).toEqual([403, 403, 403]);
  });

  test('responsável não entra na área do professor nem na da secretaria', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'guardian');

    const status = await Promise.all([
      statusOf('/professor', cookie),
      statusOf('/secretaria/alunos', cookie),
      statusOf('/comunicados', cookie),
    ]);

    expect(status).toEqual([403, 403, 403]);
  });

  test('secretaria não administra a rede, e administração da rede não dá aula', async () => {
    const scenario = await fullScenario();

    const registrarInNetwork = await statusOf('/rede/unidades', await signInAs(scenario, 'registrar'));
    const adminOnTeacherArea = await statusOf('/professor', await signInAs(scenario, 'admin'));

    expect([registrarInNetwork, adminOnTeacherArea]).toEqual([403, 403]);
  });

  test('secretaria e administração da rede publicam comunicados; o professor não', async () => {
    const scenario = await fullScenario();

    const status = await Promise.all([
      statusOf('/comunicados', await signInAs(scenario, 'registrar')),
      statusOf('/comunicados', await signInAs(scenario, 'admin')),
      statusOf('/comunicados', await signInAs(scenario, 'teacher')),
    ]);

    expect(status).toEqual([200, 200, 403]);
  });

  test('trocar a própria senha é de qualquer autenticado', async () => {
    const scenario = await fullScenario();

    const status = await Promise.all([
      statusOf('/conta/senha', await signInAs(scenario, 'teacher')),
      statusOf('/conta/senha', await signInAs(scenario, 'guardian')),
    ]);

    expect(status).toEqual([200, 200]);
  });
});

describe('alcance dentro do papel', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('professor não abre as notas de turma-disciplina de outro professor', async () => {
    const scenario = await fullScenario();
    const anotherTeacher = await createUser({
      networkId: scenario.network.id,
      password: scenario.password,
      roles: [{ schoolId: scenario.schools[0].id, role: 'teacher' }],
    });
    const subject = await createSubject({ networkId: scenario.network.id });
    const foreign = await createClassGroupSubject({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[1].id,
      subjectId: subject.id,
      teacherUserId: anotherTeacher.id,
    });
    const cookie = await signInAs(scenario, 'teacher');

    const own = await statusOf(
      `/professor/disciplinas/${scenario.classGroupSubjects[0].id}/notas`,
      cookie,
    );
    const fromAnother = await statusOf(`/professor/disciplinas/${foreign.id}/notas`, cookie);

    expect(own).toBe(200);
    expect(fromAnother).toBe(404);
  });

  test('professor não abre chamada nem fechamento de turma que não leciona', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const withoutAssignment = scenario.classGroups[1].id;

    const status = await Promise.all([
      statusOf(`/professor/turmas/${withoutAssignment}/chamada`, cookie),
      statusOf(`/professor/turmas/${withoutAssignment}/fechamento`, cookie),
    ]);

    expect(status).toEqual([404, 404]);
  });

  test('responsável não abre boletim de aluno que não é dele', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'guardian');

    const ofTheirStudent = await statusOf(
      `/responsavel/matriculas/${scenario.enrollments[0].id}/boletim`,
      cookie,
    );
    const fromAnotherFamily = await statusOf(
      `/responsavel/matriculas/${scenario.enrollments[1].id}/boletim`,
      cookie,
    );

    expect(ofTheirStudent).toBe(200);
    expect(fromAnotherFamily).toBe(404);
  });

  test('responsável não abre frequência de aluno que não é dele', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'guardian');

    const status = await statusOf(
      `/responsavel/matriculas/${scenario.enrollments[2].id}/frequencia`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('registro de outra rede não existe para quem pergunta', async () => {
    const [networkA, networkB] = await Promise.all([fullScenario(), fullScenario()]);
    const cookie = await signInAs(networkA, 'registrar');

    const ofTheOwnNetwork = await statusOf(`/secretaria/turmas/${networkA.classGroups[0].id}`, cookie);
    const ofTheOtherNetwork = await statusOf(`/secretaria/turmas/${networkB.classGroups[0].id}`, cookie);

    expect(ofTheOwnNetwork).toBe(200);
    expect(ofTheOtherNetwork).toBe(404);
  });

  test('professor de uma rede não alcança a turma-disciplina de outra rede', async () => {
    const [networkA, networkB] = await Promise.all([fullScenario(), fullScenario()]);
    const cookie = await signInAs(networkA, 'teacher');

    const status = await statusOf(
      `/professor/disciplinas/${networkB.classGroupSubjects[0].id}/notas`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('identificador que não é uuid responde 404 em vez de estourar', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const status = await Promise.all([
      statusOf('/secretaria/turmas/nao-e-um-uuid', cookie),
      statusOf('/secretaria/alunos/nao-e-um-uuid', cookie),
    ]);

    expect(status).toEqual([404, 404]);
  });
});
