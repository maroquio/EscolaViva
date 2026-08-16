export const TITULO_TAMANHO_MAXIMO = 160;
export const CORPO_TAMANHO_MAXIMO = 8000;

export type Comunicado = {
  id: string;
  redeId: string;
  unidadeId: string;
  titulo: string;
  corpo: string;
  autorNome: string;
  publicadoEm: string | null;
};

export type ComunicadoArmazenado = {
  id: string;
  redeId: string;
  unidadeId: string;
  titulo: string;
  corpo: string;
  autorUsuarioId: string;
  publicadoEm: string | null;
};

export function tituloValido(titulo: string): boolean {
  const limpo = titulo.trim();
  return limpo.length > 0 && limpo.length <= TITULO_TAMANHO_MAXIMO;
}

export function corpoValido(corpo: string): boolean {
  const limpo = corpo.trim();
  return limpo.length > 0 && limpo.length <= CORPO_TAMANHO_MAXIMO;
}

export function estaPublicado(comunicado: { publicadoEm: string | null }): boolean {
  return comunicado.publicadoEm !== null;
}

export function comAutor(comunicado: ComunicadoArmazenado, autorNome: string): Comunicado {
  return {
    id: comunicado.id,
    redeId: comunicado.redeId,
    unidadeId: comunicado.unidadeId,
    titulo: comunicado.titulo,
    corpo: comunicado.corpo,
    autorNome,
    publicadoEm: comunicado.publicadoEm,
  };
}
