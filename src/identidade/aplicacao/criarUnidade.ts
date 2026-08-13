import { z } from 'zod';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import { errosDeSchema, falha, falhaDeCampo, sucesso, type Resultado } from '../../shared/resultado';
import type { Unidade } from '../dominio/unidade';
import * as unidadeRepositorio from '../infra/unidadeRepositorio';

const TAMANHO_MAXIMO_DO_INEP = 20;

const schema = z.object({
  redeId: z.string().uuid('rede inválida'),
  nome: z.string().trim().min(1, 'informe o nome da unidade').max(120, 'nome longo demais'),
  codigoInep: z
    .string()
    .trim()
    .max(TAMANHO_MAXIMO_DO_INEP, 'código INEP longo demais')
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
      return falhaDeCampo('nome', 'nome_em_uso', 'já existe unidade com este nome na rede');
    }
    await unidadeRepositorio.inserir(sql, unidade);
    return sucesso(unidade);
  });
}
