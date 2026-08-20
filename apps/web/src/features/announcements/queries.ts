import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AnnouncementBoard } from '@escolaviva/contracts/announcements';
import type { SimpleOption } from '@escolaviva/contracts/shared';
import { type ApiError, client, PAGE_PARAMS } from '../../shared/api';
import { ANNOUNCEMENT_ENDPOINTS, NO_SCHOOL, SCHOOL_PARAM } from './constants';

const LISTS_KEY = ['announcements', 'list'] as const;
const RECIPIENTS_KEY = ['announcements', 'recipients'] as const;

export const announcementKeys = {
  lists: LISTS_KEY,
  list: (schoolId: string, page: number) => [...LISTS_KEY, schoolId, page] as const,
  recipients: (schoolId: string) => [...RECIPIENTS_KEY, schoolId] as const,
};

export function useAnnouncements(schoolId: string, page: number) {
  return useQuery<AnnouncementBoard, ApiError>({
    queryKey: announcementKeys.list(schoolId, page),
    queryFn: () =>
      client
        .get<AnnouncementBoard>(ANNOUNCEMENT_ENDPOINTS.announcements, {
          params: {
            ...(schoolId === NO_SCHOOL ? {} : { [SCHOOL_PARAM]: schoolId }),
            [PAGE_PARAMS.default]: page,
          },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
  });
}

export function useRecipients(schoolId: string) {
  return useQuery<readonly SimpleOption[], ApiError>({
    queryKey: announcementKeys.recipients(schoolId),
    queryFn: () =>
      client
        .get<readonly SimpleOption[]>(ANNOUNCEMENT_ENDPOINTS.recipients, {
          params: { [SCHOOL_PARAM]: schoolId },
        })
        .then((response) => response.data),
    enabled: schoolId !== NO_SCHOOL,
  });
}
