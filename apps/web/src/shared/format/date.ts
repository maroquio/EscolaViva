import { MISSING_VALUE } from './constants';

export type DateValue = string | Date | null | undefined;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const TWO_DIGIT_WIDTH = 2;
const DIGIT_PAD = '0';

const twoDigits = (value: number): string => String(value).padStart(TWO_DIGIT_WIDTH, DIGIT_PAD);

const monthAsPeopleNumberIt = (date: Date): number => date.getMonth() + 1;

const asDate = (value: DateValue): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayMonthYear = (date: Date): string =>
  `${twoDigits(date.getDate())}/${twoDigits(monthAsPeopleNumberIt(date))}/${date.getFullYear()}`;

const isoRewrittenWithoutEverBecomingADate = (value: DateValue): string | null => {
  if (typeof value !== 'string') return null;
  const [, year, month, day] = ISO_DATE.exec(value) ?? [];
  if (year === undefined || month === undefined || day === undefined) return null;
  return `${day}/${month}/${year}`;
};

export function formatDate(value: DateValue): string {
  const written = isoRewrittenWithoutEverBecomingADate(value);
  if (written !== null) return written;

  const date = asDate(value);
  return date === null ? MISSING_VALUE : dayMonthYear(date);
}

export function formatDateTime(value: DateValue): string {
  const date = asDate(value);
  if (date === null) return MISSING_VALUE;
  return `${dayMonthYear(date)} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}
