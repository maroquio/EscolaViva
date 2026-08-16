import { z } from 'zod';

import { academics } from '../../academics';
import { identity } from '../../identity';
import { unitOfWork } from '../../shared/db';
import { uuidIdGenerator } from '../../shared/ports';
import { failure, fieldFailure, schemaErrors, success, type Result } from '../../shared/result';
import { CODES, FIELDS, MESSAGES, SCHEMA_FIELD_NAMES } from '../constants';
import {
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  isValidBody,
  isValidTitle,
  withAuthor,
  type Announcement,
  type StoredAnnouncement,
} from '../domain/announcement';
import { insertPublished, insertRecipients } from '../infra/announcementRepository';

export type AnnouncementInput = {
  networkId: string;
  schoolId: string;
  title: string;
  body: string;
  authorUserId: string;
  recipients: { guardianId: string }[];
};

const schema = z.object({
  networkId: z.string().uuid(),
  schoolId: z.string().uuid(),
  title: z.string().trim(),
  body: z.string().trim(),
  authorUserId: z.string().uuid(),
  recipients: z.array(z.object({ guardianId: z.string().uuid() })),
});

type ValidatedData = z.infer<typeof schema>;

function checkText(data: ValidatedData): Result<void> {
  if (!isValidTitle(data.title)) {
    return fieldFailure(FIELDS.title, CODES.invalidTitle, MESSAGES.invalidTitle(MAX_TITLE_LENGTH));
  }
  if (!isValidBody(data.body)) {
    return fieldFailure(FIELDS.body, CODES.invalidBody, MESSAGES.invalidBody(MAX_BODY_LENGTH));
  }
  return success<void>(undefined);
}

async function targetGuardians(data: ValidatedData): Promise<string[]> {
  if (data.recipients.length > 0) {
    return [...new Set(data.recipients.map((recipient) => recipient.guardianId))];
  }
  const ofSchool = await academics.schoolGuardians(data.networkId, data.schoolId);
  return ofSchool.map((guardian) => guardian.id);
}

async function save(
  data: ValidatedData,
  guardianIds: readonly string[],
): Promise<StoredAnnouncement> {
  return await unitOfWork(async ({ sql }) => {
    const announcement = await insertPublished(sql, {
      id: uuidIdGenerator.next(),
      networkId: data.networkId,
      schoolId: data.schoolId,
      title: data.title,
      body: data.body,
      authorUserId: data.authorUserId,
    });
    await insertRecipients(sql, {
      networkId: data.networkId,
      announcementId: announcement.id,
      guardianIds,
    });
    return announcement;
  });
}

export async function publishAnnouncement(
  input: AnnouncementInput,
): Promise<Result<Announcement>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return failure(...schemaErrors(parsed.error.issues, SCHEMA_FIELD_NAMES.announcement));
  }

  const data = parsed.data;
  const text = checkText(data);
  if (!text.ok) return failure(...text.erros);

  const [school, names] = await Promise.all([
    identity.schoolById(data.networkId, data.schoolId),
    identity.userNames(data.networkId, [data.authorUserId]),
  ]);
  if (school === null) {
    return fieldFailure(FIELDS.schoolId, CODES.unknownSchool, MESSAGES.unknownSchool);
  }
  const authorName = names.get(data.authorUserId);
  if (authorName === undefined) {
    return fieldFailure(FIELDS.authorUserId, CODES.unknownAuthor, MESSAGES.unknownAuthor);
  }

  const guardianIds = await targetGuardians(data);
  if (guardianIds.length === 0) {
    return fieldFailure(FIELDS.recipients, CODES.noRecipients, MESSAGES.noRecipients);
  }

  return success(withAuthor(await save(data, guardianIds), authorName));
}
