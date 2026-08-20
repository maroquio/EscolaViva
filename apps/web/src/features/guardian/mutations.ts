import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ApiError, client, useSubmission } from '../../shared/api';
import { GUARDIAN_ENDPOINTS } from './constants';
import { guardianKeys } from './queries';

export function useMarkAsRead(announcementId: string) {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<void, ApiError, void>({
    mutationFn: () =>
      client
        .post(GUARDIAN_ENDPOINTS.markAsRead(announcementId), undefined, submission.attempt())
        .then(() => undefined),
    onSuccess: async () => {
      submission.accepted();
      await Promise.all([
        queries.invalidateQueries({ queryKey: guardianKeys.boards }),
        queries.invalidateQueries({ queryKey: guardianKeys.dashboards }),
        queries.invalidateQueries({ queryKey: guardianKeys.announcement(announcementId) }),
      ]);
    },
  });
}
