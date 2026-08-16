/*
 * Who may do what, and why the answer changes status code.
 *
 * The rule has two halves. The first is the role: an account without the role of that area gets a
 * 403, and the denied access is logged. The second is reach within the role — the class group that
 * is not the teacher's, the report card that is not the guardian's, the network that is not the
 * session's — and that half answers 404, never 403: saying "it exists, but it is not yours" already
 * tells that the record exists, and the existence of a student is information.
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

describe('authorization by role', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('each role lands on the dashboard of its own role', async () => {
    const scenario = await fullScenario();

    const targets = await Promise.all(
      (['admin', 'registrar', 'teacher', 'guardian'] as const).map(async (who) => {
        const response = await open('/dashboard', await signInAs(scenario, who));
        return response.headers.get('Location');
      }),
    );

    expect(targets).toEqual(['/network', '/registrar', '/teacher', '/guardian']);
  });

  test('each role opens its own area', async () => {
    const scenario = await fullScenario();

    const status = await Promise.all([
      statusOf('/network', await signInAs(scenario, 'admin')),
      statusOf('/registrar', await signInAs(scenario, 'registrar')),
      statusOf('/teacher', await signInAs(scenario, 'teacher')),
      statusOf('/guardian', await signInAs(scenario, 'guardian')),
    ]);

    expect(status).toEqual([200, 200, 200, 200]);
  });

  test('a teacher gets into neither the registrar area nor the network administration', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');

    const status = await Promise.all([
      statusOf('/registrar', cookie),
      statusOf('/registrar/class-groups', cookie),
      statusOf('/network/users', cookie),
    ]);

    expect(status).toEqual([403, 403, 403]);
  });

  test('a guardian gets into neither the teacher area nor the registrar area', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'guardian');

    const status = await Promise.all([
      statusOf('/teacher', cookie),
      statusOf('/registrar/students', cookie),
      statusOf('/announcements', cookie),
    ]);

    expect(status).toEqual([403, 403, 403]);
  });

  test('the registrar does not administer the network, and network administration does not teach', async () => {
    const scenario = await fullScenario();

    const registrarInNetwork = await statusOf('/network/schools', await signInAs(scenario, 'registrar'));
    const adminOnTeacherArea = await statusOf('/teacher', await signInAs(scenario, 'admin'));

    expect([registrarInNetwork, adminOnTeacherArea]).toEqual([403, 403]);
  });

  test('the registrar and network administration publish announcements; the teacher does not', async () => {
    const scenario = await fullScenario();

    const status = await Promise.all([
      statusOf('/announcements', await signInAs(scenario, 'registrar')),
      statusOf('/announcements', await signInAs(scenario, 'admin')),
      statusOf('/announcements', await signInAs(scenario, 'teacher')),
    ]);

    expect(status).toEqual([200, 200, 403]);
  });

  test('changing one\'s own password belongs to anyone signed in', async () => {
    const scenario = await fullScenario();

    const status = await Promise.all([
      statusOf('/account/password', await signInAs(scenario, 'teacher')),
      statusOf('/account/password', await signInAs(scenario, 'guardian')),
    ]);

    expect(status).toEqual([200, 200]);
  });
});

describe('reach within the role', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('a teacher does not open the grades of another teacher\'s class-group subject', async () => {
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
      `/teacher/subjects/${scenario.classGroupSubjects[0].id}/grades`,
      cookie,
    );
    const fromAnother = await statusOf(`/teacher/subjects/${foreign.id}/grades`, cookie);

    expect(own).toBe(200);
    expect(fromAnother).toBe(404);
  });

  test('a teacher opens neither roll call nor closing for a class group they do not teach', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const withoutAssignment = scenario.classGroups[1].id;

    const status = await Promise.all([
      statusOf(`/teacher/class-groups/${withoutAssignment}/roll-call`, cookie),
      statusOf(`/teacher/class-groups/${withoutAssignment}/closing`, cookie),
    ]);

    expect(status).toEqual([404, 404]);
  });

  test('a guardian does not open the report card of a student who is not theirs', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'guardian');

    const ofTheirStudent = await statusOf(
      `/guardian/enrollments/${scenario.enrollments[0].id}/report-card`,
      cookie,
    );
    const fromAnotherFamily = await statusOf(
      `/guardian/enrollments/${scenario.enrollments[1].id}/report-card`,
      cookie,
    );

    expect(ofTheirStudent).toBe(200);
    expect(fromAnotherFamily).toBe(404);
  });

  test('a guardian does not open the attendance of a student who is not theirs', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'guardian');

    const status = await statusOf(
      `/guardian/enrollments/${scenario.enrollments[2].id}/attendance`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('a record from another network does not exist for whoever asks', async () => {
    const [networkA, networkB] = await Promise.all([fullScenario(), fullScenario()]);
    const cookie = await signInAs(networkA, 'registrar');

    const ofTheOwnNetwork = await statusOf(`/registrar/class-groups/${networkA.classGroups[0].id}`, cookie);
    const ofTheOtherNetwork = await statusOf(`/registrar/class-groups/${networkB.classGroups[0].id}`, cookie);

    expect(ofTheOwnNetwork).toBe(200);
    expect(ofTheOtherNetwork).toBe(404);
  });

  test('a teacher in one network does not reach the class-group subject of another network', async () => {
    const [networkA, networkB] = await Promise.all([fullScenario(), fullScenario()]);
    const cookie = await signInAs(networkA, 'teacher');

    const status = await statusOf(
      `/teacher/subjects/${networkB.classGroupSubjects[0].id}/grades`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('an identifier that is not a uuid answers 404 instead of blowing up', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const status = await Promise.all([
      statusOf('/registrar/class-groups/nao-e-um-uuid', cookie),
      statusOf('/registrar/students/nao-e-um-uuid', cookie),
    ]);

    expect(status).toEqual([404, 404]);
  });
});
