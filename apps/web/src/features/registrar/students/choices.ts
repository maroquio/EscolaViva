import type { Shift } from '@escolaviva/contracts/enumerations';
import type { AcademicYearOption } from '@escolaviva/contracts/options';
import type { SimpleOption } from '@escolaviva/contracts/shared';
import { SHIFT_LABELS } from '../../../shared/labels/constants';

export type Choice = { readonly value: string; readonly label: string };

type ClassGroupWorthTellingApart = {
  readonly id: string;
  readonly name: string;
  readonly shift: Shift;
  readonly schoolName: string;
};

const NOTHING_CHOSEN = '';

export const withPlaceholder = (placeholder: string, choices: readonly Choice[]): Choice[] => [
  { value: NOTHING_CHOSEN, label: placeholder },
  ...choices,
];

export const nameWithShiftAndSchool = (classGroup: ClassGroupWorthTellingApart): string =>
  `${classGroup.name} · ${SHIFT_LABELS[classGroup.shift]} · ${classGroup.schoolName}`;

export const classGroupChoices = (classGroups: readonly ClassGroupWorthTellingApart[]): Choice[] =>
  classGroups.map((classGroup) => ({
    value: classGroup.id,
    label: nameWithShiftAndSchool(classGroup),
  }));

export const academicYearChoices = (years: readonly AcademicYearOption[]): Choice[] =>
  years.map((year) => ({ value: year.id, label: String(year.year) }));

export const guardianChoices = (guardians: readonly SimpleOption[]): Choice[] =>
  guardians.map((guardian) => ({ value: guardian.id, label: guardian.name }));
