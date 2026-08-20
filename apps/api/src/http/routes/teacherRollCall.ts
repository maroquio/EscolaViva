import { Hono } from 'hono';
import { academics } from '../../academics';
import { assessment } from '../../assessment';
import { CONTEXT_VARIABLES, STATUS } from '../../shared/constants';
import {
  BusinessRuleViolation,
  currentNetwork,
  errorBody,
  type Variables,
} from '../../shared/http';
import { systemClock } from '../../shared/ports';
import { PARAMS, TEACHER_ROUTES } from '../constants';
import { DIAGNOSTICS } from './constants';
import { rollCallScreenAsJson } from '../presenters/teacher';
import { parse } from '../schemas/parse';
import { rollCallSchema } from '../schemas/teacher';
import { rollCallDateOrNull } from './assessmentValues';
import { TEACHER_PARAMS, taughtClassGroupOr404 } from './teacherSchedule';

const ABSENT_UNLESS_REPORTED = false;

const withoutBlank = (excuse: string | null): string | null => (excuse === '' ? null : excuse);

export const rollCallRoutes = new Hono<{ Variables: Variables }>();

rollCallRoutes.get(TEACHER_ROUTES.rollCall, async (c) => {
  const classGroupId = await taughtClassGroupOr404(c, c.req.param(TEACHER_PARAMS.classGroupId));
  const date = rollCallDateOrNull(c.req.query(PARAMS.date)) ?? systemClock.today();

  const networkId = currentNetwork(c);
  const [enrollments, recorded] = await Promise.all([
    academics.activeEnrollmentsOfClassGroup(networkId, classGroupId),
    assessment.rollCallForDate(networkId, classGroupId, date),
  ]);

  return c.json(rollCallScreenAsJson(date, enrollments, recorded));
});

rollCallRoutes.put(TEACHER_ROUTES.rollCall, async (c) => {
  const classGroupId = await taughtClassGroupOr404(c, c.req.param(TEACHER_PARAMS.classGroupId));

  const input = parse(rollCallSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const date = rollCallDateOrNull(input.value.date);
  if (date === null) throw new BusinessRuleViolation(DIAGNOSTICS.malformedRollCallDate);

  const networkId = currentNetwork(c);
  const enrollments = await academics.activeEnrollmentsOfClassGroup(networkId, classGroupId);
  const reported = new Map(input.value.rows.map((row) => [row.enrollmentId, row]));

  const result = await assessment.recordRollCall({
    networkId,
    classGroupId,
    date,
    rows: enrollments.map((enrollment) => {
      const row = reported.get(enrollment.id);
      return {
        enrollmentId: enrollment.id,
        present: row?.present ?? ABSENT_UNLESS_REPORTED,
        excuse: withoutBlank(row?.excuse ?? null),
      };
    }),
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  return c.body(null, STATUS.noContent);
});
