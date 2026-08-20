import { Hono } from 'hono';
import { ROLE } from '../../identity';
import { requireRole, type Variables } from '../../shared/http';
import { ROOT_PATH } from '../constants';
import { closingRoutes } from './teacherClosing';
import { gradeRoutes } from './teacherGrades';
import { rollCallRoutes } from './teacherRollCall';
import { scheduleRoutes } from './teacherSchedule';

export const teacherRoutes = new Hono<{ Variables: Variables }>();

teacherRoutes.use(requireRole(ROLE.teacher));

teacherRoutes.route(ROOT_PATH, scheduleRoutes);
teacherRoutes.route(ROOT_PATH, gradeRoutes);
teacherRoutes.route(ROOT_PATH, rollCallRoutes);
teacherRoutes.route(ROOT_PATH, closingRoutes);
