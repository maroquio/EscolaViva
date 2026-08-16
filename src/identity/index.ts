import { authenticate } from './application/authenticate';
import {
  countSchoolsAndUsers,
  isTeacherAtSchool,
  listSchools,
  listUsers,
  networkBySlug,
  schoolById,
  schoolTeachers,
  schoolsPage,
  userContacts,
  userNames,
  usersPage,
  validSession,
} from './application/queries';
import { inviteUser } from './application/inviteUser';
import { createSchool } from './application/createSchool';
import { endSession } from './application/endSession';
import { purgeExpiredSessions } from './application/purgeSessions';
import { changePassword } from './application/changePassword';

export type { Role, RoleInSchool } from './domain/role';
export type { School } from './domain/school';
export type { AuthenticatedUser, UserContact, UserSummary } from './domain/user';

export const identity = {
  authenticate,
  validSession,
  endSession,
  purgeExpiredSessions,
  changePassword,
  inviteUser,
  createSchool,
  listSchools,
  schoolsPage,
  schoolById,
  listUsers,
  usersPage,
  countSchoolsAndUsers,
  networkBySlug,
  isTeacherAtSchool,
  schoolTeachers,
  userNames,
  userContacts,
};

export {
  ACTIVE_NETWORK_STATUS,
  FIELDS as IDENTITY_FIELDS,
  LIMITS as IDENTITY_LIMITS,
  LOG_EVENTS as IDENTITY_LOG_EVENTS,
  ROLE,
  SESSION_PURGE,
  VOCABULARY as IDENTITY_VOCABULARY,
} from './constants';

export { ROLES } from './domain/role';
export { NETWORK_STATUSES } from './domain/network';
export { MINIMUM_PASSWORD_LENGTH } from './domain/user';
