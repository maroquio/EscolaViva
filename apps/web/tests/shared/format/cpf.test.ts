import { describe, expect, test } from 'vitest';
import { formatCpf } from '../../../src/shared/format/cpf';

describe('a CPF', () => {
  test('comes out punctuated', () => {
    expect(formatCpf('12345678909')).toBe('123.456.789-09');
    expect(formatCpf('00000000191')).toBe('000.000.001-91');
  });

  test('what is not eleven digits is refused, never padded or trimmed into shape, because a half-formatted CPF on screen reads as a real one', () => {
    expect(formatCpf('123')).toBe('—');
    expect(formatCpf('123456789012')).toBe('—');
    expect(formatCpf('123.456.789-09')).toBe('—');
    expect(formatCpf('abcdefghijk')).toBe('—');
    expect(formatCpf('')).toBe('—');
  });

  test('one with impossible check digits is still punctuated, because validity is the server answer', () => {
    expect(formatCpf('11111111111')).toBe('111.111.111-11');
  });

  test('an absent CPF is an em dash', () => {
    expect(formatCpf(null)).toBe('—');
    expect(formatCpf(undefined)).toBe('—');
  });
});
