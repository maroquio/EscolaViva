export type Student = {
  id: string;
  networkId: string;
  name: string;
  birthDate: string;
};

type DateParts = { year: number; month: number; day: number };

const YEAR_START = 0;
const YEAR_END = 4;
const MONTH_START = 5;
const MONTH_END = 7;
const DAY_START = 8;
const DAY_END = 10;

function dateParts(date: string): DateParts {
  return {
    year: Number(date.slice(YEAR_START, YEAR_END)),
    month: Number(date.slice(MONTH_START, MONTH_END)),
    day: Number(date.slice(DAY_START, DAY_END)),
  };
}

export function ageOn(birthDate: string, date: string): number {
  const birth = dateParts(birthDate);
  const reference = dateParts(date);
  const birthdayHasPassed =
    reference.month > birth.month ||
    (reference.month === birth.month && reference.day >= birth.day);
  return reference.year - birth.year - (birthdayHasPassed ? 0 : 1);
}
