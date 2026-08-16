import { Hono, type Context } from 'hono';
import { identity } from '../../identity';
import { CONTEXT_VARIABLES } from '../../shared/constants';
import { currentUser, requireLogin, type FormBody, type Variables } from '../../shared/http';
import { logger } from '../../shared/log';
import type { ApplicationError } from '../../shared/result';
import {
  FIELDS,
  FORM_ERRORS,
  LOG_EVENTS,
  NOTICES,
  NOTICE_CODES,
  PARAMS,
  ROUTES,
  TEMPLATES,
  TITLES,
} from '../constants';
import { render } from '../render';

const MESSAGES: Record<string, string> = {
  [NOTICE_CODES.passwordChanged]: NOTICES.passwordChanged,
};

export const accountRoutes = new Hono<{ Variables: Variables }>();

accountRoutes.use(requireLogin());

const password = (body: FormBody, field: string): string => {
  const value = body[field];
  return typeof value === 'string' ? value : '';
};

const passwordScreen = (c: Context, errors: ApplicationError[]): Response =>
  render(c, TEMPLATES.account.password, { title: TITLES.changePassword, errors });

accountRoutes.get(ROUTES.account.password.pattern, (c) =>
  render(c, TEMPLATES.account.password, {
    title: TITLES.changePassword,
    errors: [],
    message: MESSAGES[c.req.query(PARAMS.ok) ?? ''],
  }),
);

accountRoutes.post(ROUTES.account.password.pattern, async (c) => {
  const user = currentUser(c);
  const body = c.get(CONTEXT_VARIABLES.body);
  const newPassword = password(body, FIELDS.password.newPassword);

  if (newPassword !== password(body, FIELDS.password.passwordConfirmation)) {
    return passwordScreen(c, [FORM_ERRORS.confirmationMismatch]);
  }

  const result = await identity.changePassword({
    userId: user.id,
    currentPassword: password(body, FIELDS.password.currentPassword),
    newPassword,
  });
  if (!result.ok) return passwordScreen(c, result.erros);

  logger.info({ user_id: user.id }, LOG_EVENTS.passwordChanged);
  return c.redirect(
    `${ROUTES.account.password()}?${PARAMS.ok}=${NOTICE_CODES.passwordChanged}`,
    303,
  );
});
