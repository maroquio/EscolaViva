import type { Context } from 'hono';
import { INTERNAL_REASONS } from '../constants';
import { Unauthorized } from './errors';
import { currentUserOrNull } from './session';

export function currentNetwork(c: Context): string {
  const user = currentUserOrNull(c);
  if (user === null) throw new Unauthorized(INTERNAL_REASONS.networkUnavailableWithoutSession);
  return user.redeId;
}
