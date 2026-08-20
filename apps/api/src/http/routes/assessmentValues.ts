import { ASSESSMENT_LIMITS, NOON_UTC, TERMS } from '../../assessment';
import { FORMATS, ISO_DATE_LENGTH } from '../../shared/constants';

export const termOrNull = (value: number): number | null => (TERMS.includes(value) ? value : null);

export const termFromQuery = (raw: string | undefined): number | null => termOrNull(Number(raw));

export const gradeWithinScale = (value: number | null | undefined): boolean =>
  value === undefined ||
  value === null ||
  (Number.isFinite(value) &&
    value >= ASSESSMENT_LIMITS.grade.minimum &&
    value <= ASSESSMENT_LIMITS.grade.maximum);

export const rollCallDateOrNull = (raw: string | undefined): string | null => {
  if (raw === undefined || !FORMATS.isoDate.test(raw)) return null;
  const converted = new Date(`${raw}${NOON_UTC}`);
  if (Number.isNaN(converted.getTime())) return null;
  return converted.toISOString().slice(0, ISO_DATE_LENGTH) === raw ? raw : null;
};
