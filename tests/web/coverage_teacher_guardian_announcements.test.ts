/*
 * As telas de leitura do professor, do responsável e de quem publica comunicados.
 *
 * A suíte já provava quem *pode* abrir cada uma dessas rotas — 200 para o papel certo, 403 para o
 * papel errado, 404 para o registro de outra família. O que faltava era a outra metade da pergunta:
 * aberta a porta, a tela que veio é a tela certa? Um GET pode responder 200 renderizando o painel
 * errado, uma tabela sem colunas ou um formulário sem campos, e nenhuma verificação de status
 * perceberia.
 *
 * Por isso cada caso aqui olha para o conteúdo, e escolhe como âncora aquilo que a tela existe para
 * mostrar: o título da página, o cabeçalho da tabela, o nome do campo do formulário, o link que
 * leva ao próximo passo. Nomes de campo (`nota_<id>`, `presenca_<id>`, `responsaveis[]`) são
 * contrato com o navegador, não detalhe interno — trocá-los quebra o envio, e é a asserção que
 * transforma isso em teste vermelho em vez de bug silencioso.
 *
 * Os endereços são escritos à mão, um por um. Importar a constante que a rota usa faria o teste
 * concordar com o código por construção: se o caminho mudasse, teste e aplicação mudariam juntos e
 * ninguém saberia que a URL que o usuário tem no favorito deixou de existir.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { clearDatabase } from '../support/database';
import {
  fullScenario,
  createAnnouncement,
  createSubject,
  createClassGroupSubject,
  createSchool,
  createUser,
  type Scenario,
} from '../support/factories';
import { open, signIn } from './support';

type GoldenRole = 'admin' | 'registrar' | 'teacher' | 'guardian';

const signInAs = (scenario: Scenario, who: GoldenRole): Promise<string> =>
  signIn({ networkSlug: scenario.network.slug, cpf: scenario[who].cpf, password: scenario.password });

/** O par que todo caso desta suíte examina: o código e o corpo da tela que veio com ele. */
const screen = async (path: string, cookie: string): Promise<{ status: number; html: string }> => {
  const response = await open(path, cookie);
  return { status: response.status, html: await response.text() };
};

/**
 * O título da própria página, e não o item de menu de mesmo nome. `Minhas turmas` e `Meus alunos`
 * aparecem na navegação de toda tela do papel: sem a classe, a asserção passaria com qualquer
 * página do professor no lugar do painel dele.
 */
const pageTitle = (text: string): string => `<h1 class="pagina__titulo">${text}</h1>`;

/** O `form` de escrita da tela, e não o de sair da conta que o cabeçalho traz em toda página. */
const formFor = (target: string): string => `method="post" action="${target}"`;

beforeEach(async () => {
  await clearDatabase();
});

/* --- Professor -------------------------------------------------------------- */

describe('as quatro telas do diário de classe', () => {
  test('o painel agrupa por turma e oferece as ações da sala inteira', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [classGroup, withoutAssignment] = scenario.classGroups;

    const { status, html } = await screen('/teacher', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Minhas turmas'));
    expect(html).toContain(classGroup.name);
    // As três disciplinas alocadas abrem o diário; a chamada e o fechamento são da turma.
    for (const subject of scenario.classGroupSubjects) {
      expect(html).toContain(`href="/teacher/subjects/${subject.id}/grades"`);
    }
    expect(html).toContain(`href="/teacher/class-groups/${classGroup.id}/roll-call"`);
    expect(html).toContain(`href="/teacher/class-groups/${classGroup.id}/closing"`);
    // A turma sem alocação deste professor não aparece no painel dele.
    expect(html).not.toContain(`href="/teacher/class-groups/${withoutAssignment.id}/roll-call"`);
  });

  test('professor sem alocação vê o que falta, e não uma lista vazia', async () => {
    const scenario = await fullScenario();
    const newlyArrived = await createUser({
      networkId: scenario.network.id,
      password: scenario.password,
      roles: [{ schoolId: scenario.schools[0].id, role: 'teacher' }],
    });
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: newlyArrived.cpf,
      password: scenario.password,
    });

    const { status, html } = await screen('/teacher', cookie);

    expect(status).toBe(200);
    expect(html).toContain('Nenhuma turma alocada');
  });

  test('a tela de notas abre a tabela do bimestre pedido, com um campo por matrícula', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [assignment] = scenario.classGroupSubjects;
    const [subject] = scenario.subjects;

    const { status, html } = await screen(
      `/teacher/subjects/${assignment.id}/grades?term=3`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(subject.name));
    expect(html).toContain(`Notas do 3º bimestre · ${subject.name} · ${scenario.classGroups[0].name}`);
    expect(html).toContain('<th scope="col">Nota (0 a 10)</th>');
    expect(html).toContain(formFor(`/teacher/subjects/${assignment.id}/grades`));
    // O campo é nomeado pela matrícula, e o aluno da linha aparece pelo nome.
    for (const enrollment of scenario.enrollments) {
      expect(html).toContain(`name="nota_${enrollment.id}"`);
    }
    for (const student of scenario.students) {
      expect(html).toContain(student.name);
    }
  });

  test('bimestre inventado na URL abre o primeiro, porque navegar não é escrever', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [assignment] = scenario.classGroupSubjects;

    const { status, html } = await screen(
      `/teacher/subjects/${assignment.id}/grades?term=9`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain('Notas do 1º bimestre');
  });

  test('a chamada do dia abre na data pedida, com todo mundo presente', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [classGroup] = scenario.classGroups;

    const { status, html } = await screen(
      `/teacher/class-groups/${classGroup.id}/roll-call?date=2026-03-02`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(`Chamada · ${classGroup.name}`));
    expect(html).toContain(`Chamada de 02/03/2026 · ${classGroup.name}`);
    expect(html).toContain('<th scope="col">Justificativa da falta</th>');
    expect(html).toContain(formFor(`/teacher/class-groups/${classGroup.id}/roll-call`));
    expect(html).toContain('name="data" value="2026-03-02"');
    // Sem registro no dia, a caixa de cada aluno já vem marcada.
    for (const enrollment of scenario.enrollments) {
      expect(html).toContain(`name="presenca_${enrollment.id}"\n                   checked`);
      expect(html).toContain(`name="justificativa_${enrollment.id}"`);
    }
    // O eixo da tela é o calendário: um dia para trás e um para a frente.
    expect(html).toContain(`/teacher/class-groups/${classGroup.id}/roll-call?date=2026-03-01`);
    expect(html).toContain(`/teacher/class-groups/${classGroup.id}/roll-call?date=2026-03-03`);
  });

  test('a chamada sem data na URL abre em um dia, e não em uma tela sem data', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [classGroup] = scenario.classGroups;

    const { status, html } = await screen(`/teacher/class-groups/${classGroup.id}/roll-call`, cookie);

    expect(status).toBe(200);
    expect(html).toMatch(/name="data" value="\d{4}-\d{2}-\d{2}"/);
  });

  test('a chamada de turma sem matrícula ativa explica a ausência', async () => {
    const scenario = await fullScenario();
    // A segunda turma do cenário nasce vazia: alocar o professor nela é o que abre a porta.
    const subject = await createSubject({ networkId: scenario.network.id });
    await createClassGroupSubject({
      networkId: scenario.network.id,
      classGroupId: scenario.classGroups[1].id,
      subjectId: subject.id,
      teacherUserId: scenario.teacher.id,
    });
    const cookie = await signInAs(scenario, 'teacher');

    const { status, html } = await screen(
      `/teacher/class-groups/${scenario.classGroups[1].id}/roll-call`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain('Nenhum aluno matriculado');
  });

  test('o fechamento mostra os quatro bimestres, inclusive os que nem começaram', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'teacher');
    const [classGroup] = scenario.classGroups;

    const { status, html } = await screen(`/teacher/class-groups/${classGroup.id}/closing`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(`Fechamento · ${classGroup.name}`));
    expect(html).toContain(formFor(`/teacher/class-groups/${classGroup.id}/closing`));
    for (const term of [1, 2, 3, 4]) {
      expect(html).toContain(`<h2>${term}º bimestre</h2>`);
      expect(html).toContain(`Fechar ${term}º bimestre`);
      expect(html).toContain(`name="bimestre" value="${term}"`);
    }
    // Cada bimestre aberto oferece o atalho para o diário das disciplinas deste professor.
    expect(html).toContain(`/teacher/subjects/${scenario.classGroupSubjects[0].id}/grades?term=1`);
  });
});

/* --- Responsável ------------------------------------------------------------ */

describe('as telas do portal do responsável', () => {
  test('o painel lista as matrículas da família e aponta para boletim e frequência', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'guardian');
    const [mine, fromAnotherFamily] = scenario.enrollments;

    const { status, html } = await screen('/guardian', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Meus alunos'));
    expect(html).toContain('Matrículas sob sua responsabilidade');
    expect(html).toContain(scenario.students[0].name);
    expect(html).toContain(`href="/guardian/enrollments/${mine.id}/report-card"`);
    expect(html).toContain(`href="/guardian/enrollments/${mine.id}/attendance"`);
    // O aluno de outra família não aparece nem como link.
    expect(html).not.toContain(`href="/guardian/enrollments/${fromAnotherFamily.id}/report-card"`);
  });

  test('o painel traz o que a escola disse e ainda não foi lido', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    const unread = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Reunião de pais na quinta',
      recipients: [{ guardianId: guardian.id }],
    });
    const alreadyRead = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Calendário do primeiro bimestre',
      recipients: [{ guardianId: guardian.id, readAt: new Date() }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status, html } = await screen('/guardian', cookie);

    expect(status).toBe(200);
    expect(html).toContain(`href="/guardian/board/${unread.id}"`);
    expect(html).toContain(unread.title);
    expect(html).toContain('Não lido');
    // O painel mostra só o que está por ler; o que já foi lido mora no mural.
    expect(html).not.toContain(`href="/guardian/board/${alreadyRead.id}"`);
  });

  test('conta com o papel mas sem vínculo manda procurar a secretaria', async () => {
    const scenario = await fullScenario();
    const withoutGuardianLink = await createUser({
      networkId: scenario.network.id,
      password: scenario.password,
      roles: [{ schoolId: scenario.schools[0].id, role: 'guardian' }],
    });
    const cookie = await signIn({
      networkSlug: scenario.network.slug,
      cpf: withoutGuardianLink.cpf,
      password: scenario.password,
    });

    const { status, html } = await screen('/guardian', cookie);

    expect(status).toBe(200);
    expect(html).toContain('Nenhum aluno vinculado à sua conta');
  });

  test('o mural separa em dois pesos o que está por ler e o que já foi lido', async () => {
    const scenario = await fullScenario();
    const [guardian] = scenario.guardians;
    const unread = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Feira de ciências no sábado',
      recipients: [{ guardianId: guardian.id }],
    });
    const alreadyRead = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Uniforme novo a partir de março',
      recipients: [{ guardianId: guardian.id, readAt: new Date() }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status, html } = await screen('/guardian/board', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Mural de comunicados'));
    expect(html).toContain('<h2 id="titulo-por-ler">Não lidos</h2>');
    expect(html).toContain('<h2 id="titulo-lidos">Já lidos</h2>');
    expect(html).toContain(`href="/guardian/board/${unread.id}"`);
    expect(html).toContain(`href="/guardian/board/${alreadyRead.id}"`);
    expect(html).toContain(unread.title);
    expect(html).toContain(alreadyRead.title);
  });

  test('o comunicado abre por inteiro, com o botão que registra a leitura', async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Vacinação na escola',
      body: 'A equipe da unidade de saúde estará na escola na próxima terça-feira.',
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status, html } = await screen(`/guardian/board/${announcement.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(announcement.title));
    expect(html).toContain(announcement.body);
    expect(html).toContain(scenario.registrar.name);
    // Abrir a página não marca leitura: quem marca é este formulário, com POST.
    expect(html).toContain(formFor(`/guardian/board/${announcement.id}/read`));
    expect(html).toContain('Marcar como lido');
  });

  test('comunicado já lido mostra a data da leitura no lugar do botão', async () => {
    const scenario = await fullScenario();
    const announcement = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      title: 'Boletim disponível no portal',
      recipients: [{ guardianId: scenario.guardians[0].id, readAt: new Date() }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status, html } = await screen(`/guardian/board/${announcement.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle(announcement.title));
    expect(html).toContain('etiqueta--aprovado');
    expect(html).not.toContain('Marcar como lido');
    expect(html).not.toContain(formFor(`/guardian/board/${announcement.id}/read`));
  });

  test('comunicado de outra família não existe para quem pergunta', async () => {
    const scenario = await fullScenario();
    const fromAnotherFamily = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      recipients: [{ guardianId: scenario.guardians[1].id }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status } = await screen(`/guardian/board/${fromAnotherFamily.id}`, cookie);

    expect(status).toBe(404);
  });

  test('comunicado ainda não publicado não abre no mural de ninguém', async () => {
    const scenario = await fullScenario();
    const draft = await createAnnouncement({
      networkId: scenario.network.id,
      schoolId: scenario.schools[0].id,
      authorUserId: scenario.registrar.id,
      publishedAt: null,
      recipients: [{ guardianId: scenario.guardians[0].id }],
    });
    const cookie = await signInAs(scenario, 'guardian');

    const { status } = await screen(`/guardian/board/${draft.id}`, cookie);

    expect(status).toBe(404);
  });
});

/* --- Comunicados ------------------------------------------------------------ */

describe('as telas de quem publica no mural', () => {
  /** Dois destinatários e uma leitura: a taxa do recorte é exatamente a metade. */
  const halfReadAnnouncement = (scenario: Scenario, schoolId: string, title: string) =>
    createAnnouncement({
      networkId: scenario.network.id,
      schoolId,
      authorUserId: scenario.registrar.id,
      title,
      recipients: [
        { guardianId: scenario.guardians[0].id, readAt: new Date() },
        { guardianId: scenario.guardians[1].id },
      ],
    });

  test('a lista mostra a taxa de leitura, que é o motivo da tela existir', async () => {
    const scenario = await fullScenario();
    const announcement = await halfReadAnnouncement(
      scenario,
      scenario.schools[0].id,
      'Semana de provas',
    );
    const cookie = await signInAs(scenario, 'registrar');

    const { status, html } = await screen('/announcements', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Comunicados'));
    expect(html).toContain('Comunicados e leituras');
    expect(html).toContain('<th scope="col">Destinatários</th>');
    expect(html).toContain('<th scope="col">Taxa de leitura</th>');
    expect(html).toContain(announcement.title);
    expect(html).toContain('50,0 %');
    expect(html).toContain('href="/announcements/new"');
  });

  test('a secretaria vê a unidade onde tem papel, e o administrador vê a rede', async () => {
    const scenario = await fullScenario();
    const atRegistrarSchool = await halfReadAnnouncement(
      scenario,
      scenario.schools[0].id,
      'Aviso da Escola Central',
    );
    const atOtherSchool = await halfReadAnnouncement(
      scenario,
      scenario.schools[1].id,
      'Aviso da Escola Bairro',
    );

    const registrarList = await screen('/announcements', await signInAs(scenario, 'registrar'));
    const adminList = await screen('/announcements', await signInAs(scenario, 'admin'));

    expect(registrarList.status).toBe(200);
    expect(registrarList.html).toContain(atRegistrarSchool.title);
    expect(registrarList.html).not.toContain(atOtherSchool.title);

    expect(adminList.status).toBe(200);
    expect(adminList.html).toContain(atRegistrarSchool.title);
    expect(adminList.html).toContain(atOtherSchool.title);
  });

  test('o filtro da query recorta a lista pela unidade escolhida', async () => {
    const scenario = await fullScenario();
    const atCentralSchool = await halfReadAnnouncement(
      scenario,
      scenario.schools[0].id,
      'Só da Escola Central',
    );
    const atNeighbourhoodSchool = await halfReadAnnouncement(
      scenario,
      scenario.schools[1].id,
      'Só da Escola Bairro',
    );
    const cookie = await signInAs(scenario, 'admin');

    const { status, html } = await screen(
      `/announcements?schoolId=${scenario.schools[1].id}`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(atNeighbourhoodSchool.title);
    expect(html).not.toContain(atCentralSchool.title);
    // O filtro volta escolhido, para que a próxima página continue no mesmo recorte.
    expect(html).toContain(`<option value="${scenario.schools[1].id}" selected>`);
  });

  test('unidade fora do alcance de quem lista responde 404, e não uma lista vazia', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const { status } = await screen(`/announcements?schoolId=${scenario.schools[1].id}`, cookie);

    expect(status).toBe(404);
  });

  test('o envio começa escolhendo a unidade, porque os destinatários vêm dela', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const { status, html } = await screen('/announcements/new', cookie);

    expect(status).toBe(200);
    expect(html).toContain(pageTitle('Novo comunicado'));
    expect(html).toContain('Passo 1 · Unidade');
    expect(html).toContain('method="get" action="/announcements/new"');
    expect(html).toContain(`<option value="${scenario.schools[0].id}">`);
    // A unidade em que esta secretaria não tem papel não entra na escolha.
    expect(html).not.toContain(`<option value="${scenario.schools[1].id}">`);
  });

  test('com a unidade escolhida, o passo dois traz título, mensagem e destinatários', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');
    const [school] = scenario.schools;

    const { status, html } = await screen(`/announcements/new?schoolId=${school.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain('Passo 2 · Mensagem');
    expect(html).toContain(school.name);
    expect(html).toContain(formFor('/announcements/new'));
    expect(html).toContain(`name="unidadeId" value="${school.id}"`);
    expect(html).toContain('name="titulo"');
    expect(html).toContain('name="corpo"');
    // O sufixo `[]` é o que faz a segunda caixa marcada somar em vez de sobrescrever a primeira.
    expect(html).toContain('name="responsaveis[]"');
    for (const guardian of scenario.guardians) {
      expect(html).toContain(`value="${guardian.id}"`);
      expect(html).toContain(guardian.name);
    }
  });

  test('unidade fora do alcance de quem publica não abre o formulário', async () => {
    const scenario = await fullScenario();
    const cookie = await signInAs(scenario, 'registrar');

    const { status } = await screen(
      `/announcements/new?schoolId=${scenario.schools[1].id}`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('unidade inativa não recebe comunicado nem aparece na escolha', async () => {
    const scenario = await fullScenario();
    const closed = await createSchool({
      networkId: scenario.network.id,
      name: 'Escola Desativada',
      active: false,
    });
    const cookie = await signInAs(scenario, 'admin');

    const choice = await screen('/announcements/new', cookie);
    const direct = await screen(`/announcements/new?schoolId=${closed.id}`, cookie);

    expect(choice.status).toBe(200);
    expect(choice.html).toContain(`<option value="${scenario.schools[0].id}">`);
    expect(choice.html).not.toContain(`<option value="${closed.id}">`);
    expect(choice.html).not.toContain(closed.name);
    expect(direct.status).toBe(404);
  });
});
