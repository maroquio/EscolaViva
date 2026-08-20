import { describe, expect, test } from 'vitest';
import { formatDate, formatDateTime } from '../../../src/shared/format/date';

describe('a date', () => {
  test('an ISO date becomes a Brazilian date read by its parts, never handed to new Date, which reads it as UTC midnight and prints the day before for anyone west of Greenwich — a birth date that moves by one day is a bug nobody notices until a parent does', () => {
    expect(formatDate('2026-03-15')).toBe('15/03/2026');
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
  });

  test('a timestamp keeps the day it carries', () => {
    expect(formatDate('2026-03-15T23:30:00')).toBe('15/03/2026');
  });

  test('what is not a date is an em dash, not today', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('não é data')).toBe('—');
  });
});

describe('a date with time', () => {
  test('carries the hour and the minute, both padded', () => {
    expect(formatDateTime(new Date(2026, 2, 5, 9, 7))).toBe('05/03/2026 09:07');
  });

  test('an absent value is an em dash', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});
