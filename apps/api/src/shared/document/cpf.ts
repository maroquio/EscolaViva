import { MISSING_VALUE } from '../constants';

const ONLY_DIGITS = /^[0-9]{11}$/;
const ALL_EQUAL = /^(\d)\1{10}$/;
const NON_DIGIT = /\D/g;

export const normalizeCpf = (raw: string): string => raw.replace(NON_DIGIT, '');

const FIRST_INITIAL_WEIGHT = 10;
const SECOND_INITIAL_WEIGHT = 11;

const SUM_FACTOR = 10;
const CHECK_DIGIT_MODULUS = 11;
const REMAINDER_AS_ZERO = 10;

const BASE_DIGITS = 9;

const checkDigit = (digits: string, initialWeight: number): number => {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    sum += Number(digits[index]) * (initialWeight - index);
  }
  const remainder = (sum * SUM_FACTOR) % CHECK_DIGIT_MODULUS;
  return remainder === REMAINDER_AS_ZERO ? 0 : remainder;
};

const withCheckDigits = (base: string): string => {
  const first = checkDigit(base, FIRST_INITIAL_WEIGHT);
  const second = checkDigit(`${base}${first}`, SECOND_INITIAL_WEIGHT);
  return `${base}${first}${second}`;
};

export function isValidCpf(digits: string): boolean {
  if (!ONLY_DIGITS.test(digits)) return false;
  if (ALL_EQUAL.test(digits)) return false;
  return digits === withCheckDigits(digits.slice(0, BASE_DIGITS));
}

const FIRST_DOT_CUT = 3;
const SECOND_DOT_CUT = 6;
const DASH_CUT = 9;

export function formatCpf(digits: string): string {
  if (!ONLY_DIGITS.test(digits)) return MISSING_VALUE;
  const [a, b, c, d] = [
    digits.slice(0, FIRST_DOT_CUT),
    digits.slice(FIRST_DOT_CUT, SECOND_DOT_CUT),
    digits.slice(SECOND_DOT_CUT, DASH_CUT),
    digits.slice(DASH_CUT),
  ];
  return `${a}.${b}.${c}-${d}`;
}

const BASE_PREFIX = '10';
const SEED_DIGITS = 7;
const SEED_RANGE = 10 ** SEED_DIGITS;
const SEED_PADDING = '0';

export function generateCpf(seed: number): string {
  const remainder = String(Math.abs(Math.trunc(seed)) % SEED_RANGE).padStart(
    SEED_DIGITS,
    SEED_PADDING,
  );
  return withCheckDigits(`${BASE_PREFIX}${remainder}`);
}
