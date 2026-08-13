import { unidadeDeTrabalho } from '../../shared/db';
import * as sessaoRepositorio from '../infra/sessaoRepositorio';

/**
 * Único job periódico do Estágio 01. A sessão vencida continua no banco até esta varredura
 * passar — quem decide se ela vale é o domínio, a cada requisição; quem limpa é aqui.
 */
export async function expurgarSessoesExpiradas(): Promise<number> {
  return await unidadeDeTrabalho(async ({ sql }) => sessaoRepositorio.expurgarExpiradas(sql));
}
