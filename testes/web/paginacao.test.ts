/*
 * A paginação como o navegador a vê.
 *
 * O estado da página mora na URL, e é isso que se prova aqui: a segunda página é um endereço, o
 * filtro sobrevive à navegação, e duas tabelas na mesma tela andam sem arrastar uma à outra. Um
 * número inventado na query não vira erro nem tela vazia — vira a página mais próxima que existe.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { limparBanco } from '../apoio/banco';
import {
  cenarioCompleto,
  criarAluno,
  criarComunicado,
  criarMatricula,
  criarResponsavel,
  type Cenario,
} from '../apoio/fabricas';
import { abrir, entrar } from './apoio';

beforeEach(limparBanco);

/** O tamanho de página do sistema. Os cenários abaixo são montados em torno dele. */
const TAMANHO = 20;

const entrarComoSecretaria = (cenario: Cenario): Promise<string> =>
  entrar({ redeSlug: cenario.rede.slug, email: cenario.secretaria.email, senha: cenario.senha });

const entrarComoResponsavel = (cenario: Cenario): Promise<string> =>
  entrar({ redeSlug: cenario.rede.slug, email: cenario.responsavel.email, senha: cenario.senha });

const html = async (caminho: string, cookie: string): Promise<string> =>
  await (await abrir(caminho, cookie)).text();

/** Cada linha de dado tem uma célula-âncora `scope="row"`; o cabeçalho não tem. */
const linhasDaTabela = (pagina: string): number => (pagina.match(/scope="row"/g) ?? []).length;

const nomeNumerado = (posicao: number): string => `Pessoa ${String(posicao).padStart(3, '0')}`;

describe('recorte na tela de responsáveis', () => {
  /** 25 responsáveis: uma página cheia e uma sobra de cinco. */
  const vinteECinco = async (): Promise<Cenario> => {
    const cenario = await cenarioCompleto();
    for (let i = 1; i <= 20; i += 1) {
      await criarResponsavel({ redeId: cenario.rede.id, nome: nomeNumerado(i) });
    }
    return cenario;
  };

  test('a primeira página traz o tamanho de página, e não a lista inteira', async () => {
    const cenario = await vinteECinco();

    const pagina = await html('/secretaria/responsaveis', await entrarComoSecretaria(cenario));

    expect(linhasDaTabela(pagina)).toBe(TAMANHO);
    expect(pagina).toContain('class="paginacao"');
    expect(pagina).toContain('href="/secretaria/responsaveis?p=2"');
  });

  test('a contagem da seção mostra o total, e não o tamanho da página', async () => {
    const cenario = await vinteECinco();

    const pagina = await html('/secretaria/responsaveis', await entrarComoSecretaria(cenario));

    expect(pagina).toContain('>25</span>');
  });

  test('a segunda página traz a sobra e oferece a volta', async () => {
    const cenario = await vinteECinco();

    const pagina = await html('/secretaria/responsaveis?p=2', await entrarComoSecretaria(cenario));

    expect(linhasDaTabela(pagina)).toBe(5);
    expect(pagina).toContain('rel="prev"');
    expect(pagina).not.toContain('rel="next"');
  });

  test('página além do fim serve a última, em vez de uma tela vazia', async () => {
    const cenario = await vinteECinco();

    const pagina = await html('/secretaria/responsaveis?p=999', await entrarComoSecretaria(cenario));

    expect(linhasDaTabela(pagina)).toBe(5);
  });

  test('página que não é número cai na primeira, sem erro', async () => {
    const cenario = await vinteECinco();
    const cookie = await entrarComoSecretaria(cenario);

    const resposta = await abrir('/secretaria/responsaveis?p=abc', cookie);

    expect(resposta.status).toBe(200);
    expect(linhasDaTabela(await resposta.text())).toBe(TAMANHO);
  });

  test('lista de uma página só não desenha os controles, mas continua contando', async () => {
    const cenario = await cenarioCompleto();

    const pagina = await html('/secretaria/responsaveis', await entrarComoSecretaria(cenario));

    expect(pagina).toContain('class="paginacao"');
    expect(pagina).not.toContain('paginacao__lista');
  });
});

describe('o resto da query sobrevive à navegação', () => {
  test('o termo da busca continua nos links de página', async () => {
    const cenario = await cenarioCompleto();
    for (let i = 1; i <= 25; i += 1) {
      await criarAluno({ redeId: cenario.rede.id, nome: `Silva ${String(i).padStart(3, '0')}` });
    }

    const pagina = await html('/secretaria/alunos?q=Silva', await entrarComoSecretaria(cenario));

    expect(linhasDaTabela(pagina)).toBe(TAMANHO);
    expect(pagina).toContain('q=Silva&amp;p=2');
  });

  test('voltar à primeira página tira o parâmetro da URL em vez de escrever p=1', async () => {
    const cenario = await cenarioCompleto();
    for (let i = 1; i <= 25; i += 1) {
      await criarResponsavel({ redeId: cenario.rede.id, nome: nomeNumerado(i) });
    }

    const pagina = await html('/secretaria/responsaveis?p=2', await entrarComoSecretaria(cenario));

    expect(pagina).toContain('href="/secretaria/responsaveis"');
    expect(pagina).not.toContain('p=1"');
  });
});

describe('duas tabelas na mesma tela', () => {
  test('avançar as matrículas não mexe na página das disciplinas', async () => {
    const cenario = await cenarioCompleto();
    const [turma] = cenario.turmas;
    // 5 matrículas do cenário + 20: a turma passa a ter duas páginas de alunos.
    for (let i = 1; i <= 20; i += 1) {
      const aluno = await criarAluno({ redeId: cenario.rede.id, nome: nomeNumerado(i) });
      await criarMatricula({
        redeId: cenario.rede.id, alunoId: aluno.id, turmaId: turma.id,
        anoLetivoId: cenario.anoLetivo.id,
      });
    }

    const pagina = await html(
      `/secretaria/turmas/${turma.id}?pDisciplinas=1`,
      await entrarComoSecretaria(cenario),
    );

    // O link que avança os alunos carrega junto a página em que as disciplinas estão.
    expect(pagina).toContain('pDisciplinas=1&amp;pMatriculas=2');
  });
});

describe('portal do responsável', () => {
  test('o mural pagina as duas metades com parâmetros próprios', async () => {
    const cenario = await cenarioCompleto();
    const [responsavel] = cenario.responsaveis;
    // Um por ler e um já lido: cada metade do mural precisa ter o que contar.
    await criarComunicado({
      redeId: cenario.rede.id, unidadeId: cenario.unidades[0].id,
      autorUsuarioId: cenario.secretaria.id,
      destinatarios: [{ responsavelId: responsavel.id }],
    });
    await criarComunicado({
      redeId: cenario.rede.id, unidadeId: cenario.unidades[0].id,
      autorUsuarioId: cenario.secretaria.id,
      destinatarios: [{ responsavelId: responsavel.id, lidoEm: new Date() }],
    });

    const pagina = await html('/responsavel/mural', await entrarComoResponsavel(cenario));

    expect(pagina).toContain('Paginação de comunicados não lidos');
    expect(pagina).toContain('Paginação de comunicados lidos');
  });

  test('a frequência do aluno abre paginada', async () => {
    const cenario = await cenarioCompleto();
    const [matricula] = cenario.matriculas;

    const resposta = await abrir(
      `/responsavel/matriculas/${matricula.id}/frequencia`,
      await entrarComoResponsavel(cenario),
    );

    expect(resposta.status).toBe(200);
  });
});
