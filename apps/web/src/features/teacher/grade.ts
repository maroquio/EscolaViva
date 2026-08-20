export type ClearedGrade = null;

export type UnreadableGrade = undefined;

export type GradeAsTyped = number | ClearedGrade | UnreadableGrade;

export type GradeAsPosted = number | ClearedGrade;

const CLEARED: ClearedGrade = null;
const UNREADABLE: UnreadableGrade = undefined;

const LOWEST_GRADE = 0;
const HIGHEST_GRADE = 10;

const DECIMAL_COMMA = ',';
const DECIMAL_DOT = '.';
const NOTHING_TYPED = '';

export const isGradeInsideTheScale = (grade: number): boolean =>
  Number.isFinite(grade) && grade >= LOWEST_GRADE && grade <= HIGHEST_GRADE;

export const asGrade = (typed: string): GradeAsTyped => {
  if (typed.trim() === NOTHING_TYPED) return CLEARED;
  const grade = Number(typed.replace(DECIMAL_COMMA, DECIMAL_DOT));
  return isGradeInsideTheScale(grade) ? grade : UNREADABLE;
};

export const asTyped = (grade: GradeAsTyped): string =>
  grade === CLEARED || grade === UNREADABLE
    ? NOTHING_TYPED
    : String(grade).replace(DECIMAL_DOT, DECIMAL_COMMA);
