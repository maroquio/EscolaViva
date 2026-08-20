import { Hono, type Context } from 'hono';
import { academics } from '../../academics';
import { NotFound, currentNetwork, currentUser, type Variables } from '../../shared/http';
import { TEACHER_ROUTES } from '../constants';
import { DIAGNOSTICS } from './constants';
import type { Params } from '../routeParams';
import { teacherClassGroupsAsJson, type TeacherAssignment } from '../presenters/teacher';

type TeacherContext = Context<{ Variables: Variables }>;

export const TEACHER_PARAMS = {
  classGroupSubjectId: 'classGroupSubjectId',
  classGroupId: 'classGroupId',
} as const satisfies Params<
  | typeof TEACHER_ROUTES.grades
  | typeof TEACHER_ROUTES.rollCall
  | typeof TEACHER_ROUTES.closing
>;

const teacherAssignments = (c: TeacherContext): Promise<TeacherAssignment[]> =>
  academics.teacherClassGroupSubjects(currentNetwork(c), currentUser(c).id);

export async function assignmentOr404(
  c: TeacherContext,
  classGroupSubjectId: string,
): Promise<TeacherAssignment> {
  const assignments = await teacherAssignments(c);
  const assignment = assignments.find((candidate) => candidate.id === classGroupSubjectId);
  if (assignment === undefined) throw new NotFound(DIAGNOSTICS.subjectOutsideSchedule);
  return assignment;
}

export async function taughtClassGroupOr404(
  c: TeacherContext,
  classGroupId: string,
): Promise<string> {
  const assignments = await teacherAssignments(c);
  const taught = assignments.some((candidate) => candidate.classGroupId === classGroupId);
  if (!taught) throw new NotFound(DIAGNOSTICS.classGroupOutsideSchedule);
  return classGroupId;
}

export const scheduleRoutes = new Hono<{ Variables: Variables }>();

scheduleRoutes.get(TEACHER_ROUTES.classGroups, async (c) =>
  c.json(teacherClassGroupsAsJson(await teacherAssignments(c))),
);
