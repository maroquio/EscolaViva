/*
 * The CPF is the credential for signing in, and the arithmetic of the check digits is
 * the only thing separating a typed number from a document.
 *
 * The generator is tested alongside the validator on purpose: they are two sides of the same
 * algorithm, and `isValidCpf(generateCpf(n))` over a range of seeds brings the suite down if
 * either of them is wrong — something a fixed-table test would never catch.
 */

import { describe, expect, test } from 'bun:test';
import { formatCpf, generateCpf, isValidCpf, normalizeCpf } from '../../src/shared/document';

/** A well-worn test CPF: both check digits add up. It belongs to nobody. */
const VALID = '52998224725';
const SEEDS = 500;

describe('normalizeCpf', () => {
  test('strips punctuation, dash and whitespace', () => {
    expect(normalizeCpf(' 529.982.247-25 ')).toBe(VALID);
  });

  test('text with no digit at all becomes an empty string', () => {
    expect(normalizeCpf('sem número')).toBe('');
  });
});

describe('isValidCpf', () => {
  test('accepts a CPF whose two check digits are both right', () => {
    expect(isValidCpf(VALID)).toBe(true);
  });

  test('refuses it when the last digit is wrong', () => {
    expect(isValidCpf('52998224724')).toBe(false);
  });

  test('refuses any length other than eleven', () => {
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('529982247250')).toBe(false);
  });

  test('refuses anything that is not digits alone — normalization comes first', () => {
    expect(isValidCpf('529.982.247-25')).toBe(false);
  });

  /* A repeated sequence satisfies the check-digit arithmetic and still is nobody's CPF. */
  test('refuses a sequence of repeated digits', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
  });
});

describe('formatCpf', () => {
  test('applies the mask', () => {
    expect(formatCpf(VALID)).toBe('529.982.247-25');
  });

  test('an input that is not a CPF gives back the em dash the other screens use', () => {
    expect(formatCpf('')).toBe('—');
  });
});

describe('generateCpf', () => {
  test('the same seed always gives back the same CPF', () => {
    expect(generateCpf(0)).toBe('10000000019');
    expect(generateCpf(0)).toBe(generateCpf(0));
  });

  test('everything the generator emits passes the validator', () => {
    const invalid = Array.from({ length: SEEDS }, (_, i) => generateCpf(i)).filter(
      (cpf) => !isValidCpf(cpf),
    );

    expect(invalid).toEqual([]);
  });

  test('distinct seeds never collide', () => {
    const generated = Array.from({ length: SEEDS }, (_, i) => generateCpf(i));

    expect(new Set(generated).size).toBe(SEEDS);
  });
});
