import { z } from 'zod';
import { identity } from '../../identity/index';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constants';
import { turnoValido, type Turma } from '../domain/classGroup';
import * as anosLetivos from '../infra/academicYearRepository';
import * as turmas from '../infra/classGroupRepository';

const entrada = z.object({
  redeId: z.string().uuid(),
  unidadeId: z.string().uuid(MENSAGENS.turma.unidadeObrigatoria),
  anoLetivoId: z.string().uuid(MENSAGENS.anoLetivoObrigatorio),
  nome: z
    .string()
    .trim()
    .min(1, MENSAGENS.turma.nomeObrigatorio)
    .max(LIMITES.turma.nome, MENSAGENS.turma.nomeLongo),
  serie: z
    .string()
    .trim()
    .min(1, MENSAGENS.turma.serieObrigatoria)
    .max(LIMITES.turma.serie, MENSAGENS.turma.serieLonga),
  turno: z.string().trim().refine(turnoValido, MENSAGENS.turma.turnoInvalido),
});

export async function cadastrarTurma(e: {
  redeId: string;
  unidadeId: string;
  anoLetivoId: string;
  nome: string;
  serie: string;
  turno: string;
}): Promise<Result<Turma>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  const { redeId, unidadeId, anoLetivoId } = validada.data;
  return unitOfWork(async ({ sql }): Promise<Result<Turma>> => {
    const unidade = await identity.schoolById(redeId, unidadeId);
    if (unidade === null) {
      return fieldFailure(
        CAMPOS.turma.unidadeId,
        CODIGOS.turma.unidadeNaoEncontrada,
        MENSAGENS.turma.unidadeNaoEncontrada,
      );
    }
    const anoLetivo = await anosLetivos.porId(sql, redeId, anoLetivoId);
    if (anoLetivo === null) {
      return fieldFailure(
        CAMPOS.turma.anoLetivoId,
        CODIGOS.anoLetivoNaoEncontrado,
        MENSAGENS.anoLetivoNaoEncontrado,
      );
    }

    const turma: Turma = { id: uuidIdGenerator.next(), ...validada.data };
    const criada = await turmas.inserir(sql, turma);
    if (!criada) {
      return fieldFailure(CAMPOS.turma.nome, CODIGOS.turma.duplicada, MENSAGENS.turma.duplicada);
    }
    return success(turma);
  });
}
