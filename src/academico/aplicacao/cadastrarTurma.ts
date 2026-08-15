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
import { CAMPOS, CODIGOS, LIMITES, MENSAGENS } from '../constantes';
import { turnoValido, type Turma } from '../dominio/turma';
import * as anosLetivos from '../infra/anoLetivoRepositorio';
import * as turmas from '../infra/turmaRepositorio';

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
  // A regra do turno mora no domínio; o schema apenas a consulta.
  turno: z.string().trim().refine(turnoValido, MENSAGENS.turma.turnoInvalido),
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
        CAMPOS.turma.unidadeId,
        CODIGOS.turma.unidadeNaoEncontrada,
        MENSAGENS.turma.unidadeNaoEncontrada,
      );
    }
    const anoLetivo = await anosLetivos.porId(sql, redeId, anoLetivoId);
    if (anoLetivo === null) {
      return falhaDeCampo(
        CAMPOS.turma.anoLetivoId,
        CODIGOS.anoLetivoNaoEncontrado,
        MENSAGENS.anoLetivoNaoEncontrado,
      );
    }

    const turma: Turma = { id: idGeneratorUuid.novo(), ...validada.data };
    const criada = await turmas.inserir(sql, turma);
    if (!criada) {
      return falhaDeCampo(CAMPOS.turma.nome, CODIGOS.turma.duplicada, MENSAGENS.turma.duplicada);
    }
    return sucesso(turma);
  });
}
