import { reader } from '../../shared/db';
import type { ClassGroup, TeacherClassGroupSubject } from '../domain/classGroup';
import * as classGroups from '../infra/classGroupRepository';

export function teacherClassGroupSubjects(
  networkId: string,
  teacherUserId: string,
): Promise<TeacherClassGroupSubject[]> {
  return classGroups.teacherSubjects(reader(), networkId, teacherUserId);
}

export function teacherClassGroups(
  networkId: string,
  teacherUserId: string,
): Promise<ClassGroup[]> {
  return classGroups.ofTeacher(reader(), networkId, teacherUserId);
}
