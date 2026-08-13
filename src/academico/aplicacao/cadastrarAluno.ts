import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import { clockDoSistema, idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { idadeEm, type Aluno } from '../dominio/aluno';
import * as alunos from '../infra/alunoRepositorio';

const NOME_MAXIMO = 120;

const entrada = z.object({
  redeId: z.string().uuid(),
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do aluno.')
    .max(NOME_MAXIMO, `O nome precisa ter até ${NOME_MAXIMO} caracteres.`),
  dataNascimento: z.string().date('Informe a data de nascimento no formato AAAA-MM-DD.'),
});

/** A data de hoje em 'AAAA-MM-DD'; o dia de diferença por fuso não muda uma checagem de futuro. */
const hoje = (): string => clockDoSistema.agora().toISOString().slice(0, 10);

export async function cadastrarAluno(e: {
  redeId: string;
  nome: string;
  dataNascimento: string;
}): Promise<Resultado<Aluno>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  if (idadeEm(validada.data.dataNascimento, hoje()) < 0) {
    return falhaDeCampo(
      'dataNascimento',
      'data_no_futuro',
      'A data de nascimento não pode estar no futuro.',
    );
  }

  const aluno: Aluno = { id: idGeneratorUuid.novo(), ...validada.data };
  await unidadeDeTrabalho(({ sql }) => alunos.inserir(sql, aluno));
  return sucesso(aluno);
}
