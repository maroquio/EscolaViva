import { MISSING_VALUE } from './constants';

const ELEVEN_DIGITS = /^[0-9]{11}$/;

const FIRST_DOT_CUT = 3;
const SECOND_DOT_CUT = 6;
const DASH_CUT = 9;

export function formatCpf(digits: string | null | undefined): string {
  if (digits === null || digits === undefined || !ELEVEN_DIGITS.test(digits)) return MISSING_VALUE;

  const firstBlock = digits.slice(0, FIRST_DOT_CUT);
  const secondBlock = digits.slice(FIRST_DOT_CUT, SECOND_DOT_CUT);
  const thirdBlock = digits.slice(SECOND_DOT_CUT, DASH_CUT);
  const checkDigits = digits.slice(DASH_CUT);

  return `${firstBlock}.${secondBlock}.${thirdBlock}-${checkDigits}`;
}
