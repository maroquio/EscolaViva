import { MISSING_VALUE } from './constants';

export type NumericValue = number | string | null | undefined;

export type PercentageValue = NumericValue;

export type FractionValue = NumericValue;

const DECIMAL_SEPARATOR = ',';
const TO_FIXED_SEPARATOR = '.';
const ONE_DECIMAL_FACTOR = 10;
const PERCENT_FACTOR = 100;
const PERCENT_SUFFIX = ' %';

const asNumber = (value: NumericValue): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const oneDecimalTruncatedNeverRounded = (value: number): string => {
  const tenths = Math.trunc(value * ONE_DECIMAL_FACTOR);
  return (tenths / ONE_DECIMAL_FACTOR).toFixed(1).replace(TO_FIXED_SEPARATOR, DECIMAL_SEPARATOR);
};

export function formatGrade(value: NumericValue): string {
  const grade = asNumber(value);
  return grade === null ? MISSING_VALUE : oneDecimalTruncatedNeverRounded(grade);
}

export function formatPercent(value: PercentageValue): string {
  const percentage = asNumber(value);
  if (percentage === null) return MISSING_VALUE;
  return `${oneDecimalTruncatedNeverRounded(percentage)}${PERCENT_SUFFIX}`;
}

export function formatRate(fraction: FractionValue): string {
  const rate = asNumber(fraction);
  return rate === null ? MISSING_VALUE : formatPercent(rate * PERCENT_FACTOR);
}
