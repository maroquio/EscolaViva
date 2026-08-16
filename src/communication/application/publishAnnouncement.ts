import { z } from 'zod';

import { academico } from '../../academics';
import { identity } from '../../identity';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constants';
import {
  CORPO_TAMANHO_MAXIMO,
  TITULO_TAMANHO_MAXIMO,
  comAutor,
  corpoValido,
  tituloValido,
  type Comunicado,
  type ComunicadoArmazenado,
} from '../domain/announcement';
import { inserirDestinatarios, inserirPublicado } from '../infra/announcementRepository';

export type EntradaDeComunicado = {
  redeId: string;
  unidadeId: string;
  titulo: string;
  corpo: string;
  autorUsuarioId: string;
  destinatarios: { responsavelId: string }[];
};

const esquema = z.object({
  redeId: z.string().uuid(),
  unidadeId: z.string().uuid(),
  titulo: z.string().trim(),
  corpo: z.string().trim(),
  autorUsuarioId: z.string().uuid(),
  destinatarios: z.array(z.object({ responsavelId: z.string().uuid() })),
});

type DadosValidados = z.infer<typeof esquema>;

function conferirTexto(dados: DadosValidados): Result<void> {
  if (!tituloValido(dados.titulo)) {
    return fieldFailure(
      CAMPOS.titulo,
      CODIGOS.tituloInvalido,
      MENSAGENS.tituloInvalido(TITULO_TAMANHO_MAXIMO),
    );
  }
  if (!corpoValido(dados.corpo)) {
    return fieldFailure(
      CAMPOS.corpo,
      CODIGOS.corpoInvalido,
      MENSAGENS.corpoInvalido(CORPO_TAMANHO_MAXIMO),
    );
  }
  return success<void>(undefined);
}

async function responsaveisAlvo(dados: DadosValidados): Promise<string[]> {
  if (dados.destinatarios.length > 0) {
    return [...new Set(dados.destinatarios.map((destinatario) => destinatario.responsavelId))];
  }
  const daUnidade = await academico.responsaveisDaUnidade(dados.redeId, dados.unidadeId);
  return daUnidade.map((responsavel) => responsavel.id);
}

async function gravar(
  dados: DadosValidados,
  responsaveisIds: readonly string[],
): Promise<ComunicadoArmazenado> {
  return await unitOfWork(async ({ sql }) => {
    const comunicado = await inserirPublicado(sql, {
      id: uuidIdGenerator.next(),
      redeId: dados.redeId,
      unidadeId: dados.unidadeId,
      titulo: dados.titulo,
      corpo: dados.corpo,
      autorUsuarioId: dados.autorUsuarioId,
    });
    await inserirDestinatarios(sql, {
      redeId: dados.redeId,
      comunicadoId: comunicado.id,
      responsaveisIds,
    });
    return comunicado;
  });
}

export async function publicarComunicado(
  entrada: EntradaDeComunicado,
): Promise<Result<Comunicado>> {
  const validado = esquema.safeParse(entrada);
  if (!validado.success) return failure(...schemaErrors(validado.error.issues));

  const dados = validado.data;
  const texto = conferirTexto(dados);
  if (!texto.ok) return failure(...texto.erros);

  const [unidade, nomes] = await Promise.all([
    identity.schoolById(dados.redeId, dados.unidadeId),
    identity.userNames(dados.redeId, [dados.autorUsuarioId]),
  ]);
  if (unidade === null) {
    return fieldFailure(
      CAMPOS.unidadeId,
      CODIGOS.unidadeDesconhecida,
      MENSAGENS.unidadeDesconhecida,
    );
  }
  const autorNome = nomes.get(dados.autorUsuarioId);
  if (autorNome === undefined) {
    return fieldFailure(
      CAMPOS.autorUsuarioId,
      CODIGOS.autorDesconhecido,
      MENSAGENS.autorDesconhecido,
    );
  }

  const responsaveisIds = await responsaveisAlvo(dados);
  if (responsaveisIds.length === 0) {
    return fieldFailure(
      CAMPOS.destinatarios,
      CODIGOS.semDestinatarios,
      MENSAGENS.semDestinatarios,
    );
  }

  return success(comAutor(await gravar(dados, responsaveisIds), autorNome));
}
