import { beforeEach, describe, expect, test } from 'bun:test';
import { LIMITES_DO_ACADEMICO, academico } from '../../src/academics';
import type { Result } from '../../src/shared/result';
import { limparBanco } from '../apoio/banco';
import { criarAluno, criarRede } from '../apoio/fabricas';

beforeEach(limparBanco);

const LINHAS_DA_BUSCA = LIMITES_DO_ACADEMICO.aluno.linhasDaBusca;
const CARACTERES_DO_NOME = LIMITES_DO_ACADEMICO.aluno.nome;

const nomeNumerado = (posicao: number): string => `Pessoa ${String(posicao).padStart(3, '0')}`;

const camposComErro = <T>(resultado: Result<T>): string[] =>
  resultado.ok ? [] : resultado.erros.map((erro) => erro.campo ?? '');

describe('LIMITES.aluno.linhasDaBusca conta LINHAS devolvidas', () => {
  test('a busca sem faixa devolve no máximo esse tanto de linhas', async () => {
    const rede = await criarRede();
    for (let posicao = 1; posicao <= LINHAS_DA_BUSCA + 1; posicao += 1) {
      await criarAluno({ networkId: rede.id, name: nomeNumerado(posicao) });
    }

    const encontrados = await academico.buscarAlunos(rede.id, 'Pessoa');

    expect(encontrados).toHaveLength(LINHAS_DA_BUSCA);
    expect(encontrados.map((aluno) => aluno.nome)).toEqual(
      Array.from({ length: LINHAS_DA_BUSCA }, (_, indice) => nomeNumerado(indice + 1)),
    );
  });

  test('o nome longo não estreita nem alarga o corte da busca', async () => {
    const rede = await criarRede();
    for (let posicao = 1; posicao <= LINHAS_DA_BUSCA + 1; posicao += 1) {
      await criarAluno({ networkId: rede.id, name: `${nomeNumerado(posicao)} ${'x'.repeat(80)}` });
    }

    const encontrados = await academico.buscarAlunos(rede.id, 'Pessoa');

    expect(encontrados).toHaveLength(LINHAS_DA_BUSCA);
  });
});

describe('LIMITES.aluno.nome conta CARACTERES do nome', () => {
  test('aceita o nome com exatamente esse tanto de caracteres', async () => {
    const rede = await criarRede();

    const resultado = await academico.cadastrarAluno({
      redeId: rede.id,
      nome: 'A'.repeat(CARACTERES_DO_NOME),
      dataNascimento: '2014-05-10',
    });

    expect(camposComErro(resultado)).toEqual([]);
    expect(resultado.ok).toBe(true);
  });

  test('recusa o nome com um caractere a mais', async () => {
    const rede = await criarRede();

    const resultado = await academico.cadastrarAluno({
      redeId: rede.id,
      nome: 'A'.repeat(CARACTERES_DO_NOME + 1),
      dataNascimento: '2014-05-10',
    });

    expect(camposComErro(resultado)).toEqual(['nome']);
  });
});
