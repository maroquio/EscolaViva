import type { Context } from 'hono';
import { MOTIVOS_INTERNOS } from '../constants';
import { NaoAutorizado } from './errors';
import { usuarioAtualOuNulo } from './session';

export function redeAtual(c: Context): string {
  const usuario = usuarioAtualOuNulo(c);
  if (usuario === null) throw new NaoAutorizado(MOTIVOS_INTERNOS.redeIndisponivelSemSessao);
  return usuario.redeId;
}
