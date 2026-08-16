import { LIMITS } from '../constants';

export type Grade = {
  enrollmentId: string;
  classGroupSubjectId: string;
  term: number;
  value: number;
};

export const TERMS: readonly number[] = [1, 2, 3, 4];

export const TERM_COUNT = TERMS.length;

export function isValidTerm(term: number): boolean {
  return Number.isInteger(term) && term >= 1 && term <= TERM_COUNT;
}

export function isValidGradeValue(value: number): boolean {
  return Number.isFinite(value) && value >= LIMITS.grade.minimum && value <= LIMITS.grade.maximum;
}
