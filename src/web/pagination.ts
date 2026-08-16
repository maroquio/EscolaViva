import type { Context } from 'hono';
import { requestedPage, type Page } from '../shared/pagination';
import { PAGINATION, PARAMS } from './constants';

const HALF_WINDOW = Math.floor(PAGINATION.window / 2);

export type PageLink = { number: number; href: string; current: boolean };

export type Pagination = {
  readonly param: string;
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly first: number;
  readonly last: number;
  readonly previous: string | null;
  readonly next: string | null;
  readonly links: readonly PageLink[];
  readonly many: boolean;
};

export function pageFromQuery(c: Context, param: string = PARAMS.defaultPage): number {
  return requestedPage(c.req.query(param));
}

const pageUrl = (c: Context, param: string, number: number): string => {
  const params = new URLSearchParams(c.req.query());
  if (number <= 1) params.delete(param);
  else params.set(param, String(number));
  const query = params.toString();
  return query === '' ? c.req.path : `${c.req.path}?${query}`;
};

const windowOf = (current: number, pages: number): number[] => {
  if (pages <= PAGINATION.window) return Array.from({ length: pages }, (_, i) => i + 1);
  const start = Math.min(Math.max(1, current - HALF_WINDOW), pages - PAGINATION.window + 1);
  return Array.from({ length: PAGINATION.window }, (_, i) => start + i);
};

export function pagination(
  c: Context,
  page: Page<unknown>,
  param: string = PARAMS.defaultPage,
): Pagination {
  const { page: current, pages, total, size, items } = page;
  const first = total === 0 ? 0 : (current - 1) * size + 1;
  return {
    param,
    page: current,
    pages,
    total,
    first,
    last: total === 0 ? 0 : first + items.length - 1,
    previous: current > 1 ? pageUrl(c, param, current - 1) : null,
    next: current < pages ? pageUrl(c, param, current + 1) : null,
    links: windowOf(current, pages).map((number) => ({
      number,
      href: pageUrl(c, param, number),
      current: number === current,
    })),
    many: pages > 1,
  };
}
