import { DEFAULT_PAGE_SIZE } from '../constants';

export { DEFAULT_PAGE_SIZE };

export type Range = {
  readonly limit: number;
  readonly offset: number;
};

export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly size: number;
  readonly pages: number;
};

export function requestedPage(raw: string | undefined | null): number {
  const number = Number(raw);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.trunc(number));
}

export function rangeFor(page: number, size: number = DEFAULT_PAGE_SIZE): Range {
  return { limit: size, offset: (Math.max(1, page) - 1) * size };
}

export function rangeParams(range?: Range): { limit: number | null; offset: number | null } {
  if (range === undefined) return { limit: null, offset: null };
  return { limit: range.limit, offset: range.offset };
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

export function emptyPage<T>(size: number = DEFAULT_PAGE_SIZE): Page<T> {
  return { items: [], total: 0, page: 1, size, pages: 1 };
}

export async function queryPage<T>(
  page: number,
  size: number,
  count: () => Promise<number>,
  search: (range: Range) => Promise<T[]>,
): Promise<Page<T>> {
  const requested = Math.max(1, Math.trunc(page) || 1);
  const [total, items] = await Promise.all([count(), search(rangeFor(requested, size))]);
  const pages = pageCount(total, size);
  if (requested <= pages) return { items, total, page: requested, size, pages };
  return {
    items: await search(rangeFor(pages, size)),
    total,
    page: pages,
    size,
    pages,
  };
}

export function sliceItems<T>(
  items: readonly T[],
  page: number,
  size: number = DEFAULT_PAGE_SIZE,
): Page<T> {
  const total = items.length;
  const pages = pageCount(total, size);
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), total, page: current, size, pages };
}
