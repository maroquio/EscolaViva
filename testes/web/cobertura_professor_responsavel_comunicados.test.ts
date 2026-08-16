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
import { limparBanco } from '../apoio/banco';
import {
  cenarioCompleto,
  criarComunicado,
  criarDisciplina,
  criarTurmaDisciplina,
  criarUnidade,
  criarUsuario,
  type Cenario,
} from '../apoio/fabricas';
import { abrir, entrar } from './apoio';

type Papel = 'admin' | 'secretaria' | 'professor' | 'responsavel';

const entrarComo = (cenario: Cenario, quem: Papel): Promise<string> =>
  entrar({ redeSlug: cenario.rede.slug, cpf: cenario[quem].cpf, senha: cenario.senha });

/** O par que todo caso desta suíte examina: o código e o corpo da tela que veio com ele. */
const tela = async (caminho: string, cookie: string): Promise<{ status: number; html: string }> => {
  const resposta = await abrir(caminho, cookie);
  return { status: resposta.status, html: await resposta.text() };
};

/**
 * O título da própria página, e não o item de menu de mesmo nome. `Minhas turmas` e `Meus alunos`
 * aparecem na navegação de toda tela do papel: sem a classe, a asserção passaria com qualquer
 * página do professor no lugar do painel dele.
 */
const tituloDaPagina = (texto: string): string => `<h1 class="pagina__titulo">${texto}</h1>`;

/** O `form` de escrita da tela, e não o de sair da conta que o cabeçalho traz em toda página. */
const formularioPara = (destino: string): string => `method="post" action="${destino}"`;

beforeEach(async () => {
  await limparBanco();
});

/* --- Professor -------------------------------------------------------------- */

describe('as quatro telas do diário de classe', () => {
  test('o painel agrupa por turma e oferece as ações da sala inteira', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');
    const [turma, semAlocacao] = cenario.turmas;

    const { status, html } = await tela('/professor', cookie);

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina('Minhas turmas'));
    expect(html).toContain(turma.name);
    // As três disciplinas alocadas abrem o diário; a chamada e o fechamento são da turma.
    for (const disciplina of cenario.turmaDisciplinas) {
      expect(html).toContain(`href="/professor/disciplinas/${disciplina.id}/notas"`);
    }
    expect(html).toContain(`href="/professor/turmas/${turma.id}/chamada"`);
    expect(html).toContain(`href="/professor/turmas/${turma.id}/fechamento"`);
    // A turma sem alocação deste professor não aparece no painel dele.
    expect(html).not.toContain(`href="/professor/turmas/${semAlocacao.id}/chamada"`);
  });

  test('professor sem alocação vê o que falta, e não uma lista vazia', async () => {
    const cenario = await cenarioCompleto();
    const recemChegado = await criarUsuario({
      networkId: cenario.rede.id,
      senha: cenario.senha,
      papeis: [{ schoolId: cenario.unidades[0].id, role: 'teacher' }],
    });
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: recemChegado.cpf,
      senha: cenario.senha,
    });

    const { status, html } = await tela('/professor', cookie);

    expect(status).toBe(200);
    expect(html).toContain('Nenhuma turma alocada');
  });

  test('a tela de notas abre a tabela do bimestre pedido, com um campo por matrícula', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');
    const [alocacao] = cenario.turmaDisciplinas;
    const [disciplina] = cenario.disciplinas;

    const { status, html } = await tela(
      `/professor/disciplinas/${alocacao.id}/notas?bimestre=3`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina(disciplina.name));
    expect(html).toContain(`Notas do 3º bimestre · ${disciplina.name} · ${cenario.turmas[0].name}`);
    expect(html).toContain('<th scope="col">Nota (0 a 10)</th>');
    expect(html).toContain(formularioPara(`/professor/disciplinas/${alocacao.id}/notas`));
    // O campo é nomeado pela matrícula, e o aluno da linha aparece pelo nome.
    for (const matricula of cenario.matriculas) {
      expect(html).toContain(`name="nota_${matricula.id}"`);
    }
    for (const aluno of cenario.alunos) {
      expect(html).toContain(aluno.name);
    }
  });

  test('bimestre inventado na URL abre o primeiro, porque navegar não é escrever', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');
    const [alocacao] = cenario.turmaDisciplinas;

    const { status, html } = await tela(
      `/professor/disciplinas/${alocacao.id}/notas?bimestre=9`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain('Notas do 1º bimestre');
  });

  test('a chamada do dia abre na data pedida, com todo mundo presente', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');
    const [turma] = cenario.turmas;

    const { status, html } = await tela(
      `/professor/turmas/${turma.id}/chamada?data=2026-03-02`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina(`Chamada · ${turma.name}`));
    expect(html).toContain(`Chamada de 02/03/2026 · ${turma.name}`);
    expect(html).toContain('<th scope="col">Justificativa da falta</th>');
    expect(html).toContain(formularioPara(`/professor/turmas/${turma.id}/chamada`));
    expect(html).toContain('name="data" value="2026-03-02"');
    // Sem registro no dia, a caixa de cada aluno já vem marcada.
    for (const matricula of cenario.matriculas) {
      expect(html).toContain(`name="presenca_${matricula.id}"\n                   checked`);
      expect(html).toContain(`name="justificativa_${matricula.id}"`);
    }
    // O eixo da tela é o calendário: um dia para trás e um para a frente.
    expect(html).toContain(`/professor/turmas/${turma.id}/chamada?data=2026-03-01`);
    expect(html).toContain(`/professor/turmas/${turma.id}/chamada?data=2026-03-03`);
  });

  test('a chamada sem data na URL abre em um dia, e não em uma tela sem data', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');
    const [turma] = cenario.turmas;

    const { status, html } = await tela(`/professor/turmas/${turma.id}/chamada`, cookie);

    expect(status).toBe(200);
    expect(html).toMatch(/name="data" value="\d{4}-\d{2}-\d{2}"/);
  });

  test('a chamada de turma sem matrícula ativa explica a ausência', async () => {
    const cenario = await cenarioCompleto();
    // A segunda turma do cenário nasce vazia: alocar o professor nela é o que abre a porta.
    const disciplina = await criarDisciplina({ networkId: cenario.rede.id });
    await criarTurmaDisciplina({
      networkId: cenario.rede.id,
      classGroupId: cenario.turmas[1].id,
      subjectId: disciplina.id,
      teacherUserId: cenario.professor.id,
    });
    const cookie = await entrarComo(cenario, 'professor');

    const { status, html } = await tela(
      `/professor/turmas/${cenario.turmas[1].id}/chamada`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain('Nenhum aluno matriculado');
  });

  test('o fechamento mostra os quatro bimestres, inclusive os que nem começaram', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'professor');
    const [turma] = cenario.turmas;

    const { status, html } = await tela(`/professor/turmas/${turma.id}/fechamento`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina(`Fechamento · ${turma.name}`));
    expect(html).toContain(formularioPara(`/professor/turmas/${turma.id}/fechamento`));
    for (const bimestre of [1, 2, 3, 4]) {
      expect(html).toContain(`<h2>${bimestre}º bimestre</h2>`);
      expect(html).toContain(`Fechar ${bimestre}º bimestre`);
      expect(html).toContain(`name="bimestre" value="${bimestre}"`);
    }
    // Cada bimestre aberto oferece o atalho para o diário das disciplinas deste professor.
    expect(html).toContain(`/professor/disciplinas/${cenario.turmaDisciplinas[0].id}/notas?bimestre=1`);
  });
});

/* --- Responsável ------------------------------------------------------------ */

describe('as telas do portal do responsável', () => {
  test('o painel lista as matrículas da família e aponta para boletim e frequência', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'responsavel');
    const [minha, deOutraFamilia] = cenario.matriculas;

    const { status, html } = await tela('/responsavel', cookie);

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina('Meus alunos'));
    expect(html).toContain('Matrículas sob sua responsabilidade');
    expect(html).toContain(cenario.alunos[0].name);
    expect(html).toContain(`href="/responsavel/matriculas/${minha.id}/boletim"`);
    expect(html).toContain(`href="/responsavel/matriculas/${minha.id}/frequencia"`);
    // O aluno de outra família não aparece nem como link.
    expect(html).not.toContain(`href="/responsavel/matriculas/${deOutraFamilia.id}/boletim"`);
  });

  test('o painel traz o que a escola disse e ainda não foi lido', async () => {
    const cenario = await cenarioCompleto();
    const [responsavel] = cenario.responsaveis;
    const porLer = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      title: 'Reunião de pais na quinta',
      destinatarios: [{ guardianId: responsavel.id }],
    });
    const jaLido = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      title: 'Calendário do primeiro bimestre',
      destinatarios: [{ guardianId: responsavel.id, readAt: new Date() }],
    });
    const cookie = await entrarComo(cenario, 'responsavel');

    const { status, html } = await tela('/responsavel', cookie);

    expect(status).toBe(200);
    expect(html).toContain(`href="/responsavel/mural/${porLer.id}"`);
    expect(html).toContain(porLer.title);
    expect(html).toContain('Não lido');
    // O painel mostra só o que está por ler; o que já foi lido mora no mural.
    expect(html).not.toContain(`href="/responsavel/mural/${jaLido.id}"`);
  });

  test('conta com o papel mas sem vínculo manda procurar a secretaria', async () => {
    const cenario = await cenarioCompleto();
    const semVinculo = await criarUsuario({
      networkId: cenario.rede.id,
      senha: cenario.senha,
      papeis: [{ schoolId: cenario.unidades[0].id, role: 'guardian' }],
    });
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: semVinculo.cpf,
      senha: cenario.senha,
    });

    const { status, html } = await tela('/responsavel', cookie);

    expect(status).toBe(200);
    expect(html).toContain('Nenhum aluno vinculado à sua conta');
  });

  test('o mural separa em dois pesos o que está por ler e o que já foi lido', async () => {
    const cenario = await cenarioCompleto();
    const [responsavel] = cenario.responsaveis;
    const porLer = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      title: 'Feira de ciências no sábado',
      destinatarios: [{ guardianId: responsavel.id }],
    });
    const jaLido = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      title: 'Uniforme novo a partir de março',
      destinatarios: [{ guardianId: responsavel.id, readAt: new Date() }],
    });
    const cookie = await entrarComo(cenario, 'responsavel');

    const { status, html } = await tela('/responsavel/mural', cookie);

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina('Mural de comunicados'));
    expect(html).toContain('<h2 id="titulo-por-ler">Não lidos</h2>');
    expect(html).toContain('<h2 id="titulo-lidos">Já lidos</h2>');
    expect(html).toContain(`href="/responsavel/mural/${porLer.id}"`);
    expect(html).toContain(`href="/responsavel/mural/${jaLido.id}"`);
    expect(html).toContain(porLer.title);
    expect(html).toContain(jaLido.title);
  });

  test('o comunicado abre por inteiro, com o botão que registra a leitura', async () => {
    const cenario = await cenarioCompleto();
    const comunicado = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      title: 'Vacinação na escola',
      body: 'A equipe da unidade de saúde estará na escola na próxima terça-feira.',
      destinatarios: [{ guardianId: cenario.responsaveis[0].id }],
    });
    const cookie = await entrarComo(cenario, 'responsavel');

    const { status, html } = await tela(`/responsavel/mural/${comunicado.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina(comunicado.title));
    expect(html).toContain(comunicado.body);
    expect(html).toContain(cenario.secretaria.name);
    // Abrir a página não marca leitura: quem marca é este formulário, com POST.
    expect(html).toContain(formularioPara(`/responsavel/mural/${comunicado.id}/lido`));
    expect(html).toContain('Marcar como lido');
  });

  test('comunicado já lido mostra a data da leitura no lugar do botão', async () => {
    const cenario = await cenarioCompleto();
    const comunicado = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      title: 'Boletim disponível no portal',
      destinatarios: [{ guardianId: cenario.responsaveis[0].id, readAt: new Date() }],
    });
    const cookie = await entrarComo(cenario, 'responsavel');

    const { status, html } = await tela(`/responsavel/mural/${comunicado.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina(comunicado.title));
    expect(html).toContain('etiqueta--aprovado');
    expect(html).not.toContain('Marcar como lido');
    expect(html).not.toContain(formularioPara(`/responsavel/mural/${comunicado.id}/lido`));
  });

  test('comunicado de outra família não existe para quem pergunta', async () => {
    const cenario = await cenarioCompleto();
    const deOutraFamilia = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      destinatarios: [{ guardianId: cenario.responsaveis[1].id }],
    });
    const cookie = await entrarComo(cenario, 'responsavel');

    const { status } = await tela(`/responsavel/mural/${deOutraFamilia.id}`, cookie);

    expect(status).toBe(404);
  });

  test('comunicado ainda não publicado não abre no mural de ninguém', async () => {
    const cenario = await cenarioCompleto();
    const rascunho = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      publishedAt: null,
      destinatarios: [{ guardianId: cenario.responsaveis[0].id }],
    });
    const cookie = await entrarComo(cenario, 'responsavel');

    const { status } = await tela(`/responsavel/mural/${rascunho.id}`, cookie);

    expect(status).toBe(404);
  });
});

/* --- Comunicados ------------------------------------------------------------ */

describe('as telas de quem publica no mural', () => {
  /** Dois destinatários e uma leitura: a taxa do recorte é exatamente a metade. */
  const comunicadoComMetadeLida = (cenario: Cenario, unidadeId: string, titulo: string) =>
    criarComunicado({
      networkId: cenario.rede.id,
      schoolId: unidadeId,
      authorUserId: cenario.secretaria.id,
      title: titulo,
      destinatarios: [
        { guardianId: cenario.responsaveis[0].id, readAt: new Date() },
        { guardianId: cenario.responsaveis[1].id },
      ],
    });

  test('a lista mostra a taxa de leitura, que é o motivo da tela existir', async () => {
    const cenario = await cenarioCompleto();
    const comunicado = await comunicadoComMetadeLida(
      cenario,
      cenario.unidades[0].id,
      'Semana de provas',
    );
    const cookie = await entrarComo(cenario, 'secretaria');

    const { status, html } = await tela('/comunicados', cookie);

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina('Comunicados'));
    expect(html).toContain('Comunicados e leituras');
    expect(html).toContain('<th scope="col">Destinatários</th>');
    expect(html).toContain('<th scope="col">Taxa de leitura</th>');
    expect(html).toContain(comunicado.title);
    expect(html).toContain('50,0 %');
    expect(html).toContain('href="/comunicados/novo"');
  });

  test('a secretaria vê a unidade onde tem papel, e o administrador vê a rede', async () => {
    const cenario = await cenarioCompleto();
    const daSecretaria = await comunicadoComMetadeLida(
      cenario,
      cenario.unidades[0].id,
      'Aviso da Escola Central',
    );
    const daOutraUnidade = await comunicadoComMetadeLida(
      cenario,
      cenario.unidades[1].id,
      'Aviso da Escola Bairro',
    );

    const listaDaSecretaria = await tela('/comunicados', await entrarComo(cenario, 'secretaria'));
    const listaDoAdmin = await tela('/comunicados', await entrarComo(cenario, 'admin'));

    expect(listaDaSecretaria.status).toBe(200);
    expect(listaDaSecretaria.html).toContain(daSecretaria.title);
    expect(listaDaSecretaria.html).not.toContain(daOutraUnidade.title);

    expect(listaDoAdmin.status).toBe(200);
    expect(listaDoAdmin.html).toContain(daSecretaria.title);
    expect(listaDoAdmin.html).toContain(daOutraUnidade.title);
  });

  test('o filtro da query recorta a lista pela unidade escolhida', async () => {
    const cenario = await cenarioCompleto();
    const daCentral = await comunicadoComMetadeLida(
      cenario,
      cenario.unidades[0].id,
      'Só da Escola Central',
    );
    const doBairro = await comunicadoComMetadeLida(
      cenario,
      cenario.unidades[1].id,
      'Só da Escola Bairro',
    );
    const cookie = await entrarComo(cenario, 'admin');

    const { status, html } = await tela(
      `/comunicados?unidadeId=${cenario.unidades[1].id}`,
      cookie,
    );

    expect(status).toBe(200);
    expect(html).toContain(doBairro.title);
    expect(html).not.toContain(daCentral.title);
    // O filtro volta escolhido, para que a próxima página continue no mesmo recorte.
    expect(html).toContain(`<option value="${cenario.unidades[1].id}" selected>`);
  });

  test('unidade fora do alcance de quem lista responde 404, e não uma lista vazia', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const { status } = await tela(`/comunicados?unidadeId=${cenario.unidades[1].id}`, cookie);

    expect(status).toBe(404);
  });

  test('o envio começa escolhendo a unidade, porque os destinatários vêm dela', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const { status, html } = await tela('/comunicados/novo', cookie);

    expect(status).toBe(200);
    expect(html).toContain(tituloDaPagina('Novo comunicado'));
    expect(html).toContain('Passo 1 · Unidade');
    expect(html).toContain('method="get" action="/comunicados/novo"');
    expect(html).toContain(`<option value="${cenario.unidades[0].id}">`);
    // A unidade em que esta secretaria não tem papel não entra na escolha.
    expect(html).not.toContain(`<option value="${cenario.unidades[1].id}">`);
  });

  test('com a unidade escolhida, o passo dois traz título, mensagem e destinatários', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const [unidade] = cenario.unidades;

    const { status, html } = await tela(`/comunicados/novo?unidadeId=${unidade.id}`, cookie);

    expect(status).toBe(200);
    expect(html).toContain('Passo 2 · Mensagem');
    expect(html).toContain(unidade.name);
    expect(html).toContain(formularioPara('/comunicados/novo'));
    expect(html).toContain(`name="unidadeId" value="${unidade.id}"`);
    expect(html).toContain('name="titulo"');
    expect(html).toContain('name="corpo"');
    // O sufixo `[]` é o que faz a segunda caixa marcada somar em vez de sobrescrever a primeira.
    expect(html).toContain('name="responsaveis[]"');
    for (const responsavel of cenario.responsaveis) {
      expect(html).toContain(`value="${responsavel.id}"`);
      expect(html).toContain(responsavel.name);
    }
  });

  test('unidade fora do alcance de quem publica não abre o formulário', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const { status } = await tela(
      `/comunicados/novo?unidadeId=${cenario.unidades[1].id}`,
      cookie,
    );

    expect(status).toBe(404);
  });

  test('unidade inativa não recebe comunicado nem aparece na escolha', async () => {
    const cenario = await cenarioCompleto();
    const fechada = await criarUnidade({
      networkId: cenario.rede.id,
      name: 'Escola Desativada',
      active: false,
    });
    const cookie = await entrarComo(cenario, 'admin');

    const escolha = await tela('/comunicados/novo', cookie);
    const direto = await tela(`/comunicados/novo?unidadeId=${fechada.id}`, cookie);

    expect(escolha.status).toBe(200);
    expect(escolha.html).toContain(`<option value="${cenario.unidades[0].id}">`);
    expect(escolha.html).not.toContain(`<option value="${fechada.id}">`);
    expect(escolha.html).not.toContain(fechada.name);
    expect(direto.status).toBe(404);
  });
});
