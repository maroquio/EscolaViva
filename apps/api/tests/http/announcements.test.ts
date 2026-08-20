/*
 * The board of whoever publishes, in JSON.
 *
 * This screen exists for one number: the read rate. Everything below is written around the two ways
 * that number can be quietly wrong — measuring the page instead of the slice, and letting the slice
 * be someone else's. The scope rule is the same one the SSR screen has always obeyed: the role says
 * what you may see, a school outside it answers 404 rather than an empty list, and a registrar with
 * a filter they may not use is refused rather than silently widened to the network.
 *
 * One URL changes in the port and only one: the SSR form posted to `/announcements/new` because a
 * browser form needed a target of its own, distinct from the URL that rendered the list. JSON needs
 * no such thing, so the collection is `POST /api/v1/announcements` and the method says the rest. The
 * 404 for an out-of-scope `schoolId` in the body travels with it — the path changed, the rule did not.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { API } from '../../src/http/constants';
import { clearDatabase, testSql } from '../support/database';
import {
  createAnnouncement,
  createSchool,
  fullScenario,
  twoNetworks,
  type Scenario,
} from '../support/factories';
import { read, signIn, write, writeWithKey } from './support';

const ANNOUNCEMENTS = `${API.versionedPrefix}/announcements`;
const RECIPIENTS = `${ANNOUNCEMENTS}/recipients`;

const SCHOOL_FILTER = 'schoolId';
const PAGE = 'p';

type AnnouncementRow = {
  id: string;
  title: string;
  publishedAt: string | null;
  recipients: number;
  reads: number;
  rate: number;
};

type Board = {
  announcements: {
    items: AnnouncementRow[];
    page: number;
    pages: number;
    total: number;
    size: number;
  };
  summary: { recipients: number; reads: number; rate: number };
  currentSchool: string;
  seesWholeNetwork: boolean;
};

type Refusal = { errors: { field?: string; code: string; message: string }[] };
type Created = { id: string };
type Repeated = { repeated: boolean; location: string };
type Option = { id: string; name: string };

type Who = 'admin' | 'registrar' | 'teacher' | 'guardian';

const signInAs = (scenario: Scenario, who: Who): Promise<string> =>
  signIn({
    networkSlug: scenario.network.slug,
    cpf: scenario[who].cpf,
    password: scenario.password,
  });

/** Two recipients and one reading: the rate of that one announcement is exactly one half. */
const halfRead = (scenario: Scenario, schoolId: string, title: string, day = 1) =>
  createAnnouncement({
    networkId: scenario.network.id,
    schoolId,
    authorUserId: scenario.registrar.id,
    title,
    publishedAt: new Date(Date.UTC(2026, 2, day)),
    recipients: [
      { userId: scenario.guardians[0].id, readAt: new Date() },
      { userId: scenario.guardians[1].id },
    ],
  });

/** Twelve half-read announcements: two pages of the default ten, and a slice rate of one half. */
const twelveAnnouncements = async (scenario: Scenario): Promise<void> => {
  for (let number = 1; number <= 12; number += 1) {
    await halfRead(scenario, scenario.schools[0].id, `Comunicado ${number}`, number);
  }
};

const wholeSchool = (schoolId: string) => ({
  schoolId,
  title: 'Semana de provas',
  body: 'As provas começam na segunda-feira.',
  audience: 'unidade',
  recipients: [] as string[],
});

const announcementTotal = async (): Promise<number> => {
  const rows = await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM announcement`;
  return Number(rows[0]?.total ?? '0');
};

const recipientTotal = async (announcementId: string): Promise<number> => {
  const rows = await testSql()<{ total: string }[]>`
    SELECT count(*)::text AS total FROM announcement_recipient
     WHERE announcement_id = ${announcementId}`;
  return Number(rows[0]?.total ?? '0');
};

describe('reading the board and its rate', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('the list answers 200 with the announcements and the rate of the slice', async () => {
    const scenario = await fullScenario();
    const announcement = await halfRead(scenario, scenario.schools[0].id, 'Semana de provas');
    const cookie = await signInAs(scenario, 'registrar');

    const response = await read(ANNOUNCEMENTS, cookie);
    const board = (await response.json()) as Board;

    expect(response.status).toBe(200);
    expect(board.announcements.total).toBe(1);
    expect(board.announcements.items[0]?.id).toBe(announcement.id);
    expect(board.announcements.items[0]?.title).toBe(announcement.title);
    expect(board.announcements.items[0]?.rate).toBe(0.5);
    expect(board.summary).toEqual({ recipients: 2, reads: 1, rate: 0.5 });
    expect(board.currentSchool).toBe(scenario.schools[0].id);
    expect(board.seesWholeNetwork).toBe(false);
  });

  /*
   * The presenter decides what goes out, and a row of the database is not it. `announcementId` is
   * the domain's name for the column; the resource the front addresses is `id`, and the body it
   * publishes comes back keyed the same way. Asserting the absence is what keeps a `...row` spread
   * from passing this file.
   */
  test('an item carries the presented shape, not the row the query returned', async () => {
    const scenario = await fullScenario();
    await halfRead(scenario, scenario.schools[0].id, 'Semana de provas');
    const cookie = await signInAs(scenario, 'registrar');

    const board = (await (await read(ANNOUNCEMENTS, cookie)).json()) as Board;
    const [item] = board.announcements.items;

    expect(Object.keys(item ?? {}).sort()).toEqual([
      'id',
      'publishedAt',
      'rate',
      'reads',
      'recipients',
      'title',
    ]);
  });

  test('without a session the board answers 401', async () => {
    const response = await read(ANNOUNCEMENTS);

    expect(response.status).toBe(401);
  });

  /*
   * `requireRole` never throws: it renders a response of its own. Under `/api` that response has to
   * be a JSON body rather than the HTML error page, which is why the body is asserted and not only
   * the status — a leak here reaches the front as an unparseable answer.
   */
  test('a teacher has no business on this board, and is refused with 403 in JSON', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');

    const response = await read(ANNOUNCEMENTS, cookie);
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(403);
    expect(refusal.errors.length).toBeGreaterThan(0);
  });

  test('a school of another network does not exist for whoever is listing', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'admin');

    const response = await read(`${ANNOUNCEMENTS}?${SCHOOL_FILTER}=${b.schools[0].id}`, cookie);

    expect(response.status).toBe(404);
  });

  /*
   * 404 and not an empty list: whether a school exists is already information, and a registrar
   * filtering by a school where they hold no role is asking about someone else's slice.
   */
  test('a school of the same network where the registrar holds no role answers 404', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await read(
      `${ANNOUNCEMENTS}?${SCHOOL_FILTER}=${scenario.schools[1].id}`,
      cookie,
    );

    expect(response.status).toBe(404);
  });

  test('`?p=` walks to the next page, and the two pages carry different announcements', async () => {
    const scenario = await fullScenario();
    await twelveAnnouncements(scenario);
    const cookie = await signInAs(scenario, 'registrar');

    const first = (await (await read(ANNOUNCEMENTS, cookie)).json()) as Board;
    const second = (await (
      await read(`${ANNOUNCEMENTS}?${PAGE}=2`, cookie)
    ).json()) as Board;

    expect(first.announcements.page).toBe(1);
    expect(first.announcements.items.length).toBe(10);
    expect(first.announcements.pages).toBe(2);
    expect(second.announcements.page).toBe(2);
    expect(second.announcements.items.length).toBe(2);

    const onFirst = new Set(first.announcements.items.map((item) => item.id));
    expect(second.announcements.items.some((item) => onFirst.has(item.id))).toBe(false);
  });

  /*
   * An over-range cursor is not an error. `queryPage` clamps to the last page and runs the query
   * again for it, so a test that expected an empty page or a 404 here would be specifying a
   * regression rather than a contract.
   */
  test('`?p=999` answers 200 with the last page, never empty and never 404', async () => {
    const scenario = await fullScenario();
    await twelveAnnouncements(scenario);
    const cookie = await signInAs(scenario, 'registrar');

    const response = await read(`${ANNOUNCEMENTS}?${PAGE}=999`, cookie);
    const board = (await response.json()) as Board;

    expect(response.status).toBe(200);
    expect(board.announcements.page).toBe(2);
    expect(board.announcements.pages).toBe(2);
    expect(board.announcements.items.length).toBe(2);
  });

  /*
   * The reason the screen exists. A rate that recalculated itself on every click of "next" would
   * answer a different question on every page — the summary measures the whole slice, and the two
   * pages of the same slice have to hand back the very same three numbers.
   */
  test('the rate does not move when the page does', async () => {
    const scenario = await fullScenario();
    await twelveAnnouncements(scenario);
    const cookie = await signInAs(scenario, 'registrar');

    const first = (await (await read(ANNOUNCEMENTS, cookie)).json()) as Board;
    const second = (await (
      await read(`${ANNOUNCEMENTS}?${PAGE}=2`, cookie)
    ).json()) as Board;

    expect(first.summary).toEqual({ recipients: 24, reads: 12, rate: 0.5 });
    expect(second.summary).toEqual(first.summary);
  });

  test('a network administrator with no filter sees the whole network', async () => {
    const scenario = await fullScenario();
    const central = await halfRead(scenario, scenario.schools[0].id, 'Aviso da Escola Central', 1);
    const neighbourhood = await halfRead(
      scenario,
      scenario.schools[1].id,
      'Aviso da Escola Bairro',
      2,
    );
    const cookie = await signInAs(scenario, 'admin');

    const board = (await (await read(ANNOUNCEMENTS, cookie)).json()) as Board;
    const titles = board.announcements.items.map((item) => item.title);

    expect(board.seesWholeNetwork).toBe(true);
    expect(board.currentSchool).toBe('');
    expect(titles).toContain(central.title);
    expect(titles).toContain(neighbourhood.title);
  });

  /*
   * The mirror image of the case above, and the one that matters: with no filter the registrar gets
   * their own school, not the network. `currentSchool` comes back filled so the next page stays
   * inside the same slice instead of quietly widening it.
   */
  test('a registrar with no filter sees their first school, not the network', async () => {
    const scenario = await fullScenario();
    const central = await halfRead(scenario, scenario.schools[0].id, 'Aviso da Escola Central', 1);
    const neighbourhood = await halfRead(
      scenario,
      scenario.schools[1].id,
      'Aviso da Escola Bairro',
      2,
    );
    const cookie = await signInAs(scenario, 'registrar');

    const board = (await (await read(ANNOUNCEMENTS, cookie)).json()) as Board;
    const titles = board.announcements.items.map((item) => item.title);

    expect(board.seesWholeNetwork).toBe(false);
    expect(board.currentSchool).toBe(scenario.schools[0].id);
    expect(titles).toContain(central.title);
    expect(titles).not.toContain(neighbourhood.title);
    expect(board.summary.recipients).toBe(2);
  });

  /*
   * "A registrar with no assigned school gets no slice and no list" is a rule the route implements,
   * and one no request can reach today: `user_role.school_id` is `NOT NULL` and the role query joins
   * the school inside the same network, so a session that clears `requireRole` as a registrar always
   * carries at least one school, and `listSchools` always contains it. What is asserted here is the
   * consequence that keeps it that way — a registrar's scope is never the empty one that would fall
   * back to the network. The day role assignments stop being per-school, this fails and the empty
   * branch has to be decided on purpose instead of inherited.
   */
  test('a registrar never reaches the empty scope that a network-wide fallback would look like', async () => {
    const scenario = await fullScenario();
    await halfRead(scenario, scenario.schools[1].id, 'Aviso da Escola Bairro');
    const cookie = await signInAs(scenario, 'registrar');

    const board = (await (await read(ANNOUNCEMENTS, cookie)).json()) as Board;

    expect(board.currentSchool).not.toBe('');
    expect(board.seesWholeNetwork).toBe(false);
    expect(board.announcements.total).toBe(0);
    expect(board.summary).toEqual({ recipients: 0, reads: 0, rate: 0 });
  });
});

describe('the recipients a school offers', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('the school hands back its guardians, in the order a list shows them', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await read(
      `${RECIPIENTS}?${SCHOOL_FILTER}=${scenario.schools[0].id}`,
      cookie,
    );
    const options = (await response.json()) as Option[];
    const names = options.map((option) => option.name);

    expect(response.status).toBe(200);
    expect(options.length).toBe(scenario.guardians.length);
    expect(new Set(options.map((option) => option.id))).toEqual(
      new Set(scenario.guardians.map((guardian) => guardian.id)),
    );
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  /*
   * With no school chosen there is nobody to offer yet: the first step of sending is picking the
   * unit, and the recipients only exist once it is known. An empty list, not a 400 — the front asks
   * this endpoint before the user has chosen anything.
   */
  test('with no school the list is empty rather than refused', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await read(RECIPIENTS, cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test('a school outside the reach of whoever asks answers 404', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await read(
      `${RECIPIENTS}?${SCHOOL_FILTER}=${scenario.schools[1].id}`,
      cookie,
    );

    expect(response.status).toBe(404);
  });

  /*
   * A closed unit receives no announcement, so it offers no recipients either — and it answers the
   * same 404 as a unit that belongs to somebody else, rather than an empty list that would read as
   * "this school has no guardians".
   */
  test('an inactive school answers 404 even for the network administrator', async () => {
    const scenario = await fullScenario();
    const closed = await createSchool({
      networkId: scenario.network.id,
      name: 'Escola Desativada',
      active: false,
    });
    const cookie = await signInAs(scenario, 'admin');

    const response = await read(`${RECIPIENTS}?${SCHOOL_FILTER}=${closed.id}`, cookie);

    expect(response.status).toBe(404);
  });

  test('without a session it answers 401, and to the wrong role 403', async () => {
    const scenario = await fullScenario();
    const guardian = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.guardian.cpf,
      password: scenario.password,
    });

    const anonymous = await read(RECIPIENTS);
    const wrongRole = await read(RECIPIENTS, guardian);

    expect(anonymous.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});

describe('publishing an announcement', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  /*
   * The `Location` is not decoration: `jsonIdempotencyMiddleware` stores exactly that header, and a
   * repeat replays it, so the front navigates wherever it points. It points at the collection
   * because this API exposes no GET for one announcement — the per-id path it used to emit answered
   * 404, which sent the second tap of a slow connection to a page that does not exist.
   */
  test('a valid announcement answers 201 with the id and the Location', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      wholeSchool(scenario.schools[0].id),
      cookie,
    );
    const created = (await response.json()) as Created;

    expect(response.status).toBe(201);
    expect(created.id).not.toBe('');
    expect(response.headers.get('Location')).toBe(ANNOUNCEMENTS);
    expect(await announcementTotal()).toBe(1);
  });

  /*
   * An empty recipient list is `publishAnnouncement`'s contract for "the whole school", and the
   * whole school is every guardian with an active enrolment there — the five of the scenario.
   */
  test('the "whole school" audience reaches every guardian of the school', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      wholeSchool(scenario.schools[0].id),
      cookie,
    );
    const created = (await response.json()) as Created;

    expect(response.status).toBe(201);
    expect(await recipientTotal(created.id)).toBe(scenario.guardians.length);
  });

  test('a chosen list reaches exactly the people chosen', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      {
        ...wholeSchool(scenario.schools[0].id),
        audience: 'selecionados',
        recipients: [scenario.guardians[0].id, scenario.guardians[1].id],
      },
      cookie,
    );
    const created = (await response.json()) as Created;

    expect(response.status).toBe(201);
    expect(await recipientTotal(created.id)).toBe(2);
  });

  /*
   * Shape is the edge's business and answers 400; a rule is the use case's and answers 422. A body
   * with no `title` never reaches `publishAnnouncement` at all.
   */
  test('a body with no title is refused by the edge, with 400 and the field named', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const { title, ...withoutTitle } = wholeSchool(scenario.schools[0].id);

    const response = await write('POST', ANNOUNCEMENTS, withoutTitle, cookie);
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.field).toBe('title');
    expect(await announcementTotal()).toBe(0);
  });

  test('an empty title is a rule, refused with 422 on the same field', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      { ...wholeSchool(scenario.schools[0].id), title: '   ' },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(refusal.errors[0]?.field).toBe('title');
    expect(await announcementTotal()).toBe(0);
  });

  /*
   * The field is `recipients` and not `guardians`. `guardians[]` existed only because an HTML form
   * encodes repeated checkboxes that way; `communication/constants.ts` calls it `recipients`, every
   * `ApplicationError` on this write names that field, and a refusal pointing anywhere else lands on
   * an input React Hook Form never registered — which renders nothing at all.
   */
  test('choosing "selected" and ticking nobody is refused with 422 on `recipients`', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      { ...wholeSchool(scenario.schools[0].id), audience: 'selecionados' },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(refusal.errors[0]?.field).toBe('recipients');
    expect(refusal.errors[0]?.code).toBe('nothing_selected');
    expect(await announcementTotal()).toBe(0);
  });

  /*
   * A ticked box is external input. The fact that React only offers the right people guarantees
   * nothing, so the list that comes back is checked against the school's — and one stranger refuses
   * the whole submission instead of being silently dropped, because a partial send nobody was told
   * about is worse than a refusal.
   */
  test('one recipient from outside the school refuses the whole submission', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'admin');
    const outsider = scenario.guardians[0].id;

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      {
        ...wholeSchool(scenario.schools[1].id),
        audience: 'selecionados',
        recipients: [outsider],
      },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(refusal.errors[0]?.field).toBe('recipients');
    expect(refusal.errors[0]?.code).toBe('recipient_outside_school');
    expect(await announcementTotal()).toBe(0);
  });

  test('a stranger mixed in with real recipients refuses the whole submission too', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'registrar');

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      {
        ...wholeSchool(a.schools[0].id),
        audience: 'selecionados',
        recipients: [a.guardians[0].id, b.guardians[0].id],
      },
      cookie,
    );

    expect(response.status).toBe(422);
    expect(await announcementTotal()).toBe(0);
  });

  /*
   * A key that is not a UUID and no key at all are the same refusal on purpose: both mean the write
   * cannot be replayed safely, and telling them apart would only invite a client to send a
   * placeholder. The empty header stands in for "absent" — the helpers always send the header, and
   * `tests/api/idempotency.test.ts` covers the truly omitted one against the middleware itself.
   */
  test('a key that is not a UUID is refused with 400 and nothing is published', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const body = wholeSchool(scenario.schools[0].id);

    const invented = await writeWithKey('POST', ANNOUNCEMENTS, body, cookie, 'chave-inventada');
    const refusal = (await invented.json()) as Refusal;
    const empty = await writeWithKey('POST', ANNOUNCEMENTS, body, cookie, '');

    expect(invented.status).toBe(400);
    expect(refusal.errors[0]?.code).toBe('missing_idempotency_key');
    expect(empty.status).toBe(400);
    expect(await announcementTotal()).toBe(0);
  });

  /*
   * The pair is the whole point. Asserting only the second status would pass against a middleware
   * that blindly refused every repeat; what has to hold is that one record exists and that the
   * repeat says where the first one went, so the front can navigate there instead of guessing.
   */
  test('the same key twice publishes once, and the repeat says where the first one went', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const key = crypto.randomUUID();
    const body = wholeSchool(scenario.schools[0].id);

    const first = await writeWithKey('POST', ANNOUNCEMENTS, body, cookie, key);
    await first.json();
    const again = await writeWithKey('POST', ANNOUNCEMENTS, body, cookie, key);
    const repeat = (await again.json()) as Repeated;

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(repeat.repeated).toBe(true);
    expect(repeat.location).toBe(ANNOUNCEMENTS);
    expect(await announcementTotal()).toBe(1);
  });

  test('without a session the write answers 401 and publishes nothing', async () => {
    const scenario = await fullScenario();

    const response = await write('POST', ANNOUNCEMENTS, wholeSchool(scenario.schools[0].id));

    expect(response.status).toBe(401);
    expect(await announcementTotal()).toBe(0);
  });

  test('a guardian may not publish, and is refused with 403', async () => {
    const scenario = await fullScenario();
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: scenario.guardian.cpf,
      password: scenario.password,
    });

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      wholeSchool(scenario.schools[0].id),
      cookie,
    );

    expect(response.status).toBe(403);
    expect(await announcementTotal()).toBe(0);
  });

  /*
   * Global Constraint 25, at its new URL. The `schoolId` arrives in the body rather than the query,
   * and it still answers 404 rather than a field error: the registrar is asking about a unit that,
   * as far as their role is concerned, does not exist.
   */
  test('a school outside the role answers 404, even coming from the body', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      wholeSchool(scenario.schools[1].id),
      cookie,
    );

    expect(response.status).toBe(404);
    expect(await announcementTotal()).toBe(0);
  });

  test('a school of another network answers 404 as well', async () => {
    const { a, b } = await twoNetworks();
    const cookie = await signInAs(a, 'admin');

    const response = await write('POST', ANNOUNCEMENTS, wholeSchool(b.schools[0].id), cookie);

    expect(response.status).toBe(404);
  });

  /*
   * An empty `schoolId` is shape-valid — it is a string — so it passes the edge and meets the rule
   * that no announcement leaves without a unit. That is a 422 on `schoolId`, not a 404: nothing was
   * asked about, so there is nothing to hide.
   */
  test('an empty school is a rule, refused with 422 on `schoolId`', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await write('POST', ANNOUNCEMENTS, wholeSchool(''), cookie);
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(422);
    expect(refusal.errors[0]?.field).toBe('schoolId');
    expect(await announcementTotal()).toBe(0);
  });

  test('an audience the contract does not know is refused by the edge with 400', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const response = await write(
      'POST',
      ANNOUNCEMENTS,
      { ...wholeSchool(scenario.schools[0].id), audience: 'todo-mundo' },
      cookie,
    );
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors[0]?.field).toBe('audience');
  });

  /*
   * The write and the read are one screen: after publishing, the rate of the fresh announcement is
   * zero out of five, and the board says so. Without this, both halves could be individually right
   * about different slices and nobody would notice.
   */
  test('what was just published shows up on the board with a rate of zero', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const publishing = await write(
      'POST',
      ANNOUNCEMENTS,
      wholeSchool(scenario.schools[0].id),
      cookie,
    );
    const created = (await publishing.json()) as Created;
    const board = (await (await read(ANNOUNCEMENTS, cookie)).json()) as Board;

    expect(board.announcements.items[0]?.id).toBe(created.id);
    expect(board.announcements.items[0]?.recipients).toBe(scenario.guardians.length);
    expect(board.announcements.items[0]?.reads).toBe(0);
    expect(board.summary.rate).toBe(0);
  });
});
