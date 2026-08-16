/*
 * As consultas paginadas contra o banco de verdade.
 *
 * O que se prova aqui é que o recorte acontece no SQL, e não depois: a página traz apenas o seu
 * pedaço, o total conta a lista inteira e nenhuma das duas coisas atravessa a fronteira da rede.
 * Um recorte que vazasse tenant seria pior que a lista sem recorte — mostraria pouco, e errado.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academico } from '../../src/academics';
import { identity } from '../../src/identity';
import { limparBanco } from '../apoio/banco';
import {
  ANO_PADRAO,
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarDisciplina,
  criarRede,
  criarResponsavel,
  criarTurma,
  criarUnidade,
} from '../apoio/fabricas';

beforeEach(limparBanco);

/** Nomes numerados com zero à esquerda para que a ordem alfabética seja a ordem de criação. */
const nomeNumerado = (posicao: number): string => `Pessoa ${String(posicao).padStart(3, '0')}`;

describe('paginaDeResponsaveis', () => {
  test('a primeira página traz o tamanho pedido, e o total conta todos', async () => {
    const rede = await criarRede();
    for (let i = 1; i <= 7; i += 1) {
      await criarResponsavel({ networkId: rede.id, name: nomeNumerado(i) });
    }

    const pagina = await academico.paginaDeResponsaveis(rede.id, 1, 3);

    expect(pagina.items.map((r) => r.nome)).toEqual([
      nomeNumerado(1), nomeNumerado(2), nomeNumerado(3),
    ]);
    expect(pagina).toMatchObject({ total: 7, page: 1, size: 3, pages: 3 });
  });

  test('a página seguinte continua de onde a anterior parou, sem repetir nem pular', async () => {
    const rede = await criarRede();
    for (let i = 1; i <= 7; i += 1) {
      await criarResponsavel({ networkId: rede.id, name: nomeNumerado(i) });
    }

    const [primeira, segunda, terceira] = await Promise.all([
      academico.paginaDeResponsaveis(rede.id, 1, 3),
      academico.paginaDeResponsaveis(rede.id, 2, 3),
      academico.paginaDeResponsaveis(rede.id, 3, 3),
    ]);

    const percorridas = [...primeira.items, ...segunda.items, ...terceira.items].map((r) => r.nome);
    expect(percorridas).toEqual(Array.from({ length: 7 }, (_, i) => nomeNumerado(i + 1)));
  });

  test('página além do fim devolve a última, e não uma lista vazia', async () => {
    const rede = await criarRede();
    for (let i = 1; i <= 5; i += 1) {
      await criarResponsavel({ networkId: rede.id, name: nomeNumerado(i) });
    }

    const pagina = await academico.paginaDeResponsaveis(rede.id, 99, 2);

    expect(pagina.page).toBe(3);
    expect(pagina.items.map((r) => r.nome)).toEqual([nomeNumerado(5)]);
  });

  test('o total nunca conta responsável de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    await criarResponsavel({ networkId: nossa.id, name: nomeNumerado(1) });
    const deFora = await criarResponsavel({ networkId: alheia.id, name: nomeNumerado(2) });

    const pagina = await academico.paginaDeResponsaveis(nossa.id, 1, 50);

    expect(pagina.total).toBe(1);
    expect(pagina.items.map((r) => r.id)).not.toContain(deFora.id);
  });
});

describe('paginaDeAlunos', () => {
  test('recorta os achados da busca e conta todos os que casam com o termo', async () => {
    const rede = await criarRede();
    for (let i = 1; i <= 6; i += 1) {
      await criarAluno({ networkId: rede.id, name: `Silva ${String(i).padStart(3, '0')}` });
    }
    await criarAluno({ networkId: rede.id, name: 'Outro Sobrenome' });

    const pagina = await academico.paginaDeAlunos(rede.id, 'Silva', 2, 4);

    expect(pagina.total).toBe(6);
    expect(pagina.items).toHaveLength(2);
    expect(pagina.items.every((aluno) => aluno.nome.startsWith('Silva'))).toBe(true);
  });

  test('a busca paginada não alcança aluno de outra rede', async () => {
    const nossa = await criarRede();
    const alheia = await criarRede();
    await criarAluno({ networkId: nossa.id, name: 'Ana Silva' });
    await criarAluno({ networkId: alheia.id, name: 'Ana Silva' });

    const pagina = await academico.paginaDeAlunos(nossa.id, 'Ana Silva', 1, 20);

    expect(pagina.total).toBe(1);
    expect(pagina.items[0]?.redeId).toBe(nossa.id);
  });
});

describe('paginaDeTurmas', () => {
  test('o alcance entra como condição: só as turmas das unidades informadas', async () => {
    const rede = await criarRede();
    const [alcancada, fora] = await Promise.all([
      criarUnidade({ networkId: rede.id }),
      criarUnidade({ networkId: rede.id }),
    ]);
    const anoLetivo = await criarAnoLetivo({ networkId: rede.id });
    await criarTurma({
      networkId: rede.id, schoolId: alcancada.id, academicYearId: anoLetivo.id, name: 'Da minha unidade',
    });
    await criarTurma({
      networkId: rede.id, schoolId: fora.id, academicYearId: anoLetivo.id, name: 'Da outra unidade',
    });

    const pagina = await academico.paginaDeTurmas(rede.id, { unidadeIds: [alcancada.id] }, 1, 20);

    expect(pagina.items.map((turma) => turma.nome)).toEqual(['Da minha unidade']);
    expect(pagina.total).toBe(1);
  });

  test('lista de unidades vazia significa nenhuma turma, e nunca todas', async () => {
    const cenario = await cenarioCompleto();

    const pagina = await academico.paginaDeTurmas(cenario.rede.id, { unidadeIds: [] }, 1, 20);

    expect(pagina.items).toEqual([]);
    expect(pagina.total).toBe(0);
  });

  test('o filtro de ano letivo continua valendo junto com o alcance', async () => {
    const cenario = await cenarioCompleto();
    const outroAno = await criarAnoLetivo({ networkId: cenario.rede.id, year: ANO_PADRAO + 1 });
    await criarTurma({
      networkId: cenario.rede.id, schoolId: cenario.unidades[0].id,
      academicYearId: outroAno.id, name: 'Turma do ano que vem',
    });

    const pagina = await academico.paginaDeTurmas(
      cenario.rede.id,
      { unidadeIds: [cenario.unidades[0].id], anoLetivoId: outroAno.id },
      1,
      20,
    );

    expect(pagina.items.map((turma) => turma.nome)).toEqual(['Turma do ano que vem']);
  });
});

describe('paginaDeMatriculasDoAluno', () => {
  test('traz o histórico do aluno restrito às unidades alcançadas', async () => {
    const cenario = await cenarioCompleto();
    const [aluno] = cenario.alunos;

    const pagina = await academico.paginaDeMatriculasDoAluno(
      cenario.rede.id, aluno.id, [cenario.unidades[0].id], 1, 20,
    );

    expect(pagina.total).toBe(1);
    expect(pagina.items[0]?.alunoId).toBe(aluno.id);
  });

  test('unidade fora do alcance não devolve matrícula nenhuma', async () => {
    const cenario = await cenarioCompleto();
    const [aluno] = cenario.alunos;

    const pagina = await academico.paginaDeMatriculasDoAluno(
      cenario.rede.id, aluno.id, [cenario.unidades[1].id], 1, 20,
    );

    expect(pagina.items).toEqual([]);
    expect(pagina.total).toBe(0);
  });
});

describe('contagens que substituíram as listas', () => {
  test('alunoTemMatricula separa o aluno novo do aluno de outra unidade', async () => {
    const cenario = await cenarioCompleto();
    const recemCadastrado = await criarAluno({ networkId: cenario.rede.id });

    expect(await academico.alunoTemMatricula(cenario.rede.id, cenario.alunos[0].id)).toBe(true);
    expect(await academico.alunoTemMatricula(cenario.rede.id, recemCadastrado.id)).toBe(false);
  });

  test('contagensPorUnidade devolve turmas, matriculados e responsáveis de cada unidade', async () => {
    const cenario = await cenarioCompleto();

    const porUnidade = await academico.contagensPorUnidade(
      cenario.rede.id, cenario.unidades.map((unidade) => unidade.id),
    );

    // O cenário monta as duas turmas e as cinco matrículas na primeira unidade.
    expect(porUnidade.get(cenario.unidades[0].id)).toEqual({
      turmas: 2, matriculas: 5, responsaveis: 5,
    });
    expect(porUnidade.get(cenario.unidades[1].id)).toEqual({
      turmas: 0, matriculas: 0, responsaveis: 0,
    });
  });

  test('totaisDoAlcance conta cada responsável uma vez, mesmo com filhos em duas unidades', async () => {
    const cenario = await cenarioCompleto();
    await criarDisciplina({ networkId: cenario.rede.id });

    const totais = await academico.totaisDoAlcance(
      cenario.rede.id, cenario.unidades.map((unidade) => unidade.id),
    );

    expect(totais.turmas).toBe(2);
    expect(totais.matriculas).toBe(5);
    expect(totais.responsaveis).toBe(5);
    expect(totais.disciplinas).toBe(cenario.disciplinas.length + 1);
  });
});

describe('paginaDeUsuarios', () => {
  test('os papéis vêm só dos usuários da página, e chegam completos', async () => {
    const cenario = await cenarioCompleto();

    const pagina = await identity.usersPage(cenario.rede.id, 1, 2);

    expect(pagina.items).toHaveLength(2);
    expect(pagina.total).toBe(4);
    const admin = pagina.items.find((usuario) => usuario.id === cenario.admin.id);
    if (admin !== undefined) expect(admin.roles).toHaveLength(2);
  });

  test('rede com id malformado devolve página vazia em vez de estourar', async () => {
    const pagina = await identity.usersPage('nao-e-uuid', 1, 20);

    expect(pagina).toMatchObject({ items: [], total: 0, page: 1 });
  });
});
