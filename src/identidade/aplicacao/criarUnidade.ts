import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import { errosDeSchema, falha, falhaDeCampo, sucesso, type Resultado } from '../../shared/resultado';
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constantes';
import type { Unidade } from '../dominio/unidade';
import * as unidadeRepositorio from '../infra/unidadeRepositorio';

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
}): Promise<Resultado<Unidade>> {
  const analise = schema.safeParse(entrada);
  if (!analise.success) return falha(...errosDeSchema(analise.error.issues));
  const dados = analise.data;

  // Campo em branco no formulário é ausência de código INEP, não código vazio.
  const codigoInep = dados.codigoInep === '' ? null : (dados.codigoInep ?? null);
  const unidade: Unidade = {
    id: idGeneratorUuid.novo(),
    redeId: dados.redeId,
    nome: dados.nome,
    codigoInep,
    ativa: true,
  };

  return await unidadeDeTrabalho(async ({ sql }) => {
    // A constraint `unidade_nome_unico_na_rede` é quem garante (I8); esta leitura existe só para
    // devolver a mensagem no campo certo em vez de um erro de banco na cara da secretaria.
    if (await unidadeRepositorio.existeNome(sql, unidade.redeId, unidade.nome)) {
      return falhaDeCampo(CAMPOS.unidade.nome, CODIGOS.nomeEmUso, MENSAGENS.unidade.nomeEmUso);
    }
    await unidadeRepositorio.inserir(sql, unidade);
    return sucesso(unidade);
  });
}
