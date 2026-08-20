import { z } from 'zod';
import { ROLES } from '@escolaviva/contracts/enumerations';
import {
  ACADEMIC_YEAR_FIELD,
  NETWORK_MESSAGES,
  ROLE_OFFERED_FIRST,
  SCHOOL_CHOICE,
  SCHOOL_FIELD,
  SENSIBLE_YEARS,
  USER_FIELD,
} from './constants';

const requiredText = (whenMissing: string) => z.string().trim().min(1, whenMissing);

const optionalText = () => z.string().trim();

const chosenOption = (whenNotChosen: string) => z.string().min(1, whenNotChosen);

const NOTHING_TYPED = '';

export const schoolSchema = z.object({
  name: requiredText(NETWORK_MESSAGES.schoolName),
  inepCode: optionalText(),
});

export type SchoolValues = z.infer<typeof schoolSchema>;

export const SCHOOL_FIELDS = Object.values(SCHOOL_FIELD);

export const BLANK_SCHOOL: SchoolValues = { name: NOTHING_TYPED, inepCode: NOTHING_TYPED };

const roleAssignmentSchema = z.object({
  schoolId: chosenOption(NETWORK_MESSAGES.schoolChoice),
  role: z.enum(ROLES, { error: NETWORK_MESSAGES.roleChoice }),
});

export const userSchema = z.object({
  name: requiredText(NETWORK_MESSAGES.name),
  cpf: requiredText(NETWORK_MESSAGES.cpf),
  email: requiredText(NETWORK_MESSAGES.email),
  phone: optionalText(),
  roleAssignments: z
    .array(roleAssignmentSchema)
    .min(1, NETWORK_MESSAGES.atLeastOneAssignment),
});

export type UserValues = z.infer<typeof userSchema>;

export const USER_FIELDS = Object.values(USER_FIELD);

export const BLANK_ROLE_ASSIGNMENT = {
  schoolId: SCHOOL_CHOICE.none,
  role: ROLE_OFFERED_FIRST,
};

export const BLANK_INVITATION: UserValues = {
  name: NOTHING_TYPED,
  cpf: NOTHING_TYPED,
  email: NOTHING_TYPED,
  phone: NOTHING_TYPED,
  roleAssignments: [{ ...BLANK_ROLE_ASSIGNMENT }],
};

export const academicYearSchema = z.object({
  year: z
    .number({ error: NETWORK_MESSAGES.yearMissing })
    .int(NETWORK_MESSAGES.yearMissing)
    .min(SENSIBLE_YEARS.first, NETWORK_MESSAGES.yearIsATypo)
    .max(SENSIBLE_YEARS.last, NETWORK_MESSAGES.yearIsATypo),
  startDate: requiredText(NETWORK_MESSAGES.startDate),
  endDate: requiredText(NETWORK_MESSAGES.endDate),
});

export type AcademicYearValues = z.infer<typeof academicYearSchema>;

export const ACADEMIC_YEAR_FIELDS = Object.values(ACADEMIC_YEAR_FIELD);
