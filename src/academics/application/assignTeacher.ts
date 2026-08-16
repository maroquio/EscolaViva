import { z } from 'zod';
import { identity } from '../../identity/index';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, MESSAGES } from '../constants';
import type { ClassGroupSubject } from '../domain/classGroup';
import * as subjects from '../infra/subjectRepository';
import * as classGroups from '../infra/classGroupRepository';

const schema = z.object({
  networkId: z.string().uuid(),
  classGroupId: z.string().uuid(MESSAGES.teachingAssignment.classGroupRequired),
  subjectId: z.string().uuid(MESSAGES.teachingAssignment.subjectRequired),
  teacherUserId: z.string().uuid(MESSAGES.teachingAssignment.teacherRequired),
});

export async function assignTeacher(input: {
  networkId: string;
  classGroupId: string;
  subjectId: string;
  teacherUserId: string;
}): Promise<Result<ClassGroupSubject>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues));
  }

  const { networkId, classGroupId, subjectId, teacherUserId } = parsed.data;
  return unitOfWork(async ({ sql }): Promise<Result<ClassGroupSubject>> => {
    const classGroup = await classGroups.byId(sql, networkId, classGroupId);
    if (classGroup === null) {
      return fieldFailure(
        FIELDS.teachingAssignment.classGroupId,
        CODES.classGroupNotFound,
        MESSAGES.classGroupNotFound,
      );
    }
    const subject = await subjects.byId(sql, networkId, subjectId);
    if (subject === null) {
      return fieldFailure(
        FIELDS.teachingAssignment.subjectId,
        CODES.subjectNotFound,
        MESSAGES.subjectNotFound,
      );
    }
    const isTeacher = await identity.isTeacherAtSchool(
      networkId,
      teacherUserId,
      classGroup.schoolId,
    );
    if (!isTeacher) {
      return fieldFailure(
        FIELDS.teachingAssignment.teacherUserId,
        CODES.teachingAssignment.withoutTeacherRole,
        MESSAGES.teachingAssignment.withoutTeacherRole,
      );
    }

    const assignment: ClassGroupSubject = {
      id: uuidIdGenerator.next(),
      networkId,
      classGroupId,
      subjectId,
      subjectName: subject.name,
      teacherUserId,
    };
    const created = await classGroups.insertSubject(sql, assignment);
    if (!created) {
      return fieldFailure(
        FIELDS.teachingAssignment.subjectId,
        CODES.teachingAssignment.subjectAlreadyAssigned,
        MESSAGES.teachingAssignment.subjectAlreadyAssigned,
      );
    }
    return success(assignment);
  });
}
