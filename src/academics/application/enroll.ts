import { z } from 'zod';
import type { Connection } from '../../shared/db';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constants';
import { MATRICULA_ATIVA, type Matricula } from '../domain/enrollment';
import type { Turma } from '../domain/classGroup';
import * as alunos from '../infra/studentRepository';
import * as anosLetivos from '../infra/academicYearRepository';
import * as matriculas from '../infra/enrollmentRepository';
import * as turmas from '../infra/classGroupRepository';

const entrada = z.object({
  redeId: z.string().uuid(),
  alunoId: z.string().uuid(MENSAGENS.alunoObrigatorio),
  turmaId: z.string().uuid(MENSAGENS.matricula.turmaObrigatoria),
  anoLetivoId: z.string().uuid(MENSAGENS.anoLetivoObrigatorio),
  dataMatricula: z.string().date(MENSAGENS.matricula.dataFormato),
});

type Alvo = { redeId: string; alunoId: string; turmaId: string; anoLetivoId: string };
type ContextoDaMatricula = { alunoNome: string; turma: Turma; ano: number };

async function contexto(sql: Connection, alvo: Alvo): Promise<Result<ContextoDaMatricula>> {
  const aluno = await alunos.porId(sql, alvo.redeId, alvo.alunoId);
  if (aluno === null) {
    return fieldFailure(
      CAMPOS.matricula.alunoId,
      CODIGOS.alunoNaoEncontrado,
      MENSAGENS.alunoNaoEncontrado,
    );
  }
  const turma = await turmas.porId(sql, alvo.redeId, alvo.turmaId);
  if (turma === null) {
    return fieldFailure(
      CAMPOS.matricula.turmaId,
      CODIGOS.turmaNaoEncontrada,
      MENSAGENS.turmaNaoEncontrada,
    );
  }
  const anoLetivo = await anosLetivos.porId(sql, alvo.redeId, alvo.anoLetivoId);
  if (anoLetivo === null) {
    return fieldFailure(
      CAMPOS.matricula.anoLetivoId,
      CODIGOS.anoLetivoNaoEncontrado,
      MENSAGENS.anoLetivoNaoEncontrado,
    );
  }
  if (turma.anoLetivoId !== alvo.anoLetivoId) {
    return fieldFailure(
      CAMPOS.matricula.turmaId,
      CODIGOS.matricula.turmaDeOutroAno,
      MENSAGENS.matricula.turmaDeOutroAno,
    );
  }
  return success({ alunoNome: aluno.nome, turma, ano: anoLetivo.ano });
}

export async function matricular(e: {
  redeId: string;
  alunoId: string;
  turmaId: string;
  anoLetivoId: string;
  dataMatricula: string;
}): Promise<Result<Matricula>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  const { redeId, alunoId, turmaId, anoLetivoId, dataMatricula } = validada.data;
  return unitOfWork(async ({ sql }): Promise<Result<Matricula>> => {
    const encontrado = await contexto(sql, { redeId, alunoId, turmaId, anoLetivoId });
    if (!encontrado.ok) return encontrado;

    const { alunoNome, turma, ano } = encontrado.valor;
    const matricula: Matricula = {
      id: uuidIdGenerator.next(),
      redeId,
      alunoId,
      alunoNome,
      turmaId,
      turmaNome: turma.nome,
      unidadeId: turma.unidadeId,
      anoLetivoId,
      ano,
      dataMatricula,
      situacao: MATRICULA_ATIVA,
    };
    const criada = await matriculas.inserir(sql, matricula);
    if (!criada) {
      return fieldFailure(
        CAMPOS.matricula.alunoId,
        CODIGOS.matricula.ativaDuplicada,
        MENSAGENS.matricula.ativaDuplicada,
      );
    }
    return success(matricula);
  });
}
