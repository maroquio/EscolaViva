import { z } from 'zod';
import { config } from '../../shared/config';
import { reader, unitOfWork } from '../../shared/db';
import { normalizeCpf } from '../../shared/document';
import { logger } from '../../shared/log';
import { systemClock, uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, LOG_EVENTS, MESSAGES, SCHEMA_FIELD_NAMES, SECURITY } from '../constants';
import { isNetworkActive } from '../domain/network';
import { sessionExpiration, type Session } from '../domain/session';
import { toAuthenticatedUser, type AuthenticatedUser } from '../domain/user';
import * as networkRepository from '../infra/networkRepository';
import * as sessionRepository from '../infra/sessionRepository';
import * as userRepository from '../infra/userRepository';

const schema = z.object({
  networkSlug: z.string().trim().min(1, MESSAGES.login.networkRequired),
  loginIdentifier: z.string().trim().min(1, MESSAGES.login.cpfRequired),
  password: z.string().min(1, MESSAGES.login.passwordRequired),
  ip: z.string(),
});

const INVALID_CREDENTIALS = {
  code: CODES.invalidCredentials,
  message: MESSAGES.login.invalidCredentials,
};

async function createSession(networkId: string, userId: string, ip: string): Promise<Session> {
  const now = systemClock.now();
  const session: Session = {
    id: uuidIdGenerator.next(),
    networkId,
    userId,
    createdAt: now,
    expiresAt: sessionExpiration(now, config.sessionDurationHours),
    ip: ip === '' ? null : ip,
  };
  await unitOfWork(async ({ sql }) => {
    await sessionRepository.insert(sql, session);
  });
  return session;
}

export async function authenticate(input: {
  networkSlug: string;
  loginIdentifier: string;
  password: string;
  ip: string;
}): Promise<Result<{ sessionId: string; user: AuthenticatedUser }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(...schemaErrors(parsed.error.issues, SCHEMA_FIELD_NAMES.login));
  const data = parsed.data;

  const sql = reader();
  const network = await networkRepository.bySlug(sql, data.networkSlug);
  if (network === null || !isNetworkActive(network)) {
    return fieldFailure(
      FIELDS.login.networkSlug,
      CODES.networkUnavailable,
      MESSAGES.login.networkUnavailable,
    );
  }

  const credentials = await userRepository.credentialsByCpf(
    sql,
    network.id,
    normalizeCpf(data.loginIdentifier),
  );
  const passwordMatches = await Bun.password.verify(
    data.password,
    credentials?.passwordHash ?? SECURITY.nonexistentUserHash,
  );
  if (credentials === null || !passwordMatches) {
    logger.warn({ network_id: network.id }, LOG_EVENTS.authenticationRejected);
    return failure(INVALID_CREDENTIALS);
  }

  const roles = await userRepository.userRoles(sql, network.id, credentials.user.id);
  const session = await createSession(network.id, credentials.user.id, data.ip);
  logger.info({ network_id: network.id, user_id: session.userId }, LOG_EVENTS.sessionOpened);
  return success({
    sessionId: session.id,
    user: toAuthenticatedUser(credentials.user, network, roles),
  });
}
