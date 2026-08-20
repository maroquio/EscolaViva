import { describe, expect, test } from 'vitest';
import { asGrade, asTyped } from '../../../src/features/teacher/grade';

describe('asGrade', () => {
  test('a comma and a dot produce the same number', () => {
    expect(asGrade('7,5')).toBe(7.5);
    expect(asGrade('7.5')).toBe(7.5);
  });

  test('a whole number is a whole number', () => {
    expect(asGrade('8')).toBe(8);
    expect(asGrade('0')).toBe(0);
    expect(asGrade('10')).toBe(10);
  });

  test('a blank field is a real intention: it clears the grade', () => {
    expect(asGrade('')).toBeNull();
    expect(asGrade('   ')).toBeNull();
  });

  test('a value out of the scale is unreadable, and never a blank that erases the grade', () => {
    expect(asGrade('11')).toBeUndefined();
    expect(asGrade('-1')).toBeUndefined();
    expect(asGrade('10,1')).toBeUndefined();
    expect(asGrade('77')).toBeUndefined();
  });

  test('so is anything that is not a number at all', () => {
    expect(asGrade('abc')).toBeUndefined();
    expect(asGrade('7,5,3')).toBeUndefined();
    expect(asGrade('-')).toBeUndefined();
  });

  test('an empty field never becomes a zero, though Number of nothing is zero', () => {
    expect(asGrade('')).not.toBe(0);
    expect(asGrade(' ')).not.toBe(0);
  });

  test('the ends of the scale are inside it', () => {
    expect(asGrade('0')).toBe(0);
    expect(asGrade('10')).toBe(10);
    expect(asGrade('10,0')).toBe(10);
  });
});

describe('asTyped', () => {
  test('a stored grade appears with the separator this country writes', () => {
    expect(asTyped(7.5)).toBe('7,5');
    expect(asTyped(8)).toBe('8');
  });

  test('and an absent grade appears as an empty field', () => {
    expect(asTyped(null)).toBe('');
  });

  test('so does the value the form is holding as typed and invalid', () => {
    expect(asTyped(undefined)).toBe('');
  });

  test('what it shows is what asGrade reads back, or editing one cell would rewrite the others', () => {
    for (const value of [0, 7, 7.5, 9.25, 10]) {
      expect(asGrade(asTyped(value))).toBe(value);
    }
    expect(asGrade(asTyped(null))).toBeNull();
  });
});
