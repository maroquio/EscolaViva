import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES, SCHEMA_FIELD_NAMES } from '../constants';
import { isCoherentPeriod, type AcademicYear } from '../domain/academicYear';
import * as academicYears from '../infra/academicYearRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  year: z
    .number()
    .int(MESSAGES.academicYear.yearNotInteger)
    .min(LIMITS.academicYear.minYear, MESSAGES.academicYear.yearBelowMinimum)
    .max(LIMITS.academicYear.maxYear, MESSAGES.academicYear.yearAboveMaximum),
  startDate: z.string().date(MESSAGES.academicYear.startDateFormat),
  endDate: z.string().date(MESSAGES.academicYear.endDateFormat),
});

export async function defineAcademicYear(input: {
  networkId: string;
  year: number;
  startDate: string;
  endDate: string;
}): Promise<Result<AcademicYear>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues, SCHEMA_FIELD_NAMES.academicYear));
  }

  const { networkId, year, startDate, endDate } = parsed.data;
  if (!isCoherentPeriod(startDate, endDate)) {
    return fieldFailure(
      FIELDS.academicYear.endDate,
      CODES.academicYear.incoherentPeriod,
      MESSAGES.academicYear.incoherentPeriod,
    );
  }

  const academicYear: AcademicYear = {
    id: uuidIdGenerator.next(),
    networkId,
    year,
    startDate,
    endDate,
  };
  const created = await unitOfWork(({ sql }) => academicYears.insert(sql, academicYear));
  if (!created) {
    return fieldFailure(
      FIELDS.academicYear.year,
      CODES.academicYear.duplicate,
      MESSAGES.academicYear.duplicate(year),
    );
  }
  return success(academicYear);
}
