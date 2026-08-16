import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constants';
import * as alunos from '../infra/studentRepository';
import * as responsaveis from '../infra/guardianRepository';

const entrada = z.object({
  redeId: z.string().uuid(),
  alunoId: z.string().uuid(MENSAGENS.alunoObrigatorio),
  responsavelId: z.string().uuid(MENSAGENS.vinculo.responsavelObrigatorio),
  parentesco: z
    .string()
    .trim()
    .min(1, MENSAGENS.vinculo.parentescoObrigatorio)
    .max(LIMITES.parentesco.descricao, MENSAGENS.vinculo.parentescoLongo),
  financeiro: z.boolean(),
});

export async function vincularResponsavel(e: {
  redeId: string;
  alunoId: string;
  responsavelId: string;
  parentesco: string;
  financeiro: boolean;
}): Promise<Result<void>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  const { redeId, alunoId, responsavelId } = validada.data;
  return unitOfWork(async ({ sql }): Promise<Result<void>> => {
    const aluno = await alunos.porId(sql, redeId, alunoId);
    if (aluno === null) {
      return fieldFailure(
        CAMPOS.vinculo.alunoId,
        CODIGOS.alunoNaoEncontrado,
        MENSAGENS.alunoNaoEncontrado,
      );
    }
    const responsavel = await responsaveis.porId(sql, redeId, responsavelId);
    if (responsavel === null) {
      return fieldFailure(
        CAMPOS.vinculo.responsavelId,
        CODIGOS.responsavelNaoEncontrado,
        MENSAGENS.responsavelNaoEncontrado,
      );
    }

    const vinculado = await responsaveis.vincular(sql, { ...validada.data });
    if (!vinculado) {
      return fieldFailure(
        CAMPOS.vinculo.responsavelId,
        CODIGOS.vinculo.duplicado,
        MENSAGENS.vinculo.duplicado,
      );
    }
    return success<void>(undefined);
  });
}
