import { z } from 'zod';
import { unitOfWork } from '../../shared/db';
import { isValidCpf, normalizeCpf } from '../../shared/document';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import {
  CODES,
  FIELDS,
  LIMITS,
  MESSAGES,
  ROLE,
  ROLE_ASSIGNMENT_SEPARATOR,
  SECURITY,
} from '../constants';
import { ROLES, type Role } from '../domain/role';
import { normalizedEmail, type User } from '../domain/user';
import * as schoolRepository from '../infra/schoolRepository';
import * as userRepository from '../infra/userRepository';

const schema = z.object({
  networkId: z.string().uuid(MESSAGES.user.invalidNetwork),
  name: z
    .string()
    .trim()
    .min(1, MESSAGES.user.nameRequired)
    .max(LIMITS.user.name, MESSAGES.user.nameTooLong),
  email: z.string().trim().min(1, MESSAGES.user.emailRequired).email(
    MESSAGES.user.invalidEmail,
  ),
  cpf: z
    .string()
    .trim()
    .transform(normalizeCpf)
    .refine(isValidCpf, MESSAGES.user.invalidCpf),
  registeredCpf: z.string().nullable().optional(),
  registeredName: z.string().optional(),
  roleAssignments: z
    .array(
      z.object({
        schoolId: z.string().uuid(MESSAGES.user.invalidSchool),
        role: z.enum(ROLES, {
          errorMap: () => ({ message: MESSAGES.user.unknownRole }),
        }),
      }),
    )
    .min(1, MESSAGES.user.noRoleAssignment),
  guardianId: z.string().uuid(MESSAGES.user.invalidGuardian).nullable().optional(),
});

function temporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SECURITY.temporaryPasswordLength));
  return Array.from(bytes, (byte) =>
    SECURITY.unambiguousAlphabet.charAt(byte % SECURITY.unambiguousAlphabet.length),
  ).join('');
}

type RoleAssignment = { schoolId: string; role: Role };

function distinctRoleAssignments(roleAssignments: RoleAssignment[]): RoleAssignment[] {
  const byKey = new Map<string, RoleAssignment>();
  for (const roleAssignment of roleAssignments) {
    byKey.set(
      `${roleAssignment.schoolId}${ROLE_ASSIGNMENT_SEPARATOR}${roleAssignment.role}`,
      roleAssignment,
    );
  }
  return [...byKey.values()];
}

type AcceptedInvitation = { userId: string; temporaryPassword: string };

type Invitation = {
  user: User;
  passwordHash: string;
  temporaryPassword: string;
  roleAssignments: RoleAssignment[];
};

async function save(invitation: Invitation): Promise<Result<AcceptedInvitation>> {
  const { user, roleAssignments } = invitation;
  return await unitOfWork(async ({ sql }) => {
    const requestedSchools = roleAssignments.map((roleAssignment) => roleAssignment.schoolId);
    const networkSchools = await schoolRepository.idsInNetwork(
      sql,
      user.networkId,
      requestedSchools,
    );
    if (requestedSchools.some((id) => !networkSchools.has(id))) {
      return fieldFailure(
        FIELDS.user.roleAssignments,
        CODES.schoolFromAnotherNetwork,
        MESSAGES.user.schoolFromAnotherNetwork,
      );
    }
    if (await userRepository.emailExists(sql, user.networkId, user.email)) {
      return fieldFailure(FIELDS.user.email, CODES.emailInUse, MESSAGES.user.emailInUse);
    }
    if (await userRepository.cpfExists(sql, user.networkId, user.cpf)) {
      return fieldFailure(FIELDS.user.cpf, CODES.cpfInUse, MESSAGES.user.cpfInUse);
    }

    await userRepository.insert(sql, user, invitation.passwordHash);
    await userRepository.insertRoles(sql, user.networkId, user.id, roleAssignments);
    return success({ userId: user.id, temporaryPassword: invitation.temporaryPassword });
  });
}

export async function inviteUser(input: {
  networkId: string;
  name: string;
  email: string;
  cpf: string;
  registeredCpf?: string | null;
  registeredName?: string;
  roleAssignments: RoleAssignment[];
  guardianId?: string | null | undefined;
}): Promise<Result<AcceptedInvitation>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(...schemaErrors(parsed.error.issues));
  const data = parsed.data;

  const roleAssignments = distinctRoleAssignments(data.roleAssignments);
  const guardianId = data.guardianId ?? null;
  const entersAsGuardian = roleAssignments.some(({ role }) => role === ROLE.guardian);
  if (entersAsGuardian && guardianId === null) {
    return fieldFailure(
      FIELDS.user.guardianId,
      CODES.guardianRequired,
      MESSAGES.user.guardianRequired,
    );
  }

  const registeredCpf = data.registeredCpf ?? null;
  if (registeredCpf !== null && registeredCpf !== data.cpf) {
    return fieldFailure(
      FIELDS.user.cpf,
      CODES.cpfMismatch,
      MESSAGES.user.cpfMismatch(data.registeredName ?? MESSAGES.user.guardianLabel),
    );
  }

  const password = temporaryPassword();
  const passwordHash = await Bun.password.hash(password);
  const user: User = {
    id: uuidIdGenerator.next(),
    networkId: data.networkId,
    name: data.name,
    email: normalizedEmail(data.email),
    cpf: data.cpf,
    active: true,
    guardianId,
  };

  return await save({ user, passwordHash, temporaryPassword: password, roleAssignments });
}
