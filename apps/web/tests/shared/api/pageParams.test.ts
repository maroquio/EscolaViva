import { describe, expect, test } from 'vitest';
import { PAGE_PARAMS, pageQuery, requestedPage } from '../../../src/shared/api/pageParams';

describe('requestedPage — the server rule ported character for character, and invisible until it breaks', () => {
  test('reads a number', () => {
    expect(requestedPage('3')).toBe(3);
  });

  test('anything that is not a number is page one, and never a throw, because the number arrives from the address bar where a person is free to type anything and rangeFor turns it into an SQL OFFSET', () => {
    expect(requestedPage('banana')).toBe(1);
    expect(requestedPage(undefined)).toBe(1);
    expect(requestedPage(null)).toBe(1);
    expect(requestedPage('')).toBe(1);
  });

  test('below one is raised to one, and a fraction is truncated', () => {
    expect(requestedPage('0')).toBe(1);
    expect(requestedPage('-7')).toBe(1);
    expect(requestedPage('2.9')).toBe(2);
  });
});

describe('pageQuery — the two quiet contracts of a page number, both ported from the server and both invisible until they break: page one is the absence of the parameter, and a page turn preserves every filter', () => {
  test('page one deletes the parameter instead of setting it to 1, or /students?q=ana and /students?q=ana&p=1 would be two addresses for one screen: two bookmarks, two history entries, two cache keys', () => {
    expect(pageQuery(new URLSearchParams('q=ana&p=4'), 'p', 1)).toBe('?q=ana');
  });

  test('and deletes the whole query string when nothing else is there', () => {
    expect(pageQuery(new URLSearchParams('p=4'), 'p', 1)).toBe('');
  });

  test('a page turn preserves every other parameter', () => {
    expect(pageQuery(new URLSearchParams('q=ana&school=x'), 'p', 3)).toBe('?q=ana&school=x&p=3');
  });

  test('one cursor moves without touching the other, because three screens run two at once — a student guardians and enrollments, a class group subjects and enrollments, the board unread and read — and advancing one may not move the other', () => {
    const both = new URLSearchParams(`${PAGE_PARAMS.guardians}=2&${PAGE_PARAMS.enrollments}=5`);

    const moved = pageQuery(both, PAGE_PARAMS.guardians, 3);

    expect(moved).toContain(`${PAGE_PARAMS.guardians}=3`);
    expect(moved).toContain(`${PAGE_PARAMS.enrollments}=5`);
  });

  test('and the six names are the ones the server reads', () => {
    expect(Object.values(PAGE_PARAMS)).toEqual([
      'p',
      'pGuardians',
      'pEnrollments',
      'pSubjects',
      'pUnread',
      'pRead',
    ]);
  });
});
