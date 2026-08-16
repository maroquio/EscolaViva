import { z } from 'zod';
import { identity } from '../../identity/index';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES } from '../constants';
import { isValidShift, type ClassGroup } from '../domain/classGroup';
import * as academicYears from '../infra/academicYearRepository';
import * as classGroups from '../infra/classGroupRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  schoolId: z.string().uuid(MESSAGES.classGroup.schoolRequired),
  academicYearId: z.string().uuid(MESSAGES.academicYearRequired),
  name: z
    .string()
    .trim()
    .min(1, MESSAGES.classGroup.nameRequired)
    .max(LIMITS.classGroup.name, MESSAGES.classGroup.nameTooLong),
  gradeLevel: z
    .string()
    .trim()
    .min(1, MESSAGES.classGroup.gradeLevelRequired)
    .max(LIMITS.classGroup.gradeLevel, MESSAGES.classGroup.gradeLevelTooLong),
  shift: z.string().trim().refine(isValidShift, MESSAGES.classGroup.invalidShift),
});

export async function registerClassGroup(input: {
  networkId: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  gradeLevel: string;
  shift: string;
}): Promise<Result<ClassGroup>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }

  const { networkId, schoolId, academicYearId } = parsed.data;
  return unitOfWork(async ({ sql }): Promise<Result<ClassGroup>> => {
    const school = await identity.schoolById(networkId, schoolId);
    if (school === null) {
      return fieldFailure(
        FIELDS.classGroup.schoolId,
        CODES.classGroup.schoolNotFound,
        MESSAGES.classGroup.schoolNotFound,
      );
    }
    const academicYear = await academicYears.byId(sql, networkId, academicYearId);
    if (academicYear === null) {
      return fieldFailure(
        FIELDS.classGroup.academicYearId,
        CODES.academicYearNotFound,
        MESSAGES.academicYearNotFound,
      );
    }

    const classGroup: ClassGroup = { id: uuidIdGenerator.next(), ...parsed.data };
    const created = await classGroups.insert(sql, classGroup);
    if (!created) {
      return fieldFailure(
        FIELDS.classGroup.name,
        CODES.classGroup.duplicate,
        MESSAGES.classGroup.duplicate,
      );
    }
    return success(classGroup);
  });
}
