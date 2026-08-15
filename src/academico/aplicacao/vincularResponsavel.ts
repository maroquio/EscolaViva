import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constantes';
import * as alunos from '../infra/alunoRepositorio';
import * as responsaveis from '../infra/responsavelRepositorio';

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
}): Promise<Resultado<void>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const { redeId, alunoId, responsavelId } = validada.data;
  return unidadeDeTrabalho(async ({ sql }): Promise<Resultado<void>> => {
    const aluno = await alunos.porId(sql, redeId, alunoId);
    if (aluno === null) {
      return falhaDeCampo(
        CAMPOS.vinculo.alunoId,
        CODIGOS.alunoNaoEncontrado,
        MENSAGENS.alunoNaoEncontrado,
      );
    }
    const responsavel = await responsaveis.porId(sql, redeId, responsavelId);
    if (responsavel === null) {
      return falhaDeCampo(
        CAMPOS.vinculo.responsavelId,
        CODIGOS.responsavelNaoEncontrado,
        MENSAGENS.responsavelNaoEncontrado,
      );
    }

    const vinculado = await responsaveis.vincular(sql, { ...validada.data });
    if (!vinculado) {
      return falhaDeCampo(
        CAMPOS.vinculo.responsavelId,
        CODIGOS.vinculo.duplicado,
        MENSAGENS.vinculo.duplicado,
      );
    }
    return sucesso<void>(undefined);
  });
}
