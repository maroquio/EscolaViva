/*
 * Matricular e transferir — as duas escritas do acadêmico que o banco protege sozinho.
 * O índice único parcial `matricula_ativa_unica_por_ano` é a regra; o caso de uso existe para
 * traduzi-la em erro de campo legível em vez de deixar a violação do PostgreSQL chegar à tela.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academico } from '../../src/academico';
import type { ErroDeAplicacao, Resultado } from '../../src/shared/resultado';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  ANO_PADRAO,
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarTurma,
  duasRedes,
} from '../apoio/fabricas';

const DATA_DE_MATRICULA = `${ANO_PADRAO}-02-10`;
const DATA_DE_TRANSFERENCIA = `${ANO_PADRAO}-06-01`;

function valorDe<T>(resultado: Resultado<T>): T {
  if (!resultado.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(resultado.erros)}`);
  }
  return resultado.valor;
}

function errosDe(resultado: Resultado<unknown>): ErroDeAplicacao[] {
  if (resultado.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return resultado.erros;
}

async function situacoesDoAluno(alunoId: string): Promise<string[]> {
  const linhas = await sqlDeTeste()<{ situacao: string }[]>`
    SELECT situacao FROM matricula WHERE aluno_id = ${alunoId} ORDER BY situacao, criado_em`;
  return linhas.map((linha) => linha.situacao);
}

beforeEach(limparBanco);

describe('matricular', () => {
  test('cria a matrícula ativa do aluno na turma do ano letivo', async () => {
    const cenario = await cenarioCompleto();
    const aluno = await criarAluno({ redeId: cenario.rede.id, nome: 'Ana Souza' });
    const [, turmaVazia] = cenario.turmas;

    const resultado = await academico.matricular({
      redeId: cenario.rede.id,
      alunoId: aluno.id,
      turmaId: turmaVazia.id,
      anoLetivoId: cenario.anoLetivo.id,
      dataMatricula: DATA_DE_MATRICULA,
    });

    const matricula = valorDe(resultado);
    expect(matricula).toEqual({
      id: matricula.id,
      redeId: cenario.rede.id,
      alunoId: aluno.id,
      alunoNome: 'Ana Souza',
      turmaId: turmaVazia.id,
      turmaNome: turmaVazia.nome,
      unidadeId: turmaVazia.unidadeId,
      anoLetivoId: cenario.anoLetivo.id,
      ano: ANO_PADRAO,
      dataMatricula: DATA_DE_MATRICULA,
      situacao: 'ativa',
    });
    const naTurma = await academico.matriculasAtivasDaTurma(cenario.rede.id, turmaVazia.id);
    expect(naTurma.map((linha) => linha.id)).toEqual([matricula.id]);
  });

  test('a matrícula recém-criada é recuperável por id', async () => {
    const cenario = await cenarioCompleto();
    const aluno = await criarAluno({ redeId: cenario.rede.id });
    const [, turmaVazia] = cenario.turmas;

    const criada = valorDe(
      await academico.matricular({
        redeId: cenario.rede.id,
        alunoId: aluno.id,
        turmaId: turmaVazia.id,
        anoLetivoId: cenario.anoLetivo.id,
        dataMatricula: DATA_DE_MATRICULA,
      }),
    );

    expect(await academico.matriculaPorId(cenario.rede.id, criada.id)).toEqual(criada);
  });

  test('segunda matrícula ativa do mesmo aluno no mesmo ano é recusada com erro de campo', async () => {
    const cenario = await cenarioCompleto();
    const [jaMatriculado] = cenario.alunos;
    const [, outraTurma] = cenario.turmas;

    const resultado = await academico.matricular({
      redeId: cenario.rede.id,
      alunoId: jaMatriculado.id,
      turmaId: outraTurma.id,
      anoLetivoId: cenario.anoLetivo.id,
      dataMatricula: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'alunoId',
        codigo: 'matricula_ativa_duplicada',
        mensagem: 'Este aluno já tem matrícula ativa neste ano letivo.',
      },
    ]);
    expect(await situacoesDoAluno(jaMatriculado.id)).toEqual(['ativa']);
  });

  test('a recusa da matrícula duplicada é mensagem de negócio, não erro cru do banco', async () => {
    const cenario = await cenarioCompleto();
    const [jaMatriculado] = cenario.alunos;
    const [, outraTurma] = cenario.turmas;

    const resultado = await academico.matricular({
      redeId: cenario.rede.id,
      alunoId: jaMatriculado.id,
      turmaId: outraTurma.id,
      anoLetivoId: cenario.anoLetivo.id,
      dataMatricula: DATA_DE_MATRICULA,
    });

    const mensagem = errosDe(resultado)[0]?.mensagem ?? '';
    expect(mensagem).not.toMatch(/duplicate key|23505|constraint|unique index/i);
    expect(mensagem).toMatch(/matrícula ativa/i);
  });

  test('o mesmo aluno pode se matricular em outro ano letivo', async () => {
    const cenario = await cenarioCompleto();
    const [jaMatriculado] = cenario.alunos;
    const proximoAno = await criarAnoLetivo({ redeId: cenario.rede.id, ano: ANO_PADRAO + 1 });
    const turmaDoProximoAno = await criarTurma({
      redeId: cenario.rede.id, unidadeId: cenario.unidades[0].id, anoLetivoId: proximoAno.id,
    });

    const resultado = await academico.matricular({
      redeId: cenario.rede.id,
      alunoId: jaMatriculado.id,
      turmaId: turmaDoProximoAno.id,
      anoLetivoId: proximoAno.id,
      dataMatricula: `${ANO_PADRAO + 1}-02-05`,
    });

    expect(valorDe(resultado).ano).toBe(ANO_PADRAO + 1);
    expect(await situacoesDoAluno(jaMatriculado.id)).toEqual(['ativa', 'ativa']);
  });

  test('aluno de outra rede é recusado', async () => {
    const { a, b } = await duasRedes();

    const resultado = await academico.matricular({
      redeId: a.rede.id,
      alunoId: b.alunos[0].id,
      turmaId: a.turmas[1].id,
      anoLetivoId: a.anoLetivo.id,
      dataMatricula: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'alunoId',
        codigo: 'aluno_nao_encontrado',
        mensagem: 'Aluno não encontrado nesta rede.',
      },
    ]);
  });

  test('turma de outra rede é recusada', async () => {
    const { a, b } = await duasRedes();
    const aluno = await criarAluno({ redeId: a.rede.id });

    const resultado = await academico.matricular({
      redeId: a.rede.id,
      alunoId: aluno.id,
      turmaId: b.turmas[1].id,
      anoLetivoId: a.anoLetivo.id,
      dataMatricula: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'turmaId',
        codigo: 'turma_nao_encontrada',
        mensagem: 'Turma não encontrada nesta rede.',
      },
    ]);
  });

  test('ano letivo de outra rede é recusado', async () => {
    const { a, b } = await duasRedes();
    const aluno = await criarAluno({ redeId: a.rede.id });

    const resultado = await academico.matricular({
      redeId: a.rede.id,
      alunoId: aluno.id,
      turmaId: a.turmas[1].id,
      anoLetivoId: b.anoLetivo.id,
      dataMatricula: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('ano_letivo_nao_encontrado');
  });

  test('turma de outro ano letivo da mesma rede é recusada', async () => {
    const cenario = await cenarioCompleto();
    const aluno = await criarAluno({ redeId: cenario.rede.id });
    const outroAno = await criarAnoLetivo({ redeId: cenario.rede.id, ano: ANO_PADRAO + 1 });
    const turmaDoOutroAno = await criarTurma({
      redeId: cenario.rede.id, unidadeId: cenario.unidades[0].id, anoLetivoId: outroAno.id,
    });

    const resultado = await academico.matricular({
      redeId: cenario.rede.id,
      alunoId: aluno.id,
      turmaId: turmaDoOutroAno.id,
      anoLetivoId: cenario.anoLetivo.id,
      dataMatricula: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'turmaId',
        codigo: 'turma_de_outro_ano',
        mensagem: 'A turma não pertence ao ano letivo informado.',
      },
    ]);
  });

  test('data de matrícula fora do formato é recusada antes de escrever', async () => {
    const cenario = await cenarioCompleto();
    const aluno = await criarAluno({ redeId: cenario.rede.id });

    const resultado = await academico.matricular({
      redeId: cenario.rede.id,
      alunoId: aluno.id,
      turmaId: cenario.turmas[1].id,
      anoLetivoId: cenario.anoLetivo.id,
      dataMatricula: '10/02/2026',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('dataMatricula');
    expect(await situacoesDoAluno(aluno.id)).toEqual([]);
  });

  test('ids fora do formato são recusados pela validação de entrada', async () => {
    const cenario = await cenarioCompleto();

    const resultado = await academico.matricular({
      redeId: cenario.rede.id,
      alunoId: 'nao-e-uuid',
      turmaId: 'tambem-nao',
      anoLetivoId: cenario.anoLetivo.id,
      dataMatricula: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado).map((erro) => erro.campo)).toEqual(['alunoId', 'turmaId']);
  });
});

describe('transferir', () => {
  test('encerra a matrícula de origem e abre a nova na turma de destino, no mesmo ano', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const [turmaDeOrigem, turmaDeDestino] = cenario.turmas;

    const resultado = await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: turmaDeDestino.id,
      data: DATA_DE_TRANSFERENCIA,
    });

    const nova = valorDe(resultado);
    expect(nova.turmaId).toBe(turmaDeDestino.id);
    expect(nova.situacao).toBe('ativa');
    expect(nova.alunoId).toBe(origem.alunoId);
    expect(nova.anoLetivoId).toBe(origem.anoLetivoId);
    expect(nova.dataMatricula).toBe(DATA_DE_TRANSFERENCIA);
    const antiga = await academico.matriculaPorId(cenario.rede.id, origem.id);
    expect(antiga?.situacao).toBe('transferida');
    expect(antiga?.turmaId).toBe(turmaDeOrigem.id);
  });

  test('depois de transferir sobra exatamente uma matrícula ativa do aluno no ano', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;

    await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: cenario.turmas[1].id,
      data: DATA_DE_TRANSFERENCIA,
    });

    const linhas = await sqlDeTeste()<{ situacao: string }[]>`
      SELECT situacao FROM matricula
       WHERE aluno_id = ${origem.alunoId} AND ano_letivo_id = ${origem.anoLetivoId}
       ORDER BY situacao`;
    expect(linhas.map((linha) => linha.situacao)).toEqual(['ativa', 'transferida']);
  });

  test('a turma de origem perde o aluno e a de destino ganha', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const [turmaDeOrigem, turmaDeDestino] = cenario.turmas;

    await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: turmaDeDestino.id,
      data: DATA_DE_TRANSFERENCIA,
    });

    const naOrigem = await academico.matriculasAtivasDaTurma(cenario.rede.id, turmaDeOrigem.id);
    const noDestino = await academico.matriculasAtivasDaTurma(cenario.rede.id, turmaDeDestino.id);
    expect(naOrigem.map((linha) => linha.alunoId)).not.toContain(origem.alunoId);
    expect(noDestino.map((linha) => linha.alunoId)).toEqual([origem.alunoId]);
  });

  test('transferir para a mesma turma é recusado e nada muda', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;

    const resultado = await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: origem.turmaId,
      data: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'turmaDestinoId',
        codigo: 'mesma_turma',
        mensagem: 'A turma de destino é a mesma turma da matrícula atual.',
      },
    ]);
    expect(await situacoesDoAluno(origem.alunoId)).toEqual(['ativa']);
  });

  test('transferir matrícula já transferida é recusado', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const [, turmaDeDestino] = cenario.turmas;
    await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: turmaDeDestino.id,
      data: DATA_DE_TRANSFERENCIA,
    });

    const segundaVez = await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: turmaDeDestino.id,
      data: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(segundaVez)).toEqual([
      {
        campo: 'matriculaId',
        codigo: 'matricula_nao_ativa',
        mensagem: 'Apenas uma matrícula ativa pode ser transferida.',
      },
    ]);
    expect(await situacoesDoAluno(origem.alunoId)).toEqual(['ativa', 'transferida']);
  });

  test('a matrícula pode ser transferida de novo a partir da turma nova', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const [turmaDeOrigem, turmaDoMeio] = cenario.turmas;
    const primeira = valorDe(
      await academico.transferir({
        redeId: cenario.rede.id,
        matriculaId: origem.id,
        turmaDestinoId: turmaDoMeio.id,
        data: DATA_DE_TRANSFERENCIA,
      }),
    );

    const segunda = await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: primeira.id,
      turmaDestinoId: turmaDeOrigem.id,
      data: `${ANO_PADRAO}-08-01`,
    });

    expect(valorDe(segunda).turmaId).toBe(turmaDeOrigem.id);
    const ativas = await sqlDeTeste()<{ total: number }[]>`
      SELECT count(*)::int AS total FROM matricula
       WHERE aluno_id = ${origem.alunoId} AND situacao = 'ativa'`;
    expect(ativas[0]?.total).toBe(1);
  });

  test('transferir para turma de outro ano letivo é recusado', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const outroAno = await criarAnoLetivo({ redeId: cenario.rede.id, ano: ANO_PADRAO + 1 });
    const turmaDoOutroAno = await criarTurma({
      redeId: cenario.rede.id, unidadeId: cenario.unidades[0].id, anoLetivoId: outroAno.id,
    });

    const resultado = await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: turmaDoOutroAno.id,
      data: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'turmaDestinoId',
        codigo: 'turma_de_outro_ano',
        mensagem: 'A turma de destino pertence a outro ano letivo.',
      },
    ]);
    expect(await situacoesDoAluno(origem.alunoId)).toEqual(['ativa']);
  });

  test('transferir para turma de outra rede é recusado', async () => {
    const { a, b } = await duasRedes();
    const [origem] = a.matriculas;

    const resultado = await academico.transferir({
      redeId: a.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: b.turmas[1].id,
      data: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('turma_nao_encontrada');
    expect(await situacoesDoAluno(origem.alunoId)).toEqual(['ativa']);
  });

  test('matrícula de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await duasRedes();

    const resultado = await academico.transferir({
      redeId: a.rede.id,
      matriculaId: b.matriculas[0].id,
      turmaDestinoId: a.turmas[1].id,
      data: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'matriculaId',
        codigo: 'matricula_nao_encontrada',
        mensagem: 'Matrícula não encontrada nesta rede.',
      },
    ]);
    expect(await situacoesDoAluno(b.matriculas[0].alunoId)).toEqual(['ativa']);
  });

  test('matrícula inexistente é recusada', async () => {
    const cenario = await cenarioCompleto();

    const resultado = await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: crypto.randomUUID(),
      turmaDestinoId: cenario.turmas[1].id,
      data: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('matricula_nao_encontrada');
  });

  test('data de transferência fora do formato é recusada', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;

    const resultado = await academico.transferir({
      redeId: cenario.rede.id,
      matriculaId: origem.id,
      turmaDestinoId: cenario.turmas[1].id,
      data: '01-06-2026',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('data');
    expect(await situacoesDoAluno(origem.alunoId)).toEqual(['ativa']);
  });
});
