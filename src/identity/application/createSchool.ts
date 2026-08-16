import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constants';
import type { Unidade } from '../domain/school';
import * as unidadeRepositorio from '../infra/schoolRepository';

const schema = z.object({
  redeId: z.string().uuid(MENSAGENS.unidade.redeInvalida),
  nome: z
    .string()
    .trim()
    .min(1, MENSAGENS.unidade.nomeObrigatorio)
    .max(LIMITES.unidade.nome, MENSAGENS.unidade.nomeLongo),
  codigoInep: z
    .string()
    .trim()
    .max(LIMITES.unidade.codigoInep, MENSAGENS.unidade.inepLongo)
    .nullable()
    .optional(),
});

export async function criarUnidade(entrada: {
  redeId: string;
  nome: string;
  codigoInep?: string | null | undefined;
}): Promise<Result<Unidade>> {
  const analise = schema.safeParse(entrada);
  if (!analise.success) return failure(...schemaErrors(analise.error.issues));
  const dados = analise.data;

  const codigoInep = dados.codigoInep === '' ? null : (dados.codigoInep ?? null);
  const unidade: Unidade = {
    id: uuidIdGenerator.next(),
    redeId: dados.redeId,
    nome: dados.nome,
    codigoInep,
    ativa: true,
  };

  return await unitOfWork(async ({ sql }) => {
    if (await unidadeRepositorio.existeNome(sql, unidade.redeId, unidade.nome)) {
      return fieldFailure(CAMPOS.unidade.nome, CODIGOS.nomeEmUso, MENSAGENS.unidade.nomeEmUso);
    }
    await unidadeRepositorio.inserir(sql, unidade);
    return success(unidade);
  });
}
