import { FIRST_PAGE, PAGE_PARAMS } from './constants';

export { PAGE_PARAMS };

export type PageParam = (typeof PAGE_PARAMS)[keyof typeof PAGE_PARAMS];

const NO_QUERY = '';
const QUERY_MARK = '?';

export function requestedPage(raw: string | undefined | null): number {
  const requested = Number(raw);
  if (!Number.isFinite(requested)) return FIRST_PAGE;
  return Math.max(FIRST_PAGE, Math.trunc(requested));
}

export function pageQuery(current: URLSearchParams, cursor: string, page: number): string {
  const params = new URLSearchParams(current);
  if (page <= FIRST_PAGE) params.delete(cursor);
  else params.set(cursor, String(page));
  const query = params.toString();
  return query === NO_QUERY ? NO_QUERY : `${QUERY_MARK}${query}`;
}
