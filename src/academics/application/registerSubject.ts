import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constants';
import type { Disciplina } from '../domain/subject';
import * as disciplinas from '../infra/subjectRepository';

const entrada = z.object({
  redeId: z.string().uuid(),
  nome: z
    .string()
    .trim()
    .min(1, MENSAGENS.disciplina.nomeObrigatorio)
    .max(LIMITES.disciplina.nome, MENSAGENS.disciplina.nomeLongo),
});

export async function cadastrarDisciplina(e: {
  redeId: string;
  nome: string;
}): Promise<Result<Disciplina>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  const disciplina: Disciplina = { id: uuidIdGenerator.next(), ...validada.data };
  const criada = await unitOfWork(({ sql }) => disciplinas.inserir(sql, disciplina));
  if (!criada) {
    return fieldFailure(
      CAMPOS.disciplina.nome,
      CODIGOS.disciplina.duplicada,
      MENSAGENS.disciplina.duplicada,
    );
  }
  return success(disciplina);
}
