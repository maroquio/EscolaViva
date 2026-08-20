import { generatePath } from 'react-router';
import { REGISTRAR_ROUTES } from '../../../constants';

export const studentRecordAddress = (studentId: string): string =>
  generatePath(REGISTRAR_ROUTES.student, { id: studentId });

export const enrollAddress = (studentId: string): string =>
  generatePath(REGISTRAR_ROUTES.enroll, { id: studentId });

export const guardianLinkAddress = (studentId: string): string =>
  generatePath(REGISTRAR_ROUTES.newStudentGuardian, { id: studentId });

export const transferAddress = (enrollmentId: string): string =>
  generatePath(REGISTRAR_ROUTES.enrollmentTransfer, { id: enrollmentId });
