/*
 * The `communication` domain with no database: what counts as a title and a body, what counts as
 * published, and the read rate — the measurement that lifts "nobody reads the board" out of the
 * realm of opinion, and which therefore must never hand `NaN` to the screen.
 */

import { describe, expect, test } from 'bun:test';
import {
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  isPublished,
  isValidBody,
  isValidTitle,
  withAuthor,
} from '../../src/communication/domain/announcement';
import { readRate } from '../../src/communication/domain/recipient';

describe('readRate', () => {
  test('gives back 0 with no recipient, instead of dividing by zero', () => {
    const rate = readRate(0, 0);

    expect(rate).toBe(0);
    expect(Number.isNaN(rate)).toBe(false);
  });

  test('gives back the fraction of recipients who read it', () => {
    const rate = readRate(10, 3);

    expect(rate).toBe(0.3);
  });

  test('gives back 0 when the announcement was delivered and nobody opened it', () => {
    const rate = readRate(120, 0);

    expect(rate).toBe(0);
  });

  test('gives back 1 when every recipient read it', () => {
    const rate = readRate(7, 7);

    expect(rate).toBe(1);
  });

  test('never goes past 1, even on an inconsistent count', () => {
    const rate = readRate(4, 9);

    expect(rate).toBe(1);
  });

  test('never goes negative, even on an inconsistent count', () => {
    const rate = readRate(4, -2);

    expect(rate).toBe(0);
  });
});

describe('isValidTitle', () => {
  test('accepts an ordinary title', () => {
    const valid = isValidTitle('Reunião de pais na quinta-feira');

    expect(valid).toBe(true);
  });

  test('refuses a title that is empty or made only of spaces', () => {
    const rejected = ['', '   ', '\n\t'].map(isValidTitle);

    expect(rejected).toEqual([false, false, false]);
  });

  test('accepts a title at the maximum length and refuses one character past it', () => {
    const atTheLimit = isValidTitle('t'.repeat(MAX_TITLE_LENGTH));
    const above = isValidTitle('t'.repeat(MAX_TITLE_LENGTH + 1));

    expect(atTheLimit).toBe(true);
    expect(above).toBe(false);
  });

  test('measures the title with the surrounding spaces already gone', () => {
    const valid = isValidTitle(`  ${'t'.repeat(MAX_TITLE_LENGTH)}  `);

    expect(valid).toBe(true);
  });
});

describe('isValidBody', () => {
  test('accepts an ordinary body', () => {
    const valid = isValidBody('A reunião começa às 19h no auditório.');

    expect(valid).toBe(true);
  });

  test('refuses a body that is empty or made only of spaces', () => {
    const rejected = ['', '    '].map(isValidBody);

    expect(rejected).toEqual([false, false]);
  });

  test('accepts a body at the maximum length and refuses one character past it', () => {
    const atTheLimit = isValidBody('c'.repeat(MAX_BODY_LENGTH));
    const above = isValidBody('c'.repeat(MAX_BODY_LENGTH + 1));

    expect(atTheLimit).toBe(true);
    expect(above).toBe(false);
  });
});

describe('isPublished', () => {
  test('an announcement with no publication date is not published', () => {
    const published = isPublished({ publishedAt: null });

    expect(published).toBe(false);
  });

  test('an announcement carrying a publication date is published', () => {
    const published = isPublished({ publishedAt: '2026-05-10T12:00:00.000Z' });

    expect(published).toBe(true);
  });
});

describe('withAuthor', () => {
  test('swaps the author id for the name without letting the id leak outside the module', () => {
    const stored = {
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Reunião de pais',
      body: 'A reunião começa às 19h.',
      authorUserId: 'usuario-1',
      publishedAt: '2026-05-10T12:00:00.000Z',
    };

    const announcement = withAuthor(stored, 'Ana Prado');

    expect(announcement).toEqual({
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Reunião de pais',
      body: 'A reunião começa às 19h.',
      authorName: 'Ana Prado',
      publishedAt: '2026-05-10T12:00:00.000Z',
    });
    expect(Object.keys(announcement)).not.toContain('authorUserId');
  });

  test('does not alter the stored announcement it was handed', () => {
    const stored = {
      id: 'c1',
      networkId: 'r1',
      schoolId: 'u1',
      title: 'Aviso',
      body: 'Corpo do aviso.',
      authorUserId: 'usuario-1',
      publishedAt: null,
    };

    withAuthor(stored, 'Ana Prado');

    expect(stored.authorUserId).toBe('usuario-1');
    expect(Object.keys(stored)).not.toContain('authorName');
  });
});
