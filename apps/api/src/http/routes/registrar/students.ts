import { Hono } from 'hono';
import { ROLE } from '../../../identity';
import { requireRole, type Variables } from '../../../shared/http';
import { ROOT_PATH } from '../../constants';
import { dashboardRoutes } from './dashboard';
import { enrollmentRoutes } from './enrollments';
import { registrarGuardianRoutes } from './guardians';
import { studentRecordRoutes } from './studentRecords';

export const studentRoutes = new Hono<{ Variables: Variables }>();

studentRoutes.use(requireRole(ROLE.registrar));

studentRoutes.route(ROOT_PATH, dashboardRoutes);
studentRoutes.route(ROOT_PATH, studentRecordRoutes);
studentRoutes.route(ROOT_PATH, registrarGuardianRoutes);
studentRoutes.route(ROOT_PATH, enrollmentRoutes);
