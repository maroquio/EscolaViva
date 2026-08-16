import type { PapelEmUnidade } from './role';
import type { Rede } from './network';

export const TAMANHO_MINIMO_DE_SENHA = 10;

export type Usuario = {
  id: string;
  redeId: string;
  nome: string;
  email: string;
  cpf: string;
  ativo: boolean;
  responsavelId: string | null;
};

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
  cpf: string | null;
  ativo: boolean;
  papeis: PapelEmUnidade[];
};

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
