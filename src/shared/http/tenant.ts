import type { Context } from 'hono';
import { MOTIVOS_INTERNOS } from '../constantes';
import { NaoAutorizado } from './erros';
import { usuarioAtualOuNulo } from './sessao';

/**
 * Toda consulta do sistema começa por `rede_id`, e este é o único lugar de onde esse valor sai na
 * camada web: ele vem da sessão, nunca da URL ou do formulário. O isolamento entre redes é assim
 * verificável no banco — coluna e chave estrangeira em toda tabela —, não só na aplicação.
 */
export function redeAtual(c: Context): string {
  const usuario = usuarioAtualOuNulo(c);
  if (usuario === null) throw new NaoAutorizado(MOTIVOS_INTERNOS.redeIndisponivelSemSessao);
  return usuario.redeId;
}
