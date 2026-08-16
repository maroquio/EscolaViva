import { unitOfWork } from '../../shared/db';
import * as sessaoRepositorio from '../infra/sessionRepository';

export async function expurgarSessoesExpiradas(): Promise<number> {
  return await unitOfWork(async ({ sql }) => sessaoRepositorio.expurgarExpiradas(sql));
}
