import { z } from 'zod';
import { identidade } from '../../identidade/index';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { turnoValido, type Turma } from '../dominio/turma';
import * as anosLetivos from '../infra/anoLetivoRepositorio';
import * as turmas from '../infra/turmaRepositorio';

const NOME_MAXIMO = 60;
const SERIE_MAXIMA = 60;

const entrada = z.object({
  redeId: z.string().uuid(),
  unidadeId: z.string().uuid('Selecione a unidade.'),
  anoLetivoId: z.string().uuid('Selecione o ano letivo.'),
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome da turma.')
    .max(NOME_MAXIMO, `O nome precisa ter até ${NOME_MAXIMO} caracteres.`),
  serie: z
    .string()
    .trim()
    .min(1, 'Informe a série.')
    .max(SERIE_MAXIMA, `A série precisa ter até ${SERIE_MAXIMA} caracteres.`),
  // A regra do turno mora no domínio; o schema apenas a consulta.
  turno: z.string().trim().refine(turnoValido, 'Turno inválido.'),
});

export async function cadastrarTurma(e: {
  redeId: string;
  unidadeId: string;
  anoLetivoId: string;
  nome: string;
  serie: string;
  turno: string;
}): Promise<Resultado<Turma>> {
  const validada = entrada.safeParse(e);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));

  const { redeId, unidadeId, anoLetivoId } = validada.data;
  return unidadeDeTrabalho(async ({ sql }): Promise<Resultado<Turma>> => {
    const unidade = await identidade.unidadePorId(redeId, unidadeId);
    if (unidade === null) {
      return falhaDeCampo(
        'unidadeId',
        'unidade_nao_encontrada',
        'Unidade não encontrada nesta rede.',
      );
    }
    const anoLetivo = await anosLetivos.porId(sql, redeId, anoLetivoId);
    if (anoLetivo === null) {
      return falhaDeCampo(
        'anoLetivoId',
        'ano_letivo_nao_encontrado',
        'Ano letivo não encontrado nesta rede.',
      );
    }

    const turma: Turma = { id: idGeneratorUuid.novo(), ...validada.data };
    const criada = await turmas.inserir(sql, turma);
    if (!criada) {
      return falhaDeCampo(
        'nome',
        'turma_duplicada',
        'Esta unidade já tem uma turma com este nome neste ano letivo.',
      );
    }
    return sucesso(turma);
  });
}
