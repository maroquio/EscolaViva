/*
 * Toda tela de leitura da secretaria, pelo endereço que o navegador digita.
 *
 * O que este arquivo fecha é uma pergunta só: cada GET de `/secretaria` responde 200 e devolve a
 * SUA tela? Status não basta — uma rota que renderizasse o painel no lugar da lista de disciplinas
 * passaria em qualquer verificação de código. Por isso cada caso afirma também algo que só aquela
 * tela tem: o título da página, a legenda da tabela, o campo do formulário.
 *
 * Os endereços aparecem escritos por extenso, e não importados de uma constante de rota. Um teste
 * que lê o caminho do próprio código que ele verifica deixa de notar quando o caminho muda — e
 * mudar o endereço de uma tela é exatamente o tipo de coisa que quebra o link que alguém guardou.
 *
 * Além das telas em si, ficam aqui os estados que só o GET produz: a busca de alunos antes da
 * primeira busca, o filtro de turmas que vive na URL, e o painel de quem responde por mais de uma
 * unidade — caminhos que nenhuma escrita alcança.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { limparBanco } from '../support/database';
import {
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarTurma,
  criarUsuario,
  type Cenario,
} from '../support/factories';
import { abrir, entrar } from './support';

beforeEach(limparBanco);

const entrarComoSecretaria = (cenario: Cenario): Promise<string> =>
  entrar({ redeSlug: cenario.rede.slug, cpf: cenario.secretaria.cpf, senha: cenario.senha });

/** A secretaria do cenário responde por uma unidade só; esta responde pelas duas. */
const entrarComoSecretariaDasDuasUnidades = async (cenario: Cenario): Promise<string> => {
  const usuario = await criarUsuario({
    networkId: cenario.rede.id,
    senha: cenario.senha,
    papeis: [
      { schoolId: cenario.unidades[0].id, role: 'registrar' },
      { schoolId: cenario.unidades[1].id, role: 'registrar' },
    ],
  });
  return await entrar({ redeSlug: cenario.rede.slug, cpf: usuario.cpf, senha: cenario.senha });
};

const html = async (caminho: string, cookie: string): Promise<string> =>
  await (await abrir(caminho, cookie)).text();

/** O `h1` da tela — o que distingue uma página da outra dentro do mesmo layout. */
const tituloDaTela = (titulo: string): string => `<h1 class="pagina__titulo">${titulo}</h1>`;

/* ------------------------------------------------------------------------- */

describe('cada endereço de leitura abre a sua própria tela', () => {
  type Tela = {
    readonly nome: string;
    readonly caminho: (cenario: Cenario) => string;
    readonly titulo: (cenario: Cenario) => string;
  };

  const TELAS: readonly Tela[] = [
    { nome: '/secretaria', caminho: () => '/secretaria', titulo: () => 'Painel da secretaria' },
    { nome: '/secretaria/alunos', caminho: () => '/secretaria/alunos', titulo: () => 'Alunos' },
    {
      nome: '/secretaria/alunos/novo',
      caminho: () => '/secretaria/alunos/novo',
      titulo: () => 'Cadastrar aluno',
    },
    {
      nome: '/secretaria/alunos/:id',
      caminho: (cenario) => `/secretaria/alunos/${cenario.alunos[0].id}`,
      titulo: (cenario) => cenario.alunos[0].name,
    },
    {
      nome: '/secretaria/alunos/:id/responsaveis/novo',
      caminho: (cenario) => `/secretaria/alunos/${cenario.alunos[0].id}/responsaveis/novo`,
      titulo: () => 'Vincular responsável',
    },
    {
      nome: '/secretaria/alunos/:id/matricular',
      caminho: (cenario) => `/secretaria/alunos/${cenario.alunos[0].id}/matricular`,
      titulo: () => 'Matricular em uma turma',
    },
    {
      nome: '/secretaria/matriculas/:id/transferir',
      caminho: (cenario) => `/secretaria/matriculas/${cenario.matriculas[0].id}/transferir`,
      titulo: () => 'Transferir de turma',
    },
    {
      nome: '/secretaria/responsaveis',
      caminho: () => '/secretaria/responsaveis',
      titulo: () => 'Responsáveis',
    },
    {
      nome: '/secretaria/responsaveis/novo',
      caminho: () => '/secretaria/responsaveis/novo',
      titulo: () => 'Cadastrar responsável',
    },
    { nome: '/secretaria/turmas', caminho: () => '/secretaria/turmas', titulo: () => 'Turmas' },
    {
      nome: '/secretaria/turmas/nova',
      caminho: () => '/secretaria/turmas/nova',
      titulo: () => 'Cadastrar turma',
    },
    {
      nome: '/secretaria/turmas/:id',
      caminho: (cenario) => `/secretaria/turmas/${cenario.turmas[0].id}`,
      titulo: (cenario) => cenario.turmas[0].name,
    },
    {
      nome: '/secretaria/turmas/:id/disciplinas/nova',
      caminho: (cenario) => `/secretaria/turmas/${cenario.turmas[0].id}/disciplinas/nova`,
      titulo: () => 'Alocar disciplina e professor',
    },
    {
      nome: '/secretaria/disciplinas',
      caminho: () => '/secretaria/disciplinas',
      titulo: () => 'Disciplinas',
    },
    {
      nome: '/secretaria/disciplinas/nova',
      caminho: () => '/secretaria/disciplinas/nova',
      titulo: () => 'Cadastrar disciplina',
    },
  ];

  for (const tela of TELAS) {
    test(`${tela.nome} responde 200 com o título da tela`, async () => {
      const cenario = await cenarioCompleto();
      const cookie = await entrarComoSecretaria(cenario);

      const resposta = await abrir(tela.caminho(cenario), cookie);

      expect(resposta.status).toBe(200);
      expect(await resposta.text()).toContain(tituloDaTela(tela.titulo(cenario)));
    });
  }
});

/* ------------------------------------------------------------------------- */

describe('a página de cadastrar aluno', () => {
  test('abre com os dois campos que o cadastro pede, e nenhum vínculo', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir('/secretaria/alunos/novo', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('method="post" action="/secretaria/alunos"');
    expect(pagina).toContain('name="nome"');
    expect(pagina).toContain('name="dataNascimento"');
    // Matrícula e responsável são vínculos que se fazem depois, da ficha: não cabem no cadastro.
    expect(pagina).not.toContain('name="turmaId"');
    expect(pagina).not.toContain('name="responsavelId"');
  });

  test('nasce vazia — o formulário em branco não traz valor digitado', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const pagina = await html('/secretaria/alunos/novo', cookie);

    expect(pagina).toContain('id="nome"');
    expect(pagina).not.toContain('id="nome-erro"');
    expect(pagina).not.toContain('id="dataNascimento-erro"');
  });
});

/* ------------------------------------------------------------------------- */

describe('a busca de alunos tem três estados, e todos são GET', () => {
  test('sem termo, a tela pede a busca em vez de despejar a rede inteira', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir('/secretaria/alunos', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Comece pela busca');
    expect(pagina).not.toContain('Alunos encontrados para');
    expect(pagina).not.toContain(cenario.alunos[0].name);
  });

  test('com termo que acha, a tabela traz o aluno e a situação da matrícula', async () => {
    const cenario = await cenarioCompleto();
    await criarAluno({ networkId: cenario.rede.id, name: 'Zulmira Peixoto de Andrade' });
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir('/secretaria/alunos?q=Zulmira', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Alunos encontrados para');
    expect(pagina).toContain('Zulmira Peixoto de Andrade');
    expect(pagina).toContain('aluno encontrado');
    // Ninguém a matriculou ainda, e a coluna afirma só o que se sabe.
    expect(pagina).toContain('Sem matrícula');
  });

  test('com termo que não acha, a tela oferece o cadastro em vez de uma tabela vazia', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir('/secretaria/alunos?q=Zulmira', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Nenhum aluno com esse nome');
    expect(pagina).toContain('href="/secretaria/alunos/novo"');
  });
});

/* ------------------------------------------------------------------------- */

describe('o painel conta o que está ao alcance de quem abriu', () => {
  /** Os quatro cartões, na ordem em que a tela os desenha. */
  const numerosDosCartoes = (pagina: string): number[] =>
    [...pagina.matchAll(/cartao__numero">(\d+)</g)].map(([, numero]) => Number(numero));

  test('os cartões trazem os números da unidade em que a pessoa é secretaria', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const pagina = await html('/secretaria', cookie);

    // Matrículas ativas, turmas, responsáveis e disciplinas: o cenário completo em uma unidade.
    expect(numerosDosCartoes(pagina)).toEqual([5, 2, 5, 3]);
  });

  test('com uma unidade só, a tabela por unidade não aparece — não há o que comparar', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const pagina = await html('/secretaria', cookie);

    expect(pagina).not.toContain('Números de cada unidade sob sua secretaria');
    expect(pagina).not.toContain(cenario.unidades[1].name);
  });

  test('com duas unidades, a tabela aparece e nomeia as duas', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretariaDasDuasUnidades(cenario);

    const resposta = await abrir('/secretaria', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Números de cada unidade sob sua secretaria');
    expect(pagina).toContain(cenario.unidades[0].name);
    expect(pagina).toContain(cenario.unidades[1].name);
  });
});

/* ------------------------------------------------------------------------- */

describe('o filtro de turmas vive na URL', () => {
  test('filtrar por unidade recorta a lista às turmas daquela unidade', async () => {
    const cenario = await cenarioCompleto();
    const base = { networkId: cenario.rede.id, academicYearId: cenario.anoLetivo.id };
    await criarTurma({ ...base, schoolId: cenario.unidades[0].id, name: 'Turma Alfa da Central' });
    await criarTurma({ ...base, schoolId: cenario.unidades[1].id, name: 'Turma Beta do Bairro' });
    const cookie = await entrarComoSecretariaDasDuasUnidades(cenario);

    const resposta = await abrir(`/secretaria/turmas?unidade=${cenario.unidades[1].id}`, cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Turma Beta do Bairro');
    expect(pagina).not.toContain('Turma Alfa da Central');
  });

  test('filtrar por ano letivo recorta a lista àquele ano', async () => {
    const cenario = await cenarioCompleto();
    const outroAno = await criarAnoLetivo({ networkId: cenario.rede.id, year: cenario.anoLetivo.year + 1 });
    const base = { networkId: cenario.rede.id, schoolId: cenario.unidades[0].id };
    await criarTurma({ ...base, academicYearId: cenario.anoLetivo.id, name: 'Turma Gama do Ano Velho' });
    await criarTurma({ ...base, academicYearId: outroAno.id, name: 'Turma Delta do Ano Novo' });
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir(`/secretaria/turmas?ano=${outroAno.id}`, cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Turma Delta do Ano Novo');
    expect(pagina).not.toContain('Turma Gama do Ano Velho');
  });

  test('unidade fora do alcance vale como “todas as suas”, e não abre a de fora', async () => {
    const cenario = await cenarioCompleto();
    const base = { networkId: cenario.rede.id, academicYearId: cenario.anoLetivo.id };
    await criarTurma({ ...base, schoolId: cenario.unidades[0].id, name: 'Turma Epsilon da Minha' });
    await criarTurma({ ...base, schoolId: cenario.unidades[1].id, name: 'Turma Zeta da Outra' });
    // Esta secretaria só tem papel na primeira unidade: a segunda não é filtro que ela possa pedir.
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir(`/secretaria/turmas?unidade=${cenario.unidades[1].id}`, cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Turma Epsilon da Minha');
    expect(pagina).not.toContain('Turma Zeta da Outra');
  });

  test('número de página que não existe não vira erro nem tela quebrada', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir('/secretaria/turmas?p=999', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Turmas das unidades sob sua secretaria');
  });
});

/* ------------------------------------------------------------------------- */

describe('as listagens mostram o que prometem no cabeçalho', () => {
  test('a lista de disciplinas traz a tabela da rede', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir('/secretaria/disciplinas', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Disciplinas disponíveis para alocar nas turmas');
    expect(pagina).toContain(cenario.disciplinas[0].name);
    expect(pagina).toContain('href="/secretaria/disciplinas/nova"');
  });

  test('a lista de responsáveis traz nome, CPF e e-mail de quem responde pelos alunos', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir('/secretaria/responsaveis', cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Responsáveis cadastrados nesta rede');
    expect(pagina).toContain(cenario.responsaveis[0].name);
    expect(pagina).toContain(cenario.responsaveis[0].email);
  });

  test('a tela da turma lista as disciplinas alocadas e os alunos com matrícula ativa', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir(`/secretaria/turmas/${cenario.turmas[0].id}`, cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Quem leciona o quê nesta turma');
    expect(pagina).toContain('Alunos com matrícula ativa nesta turma');
    expect(pagina).toContain(cenario.disciplinas[0].name);
    expect(pagina).toContain(cenario.professor.name);
    expect(pagina).toContain(cenario.alunos[0].name);
  });

  test('a ficha do aluno traz os responsáveis vinculados e o histórico de matrículas', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir(`/secretaria/alunos/${cenario.alunos[0].id}`, cookie);
    const pagina = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(pagina).toContain('Quem responde por este aluno');
    expect(pagina).toContain('Histórico de matrículas deste aluno');
    expect(pagina).toContain(cenario.responsaveis[0].name);
    expect(pagina).toContain(cenario.turmas[0].name);
  });
});
