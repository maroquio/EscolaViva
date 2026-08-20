import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PublishedAnnouncement } from '@escolaviva/contracts/announcements';
import { type ApiError, client, useSubmission } from '../../shared/api';
import { guardianKeys } from '../guardian/queries';
import type { Written } from '../network/mutations';
import { ANNOUNCEMENT_ENDPOINTS, SCHOOL_AUDIENCE } from './constants';
import { announcementKeys } from './queries';
import type { AnnouncementValues } from './schemas';

export function usePublishAnnouncement() {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<PublishedAnnouncement>, ApiError, AnnouncementValues>({
    mutationFn: (values) =>
      client
        .post<Written<PublishedAnnouncement>>(
          ANNOUNCEMENT_ENDPOINTS.announcements,
          {
            schoolId: values.schoolId,
            title: values.title,
            body: values.body,
            audience: values.audience,
            recipients: values.audience === SCHOOL_AUDIENCE ? [] : values.recipients,
          },
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: async () => {
      submission.accepted();
      await Promise.all([
        queries.invalidateQueries({ queryKey: announcementKeys.lists }),
        queries.invalidateQueries({ queryKey: guardianKeys.all }),
      ]);
    },
  });
}
