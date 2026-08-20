import { describe, expect, test } from 'vitest';
import { ROLES } from '@escolaviva/contracts/enumerations';
import { NETWORK_QUERY_KEYS, ROLE_LABELS } from '../../../src/features/network/constants';

const isPrefixOf = (prefix: readonly unknown[], key: readonly unknown[]): boolean =>
  prefix.every((segment, position) => key[position] === segment);

describe('the query keys', () => {
  test('carry the page number, so two pages of one list are two entries in the cache', () => {
    expect(NETWORK_QUERY_KEYS.schoolsPage(1)).not.toEqual(NETWORK_QUERY_KEYS.schoolsPage(2));
  });

  test('let one write invalidate every page of the list it changed', () => {
    expect(isPrefixOf(NETWORK_QUERY_KEYS.schoolsList, NETWORK_QUERY_KEYS.schoolsPage(7))).toBe(true);
  });

  test('and no more than that, so creating a school does not refetch the users list or the counters', () => {
    expect(isPrefixOf(NETWORK_QUERY_KEYS.schoolsList, NETWORK_QUERY_KEYS.usersPage(1))).toBe(false);
    expect(isPrefixOf(NETWORK_QUERY_KEYS.schoolsList, NETWORK_QUERY_KEYS.dashboard)).toBe(false);
  });
});

describe('the role labels', () => {
  test('cover every role, so no screen ever shows a person the word network_admin', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
    expect(Object.keys(ROLE_LABELS)).toHaveLength(ROLES.length);
  });
});
