/**
 * Comunicado é o que a escola diz ao responsável. No Estágio 01 ele vive em um lugar só — o mural
 * do portal — e por isso a leitura precisa ser medida na origem.
 */

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

/**
 * Forma persistida: `comunicacao` guarda o id do autor, nunca o nome. O nome pertence a
 * `identidade` e é pedido a ela — a junção que não existe em SQL é justamente a fronteira do módulo.
 */
export type ComunicadoArmazenado = {
  id: string;
  redeId: string;
  unidadeId: string;
  titulo: string;
  corpo: string;
  autorUsuarioId: string;
  publicadoEm: string | null;
};

/** Título é a linha que o responsável vê na lista do mural: não pode ser vazio nem um parágrafo. */
export function tituloValido(titulo: string): boolean {
  const limpo = titulo.trim();
  return limpo.length > 0 && limpo.length <= TITULO_TAMANHO_MAXIMO;
}

export function corpoValido(corpo: string): boolean {
  const limpo = corpo.trim();
  return limpo.length > 0 && limpo.length <= CORPO_TAMANHO_MAXIMO;
}

/** Comunicado sem `publicadoEm` não aparece no mural de ninguém. */
export function estaPublicado(comunicado: { publicadoEm: string | null }): boolean {
  return comunicado.publicadoEm !== null;
}

/** Junta o comunicado ao nome que veio de `identidade`, sem carregar o id do autor para fora. */
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
