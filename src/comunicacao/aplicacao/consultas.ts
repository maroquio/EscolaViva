import { identidade } from '../../identity';
import { reader } from '../../shared/db';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import { ERROS_INTERNOS } from '../constantes';
import { comAutor, estaPublicado, type Comunicado } from '../dominio/comunicado';
import {
  taxaDeLeitura,
  type EstatisticaDeLeitura,
  type ItemDoMural,
} from '../dominio/destinatario';
import {
  buscarParaResponsavel,
  contarComunicados,
  contarDoResponsavel,
  contarLeituras,
  listarDoResponsavel,
  somarLeituras,
} from '../infra/comunicadoRepositorio';

export async function muralDoResponsavel(
  redeId: string,
  responsavelId: string,
): Promise<ItemDoMural[]> {
  return await listarDoResponsavel(reader(), redeId, responsavelId);
}

export async function paginaDoMural(
  redeId: string,
  responsavelId: string,
  lido: boolean | undefined,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<ItemDoMural>> {
  const sql = reader();
  const filtro = lido === undefined ? undefined : { lido };
  return await queryPage(
    pagina,
    tamanho,
    () => contarDoResponsavel(sql, redeId, responsavelId, filtro),
    (faixa) => listarDoResponsavel(sql, redeId, responsavelId, filtro, faixa),
  );
}

export async function contagemDoMural(
  redeId: string,
  responsavelId: string,
): Promise<{ naoLidos: number; total: number }> {
  const sql = reader();
  const [naoLidos, total] = await Promise.all([
    contarDoResponsavel(sql, redeId, responsavelId, { lido: false }),
    contarDoResponsavel(sql, redeId, responsavelId),
  ]);
  return { naoLidos, total };
}

export async function comunicadoParaResponsavel(
  redeId: string,
  responsavelId: string,
  comunicadoId: string,
): Promise<Comunicado | null> {
  const armazenado = await buscarParaResponsavel(reader(), redeId, responsavelId, comunicadoId);
  if (armazenado === null || !estaPublicado(armazenado)) return null;

  const nomes = await identidade.nomesDeUsuarios(redeId, [armazenado.autorUsuarioId]);
  const autorNome = nomes.get(armazenado.autorUsuarioId);
  if (autorNome === undefined) throw new Error(ERROS_INTERNOS.autorForaDaRede);
  return comAutor(armazenado, autorNome);
}

export async function listarComunicados(
  redeId: string,
  unidadeId?: string,
): Promise<EstatisticaDeLeitura[]> {
  const contagens = await contarLeituras(reader(), redeId, unidadeId ?? null);
  return contagens.map((contagem) => ({
    ...contagem,
    taxa: taxaDeLeitura(contagem.destinatarios, contagem.leituras),
  }));
}

export async function paginaDeComunicados(
  redeId: string,
  unidadeId: string | undefined,
  pagina: number,
  tamanho: number = DEFAULT_PAGE_SIZE,
): Promise<Page<EstatisticaDeLeitura>> {
  const sql = reader();
  const unidade = unidadeId ?? null;
  const recortada = await queryPage(
    pagina,
    tamanho,
    () => contarComunicados(sql, redeId, unidade),
    (faixa) => contarLeituras(sql, redeId, unidade, faixa),
  );
  return {
    ...recortada,
    items: recortada.items.map((contagem) => ({
      ...contagem,
      taxa: taxaDeLeitura(contagem.destinatarios, contagem.leituras),
    })),
  };
}

export async function resumoDeComunicados(
  redeId: string,
  unidadeId?: string,
): Promise<{ destinatarios: number; leituras: number; taxa: number }> {
  const somado = await somarLeituras(reader(), redeId, unidadeId ?? null);
  return { ...somado, taxa: taxaDeLeitura(somado.destinatarios, somado.leituras) };
}
