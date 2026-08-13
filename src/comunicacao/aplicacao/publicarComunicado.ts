import { z } from 'zod';

import { academico } from '../../academico';
import { identidade } from '../../identidade';
import { unidadeDeTrabalho } from '../../shared/db';
import { idGeneratorUuid } from '../../shared/ports';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import {
  CORPO_TAMANHO_MAXIMO,
  TITULO_TAMANHO_MAXIMO,
  comAutor,
  corpoValido,
  tituloValido,
  type Comunicado,
  type ComunicadoArmazenado,
} from '../dominio/comunicado';
import { inserirDestinatarios, inserirPublicado } from '../infra/comunicadoRepositorio';

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

function conferirTexto(dados: DadosValidados): Resultado<void> {
  if (!tituloValido(dados.titulo)) {
    return falhaDeCampo(
      'titulo',
      'titulo_invalido',
      `Informe um título de 1 a ${TITULO_TAMANHO_MAXIMO} caracteres.`,
    );
  }
  if (!corpoValido(dados.corpo)) {
    return falhaDeCampo(
      'corpo',
      'corpo_invalido',
      `Informe um corpo de 1 a ${CORPO_TAMANHO_MAXIMO} caracteres.`,
    );
  }
  return sucesso<void>(undefined);
}

/** Lista vazia significa "a unidade inteira": todo responsável com aluno matriculado ativo lá. */
async function responsaveisAlvo(dados: DadosValidados): Promise<string[]> {
  if (dados.destinatarios.length > 0) {
    return [...new Set(dados.destinatarios.map((destinatario) => destinatario.responsavelId))];
  }
  const daUnidade = await academico.responsaveisDaUnidade(dados.redeId, dados.unidadeId);
  return daUnidade.map((responsavel) => responsavel.id);
}

/** Comunicado e destinatários na MESMA unidade de trabalho: ou o mural inteiro existe, ou nada. */
async function gravar(
  dados: DadosValidados,
  responsaveisIds: readonly string[],
): Promise<ComunicadoArmazenado> {
  return await unidadeDeTrabalho(async ({ sql }) => {
    const comunicado = await inserirPublicado(sql, {
      id: idGeneratorUuid.novo(),
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

// O comunicado fica no mural do portal, sem e-mail: `lido_em` é a instrumentação que prova essa dor.
export async function publicarComunicado(
  entrada: EntradaDeComunicado,
): Promise<Resultado<Comunicado>> {
  const validado = esquema.safeParse(entrada);
  if (!validado.success) return falha(...errosDeSchema(validado.error.issues));

  const dados = validado.data;
  const texto = conferirTexto(dados);
  if (!texto.ok) return falha(...texto.erros);

  // A FK garante que a unidade existe, não que ela é desta rede — quem confere isso é o caso de uso.
  const [unidade, nomes] = await Promise.all([
    identidade.unidadePorId(dados.redeId, dados.unidadeId),
    identidade.nomesDeUsuarios(dados.redeId, [dados.autorUsuarioId]),
  ]);
  if (unidade === null) {
    return falhaDeCampo('unidadeId', 'unidade_desconhecida', 'Unidade não encontrada nesta rede.');
  }
  const autorNome = nomes.get(dados.autorUsuarioId);
  if (autorNome === undefined) {
    return falhaDeCampo('autorUsuarioId', 'autor_desconhecido', 'Autor não encontrado nesta rede.');
  }

  const responsaveisIds = await responsaveisAlvo(dados);
  if (responsaveisIds.length === 0) {
    return falhaDeCampo(
      'destinatarios',
      'sem_destinatarios',
      'Não há responsável para receber este comunicado.',
    );
  }

  return sucesso(comAutor(await gravar(dados, responsaveisIds), autorNome));
}
