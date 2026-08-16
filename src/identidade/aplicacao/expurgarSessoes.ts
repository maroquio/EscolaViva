import { unitOfWork } from '../../shared/db';
import * as sessaoRepositorio from '../infra/sessaoRepositorio';

export async function expurgarSessoesExpiradas(): Promise<number> {
  return await unitOfWork(async ({ sql }) => sessaoRepositorio.expurgarExpiradas(sql));
}
