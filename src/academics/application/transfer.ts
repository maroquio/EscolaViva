import { z } from 'zod';
import type { Connection } from '../../shared/db';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, ERROS_INTERNOS, MENSAGENS } from '../constants';
import { MATRICULA_ATIVA, podeTransferir, type Matricula } from '../domain/enrollment';
import type { Turma } from '../domain/classGroup';
import * as matriculas from '../infra/enrollmentRepository';
import * as turmas from '../infra/classGroupRepository';

const entrada = z.object({
  redeId: z.string().uuid(),
  matriculaId: z.string().uuid(MENSAGENS.transferencia.matriculaObrigatoria),
  turmaDestinoId: z.string().uuid(MENSAGENS.transferencia.turmaDestinoObrigatoria),
  data: z.string().date(MENSAGENS.transferencia.dataFormato),
});

async function trocarDeTurma(
  sql: Connection,
  origem: Matricula,
  destino: Turma,
  data: string,
): Promise<Result<Matricula>> {
  const encerrada = await matriculas.marcarComoTransferida(sql, origem.redeId, origem.id);
  if (!encerrada) {
    return fieldFailure(
      CAMPOS.transferencia.matriculaId,
      CODIGOS.transferencia.perdeuACorrida,
      MENSAGENS.transferencia.perdeuACorrida,
    );
  }

  const nova: Matricula = {
    id: uuidIdGenerator.next(),
    redeId: origem.redeId,
    alunoId: origem.alunoId,
    alunoNome: origem.alunoNome,
    turmaId: destino.id,
    turmaNome: destino.nome,
    unidadeId: destino.unidadeId,
    anoLetivoId: origem.anoLetivoId,
    ano: origem.ano,
    dataMatricula: data,
    situacao: MATRICULA_ATIVA,
  };
  const criada = await matriculas.inserir(sql, nova);
  if (!criada) throw new Error(ERROS_INTERNOS.conflitoDeMatriculaNaTransferencia);
  return success(nova);
}

export async function transferir(e: {
  redeId: string;
  matriculaId: string;
  turmaDestinoId: string;
  data: string;
}): Promise<Result<Matricula>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  const { redeId, matriculaId, turmaDestinoId, data } = validada.data;
  return unitOfWork(async ({ sql }): Promise<Result<Matricula>> => {
    const origem = await matriculas.porId(sql, redeId, matriculaId);
    if (origem === null) {
      return fieldFailure(
        CAMPOS.transferencia.matriculaId,
        CODIGOS.transferencia.matriculaNaoEncontrada,
        MENSAGENS.transferencia.matriculaNaoEncontrada,
      );
    }
    if (!podeTransferir(origem)) {
      return fieldFailure(
        CAMPOS.transferencia.matriculaId,
        CODIGOS.transferencia.somenteAtivaTransfere,
        MENSAGENS.transferencia.somenteAtivaTransfere,
      );
    }
    if (origem.turmaId === turmaDestinoId) {
      return fieldFailure(
        CAMPOS.transferencia.turmaDestinoId,
        CODIGOS.transferencia.mesmaTurma,
        MENSAGENS.transferencia.mesmaTurma,
      );
    }

    const destino = await turmas.porId(sql, redeId, turmaDestinoId);
    if (destino === null) {
      return fieldFailure(
        CAMPOS.transferencia.turmaDestinoId,
        CODIGOS.transferencia.turmaDestinoNaoEncontrada,
        MENSAGENS.transferencia.turmaDestinoNaoEncontrada,
      );
    }
    if (destino.anoLetivoId !== origem.anoLetivoId) {
      return fieldFailure(
        CAMPOS.transferencia.turmaDestinoId,
        CODIGOS.transferencia.turmaDeOutroAno,
        MENSAGENS.transferencia.turmaDeOutroAno,
      );
    }

    return trocarDeTurma(sql, origem, destino, data);
  });
}
