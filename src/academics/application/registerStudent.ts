import { z } from 'zod';
import { ISO_DATE_LENGTH } from '../../shared/constants';
import { unitOfWork } from '../../shared/db';
import { systemClock, uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LIMITS, MESSAGES } from '../constants';
import { ageOn, type Student } from '../domain/student';
import * as students from '../infra/studentRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, MESSAGES.student.nameRequired)
    .max(LIMITS.student.name, MESSAGES.student.nameTooLong),
  birthDate: z.string().date(MESSAGES.student.birthDateFormat),
});

const today = (): string => systemClock.now().toISOString().slice(0, ISO_DATE_LENGTH);

export async function registerStudent(input: {
  networkId: string;
  name: string;
  birthDate: string;
}): Promise<Result<Student>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }

  if (ageOn(parsed.data.birthDate, today()) < 0) {
    return fieldFailure(
      FIELDS.student.birthDate,
      CODES.student.dateInFuture,
      MESSAGES.student.dateInFuture,
    );
  }

  const student: Student = { id: uuidIdGenerator.next(), ...parsed.data };
  await unitOfWork(({ sql }) => students.insert(sql, student));
  return success(student);
}
