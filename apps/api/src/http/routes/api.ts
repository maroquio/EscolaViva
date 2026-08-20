import { Hono } from 'hono';
import { config } from '../../shared/config';
import { jsonIdempotencyMiddleware, type Variables } from '../../shared/http';
import { API, API_ROUTES } from '../constants';
import { createCorsMiddleware } from '../cors';
import { secureWriteMiddleware } from '../secureWrite';
import { accountRoutes } from './account';
import { announcementRoutes } from './announcements';
import { guardianRoutes } from './guardian';
import { networkRoutes } from './network';
import { optionsRoutes } from './options';
import { classGroupRoutes } from './registrar/classGroups';
import { studentRoutes } from './registrar/students';
import { sessionRoutes } from './session';
import { teacherRoutes } from './teacher';

type WebApplication = Hono<{ Variables: Variables }>;

export function mountApi(app: WebApplication): void {
  const api = new Hono<{ Variables: Variables }>();

  api.use(createCorsMiddleware(config.allowedOrigins));
  api.use(secureWriteMiddleware);
  api.use(jsonIdempotencyMiddleware);

  api.route(API_ROUTES.session, sessionRoutes);
  api.route(API_ROUTES.account, accountRoutes);
  api.route(API_ROUTES.options, optionsRoutes);
  api.route(API_ROUTES.network, networkRoutes);
  api.route(API_ROUTES.registrar, studentRoutes);
  api.route(API_ROUTES.registrar, classGroupRoutes);
  api.route(API_ROUTES.teacher, teacherRoutes);
  api.route(API_ROUTES.guardian, guardianRoutes);
  api.route(API_ROUTES.announcements, announcementRoutes);

  app.route(API.versionedPrefix, api);
}
