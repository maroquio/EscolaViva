/*
 * The ruler that cuts the slice, with no database in the middle.
 *
 * Two things are proven here. The first: a page number arriving from outside never produces a
 * strange query — text, zero, a negative and a fraction all become the first page, not a negative
 * OFFSET. The second: the order of the queries — count and slice leave together, and the second
 * search happens only when the requested page ran past the end.
 */

import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE,
  emptyPage,
  pageCount,
  queryPage,
  rangeFor,
  rangeParams,
  requestedPage,
  sliceItems,
  type Range,
} from '../../src/shared/pagination';

describe('requestedPage', () => {
  test('absence becomes the first page', () => {
    expect(requestedPage(undefined)).toBe(1);
    expect(requestedPage(null)).toBe(1);
  });

  test('text that is not a number becomes the first page', () => {
    expect(requestedPage('duas')).toBe(1);
    expect(requestedPage('3; DROP TABLE aluno')).toBe(1);
  });

  test('zero and a negative become the first page', () => {
    expect(requestedPage('0')).toBe(1);
    expect(requestedPage('-7')).toBe(1);
  });

  test('a fraction is truncated', () => {
    expect(requestedPage('2.9')).toBe(2);
  });

  test('a valid number passes through untouched', () => {
    expect(requestedPage('42')).toBe(42);
  });
});

describe('rangeFor', () => {
  test('the first page offsets nothing', () => {
    expect(rangeFor(1, 20)).toEqual({ limit: 20, offset: 0 });
  });

  test('the offset is the page size times the pages before it', () => {
    expect(rangeFor(4, 25)).toEqual({ limit: 25, offset: 75 });
  });

  test('a page below one never produces a negative offset', () => {
    expect(rangeFor(-3, 20).offset).toBe(0);
  });
});

describe('rangeParams', () => {
  test('an absent range becomes NULL in both fields — SQL reads that as an absent clause', () => {
    expect(rangeParams(undefined)).toEqual({ limit: null, offset: null });
  });

  test('a range that is there passes the numbers along', () => {
    expect(rangeParams({ limit: 20, offset: 40 })).toEqual({ limit: 20, offset: 40 });
  });
});

describe('pageCount', () => {
  test('an empty list still has one page', () => {
    expect(pageCount(0, 20)).toBe(1);
  });

  test('the remainder takes up a whole page', () => {
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(40, 20)).toBe(2);
    expect(pageCount(41, 20)).toBe(3);
  });
});

describe('emptyPage', () => {
  test('describes a list with nothing in it, not a list with no shape', () => {
    expect(emptyPage<string>(20)).toEqual({
      items: [], total: 0, page: 1, size: 20, pages: 1,
    });
  });
});

describe('sliceItems', () => {
  const ten = Array.from({ length: 10 }, (_, i) => i + 1);

  test('gives back the slice of the requested page', () => {
    expect(sliceItems(ten, 2, 4).items).toEqual([5, 6, 7, 8]);
  });

  test('the last page brings whatever was left over', () => {
    const last = sliceItems(ten, 3, 4);
    expect(last.items).toEqual([9, 10]);
    expect(last.pages).toBe(3);
  });

  test('a page past the end is clamped to the last one, instead of giving back an empty list', () => {
    const beyond = sliceItems(ten, 99, 4);
    expect(beyond.page).toBe(3);
    expect(beyond.items).toEqual([9, 10]);
  });

  test('the total belongs to the whole list, not to the page', () => {
    expect(sliceItems(ten, 1, 4).total).toBe(10);
  });
});

describe('queryPage', () => {
  /** Records the ranges asked for: that is how many searches happened, and with what, gets proven. */
  const spy = (items: readonly number[]) => {
    const requested: Range[] = [];
    const search = async (range: Range): Promise<number[]> => {
      requested.push(range);
      return items.slice(range.offset, range.offset + range.limit);
    };
    return { requested, search };
  };

  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);

  test('gives back the slice carrying the total of the whole list', async () => {
    const { search } = spy(hundred);

    const page = await queryPage(2, 20, async () => 100, search);

    expect(page.items).toEqual(hundred.slice(20, 40));
    expect(page).toMatchObject({ total: 100, page: 2, size: 20, pages: 5 });
  });

  test('a page that exists is served with a single search', async () => {
    const { requested, search } = spy(hundred);

    await queryPage(3, 20, async () => 100, search);

    expect(requested).toEqual([{ limit: 20, offset: 40 }]);
  });

  test('a page past the end serves the last one, instead of an empty screen', async () => {
    const { requested, search } = spy(hundred);

    const page = await queryPage(99, 20, async () => 100, search);

    expect(page.page).toBe(5);
    expect(page.items).toEqual(hundred.slice(80, 100));
    // The second search is the price of a hand-typed URL, and it happens only in that case.
    expect(requested).toHaveLength(2);
  });

  test('an empty list gives back the first page, with no items', async () => {
    const { search } = spy([]);

    const page = await queryPage(1, 20, async () => 0, search);

    expect(page).toEqual({ items: [], total: 0, page: 1, size: 20, pages: 1 });
  });
});

/*
 * A number in the address bar is external input, and `(p - 1) * size` is what reaches the database
 * as `OFFSET ${offset}::int`. Past roughly 214 million the product leaves the range of `int4` and
 * PostgreSQL answers `integer out of range`, which the edge has no case for: it becomes a 500 and
 * an error line with a stack, for a listing that should simply have shown its last page.
 *
 * The clamp inside `queryPage` could not save it, because the search with the oversized offset and
 * the count run in the same `Promise.all` — the query is already in flight when the clamp is
 * computed. So the ceiling belongs where the number comes in, and it is asserted here for both
 * doors: the one the URL uses and the one `queryPage` receives.
 */
describe('a page number is bounded before it reaches SQL', () => {
  const BEYOND_INT4 = 300_000_000;

  test('requestedPage never returns a page whose offset would leave int4', () => {
    const page = requestedPage(String(BEYOND_INT4));

    expect(page).toBe(MAX_PAGE);
    expect((page - 1) * DEFAULT_PAGE_SIZE).toBeLessThan(2_147_483_647);
  });

  test('the ceiling does not disturb the pages anybody actually asks for', () => {
    expect(requestedPage('1')).toBe(1);
    expect(requestedPage('37')).toBe(37);
    expect(requestedPage(String(MAX_PAGE))).toBe(MAX_PAGE);
  });

  test('queryPage clamps on its own, for callers that do not come from a URL', async () => {
    const rows = ['a', 'b', 'c'];
    const seen: number[] = [];

    const page = await queryPage(
      BEYOND_INT4,
      DEFAULT_PAGE_SIZE,
      async () => rows.length,
      async (range) => {
        seen.push(range.offset);
        return rows;
      },
    );

    expect(Math.max(...seen)).toBeLessThan(2_147_483_647);
    expect(page.page).toBe(1);
  });
});
