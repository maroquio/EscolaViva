import { z } from 'zod';
import { ISO_DATE_LENGTH } from '../../shared/constants';
import { unitOfWork } from '../../shared/db';
import { systemClock, uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constants';
import { idadeEm, type Aluno } from '../domain/student';
import * as alunos from '../infra/studentRepository';

const entrada = z.object({
  redeId: z.string().uuid(),
  nome: z
    .string()
    .trim()
    .min(1, MENSAGENS.aluno.nomeObrigatorio)
    .max(LIMITES.aluno.nome, MENSAGENS.aluno.nomeLongo),
  dataNascimento: z.string().date(MENSAGENS.aluno.dataNascimentoFormato),
});

const hoje = (): string => systemClock.now().toISOString().slice(0, ISO_DATE_LENGTH);

export async function cadastrarAluno(e: {
  redeId: string;
  nome: string;
  dataNascimento: string;
}): Promise<Result<Aluno>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return failure(...schemaErrors(validada.error.issues));

  if (idadeEm(validada.data.dataNascimento, hoje()) < 0) {
    return fieldFailure(
      CAMPOS.aluno.dataNascimento,
      CODIGOS.aluno.dataNoFuturo,
      MENSAGENS.aluno.dataNoFuturo,
    );
  }

  const aluno: Aluno = { id: uuidIdGenerator.next(), ...validada.data };
  await unitOfWork(({ sql }) => alunos.inserir(sql, aluno));
  return success(aluno);
}
