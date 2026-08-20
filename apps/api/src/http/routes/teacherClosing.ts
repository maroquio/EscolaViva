import { Hono } from 'hono';
import { assessment } from '../../assessment';
import { CONTEXT_VARIABLES, STATUS } from '../../shared/constants';
import {
  BusinessRuleViolation,
  currentNetwork,
  currentUser,
  errorBody,
  type Variables,
} from '../../shared/http';
import { TEACHER_ROUTES } from '../constants';
import { DIAGNOSTICS } from './constants';
import { closingStateAsJson } from '../presenters/teacher';
import { created } from '../response';
import { parse } from '../schemas/parse';
import { termClosingSchema } from '../schemas/teacher';
import { termOrNull } from './assessmentValues';
import { TEACHER_PARAMS, taughtClassGroupOr404 } from './teacherSchedule';

export const closingRoutes = new Hono<{ Variables: Variables }>();

closingRoutes.get(TEACHER_ROUTES.closing, async (c) => {
  const classGroupId = await taughtClassGroupOr404(c, c.req.param(TEACHER_PARAMS.classGroupId));
  const states = await assessment.closingState(currentNetwork(c), classGroupId);

  return c.json(states.map(closingStateAsJson));
});

closingRoutes.post(TEACHER_ROUTES.closing, async (c) => {
  const classGroupId = await taughtClassGroupOr404(c, c.req.param(TEACHER_PARAMS.classGroupId));

  const input = parse(termClosingSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const term = termOrNull(input.value.term);
  if (term === null) throw new BusinessRuleViolation(DIAGNOSTICS.termOnClosing);

  const result = await assessment.closeTerm({
    networkId: currentNetwork(c),
    classGroupId,
    term,
    closedBy: currentUser(c).id,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  return created(c, c.req.path, { term });
});
