import type { Context } from 'hono';
import { NaoAutorizado } from './erros';
import { usuarioAtualOuNulo } from './sessao';

/**
 * Toda consulta do sistema começa por `rede_id`, e este é o único lugar de onde esse valor sai na
 * camada web: ele vem da sessão, nunca da URL ou do formulário. O isolamento entre redes é assim
 * verificável no banco — coluna e chave estrangeira em toda tabela —, não só na aplicação.
 */
export function redeAtual(c: Context): string {
  const usuario = usuarioAtualOuNulo(c);
  if (usuario === null) throw new NaoAutorizado('rede indisponível sem sessão');
  return usuario.redeId;
}
