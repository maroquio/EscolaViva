/*
 * The contracts folder is the only server code the front imports, and a browser bundler loads it.
 * That is why it has zero imports — and the price of that isolation is that its closed sets are
 * restated rather than imported.
 *
 * This file is what makes the duplication safe. The dependency rule is exactly what stops the
 * compiler from ever seeing a contract and its domain counterpart at once, so nothing else can
 * notice when the two drift apart. Add a shift to `academics` and forget it here, and the front
 * builds a select missing an option, with no error anywhere.
 */

import { describe, expect, test } from 'bun:test';
import { SHIFTS as DOMAIN_SHIFTS, ENROLLMENT_STATUSES as DOMAIN_STATUSES } from '../../src/academics';
import { TERMS as DOMAIN_TERMS } from '../../src/assessment';
import { ROLES as DOMAIN_ROLES } from '../../src/identity';
import {
  ENROLLMENT_STATUSES,
  ROLES,
  SHIFTS,
  TERMS,
} from '@escolaviva/contracts/enumerations';
import { pageAsJson } from '../../src/http/presenters/page';

describe('the restated sets still equal the ones the database accepts', () => {
  test('the shifts match, in the same order', () => {
    expect([...SHIFTS]).toEqual([...DOMAIN_SHIFTS]);
  });

  test('the roles match, in the same order', () => {
    expect([...ROLES]).toEqual([...DOMAIN_ROLES]);
  });

  /*
   * The domain types `TERMS` as `readonly number[]` while the contract narrows it to the four
   * literals, so the comparison is widened here rather than narrowed there: the front needs the
   * literal union to type a term parameter, and the domain has no reason to.
   */
  test('the terms match, in the same order', () => {
    const restated: number[] = [...TERMS];

    expect(restated).toEqual([...DOMAIN_TERMS]);
  });

  test('the enrollment statuses match, in the same order', () => {
    expect([...ENROLLMENT_STATUSES]).toEqual([...DOMAIN_STATUSES]);
  });

  /*
   * Order is asserted above and not merely membership, because the front builds selects by iterating
   * these. A set that matches out of order would pass a membership check and reorder every dropdown.
   */
  test('none of them is empty, so an equality above cannot pass on two empty lists', () => {
    const sets = [SHIFTS, ROLES, TERMS, ENROLLMENT_STATUSES];

    expect(sets.every((set) => set.length > 0)).toBe(true);
  });
});

describe('the page presenter is the single translation of a domain page', () => {
  test('it carries the counters across and maps each item', () => {
    const domainPage = {
      items: [{ id: 'a' }, { id: 'b' }],
      total: 12,
      page: 2,
      size: 5,
      pages: 3,
    };

    const json = pageAsJson(domainPage, (item) => item.id);

    expect(json).toEqual({ items: ['a', 'b'], total: 12, page: 2, size: 5, pages: 3 });
  });

  test('an empty page keeps its counters instead of collapsing to nothing', () => {
    const domainPage = { items: [], total: 0, page: 1, size: 20, pages: 0 };

    const json = pageAsJson(domainPage, (item: never) => item);

    expect(json).toEqual({ items: [], total: 0, page: 1, size: 20, pages: 0 });
  });
});
