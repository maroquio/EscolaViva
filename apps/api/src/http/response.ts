import type { Context } from 'hono';
import { HEADERS, STATUS } from '../shared/constants';
import { errorBody } from '../shared/http';
import type { ErrorBody } from '@escolaviva/contracts/errors';

export { errorBody };
export type { ErrorBody };

export const created = <T>(c: Context, location: string, body: T): Response => {
  c.header(HEADERS.location, location);
  return c.json(body as object, STATUS.created);
};
