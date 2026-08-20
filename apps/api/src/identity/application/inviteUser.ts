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
  ROLE_ASSIGNMENT_SEPARATOR,
  SECURITY,
} from '../constants';
import { ROLES, type Role } from '../domain/role';
import { normalizedEmail, type User } from '../domain/user';
import * as schoolRepository from '../infra/schoolRepository';
import * as userRepository from '../infra/userRepository';
import * as userRoleAssignments from '../infra/userRoleAssignments';

const schema = z.object({
  networkId: z.string().uuid(MESSAGES.user.invalidNetwork),
  name: z
    .string()
    .trim()
    .min(1, MESSAGES.user.nameRequired)
    .max(LIMITS.user.name, MESSAGES.user.nameTooLong),
  email: z
    .string()
    .trim()
    .min(1, MESSAGES.user.emailRequired)
    .email(MESSAGES.user.invalidEmail)
    .max(LIMITS.user.email, MESSAGES.user.emailTooLong),
  cpf: z
    .string()
    .trim()
    .transform(normalizeCpf)
    .refine(isValidCpf, MESSAGES.user.invalidCpf),
  phone: z
    .string()
    .trim()
    .max(LIMITS.user.phone, MESSAGES.user.phoneTooLong)
    .nullish()
    .transform((value) => (value === undefined || value === '' ? null : value)),
  roleAssignments: z
    .array(
      z.object({
        schoolId: z.string().uuid(MESSAGES.user.invalidSchool),
        role: z.enum(ROLES, { error: MESSAGES.user.unknownRole }),
      }),
    )
    .min(1, MESSAGES.user.noRoleAssignment),
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
    const admitted = await userRepository.insertUnlessCpfTaken(
      sql,
      user,
      invitation.passwordHash,
    );
    if (!admitted) {
      return fieldFailure(FIELDS.user.cpf, CODES.cpfInUse, MESSAGES.user.cpfInUse);
    }

    await userRoleAssignments.insertRoles(sql, user.networkId, user.id, roleAssignments);
    return success({ userId: user.id, temporaryPassword: invitation.temporaryPassword });
  });
}

export async function inviteUser(input: {
  networkId: string;
  name: string;
  email: string;
  cpf: string;
  phone?: string | null;
  roleAssignments: RoleAssignment[];
}): Promise<Result<AcceptedInvitation>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failure(...schemaErrors(parsed.error.issues));
  const data = parsed.data;

  const roleAssignments = distinctRoleAssignments(data.roleAssignments);

  const password = temporaryPassword();
  const passwordHash = await Bun.password.hash(password);
  const user: User = {
    id: uuidIdGenerator.next(),
    networkId: data.networkId,
    name: data.name,
    email: normalizedEmail(data.email),
    cpf: data.cpf,
    phone: data.phone,
    active: true,
  };

  return await save({ user, passwordHash, temporaryPassword: password, roleAssignments });
}
