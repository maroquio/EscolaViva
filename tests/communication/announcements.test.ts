/*
 * Comunicado, mural e taxa de leitura contra o banco real.
 *
 * Duas coisas concentram o valor deste arquivo: a lista vazia de destinatários, que significa "a
 * unidade inteira" e não pode alcançar ninguém de fora dela; e o `lido_em`, que é a instrumentação
 * da dor do Estágio 04 — ele precisa ser idempotente, senão a taxa medida vira ruído.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { communication, type Announcement } from '../../src/communication';
import { clearDatabase, testSql } from '../support/database';
import {
  fullScenario,
  createStudent,
  createAnnouncement,
  createEnrollment,
  createGuardian,
  createClassGroup,
  linkStudentGuardian,
  type Scenario,
} from '../support/factories';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OLD_READ = new Date('2026-01-05T08:30:00.000Z');

let scenario: Scenario;

beforeEach(async () => {
  await clearDatabase();
  scenario = await fullScenario();
});

/** Publica e estreita o `Result`: quando isto falha, o erro do arranjo aparece por inteiro. */
async function publish(input: {
  schoolId?: string;
  title?: string;
  body?: string;
  recipients?: { guardianId: string }[];
}): Promise<Announcement> {
  const result = await communication.publishAnnouncement({
    networkId: scenario.network.id,
    schoolId: input.schoolId ?? scenario.schools[0].id,
    title: input.title ?? 'Reunião de pais',
    body: input.body ?? 'A reunião começa às 19h no auditório.',
    authorUserId: scenario.registrar.id,
    recipients: input.recipients ?? [],
  });
  if (!result.ok) {
    throw new Error(`publicação recusada no arranjo: ${JSON.stringify(result.erros)}`);
  }
  return result.valor;
}

async function recipientsOf(announcementId: string): Promise<string[]> {
  const rows = await testSql()<{ guardian_id: string }[]>`
    SELECT guardian_id FROM announcement_recipient
     WHERE announcement_id = ${announcementId}`;
  return rows.map((row) => row.guardian_id).sort();
}

async function readsOf(announcementId: string, guardianId: string): Promise<(Date | null)[]> {
  const rows = await testSql()<{ read_at: Date | null }[]>`
    SELECT read_at FROM announcement_recipient
     WHERE announcement_id = ${announcementId} AND guardian_id = ${guardianId}`;
  return rows.map((row) => row.read_at);
}

/** Um responsável com aluno matriculado ativo na unidade indicada. */
async function guardianAtSchool(schoolId: string): Promise<string> {
  const classGroup = await createClassGroup({
    networkId: scenario.network.id,
    schoolId,
    academicYearId: scenario.academicYear.id,
  });
  const student = await createStudent({ networkId: scenario.network.id });
  const guardian = await createGuardian({ networkId: scenario.network.id });
  await linkStudentGuardian({
    networkId: scenario.network.id,
    studentId: student.id,
    guardianId: guardian.id,
  });
  await createEnrollment({
    networkId: scenario.network.id,
    studentId: student.id,
    classGroupId: classGroup.id,
    academicYearId: scenario.academicYear.id,
  });
  return guardian.id;
}

describe('publishAnnouncement', () => {
  test('publica com o nome do autor e a data de publicação preenchida', async () => {
    const announcement = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    expect(announcement.title).toBe('Reunião de pais');
    expect(announcement.body).toBe('A reunião começa às 19h no auditório.');
    expect(announcement.authorName).toBe(scenario.registrar.name);
    expect(announcement.schoolId).toBe(scenario.schools[0].id);
    expect(announcement.publishedAt).toMatch(ISO_INSTANT);
  });

  test('grava um destinatário para cada responsável da lista', async () => {
    const chosen = [scenario.guardians[0].id, scenario.guardians[2].id];

    const announcement = await publish({
      recipients: chosen.map((guardianId) => ({ guardianId })),
    });

    expect(await recipientsOf(announcement.id)).toEqual([...chosen].sort());
  });

  test('o mesmo responsável repetido na lista vira um destinatário só', async () => {
    const announcement = await publish({
      recipients: [
        { guardianId: scenario.guardians[0].id },
        { guardianId: scenario.guardians[0].id },
      ],
    });

    expect(await recipientsOf(announcement.id)).toEqual([scenario.guardians[0].id]);
  });

  test('a lista vazia alcança todo responsável com aluno matriculado ativo na unidade', async () => {
    const announcement = await publish({ recipients: [] });

    expect(await recipientsOf(announcement.id)).toEqual(
      scenario.guardians.map((guardian) => guardian.id).sort(),
    );
  });

  test('a lista vazia não alcança responsável de outra unidade da mesma rede', async () => {
    const fromAnotherSchool = await guardianAtSchool(scenario.schools[1].id);

    const announcement = await publish({ recipients: [] });

    expect(await recipientsOf(announcement.id)).not.toContain(fromAnotherSchool);
  });

  test('a lista vazia não alcança responsável de outra rede', async () => {
    const other = await fullScenario();

    const announcement = await publish({ recipients: [] });

    const reached = await recipientsOf(announcement.id);
    for (const guardian of other.guardians) {
      expect(reached).not.toContain(guardian.id);
    }
  });

  test('a lista vazia ignora responsável cujo aluno não tem matrícula ativa', async () => {
    const shutDown = await guardianAtSchool(scenario.schools[0].id);
    await testSql()`
      UPDATE enrollment SET status = 'cancelled'
       WHERE student_id IN (SELECT student_id FROM student_guardian WHERE guardian_id = ${shutDown})`;

    const announcement = await publish({ recipients: [] });

    expect(await recipientsOf(announcement.id)).not.toContain(shutDown);
  });

  test('recusa quando não há responsável nenhum para receber', async () => {
    const result = await communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[1].id,
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: scenario.registrar.id,
      recipients: [],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'destinatarios', codigo: 'sem_destinatarios' })],
    });
  });

  test('recusa título vazio e título longo demais', async () => {
    const empty = communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      title: '   ',
      body: 'Corpo do aviso.',
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    const long = communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      title: 't'.repeat(161),
      body: 'Corpo do aviso.',
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const [withoutTitle, longTitle] = await Promise.all([empty, long]);

    expect(withoutTitle).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'titulo', codigo: 'titulo_invalido' })],
    });
    expect(longTitle).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'titulo', codigo: 'titulo_invalido' })],
    });
  });

  test('recusa corpo vazio', async () => {
    const result = await communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      title: 'Aviso',
      body: '  ',
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'corpo', codigo: 'corpo_invalido' })],
    });
  });

  test('recusa unidade que não é desta rede', async () => {
    const other = await fullScenario();

    const result = await communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: other.schools[0].id,
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'unidadeId', codigo: 'unidade_desconhecida' })],
    });
  });

  test('recusa autor que não é desta rede', async () => {
    const other = await fullScenario();

    const result = await communication.publishAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: other.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'autorUsuarioId', codigo: 'autor_desconhecido' })],
    });
  });
});

describe('markAsRead', () => {
  test('registra a leitura do destinatário', async () => {
    const announcement = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const result = await communication.markAsRead({
      networkId: scenario.network.id,
      announcementId: announcement.id,
      guardianId: scenario.guardians[0].id,
    });

    expect(result).toEqual({ ok: true, valor: undefined });
    expect(await readsOf(announcement.id, scenario.guardians[0].id)).not.toEqual([null]);
  });

  test('a segunda chamada não desloca a data da primeira leitura', async () => {
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id, readAt: OLD_READ }],
    });

    await communication.markAsRead({
      networkId: scenario.network.id,
      announcementId: announcement.id,
      guardianId: scenario.guardians[0].id,
    });

    expect(await readsOf(announcement.id, scenario.guardians[0].id)).toEqual([OLD_READ]);
  });

  test('não cria leitura para quem não é destinatário', async () => {
    const announcement = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const result = await communication.markAsRead({
      networkId: scenario.network.id,
      announcementId: announcement.id,
      guardianId: scenario.guardians[1].id,
    });

    expect(result).toEqual({ ok: true, valor: undefined });
    expect(await readsOf(announcement.id, scenario.guardians[1].id)).toEqual([]);
  });

  test('não marca a leitura a partir de outra rede', async () => {
    const announcement = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    await communication.markAsRead({
      networkId: crypto.randomUUID(),
      announcementId: announcement.id,
      guardianId: scenario.guardians[0].id,
    });

    expect(await readsOf(announcement.id, scenario.guardians[0].id)).toEqual([null]);
  });

  test('recusa identificador que não é uuid', async () => {
    const result = await communication.markAsRead({
      networkId: scenario.network.id,
      announcementId: 'nao-e-uuid',
      guardianId: scenario.guardians[0].id,
    });

    expect(result).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'announcementId' })],
    });
  });
});

describe('guardianBoard', () => {
  test('traz os comunicados do responsável do mais recente para o mais antigo', async () => {
    const base = {
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    };
    const old = await createAnnouncement({
      ...base,
      title: 'Aviso de março',
      publishedAt: new Date('2026-03-01T12:00:00.000Z'),
    });
    const recent = await createAnnouncement({
      ...base,
      title: 'Aviso de maio',
      publishedAt: new Date('2026-05-01T12:00:00.000Z'),
    });

    const board = await communication.guardianBoard(
      scenario.network.id,
      scenario.guardians[0].id,
    );

    expect(board).toEqual([
      {
        announcementId: recent.id,
        title: 'Aviso de maio',
        publishedAt: '2026-05-01T12:00:00.000Z',
        readAt: null,
      },
      {
        announcementId: old.id,
        title: 'Aviso de março',
        publishedAt: '2026-03-01T12:00:00.000Z',
        readAt: null,
      },
    ]);
  });

  test('não traz comunicado de que o responsável não é destinatário', async () => {
    await publish({ recipients: [{ guardianId: scenario.guardians[0].id }] });

    const board = await communication.guardianBoard(
      scenario.network.id,
      scenario.guardians[1].id,
    );

    expect(board).toEqual([]);
  });

  test('não traz comunicado que ainda não foi publicado', async () => {
    await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const board = await communication.guardianBoard(
      scenario.network.id,
      scenario.guardians[0].id,
    );

    expect(board).toEqual([]);
  });

  test('mostra a data de leitura de quem já leu', async () => {
    await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: new Date('2026-03-01T12:00:00.000Z'),
      recipients: [{ guardianId: scenario.guardians[0].id, readAt: OLD_READ }],
    });

    const board = await communication.guardianBoard(
      scenario.network.id,
      scenario.guardians[0].id,
    );

    expect(board[0]?.readAt).toBe(OLD_READ.toISOString());
  });

  test('não traz comunicado de outra rede', async () => {
    const other = await fullScenario();
    await createAnnouncement({
      networkId: other.network.id,
      schoolId: other.schools[0].id,
      authorUserId: other.registrar.id,
      recipients: [{ guardianId: other.guardians[0].id }],
    });

    const board = await communication.guardianBoard(
      scenario.network.id,
      other.guardians[0].id,
    );

    expect(board).toEqual([]);
  });
});

describe('announcementForGuardian', () => {
  test('devolve o comunicado inteiro para quem é destinatário', async () => {
    const published = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const announcement = await communication.announcementForGuardian(
      scenario.network.id,
      scenario.guardians[0].id,
      published.id,
    );

    expect(announcement).toEqual(published);
  });

  test('devolve null para quem não é destinatário', async () => {
    const published = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const announcement = await communication.announcementForGuardian(
      scenario.network.id,
      scenario.guardians[1].id,
      published.id,
    );

    expect(announcement).toBeNull();
  });

  test('devolve null para comunicado que ainda não foi publicado', async () => {
    const draft = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const announcement = await communication.announcementForGuardian(
      scenario.network.id,
      scenario.guardians[0].id,
      draft.id,
    );

    expect(announcement).toBeNull();
  });

  test('devolve null quando o comunicado é de outra rede', async () => {
    const published = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const announcement = await communication.announcementForGuardian(
      crypto.randomUUID(),
      scenario.guardians[0].id,
      published.id,
    );

    expect(announcement).toBeNull();
  });
});

describe('listAnnouncements', () => {
  test('três leituras entre dez destinatários dão taxa de 0,3', async () => {
    const ten = await Promise.all(
      Array.from({ length: 10 }, () => createGuardian({ networkId: scenario.network.id })),
    );
    const announcement = await publish({
      recipients: ten.map((guardian) => ({ guardianId: guardian.id })),
    });
    for (const guardian of ten.slice(0, 3)) {
      await communication.markAsRead({
        networkId: scenario.network.id,
        announcementId: announcement.id,
        guardianId: guardian.id,
      });
    }

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics).toEqual([
      {
        announcementId: announcement.id,
        title: 'Reunião de pais',
        publishedAt: expect.stringMatching(ISO_INSTANT),
        recipients: 10,
        reads: 3,
        rate: 0.3,
      },
    ]);
  });

  test('uma única chamada devolve todos os comunicados da rede com a taxa de cada um', async () => {
    const counts = [0, 1, 2, 3, 4, 5];
    const expected = [];
    for (const read of counts) {
      const announcement = await createAnnouncement({
        networkId: scenario.network.id,
        schoolId: scenario.schools[0].id,
        authorUserId: scenario.registrar.id,
        publishedAt: new Date(`2026-03-0${read + 1}T12:00:00.000Z`),
        recipients: scenario.guardians.map((guardian, position) => ({
          guardianId: guardian.id,
          readAt: position < read ? OLD_READ : null,
        })),
      });
      expected.push({ announcementId: announcement.id, reads: read, rate: read / 5 });
    }

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics).toHaveLength(6);
    expect(
      statistics.map((row) => ({
        announcementId: row.announcementId,
        reads: row.reads,
        rate: row.rate,
      })),
    ).toEqual([...expected].reverse());
    expect(statistics.every((row) => row.recipients === 5)).toBe(true);
  });

  test('o comunicado sem destinatário aparece com taxa 0', async () => {
    const withoutAnyone = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
    });

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics).toEqual([
      expect.objectContaining({
        announcementId: withoutAnyone.id,
        recipients: 0,
        reads: 0,
        rate: 0,
      }),
    ]);
  });

  test('filtra por unidade quando a unidade é informada', async () => {
    const ofTheFirst = await publish({
      schoolId: scenario.schools[0].id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    await publish({
      schoolId: scenario.schools[1].id,
      recipients: [{ guardianId: scenario.guardians[1].id }],
    });

    const statistics = await communication.listAnnouncements(
      scenario.network.id,
      scenario.schools[0].id,
    );

    expect(statistics.map((row) => row.announcementId)).toEqual([ofTheFirst.id]);
  });

  test('sem filtro traz as duas unidades da rede e nenhuma de outra', async () => {
    await publish({
      schoolId: scenario.schools[0].id,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    await publish({
      schoolId: scenario.schools[1].id,
      recipients: [{ guardianId: scenario.guardians[1].id }],
    });
    const other = await fullScenario();
    await createAnnouncement({
      networkId: other.network.id,
      schoolId: other.schools[0].id,
      authorUserId: other.registrar.id,
    });

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics).toHaveLength(2);
  });

  test('o comunicado ainda não publicado fica no fim da lista', async () => {
    const draft = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
    });
    const published = await publish({
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });

    const statistics = await communication.listAnnouncements(scenario.network.id);

    expect(statistics.map((row) => row.announcementId)).toEqual([published.id, draft.id]);
    expect(statistics[1]?.publishedAt).toBeNull();
  });
});
