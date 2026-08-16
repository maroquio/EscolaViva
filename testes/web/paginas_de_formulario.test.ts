/*
 * Cadastro e listagem em páginas separadas.
 *
 * A regra é uma só e vale para as dez telas de escrita: quem lista não escreve, e quem escreve não
 * lista. O que se verifica aqui é isso, dos dois lados — a página de formulário existe, responde
 * 200 e traz o `form` com o `action` certo; a listagem correspondente não traz mais nenhum.
 *
 * O terceiro grupo é o que a separação poderia ter quebrado sem ninguém notar: o formulário
 * recusado precisa voltar para a própria página de formulário, com o que foi digitado, e não para
 * a lista. O quarto é o alcance: as páginas novas são portas novas, e cada uma responde 404 para
 * registro de fora da rede como as antigas respondiam.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { gerarCpf } from '../../src/shared/document';
import { limparBanco } from '../apoio/banco';
import { cenarioCompleto, duasRedes, type Cenario } from '../apoio/fabricas';
import { abrir, entrar, enviar } from './apoio';

const entrarComo = (cenario: Cenario, quem: 'admin' | 'secretaria'): Promise<string> =>
  entrar({ redeSlug: cenario.rede.slug, cpf: cenario[quem].cpf, senha: cenario.senha });

/** O `form` de escrita daquela página, e não o de sair da conta que vem no cabeçalho. */
const temFormularioPara = (html: string, destino: string): boolean =>
  html.includes(`method="post" action="${destino}"`);

beforeEach(async () => {
  await limparBanco();
});

/* ------------------------------------------------------------------------- */

// Fora dos quatro grupos do arquivo — não é cadastro, listagem, recusa nem alcance —, mas é a
// mesma família de verificação: a página abre e traz o campo que a fase atual promete. A janela do
// CPF fechou (ADR 0004): o campo chama-se `cpf`, e o rótulo não menciona mais e-mail — só a
// primeira checagem passaria com a tela ainda dizendo "CPF ou e-mail" acima de um campo renomeado
// por baixo, a segunda é o que garante que a tela também parou de prometer o que já não aceita.
test('a tela de entrada pede CPF, e não mais e-mail', async () => {
  const html = await (await abrir('/login')).text();

  expect(html).toContain('name="cpf"');
  expect(html).not.toContain('e-mail');
});

/* ------------------------------------------------------------------------- */

describe('cada cadastro tem a sua página, e ela traz o formulário', () => {
  type Pagina = { caminho: string; destino: string };

  const DA_REDE: readonly Pagina[] = [
    { caminho: '/rede/unidades/nova', destino: '/rede/unidades' },
    { caminho: '/rede/anos-letivos/novo', destino: '/rede/anos-letivos' },
    { caminho: '/rede/usuarios/novo', destino: '/rede/usuarios' },
  ];

  const DA_SECRETARIA: readonly Pagina[] = [
    { caminho: '/secretaria/disciplinas/nova', destino: '/secretaria/disciplinas' },
    { caminho: '/secretaria/responsaveis/novo', destino: '/secretaria/responsaveis' },
    { caminho: '/secretaria/turmas/nova', destino: '/secretaria/turmas' },
  ];

  for (const pagina of DA_REDE) {
    test(`${pagina.caminho} abre com o formulário que grava em ${pagina.destino}`, async () => {
      const cenario = await cenarioCompleto();
      const cookie = await entrarComo(cenario, 'admin');

      const resposta = await abrir(pagina.caminho, cookie);
      const html = await resposta.text();

      expect(resposta.status).toBe(200);
      expect(temFormularioPara(html, pagina.destino)).toBe(true);
    });
  }

  for (const pagina of DA_SECRETARIA) {
    test(`${pagina.caminho} abre com o formulário que grava em ${pagina.destino}`, async () => {
      const cenario = await cenarioCompleto();
      const cookie = await entrarComo(cenario, 'secretaria');

      const resposta = await abrir(pagina.caminho, cookie);
      const html = await resposta.text();

      expect(resposta.status).toBe(200);
      expect(temFormularioPara(html, pagina.destino)).toBe(true);
    });
  }

  test('cadastro de responsável traz o campo de CPF', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const html = await (await abrir('/secretaria/responsaveis/novo', cookie)).text();

    expect(html).toContain('name="cpf"');
  });

  test('vincular responsável tem página própria, fora da ficha', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const alunoId = cenario.alunos[0].id;

    const resposta = await abrir(`/secretaria/alunos/${alunoId}/responsaveis/novo`, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(temFormularioPara(html, `/secretaria/alunos/${alunoId}/responsaveis`)).toBe(true);
  });

  test('matricular tem página própria, fora da ficha', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const resposta = await abrir(`/secretaria/alunos/${cenario.alunos[0].id}/matricular`, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(temFormularioPara(html, '/secretaria/matriculas')).toBe(true);
  });

  test('transferir tem página própria, e ela conhece a matrícula ativa', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const matriculaId = cenario.matriculas[0].id;

    const resposta = await abrir(`/secretaria/matriculas/${matriculaId}/transferir`, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(temFormularioPara(html, `/secretaria/matriculas/${matriculaId}/transferir`)).toBe(true);
  });

  test('alocar disciplina tem página própria, fora da tela da turma', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const turmaId = cenario.turmas[0].id;

    const resposta = await abrir(`/secretaria/turmas/${turmaId}/disciplinas/nova`, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(temFormularioPara(html, `/secretaria/turmas/${turmaId}/disciplinas`)).toBe(true);
  });
});

/* ------------------------------------------------------------------------- */

describe('a listagem virou só a tabela', () => {
  const DA_REDE = ['/rede/unidades', '/rede/anos-letivos', '/rede/usuarios'] as const;
  const DA_SECRETARIA = [
    '/secretaria/disciplinas',
    '/secretaria/responsaveis',
    '/secretaria/turmas',
  ] as const;

  for (const caminho of DA_REDE) {
    test(`${caminho} não grava mais nada`, async () => {
      const cenario = await cenarioCompleto();
      const cookie = await entrarComo(cenario, 'admin');

      const resposta = await abrir(caminho, cookie);
      const html = await resposta.text();

      expect(resposta.status).toBe(200);
      expect(temFormularioPara(html, caminho)).toBe(false);
    });
  }

  for (const caminho of DA_SECRETARIA) {
    test(`${caminho} não grava mais nada`, async () => {
      const cenario = await cenarioCompleto();
      const cookie = await entrarComo(cenario, 'secretaria');

      const resposta = await abrir(caminho, cookie);
      const html = await resposta.text();

      expect(resposta.status).toBe(200);
      expect(temFormularioPara(html, caminho)).toBe(false);
    });
  }

  test('o filtro das turmas continua de pé — ele lê, e por isso é GET', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const html = await (await abrir('/secretaria/turmas', cookie)).text();

    expect(html).toContain('method="get" action="/secretaria/turmas"');
  });

  test('a ficha do aluno perdeu os três formulários e ganhou os três caminhos', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const alunoId = cenario.alunos[0].id;

    const html = await (await abrir(`/secretaria/alunos/${alunoId}`, cookie)).text();

    expect(temFormularioPara(html, `/secretaria/alunos/${alunoId}/responsaveis`)).toBe(false);
    expect(temFormularioPara(html, '/secretaria/matriculas')).toBe(false);
    expect(html).toContain(`href="/secretaria/alunos/${alunoId}/responsaveis/novo"`);
    expect(html).toContain(`href="/secretaria/alunos/${alunoId}/matricular"`);
    expect(html).toContain(`href="/secretaria/matriculas/${cenario.matriculas[0].id}/transferir"`);
  });

  test('a tela da turma perdeu o formulário de alocação e ganhou o caminho', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const turmaId = cenario.turmas[0].id;

    const html = await (await abrir(`/secretaria/turmas/${turmaId}`, cookie)).text();

    expect(temFormularioPara(html, `/secretaria/turmas/${turmaId}/disciplinas`)).toBe(false);
    expect(html).toContain(`href="/secretaria/turmas/${turmaId}/disciplinas/nova"`);
  });
});

/* ------------------------------------------------------------------------- */

describe('o formulário recusado volta para o formulário, não para a lista', () => {
  test('disciplina sem nome volta com o erro no campo', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const resposta = await enviar('/secretaria/disciplinas', { nome: '' }, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(temFormularioPara(html, '/secretaria/disciplinas')).toBe(true);
    expect(html).toContain('id="nome-erro"');
    expect(html).not.toContain('Disciplinas disponíveis para alocar nas turmas');
  });

  test('turma recusada volta com o que já tinha sido digitado', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const resposta = await enviar(
      '/secretaria/turmas',
      { nome: 'Turma Rejeitada', serie: '', turno: '', unidadeId: '', anoLetivoId: '' },
      cookie,
    );
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(temFormularioPara(html, '/secretaria/turmas')).toBe(true);
    expect(html).toContain('value="Turma Rejeitada"');
    expect(html).not.toContain('Turmas das unidades sob sua secretaria');
  });

  test('unidade sem nome volta para a página de criar unidade', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await enviar('/rede/unidades', { nome: '', codigoInep: '123' }, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(temFormularioPara(html, '/rede/unidades')).toBe(true);
    expect(html).toContain('value="123"');
    expect(html).not.toContain('Unidades cadastradas');
  });

  test('o convite recusa CPF que diverge do cadastro, sem publicar o número', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');
    const responsavel = cenario.responsaveis[0];

    const resposta = await enviar('/rede/usuarios', {
      nome: 'Mãe do Aluno', email: 'mae@escolaviva.test', cpf: gerarCpf(987_654),
      responsavelId: responsavel.id, 'unidade[]': cenario.unidades[0].id, 'papel[]': 'guardian',
    }, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(html).toContain('id="cpf-erro"');
    expect(html).toContain(responsavel.name);
    expect(html).not.toContain(responsavel.cpf);
  });

  test('CPF inválido no cadastro de responsável volta com o erro ancorado no campo', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const resposta = await enviar('/secretaria/responsaveis', {
      nome: 'Responsável Sem Acesso', email: 'sem.acesso@escolaviva.test', cpf: '52998224724',
    }, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(html).toContain('id="cpf-erro"');
    expect(html).toContain('value="52998224724"');
  });

  test('responsavelId fora do formato não derruba o convite com erro de conversão', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'admin');

    const resposta = await enviar('/rede/usuarios', {
      nome: 'Sem Cadastro', email: 'sem.cadastro@escolaviva.test', cpf: gerarCpf(987_655),
      responsavelId: 'nao-e-uuid', 'unidade[]': cenario.unidades[0].id, 'papel[]': 'registrar',
    }, cookie);
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(html).toContain('id="responsavelId-erro"');
  });

  test('vínculo recusado volta para a página do vínculo, sem a ficha inteira', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');
    const alunoId = cenario.alunos[0].id;

    const resposta = await enviar(
      `/secretaria/alunos/${alunoId}/responsaveis`,
      { responsavelId: '', parentesco: '' },
      cookie,
    );
    const html = await resposta.text();

    expect(resposta.status).toBe(200);
    expect(temFormularioPara(html, `/secretaria/alunos/${alunoId}/responsaveis`)).toBe(true);
    expect(html).not.toContain('Histórico de matrículas deste aluno');
  });
});

/* ------------------------------------------------------------------------- */

describe('as páginas novas respeitam o alcance da secretaria', () => {
  test('aluno de outra rede não abre a página de vínculo', async () => {
    const { a, b } = await duasRedes();
    const cookie = await entrarComo(a, 'secretaria');

    const resposta = await abrir(`/secretaria/alunos/${b.alunos[0].id}/responsaveis/novo`, cookie);

    expect(resposta.status).toBe(404);
  });

  test('aluno de outra rede não abre a página de matrícula', async () => {
    const { a, b } = await duasRedes();
    const cookie = await entrarComo(a, 'secretaria');

    const resposta = await abrir(`/secretaria/alunos/${b.alunos[0].id}/matricular`, cookie);

    expect(resposta.status).toBe(404);
  });

  test('matrícula de outra rede não abre a página de transferência', async () => {
    const { a, b } = await duasRedes();
    const cookie = await entrarComo(a, 'secretaria');

    const resposta = await abrir(`/secretaria/matriculas/${b.matriculas[0].id}/transferir`, cookie);

    expect(resposta.status).toBe(404);
  });

  test('turma de outra rede não abre a página de alocação', async () => {
    const { a, b } = await duasRedes();
    const cookie = await entrarComo(a, 'secretaria');

    const resposta = await abrir(`/secretaria/turmas/${b.turmas[0].id}/disciplinas/nova`, cookie);

    expect(resposta.status).toBe(404);
  });

  test('identificador que não é uuid responde 404, e não erro de conversão', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrarComo(cenario, 'secretaria');

    const resposta = await abrir('/secretaria/alunos/nao-e-uuid/matricular', cookie);

    expect(resposta.status).toBe(404);
  });
});
