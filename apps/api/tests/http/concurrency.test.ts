/*
 * The pool has ten connections, and a request that holds one while asking for another is a request
 * that can starve the pool it is standing in.
 *
 * `registerClassGroup` and `assignTeacher` used to call into `identity` from inside `unitOfWork`.
 * Those queries go through `reader()`, which is the same pool the open transaction is holding a
 * connection from — so ten simultaneous writes held all ten connections and each waited for an
 * eleventh that could not come. The registrar creating the year's class groups is exactly when ten
 * simultaneous writes happen, and the failure is not a slow page: it is `Idle timeout reached after
 * 30s`, thirty seconds of waiting and then a 500, past the 25 s of `HTTP_TIMEOUT_MS`.
 *
 * Both use cases now read what they need before opening the transaction, which is what
 * `linkGuardian` and `publishAnnouncement` already did.
 *
 * Four rounds rather than one: the first round used to pass while leaking the connections that made
 * the second fail ten out of ten. A single round would have called this fixed while it was not.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { API } from '../../src/http/constants';
import { clearDatabase } from '../support/database';
import { fullScenario } from '../support/factories';
import { signIn, writeWithKey } from './support';

const SIMULTANEOUS = 10;

const ROUNDS = [1, 2, 3, 4];

const DEADLINE_MS = 200_000;

describe('a write that reads across modules does not starve the connection pool', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('ten simultaneous class groups, four rounds, and none of them fails', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const school = scenario.schools[0];
    expect(school).toBeDefined();

    const create = (name: number): Promise<Response> =>
      writeWithKey(
        'POST',
        `${API.versionedPrefix}/registrar/class-groups`,
        {
          schoolId: school?.id,
          academicYearId: scenario.academicYear.id,
          name: `Turma Simultânea ${name}`,
          gradeLevel: '1º ano',
          shift: 'morning',
        },
        cookie,
        crypto.randomUUID(),
      );

    const failuresByRound: number[] = [];
    for (const round of ROUNDS) {
      const responses = await Promise.all(
        Array.from({ length: SIMULTANEOUS }, (_, index) => create(round * 100 + index)),
      );
      failuresByRound.push(responses.filter((response) => response.status >= 400).length);
    }

    expect(failuresByRound).toEqual(ROUNDS.map(() => 0));
  }, DEADLINE_MS);

  test('ten simultaneous teaching assignments, four rounds, and none of them fails', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.registrar.cpf,
      password: scenario.password,
    });
    const classGroup = scenario.classGroups[0];
    const teacher = scenario.teacher;
    expect(classGroup).toBeDefined();

    const failuresByRound: number[] = [];
    for (const round of ROUNDS) {
      const ids = await Promise.all(
        Array.from({ length: SIMULTANEOUS }, (_, index) =>
          writeWithKey(
            'POST',
            `${API.versionedPrefix}/registrar/subjects`,
            { name: `Matéria Simultânea ${round * 100 + index}` },
            cookie,
            crypto.randomUUID(),
          )
            .then((response) => response.json() as Promise<{ id: string }>)
            .then((body) => body.id),
        ),
      );

      const responses = await Promise.all(
        ids.map((subjectId) =>
          writeWithKey(
            'POST',
            `${API.versionedPrefix}/registrar/class-groups/${classGroup?.id}/subjects`,
            { subjectId, teacherUserId: teacher.id },
            cookie,
            crypto.randomUUID(),
          ),
        ),
      );
      failuresByRound.push(responses.filter((response) => response.status >= 400).length);
    }

    expect(failuresByRound).toEqual(ROUNDS.map(() => 0));
  }, DEADLINE_MS);
});

/*
 * Asking "is this name taken?" and then inserting is two statements with a gap, and the gap is where
 * the second request reads "free" for a name the first is about to take. The database catches it —
 * `school_name_unique_in_network` holds — but the loser used to hear about it as a 500 with a stack,
 * for a name it had every right to try. The constraint answers the question instead of the table,
 * so the loser reads the same refusal it would have read without the race.
 */
describe('a race on a unique name is a refusal, not a failure', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('two schools submitted at once: one is created, the other is refused with 422', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.admin.cpf,
      password: scenario.password,
    });
    const name = 'Escola Disputada';

    const responses = await Promise.all([
      writeWithKey('POST', `${API.versionedPrefix}/network/schools`, { name }, cookie, crypto.randomUUID()),
      writeWithKey('POST', `${API.versionedPrefix}/network/schools`, { name }, cookie, crypto.randomUUID()),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 422]);
  }, DEADLINE_MS);
});
