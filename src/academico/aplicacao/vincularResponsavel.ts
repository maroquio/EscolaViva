import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import * as alunos from '../infra/alunoRepositorio';
import * as responsaveis from '../infra/responsavelRepositorio';

const PARENTESCO_MAXIMO = 40;

const entrada = z.object({
  redeId: z.string().uuid(),
  alunoId: z.string().uuid('Selecione um aluno.'),
  responsavelId: z.string().uuid('Selecione um responsável.'),
  parentesco: z
    .string()
    .trim()
    .min(1, 'Informe o parentesco.')
    .max(PARENTESCO_MAXIMO, `O parentesco precisa ter até ${PARENTESCO_MAXIMO} caracteres.`),
  financeiro: z.boolean(),
});

export async function vincularResponsavel(e: {
  redeId: string;
  alunoId: string;
  responsavelId: string;
  parentesco: string;
  financeiro: boolean;
}): Promise<Resultado<void>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const { redeId, alunoId, responsavelId } = validada.data;
  return unidadeDeTrabalho(async ({ sql }): Promise<Resultado<void>> => {
    // As chaves estrangeiras garantem que aluno e responsável existem, não que sejam desta rede.
    const aluno = await alunos.porId(sql, redeId, alunoId);
    if (aluno === null) {
      return falhaDeCampo('alunoId', 'aluno_nao_encontrado', 'Aluno não encontrado nesta rede.');
    }
    const responsavel = await responsaveis.porId(sql, redeId, responsavelId);
    if (responsavel === null) {
      return falhaDeCampo(
        'responsavelId',
        'responsavel_nao_encontrado',
        'Responsável não encontrado nesta rede.',
      );
    }

    const vinculado = await responsaveis.vincular(sql, { ...validada.data });
    if (!vinculado) {
      return falhaDeCampo(
        'responsavelId',
        'vinculo_duplicado',
        'Este responsável já está vinculado a este aluno.',
      );
    }
    return sucesso<void>(undefined);
  });
}
