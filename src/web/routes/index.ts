import type { Hono } from 'hono';
import { idempotencyMiddleware, type Variables } from '../../shared/http';
import { ROUTES, WRITE_GROUPS, wildcardOf } from '../constants';
import { announcementRoutes } from './announcements';
import { accountRoutes } from './account';
import { loginRoutes } from './login';
import { teacherRoutes } from './teacher';
import { networkRoutes } from './network';
import { guardianRoutes } from './guardian';
import { registrarRoutes } from './registrar';

export type WebApp = Hono<{ Variables: Variables }>;

export function mountRoutes(app: WebApp): void {
  app.use(ROUTES.public.login.pattern, idempotencyMiddleware);
  for (const prefix of WRITE_GROUPS) {
    app.use(prefix, idempotencyMiddleware);
    app.use(wildcardOf(prefix), idempotencyMiddleware);
  }

  app.route(ROUTES.public.prefix, loginRoutes);
  app.route(ROUTES.account.prefix, accountRoutes);
  app.route(ROUTES.network.prefix, networkRoutes);
  app.route(ROUTES.registrar.prefix, registrarRoutes);
  app.route(ROUTES.teacher.prefix, teacherRoutes);
  app.route(ROUTES.guardian.prefix, guardianRoutes);
  app.route(ROUTES.announcements.prefix, announcementRoutes);
}

export {
  accountRoutes,
  announcementRoutes,
  guardianRoutes,
  loginRoutes,
  networkRoutes,
  registrarRoutes,
  teacherRoutes,
};
