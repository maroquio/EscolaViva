import type { Context } from 'hono';
import { requestedPage } from '../shared/pagination';
import { PARAMS } from './constants';

export function pageFromQuery(c: Context, param: string = PARAMS.defaultPage): number {
  return requestedPage(c.req.query(param));
}
