/*
 * Os dois caminhos que atravessam o Estágio 01 inteiro pelo HTTP.
 *
 * Nada aqui chama caso de uso direto: cada passo é uma requisição como o navegador a faria, com
 * formulário urlencoded, chave de idempotência e POST-Redirect-GET. O que se verifica ao final não
 * é o retorno de uma função, é o que a próxima tela mostra — porque é isso que a secretaria e o
 * responsável de fato veem.
 *
 * (a) A secretaria cadastra um aluno, cadastra um responsável, liga os dois, matricula, e a
 *     matrícula aparece na turma.
 * (b) O professor lança as notas dos quatro bimestres, registra a chamada, fecha os quatro
 *     bimestres — e só então o boletim do responsável deixa de dizer "em curso" e dá a situação
 *     final. É o caminho que amarra `academics`, `assessment` e a regra pedagógica.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase, testSql } from '../support/database';
import { fullScenario, type Scenario } from '../support/factories';
import { open, signIn, send } from './support';

const FLOW_DEADLINE_MS = 60_000;

const TERMS = [1, 2, 3, 4] as const;
const ROLL_CALL_DAYS = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'] as const;
const NOTA_DE_APROVACAO = '8';

const targetIdentifier = (response: Response): string => {
  const target = response.headers.get('Location') ?? '';
  const path = target.split('?')[0] ?? '';
  return path.slice(path.lastIndexOf('/') + 1);
};

const guardianByEmail = async (networkId: string, email: string): Promise<string> => {
  const rows = await testSql()<{ id: string }[]>`
    SELECT id::text FROM guardian WHERE network_id = ${networkId} AND email = ${email}`;
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`responsável ${email} não foi gravado`);
  return id;
};

const signInAs = (
  scenario: Scenario,
  who: 'registrar' | 'teacher' | 'guardian',
): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario[who].cpf, password: scenario.password });

describe('a secretaria matricula um aluno novo, do cadastro à turma', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('cadastrar, vincular e matricular deixa o aluno na turma escolhida', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const targetClassGroup = scenario.classGroups[1];
    const studentName = 'Marina Aparecida do Vale';
    const guardianName = 'Cleuza do Vale';
    const guardianEmail = 'cleuza.do.vale@escolaviva.test';

    const registration = await send(
      '/registrar/students',
      { nome: studentName, dataNascimento: '2014-07-21' },
      cookie,
    );
    const studentId = targetIdentifier(registration);

    const guardian = await send(
      '/registrar/guardians',
      { nome: guardianName, email: guardianEmail, telefone: '(27) 99999-0000' },
      cookie,
    );
    const guardianId = await guardianByEmail(scenario.network.id, guardianEmail);

    const guardianLink = await send(
      `/registrar/students/${studentId}/guardians`,
      { responsavelId: guardianId, parentesco: 'mãe', financeiro: 'on' },
      cookie,
    );

    const enrollment = await send(
      '/registrar/enrollments',
      {
        alunoId: studentId,
        turmaId: targetClassGroup.id,
        anoLetivoId: scenario.academicYear.id,
        dataMatricula: '2026-02-10',
      },
      cookie,
    );

    const classGroup = await open(`/registrar/class-groups/${targetClassGroup.id}`, cookie);
    const classGroupPage = await classGroup.text();

    expect([registration.status, guardian.status, guardianLink.status, enrollment.status]).toEqual([
      303, 303, 303, 303,
    ]);
    expect(enrollment.headers.get('Location')).toContain(`/registrar/students/${studentId}`);
    expect(classGroup.status).toBe(200);
    expect(classGroupPage).toContain(studentName);
  }, FLOW_DEADLINE_MS);

  test('a ficha do aluno mostra o responsável vinculado e a matrícula ativa', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const studentName = 'Ivo Sampaio Rezende';
    const guardianEmail = 'tia.de.ivo@escolaviva.test';

    const registration = await send(
      '/registrar/students',
      { nome: studentName, dataNascimento: '2013-01-30' },
      cookie,
    );
    const studentId = targetIdentifier(registration);
    await send(
      '/registrar/guardians',
      { nome: 'Regina Sampaio', email: guardianEmail, telefone: '' },
      cookie,
    );
    const guardianId = await guardianByEmail(scenario.network.id, guardianEmail);
    await send(
      `/registrar/students/${studentId}/guardians`,
      { responsavelId: guardianId, parentesco: 'tia', financeiro: 'on' },
      cookie,
    );
    await send(
      '/registrar/enrollments',
      {
        alunoId: studentId,
        turmaId: scenario.classGroups[1].id,
        anoLetivoId: scenario.academicYear.id,
        dataMatricula: '2026-02-10',
      },
      cookie,
    );

    const record = await (await open(`/registrar/students/${studentId}`, cookie)).text();

    expect(record).toContain('Regina Sampaio');
    expect(record).toContain('tia');
    expect(record).toContain(scenario.classGroups[1].name);
    expect(record).toContain('Ativa');
  }, FLOW_DEADLINE_MS);
});

describe('o professor fecha o ano e o responsável lê o boletim', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  const postAllGrades = async (scenario: Scenario, cookie: string): Promise<Response[]> => {
    const submissions: Response[] = [];
    for (const assignment of scenario.classGroupSubjects) {
      for (const term of TERMS) {
        const fields: Record<string, string> = { bimestre: String(term) };
        for (const enrollment of scenario.enrollments) {
          fields[`nota_${enrollment.id}`] = NOTA_DE_APROVACAO;
        }
        submissions.push(await send(`/teacher/subjects/${assignment.id}/grades`, fields, cookie));
      }
    }
    return submissions;
  };

  const recordFullRollCall = async (
    scenario: Scenario,
    cookie: string,
  ): Promise<Response[]> => {
    const submissions: Response[] = [];
    for (const date of ROLL_CALL_DAYS) {
      const fields: Record<string, string> = { data: date };
      for (const enrollment of scenario.enrollments) fields[`presenca_${enrollment.id}`] = 'on';
      submissions.push(
        await send(`/teacher/class-groups/${scenario.classGroups[0].id}/roll-call`, fields, cookie),
      );
    }
    return submissions;
  };

  const closeTerm = (scenario: Scenario, cookie: string, term: number): Promise<Response> =>
    send(
      `/teacher/class-groups/${scenario.classGroups[0].id}/closing`,
      { bimestre: String(term) },
      cookie,
    );

  test('quatro bimestres lançados, chamada registrada e ano fechado dão a situação final', async () => {
    const scenario = await fullScenario();
    const teacherCookie = await signInAs(scenario, 'teacher');
    const guardianCookie = await signInAs(scenario, 'guardian');
    const reportCardOf = (): Promise<Response> =>
      open(`/guardian/enrollments/${scenario.enrollments[0].id}/report-card`, guardianCookie);

    const grades = await postAllGrades(scenario, teacherCookie);
    const rollCalls = await recordFullRollCall(scenario, teacherCookie);

    const beforeClosing = await (await reportCardOf()).text();
    const closings: Response[] = [];
    for (const term of TERMS) {
      closings.push(await closeTerm(scenario, teacherCookie, term));
    }
    const afterClosing = await reportCardOf();
    const reportCard = await afterClosing.text();

    expect(grades.every((response) => response.status === 303)).toBe(true);
    expect(rollCalls.every((response) => response.status === 303)).toBe(true);
    expect(closings.every((response) => response.status === 303)).toBe(true);
    expect(beforeClosing).toContain('Em curso');
    expect(afterClosing.status).toBe(200);
    expect(reportCard).toContain('Aprovado');
    expect(reportCard).not.toContain('Em curso');
  }, FLOW_DEADLINE_MS);

  test('o boletim mostra a média e a frequência que decidiram a situação', async () => {
    const scenario = await fullScenario();
    const teacherCookie = await signInAs(scenario, 'teacher');
    const guardianCookie = await signInAs(scenario, 'guardian');

    await postAllGrades(scenario, teacherCookie);
    await recordFullRollCall(scenario, teacherCookie);
    for (const term of TERMS) await closeTerm(scenario, teacherCookie, term);
    const reportCard = await (
      await open(`/guardian/enrollments/${scenario.enrollments[0].id}/report-card`, guardianCookie)
    ).text();

    expect(reportCard).toContain('8,0');
    expect(reportCard).toContain('100,0 %');
    expect(reportCard).toContain(scenario.students[0].name);
    for (const subject of scenario.subjects) expect(reportCard).toContain(subject.name);
  }, FLOW_DEADLINE_MS);

  test('a frequência dia a dia mostra as quatro chamadas registradas', async () => {
    const scenario = await fullScenario();
    const teacherCookie = await signInAs(scenario, 'teacher');
    const guardianCookie = await signInAs(scenario, 'guardian');

    await recordFullRollCall(scenario, teacherCookie);
    const page = await open(
      `/guardian/enrollments/${scenario.enrollments[0].id}/attendance`,
      guardianCookie,
    );
    const attendance = await page.text();

    expect(page.status).toBe(200);
    expect(attendance).toContain('02/03/2026');
    expect(attendance).toContain('05/03/2026');
  }, FLOW_DEADLINE_MS);

  test('o fechamento é recusado enquanto falta nota, e o boletim segue em curso', async () => {
    const scenario = await fullScenario();
    const teacherCookie = await signInAs(scenario, 'teacher');
    const guardianCookie = await signInAs(scenario, 'guardian');

    const rejection = await closeTerm(scenario, teacherCookie, 1);
    const rejectionBody = await rejection.text();
    const reportCard = await (
      await open(`/guardian/enrollments/${scenario.enrollments[0].id}/report-card`, guardianCookie)
    ).text();

    // Cinco matrículas ativas em três disciplinas alocadas, nenhuma nota lançada: faltam quinze.
    expect(rejection.status).toBe(200);
    expect(rejectionBody).toContain('Faltam 15 notas para fechar o bimestre');
    expect(reportCard).toContain('Em curso');
  }, FLOW_DEADLINE_MS);
});
