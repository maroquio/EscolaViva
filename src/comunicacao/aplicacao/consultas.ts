import { identidade } from '../../identidade';
import { leitura } from '../../shared/db';
import { comAutor, estaPublicado, type Comunicado } from '../dominio/comunicado';
import {
  taxaDeLeitura,
  type EstatisticaDeLeitura,
  type ItemDoMural,
} from '../dominio/destinatario';
import {
  buscarParaResponsavel,
  contarLeituras,
  listarDoResponsavel,
} from '../infra/comunicadoRepositorio';

/** I15: a consulta escolhe a conexão de leitura de forma explícita. */
export async function muralDoResponsavel(
  redeId: string,
  responsavelId: string,
): Promise<ItemDoMural[]> {
  return await listarDoResponsavel(leitura(), redeId, responsavelId);
}

export async function comunicadoParaResponsavel(
  redeId: string,
  responsavelId: string,
  comunicadoId: string,
): Promise<Comunicado | null> {
  const armazenado = await buscarParaResponsavel(leitura(), redeId, responsavelId, comunicadoId);
  if (armazenado === null || !estaPublicado(armazenado)) return null;

  const nomes = await identidade.nomesDeUsuarios(redeId, [armazenado.autorUsuarioId]);
  const autorNome = nomes.get(armazenado.autorUsuarioId);
  // A FK garante o usuário; nome ausente significa autor em outra rede — dado inconsistente.
  if (autorNome === undefined) throw new Error('Comunicado com autor fora da rede');
  return comAutor(armazenado, autorNome);
}

/**
 * A taxa de leitura por comunicado sai de uma agregação só — a lista da secretaria não pode
 * disparar uma consulta de leituras por linha.
 */
export async function listarComunicados(
  redeId: string,
  unidadeId?: string,
): Promise<EstatisticaDeLeitura[]> {
  const contagens = await contarLeituras(leitura(), redeId, unidadeId ?? null);
  return contagens.map((contagem) => ({
    ...contagem,
    taxa: taxaDeLeitura(contagem.destinatarios, contagem.leituras),
  }));
}
