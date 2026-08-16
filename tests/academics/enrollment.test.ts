/*
 * Matricular e transferir — as duas escritas do acadêmico que o banco protege sozinho.
 * O índice único parcial `active_enrollment_unique_per_year` é a regra; o caso de uso existe para
 * traduzi-la em erro de campo legível em vez de deixar a violação do PostgreSQL chegar à tela.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import type { ApplicationError, Result } from '../../src/shared/result';
import { limparBanco, sqlDeTeste } from '../support/database';
import {
  ANO_PADRAO,
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarTurma,
  duasRedes,
} from '../support/factories';

const DATA_DE_MATRICULA = `${ANO_PADRAO}-02-10`;
const DATA_DE_TRANSFERENCIA = `${ANO_PADRAO}-06-01`;

function valorDe<T>(resultado: Result<T>): T {
  if (!resultado.ok) {
    throw new Error(`esperava sucesso, vieram erros: ${JSON.stringify(resultado.erros)}`);
  }
  return resultado.valor;
}

function errosDe(resultado: Result<unknown>): ApplicationError[] {
  if (resultado.ok) throw new Error('esperava recusa da aplicação, veio sucesso');
  return resultado.erros;
}

async function situacoesDoAluno(studentId: string): Promise<string[]> {
  const linhas = await sqlDeTeste()<{ status: string }[]>`
    SELECT status FROM enrollment WHERE student_id = ${studentId} ORDER BY status, created_at`;
  return linhas.map((linha) => linha.status);
}

beforeEach(limparBanco);

describe('matricular', () => {
  test('cria a matrícula ativa do aluno na turma do ano letivo', async () => {
    const cenario = await cenarioCompleto();
    const aluno = await criarAluno({ networkId: cenario.rede.id, name: 'Ana Souza' });
    const [, turmaVazia] = cenario.turmas;

    const resultado = await academics.enroll({
      networkId: cenario.rede.id,
      studentId: aluno.id,
      classGroupId: turmaVazia.id,
      academicYearId: cenario.anoLetivo.id,
      enrollmentDate: DATA_DE_MATRICULA,
    });

    const matricula = valorDe(resultado);
    expect(matricula).toEqual({
      id: matricula.id,
      networkId: cenario.rede.id,
      studentId: aluno.id,
      studentName: 'Ana Souza',
      classGroupId: turmaVazia.id,
      classGroupName: turmaVazia.name,
      schoolId: turmaVazia.schoolId,
      academicYearId: cenario.anoLetivo.id,
      year: ANO_PADRAO,
      enrollmentDate: DATA_DE_MATRICULA,
      status: 'active',
    });
    const naTurma = await academics.activeEnrollmentsOfClassGroup(cenario.rede.id, turmaVazia.id);
    expect(naTurma.map((linha) => linha.id)).toEqual([matricula.id]);
  });

  test('a matrícula recém-criada é recuperável por id', async () => {
    const cenario = await cenarioCompleto();
    const aluno = await criarAluno({ networkId: cenario.rede.id });
    const [, turmaVazia] = cenario.turmas;

    const criada = valorDe(
      await academics.enroll({
        networkId: cenario.rede.id,
        studentId: aluno.id,
        classGroupId: turmaVazia.id,
        academicYearId: cenario.anoLetivo.id,
        enrollmentDate: DATA_DE_MATRICULA,
      }),
    );

    expect(await academics.enrollmentById(cenario.rede.id, criada.id)).toEqual(criada);
  });

  test('segunda matrícula ativa do mesmo aluno no mesmo ano é recusada com erro de campo', async () => {
    const cenario = await cenarioCompleto();
    const [jaMatriculado] = cenario.alunos;
    const [, outraTurma] = cenario.turmas;

    const resultado = await academics.enroll({
      networkId: cenario.rede.id,
      studentId: jaMatriculado.id,
      classGroupId: outraTurma.id,
      academicYearId: cenario.anoLetivo.id,
      enrollmentDate: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'alunoId',
        codigo: 'matricula_ativa_duplicada',
        mensagem: 'Este aluno já tem matrícula ativa neste ano letivo.',
      },
    ]);
    expect(await situacoesDoAluno(jaMatriculado.id)).toEqual(['active']);
  });

  test('a recusa da matrícula duplicada é mensagem de negócio, não erro cru do banco', async () => {
    const cenario = await cenarioCompleto();
    const [jaMatriculado] = cenario.alunos;
    const [, outraTurma] = cenario.turmas;

    const resultado = await academics.enroll({
      networkId: cenario.rede.id,
      studentId: jaMatriculado.id,
      classGroupId: outraTurma.id,
      academicYearId: cenario.anoLetivo.id,
      enrollmentDate: DATA_DE_MATRICULA,
    });

    const mensagem = errosDe(resultado)[0]?.mensagem ?? '';
    expect(mensagem).not.toMatch(/duplicate key|23505|constraint|unique index/i);
    expect(mensagem).toMatch(/matrícula ativa/i);
  });

  test('o mesmo aluno pode se matricular em outro ano letivo', async () => {
    const cenario = await cenarioCompleto();
    const [jaMatriculado] = cenario.alunos;
    const proximoAno = await criarAnoLetivo({ networkId: cenario.rede.id, year: ANO_PADRAO + 1 });
    const turmaDoProximoAno = await criarTurma({
      networkId: cenario.rede.id, schoolId: cenario.unidades[0].id, academicYearId: proximoAno.id,
    });

    const resultado = await academics.enroll({
      networkId: cenario.rede.id,
      studentId: jaMatriculado.id,
      classGroupId: turmaDoProximoAno.id,
      academicYearId: proximoAno.id,
      enrollmentDate: `${ANO_PADRAO + 1}-02-05`,
    });

    expect(valorDe(resultado).year).toBe(ANO_PADRAO + 1);
    expect(await situacoesDoAluno(jaMatriculado.id)).toEqual(['active', 'active']);
  });

  test('aluno de outra rede é recusado', async () => {
    const { a, b } = await duasRedes();

    const resultado = await academics.enroll({
      networkId: a.rede.id,
      studentId: b.alunos[0].id,
      classGroupId: a.turmas[1].id,
      academicYearId: a.anoLetivo.id,
      enrollmentDate: DATA_DE_MATRICULA,
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
    const aluno = await criarAluno({ networkId: a.rede.id });

    const resultado = await academics.enroll({
      networkId: a.rede.id,
      studentId: aluno.id,
      classGroupId: b.turmas[1].id,
      academicYearId: a.anoLetivo.id,
      enrollmentDate: DATA_DE_MATRICULA,
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
    const aluno = await criarAluno({ networkId: a.rede.id });

    const resultado = await academics.enroll({
      networkId: a.rede.id,
      studentId: aluno.id,
      classGroupId: a.turmas[1].id,
      academicYearId: b.anoLetivo.id,
      enrollmentDate: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('ano_letivo_nao_encontrado');
  });

  test('turma de outro ano letivo da mesma rede é recusada', async () => {
    const cenario = await cenarioCompleto();
    const aluno = await criarAluno({ networkId: cenario.rede.id });
    const outroAno = await criarAnoLetivo({ networkId: cenario.rede.id, year: ANO_PADRAO + 1 });
    const turmaDoOutroAno = await criarTurma({
      networkId: cenario.rede.id, schoolId: cenario.unidades[0].id, academicYearId: outroAno.id,
    });

    const resultado = await academics.enroll({
      networkId: cenario.rede.id,
      studentId: aluno.id,
      classGroupId: turmaDoOutroAno.id,
      academicYearId: cenario.anoLetivo.id,
      enrollmentDate: DATA_DE_MATRICULA,
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
    const aluno = await criarAluno({ networkId: cenario.rede.id });

    const resultado = await academics.enroll({
      networkId: cenario.rede.id,
      studentId: aluno.id,
      classGroupId: cenario.turmas[1].id,
      academicYearId: cenario.anoLetivo.id,
      enrollmentDate: '10/02/2026',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('dataMatricula');
    expect(await situacoesDoAluno(aluno.id)).toEqual([]);
  });

  test('ids fora do formato são recusados pela validação de entrada', async () => {
    const cenario = await cenarioCompleto();

    const resultado = await academics.enroll({
      networkId: cenario.rede.id,
      studentId: 'nao-e-uuid',
      classGroupId: 'tambem-nao',
      academicYearId: cenario.anoLetivo.id,
      enrollmentDate: DATA_DE_MATRICULA,
    });

    expect(errosDe(resultado).map((erro) => erro.campo)).toEqual(['alunoId', 'turmaId']);
  });
});

describe('transferir', () => {
  test('encerra a matrícula de origem e abre a nova na turma de destino, no mesmo ano', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const [turmaDeOrigem, turmaDeDestino] = cenario.turmas;

    const resultado = await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: turmaDeDestino.id,
      date: DATA_DE_TRANSFERENCIA,
    });

    const nova = valorDe(resultado);
    expect(nova.classGroupId).toBe(turmaDeDestino.id);
    expect(nova.status).toBe('active');
    expect(nova.studentId).toBe(origem.studentId);
    expect(nova.academicYearId).toBe(origem.academicYearId);
    expect(nova.enrollmentDate).toBe(DATA_DE_TRANSFERENCIA);
    const antiga = await academics.enrollmentById(cenario.rede.id, origem.id);
    expect(antiga?.status).toBe('transferred');
    expect(antiga?.classGroupId).toBe(turmaDeOrigem.id);
  });

  test('depois de transferir sobra exatamente uma matrícula ativa do aluno no ano', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;

    await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: cenario.turmas[1].id,
      date: DATA_DE_TRANSFERENCIA,
    });

    const linhas = await sqlDeTeste()<{ status: string }[]>`
      SELECT status FROM enrollment
       WHERE student_id = ${origem.studentId} AND academic_year_id = ${origem.academicYearId}
       ORDER BY status`;
    expect(linhas.map((linha) => linha.status)).toEqual(['active', 'transferred']);
  });

  test('a turma de origem perde o aluno e a de destino ganha', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const [turmaDeOrigem, turmaDeDestino] = cenario.turmas;

    await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: turmaDeDestino.id,
      date: DATA_DE_TRANSFERENCIA,
    });

    const naOrigem = await academics.activeEnrollmentsOfClassGroup(cenario.rede.id, turmaDeOrigem.id);
    const noDestino = await academics.activeEnrollmentsOfClassGroup(cenario.rede.id, turmaDeDestino.id);
    expect(naOrigem.map((linha) => linha.studentId)).not.toContain(origem.studentId);
    expect(noDestino.map((linha) => linha.studentId)).toEqual([origem.studentId]);
  });

  test('transferir para a mesma turma é recusado e nada muda', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;

    const resultado = await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: origem.classGroupId,
      date: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'turmaDestinoId',
        codigo: 'mesma_turma',
        mensagem: 'A turma de destino é a mesma turma da matrícula atual.',
      },
    ]);
    expect(await situacoesDoAluno(origem.studentId)).toEqual(['active']);
  });

  test('transferir matrícula já transferida é recusado', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const [, turmaDeDestino] = cenario.turmas;
    await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: turmaDeDestino.id,
      date: DATA_DE_TRANSFERENCIA,
    });

    const segundaVez = await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: turmaDeDestino.id,
      date: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(segundaVez)).toEqual([
      {
        campo: 'matriculaId',
        codigo: 'matricula_nao_ativa',
        mensagem: 'Apenas uma matrícula ativa pode ser transferida.',
      },
    ]);
    expect(await situacoesDoAluno(origem.studentId)).toEqual(['active', 'transferred']);
  });

  test('a matrícula pode ser transferida de novo a partir da turma nova', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const [turmaDeOrigem, turmaDoMeio] = cenario.turmas;
    const primeira = valorDe(
      await academics.transfer({
        networkId: cenario.rede.id,
        enrollmentId: origem.id,
        targetClassGroupId: turmaDoMeio.id,
        date: DATA_DE_TRANSFERENCIA,
      }),
    );

    const segunda = await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: primeira.id,
      targetClassGroupId: turmaDeOrigem.id,
      date: `${ANO_PADRAO}-08-01`,
    });

    expect(valorDe(segunda).classGroupId).toBe(turmaDeOrigem.id);
    const ativas = await sqlDeTeste()<{ total: number }[]>`
      SELECT count(*)::int AS total FROM enrollment
       WHERE student_id = ${origem.studentId} AND status = 'active'`;
    expect(ativas[0]?.total).toBe(1);
  });

  test('transferir para turma de outro ano letivo é recusado', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;
    const outroAno = await criarAnoLetivo({ networkId: cenario.rede.id, year: ANO_PADRAO + 1 });
    const turmaDoOutroAno = await criarTurma({
      networkId: cenario.rede.id, schoolId: cenario.unidades[0].id, academicYearId: outroAno.id,
    });

    const resultado = await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: turmaDoOutroAno.id,
      date: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'turmaDestinoId',
        codigo: 'turma_de_outro_ano',
        mensagem: 'A turma de destino pertence a outro ano letivo.',
      },
    ]);
    expect(await situacoesDoAluno(origem.studentId)).toEqual(['active']);
  });

  test('transferir para turma de outra rede é recusado', async () => {
    const { a, b } = await duasRedes();
    const [origem] = a.matriculas;

    const resultado = await academics.transfer({
      networkId: a.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: b.turmas[1].id,
      date: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('turma_nao_encontrada');
    expect(await situacoesDoAluno(origem.studentId)).toEqual(['active']);
  });

  test('matrícula de outra rede não é alcançável pelo id', async () => {
    const { a, b } = await duasRedes();

    const resultado = await academics.transfer({
      networkId: a.rede.id,
      enrollmentId: b.matriculas[0].id,
      targetClassGroupId: a.turmas[1].id,
      date: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)).toEqual([
      {
        campo: 'matriculaId',
        codigo: 'matricula_nao_encontrada',
        mensagem: 'Matrícula não encontrada nesta rede.',
      },
    ]);
    expect(await situacoesDoAluno(b.matriculas[0].studentId)).toEqual(['active']);
  });

  test('matrícula inexistente é recusada', async () => {
    const cenario = await cenarioCompleto();

    const resultado = await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: crypto.randomUUID(),
      targetClassGroupId: cenario.turmas[1].id,
      date: DATA_DE_TRANSFERENCIA,
    });

    expect(errosDe(resultado)[0]?.codigo).toBe('matricula_nao_encontrada');
  });

  test('data de transferência fora do formato é recusada', async () => {
    const cenario = await cenarioCompleto();
    const [origem] = cenario.matriculas;

    const resultado = await academics.transfer({
      networkId: cenario.rede.id,
      enrollmentId: origem.id,
      targetClassGroupId: cenario.turmas[1].id,
      date: '01-06-2026',
    });

    expect(errosDe(resultado)[0]?.campo).toBe('data');
    expect(await situacoesDoAluno(origem.studentId)).toEqual(['active']);
  });
});
