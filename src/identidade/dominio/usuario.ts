import type { PapelEmUnidade } from './papel';
import type { Rede } from './rede';

/**
 * Comprimento mínimo de senha. Mora no domínio porque é regra do produto; a camada de aplicação
 * apenas a aplica na validação de entrada.
 */
export const TAMANHO_MINIMO_DE_SENHA = 10;

export type Usuario = {
  id: string;
  redeId: string;
  nome: string;
  email: string;
  cpf: string | null;
  ativo: boolean;
  /** Quem entra como responsável aponta para o cadastro de responsável do módulo acadêmico. */
  responsavelId: string | null;
};

/** O que a sessão carrega: identidade, rede e todos os papéis, resolvidos de uma vez. */
export type UsuarioAutenticado = {
  id: string;
  redeId: string;
  redeNome: string;
  redeSlug: string;
  nome: string;
  email: string;
  papeis: PapelEmUnidade[];
  responsavelId: string | null;
};

export type UsuarioResumo = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  papeis: PapelEmUnidade[];
};

/**
 * O índice único é `(rede_id, email)` sobre o texto cru. Normalizar na escrita e na leitura é o
 * que impede "Ana@escola.br" e "ana@escola.br" de virarem dois usuários da mesma pessoa.
 */
export function emailNormalizado(email: string): string {
  return email.trim().toLowerCase();
}

export function usuarioAutenticado(
  usuario: Usuario,
  rede: Rede,
  papeis: PapelEmUnidade[],
): UsuarioAutenticado {
  return {
    id: usuario.id,
    redeId: rede.id,
    redeNome: rede.nome,
    redeSlug: rede.slug,
    nome: usuario.nome,
    email: usuario.email,
    papeis,
    responsavelId: usuario.responsavelId,
  };
}
