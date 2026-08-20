import { Hono } from 'hono';
import { identity } from '../../identity';
import { CONTEXT_VARIABLES, STATUS } from '../../shared/constants';
import { currentUser, errorBody, requireLogin, type Variables } from '../../shared/http';
import { logger } from '../../shared/log';
import { API_ROUTES } from '../constants';
import { FORM_ERRORS, LOG_EVENTS } from './constants';
import { parse } from '../schemas/parse';
import { changePasswordSchema } from '../schemas/session';

export const accountRoutes = new Hono<{ Variables: Variables }>();

accountRoutes.use(requireLogin());

accountRoutes.put(API_ROUTES.password, async (c) => {
  const user = currentUser(c);

  const input = parse(changePasswordSchema, c.get(CONTEXT_VARIABLES.jsonBody));
  if (!input.ok) return c.json(errorBody(input.errors), STATUS.invalidShape);

  const { currentPassword, newPassword, passwordConfirmation } = input.value;
  if (newPassword !== passwordConfirmation) {
    return c.json(errorBody([FORM_ERRORS.confirmationMismatch]), STATUS.refused);
  }

  const result = await identity.changePassword({
    networkId: user.networkId,
    userId: user.id,
    currentPassword,
    newPassword,
  });
  if (!result.ok) return c.json(errorBody(result.errors), STATUS.refused);

  logger.info({ user_id: user.id }, LOG_EVENTS.passwordChanged);
  return c.body(null, STATUS.noContent);
});
