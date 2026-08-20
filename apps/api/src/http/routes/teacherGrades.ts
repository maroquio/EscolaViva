import { Hono } from 'hono';
import { academics } from '../../academics';
import { ASSESSMENT_LIMITS, assessment } from '../../assessment';
import { CONTEXT_VARIABLES, STATUS } from '../../shared/constants';
import {
  BusinessRuleViolation,
  currentNetwork,
  currentUser,
  errorBody,
  type Variables,
} from '../../shared/http';
import type { ApplicationError } from '../../shared/result';
import { PARAMS, TEACHER_ROUTES } from '../constants';
import { DIAGNOSTICS, FORM_ERRORS, GRADE_OUT_OF_RANGE } from './constants';
import { gradesScreenAsJson } from '../presenters/teacher';
import { parse } from '../schemas/parse';
import { gradesSchema } from '../schemas/teacher';
import { gradeWithinScale, termFromQuery, termOrNull } from './assessmentValues';
import { TEACHER_PARAMS, assignmentOr404 } from './teacherSchedule';

const DEFAULT_TERM = 1;

const OUT_OF_SCALE = GRADE_OUT_OF_RANGE(
  ASSESSMENT_LIMITS.grade.minimum,
  ASSESSMENT_LIMITS.grade.maximum,
);

const gradeOutOfScale = (enrollmentId: string): ApplicationError => ({
  ...FORM_ERRORS.invalidGrade,
  field: enrollmentId,
  message: OUT_OF_SCALE,
});

export const gradeRoutes = new Hono<{ Variables: Variables }>();

gradeRoutes.get(TEACHER_ROUTES.grades, async (c) => {
  const assignment = await assignmentOr404(c, c.req.param(TEACHER_PARAMS.classGroupSubjectId));
  const term = termFromQuery(c.req.query(PARAMS.term)) ?? DEFAULT_TERM;

  const networkId = currentNetwork(c);
  const [enrollments, grades, closingStates] = await Promise.all([
    academics.activeEnrollmentsOfClassGroup(networkId, assignment.classGroupId),
    assessment.classGroupSubjectGrades(networkId, assignment.id, term),
    assessment.closingState(networkId, assignment.classGroupId),
  ]);

  return c.json(gradesScreenAsJson(assignment, term, closingStates, enrollments, grades));
});

gradeRoutes.put(TEACHER_ROUTES.grades, async (c) => {
  const assignment = await assignmentOr404(c, c.req.param(TEACHER_PARAMS.classGroupSubjectId));

  const input = parse(gradesSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const term = termOrNull(input.value.term);
  if (term === null) throw new BusinessRuleViolation(DIAGNOSTICS.termOnPosting);

  const networkId = currentNetwork(c);
  const enrollments = await academics.activeEnrollmentsOfClassGroup(
    networkId,
    assignment.classGroupId,
  );
  const reported = new Map(input.value.grades.map((row) => [row.enrollmentId, row.value]));

  const outOfScale = enrollments
    .filter((enrollment) => !gradeWithinScale(reported.get(enrollment.id)))
    .map((enrollment) => gradeOutOfScale(enrollment.id));
  if (outOfScale.length > 0) return c.json(errorBody(outOfScale), STATUS.refused);

  const result = await assessment.postGrades({
    networkId,
    classGroupSubjectId: assignment.id,
    term,
    postedBy: currentUser(c).id,
    grades: enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      value: reported.get(enrollment.id) ?? null,
    })),
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  return c.json({ saved: result.value });
});
