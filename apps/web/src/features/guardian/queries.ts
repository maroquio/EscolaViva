import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  GuardianAnnouncement,
  GuardianAttendance,
  GuardianBoard,
  GuardianDashboard,
  GuardianReportCard,
} from '@escolaviva/contracts/guardian';
import { type ApiError, client, PAGE_PARAMS } from '../../shared/api';
import { GUARDIAN_ENDPOINTS, GUARDIAN_FRESH_FOR_MS, GUARDIAN_QUERY_KEYS } from './constants';

export const guardianKeys = GUARDIAN_QUERY_KEYS;

export function useGuardianDashboard(page: number) {
  return useQuery<GuardianDashboard, ApiError>({
    queryKey: guardianKeys.dashboard(page),
    queryFn: () =>
      client
        .get<GuardianDashboard>(GUARDIAN_ENDPOINTS.dashboard, {
          params: { [PAGE_PARAMS.default]: page },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
    staleTime: GUARDIAN_FRESH_FOR_MS,
  });
}

export function useReportCard(enrollmentId: string) {
  return useQuery<GuardianReportCard, ApiError>({
    queryKey: guardianKeys.reportCard(enrollmentId),
    queryFn: () =>
      client
        .get<GuardianReportCard>(GUARDIAN_ENDPOINTS.reportCard(enrollmentId))
        .then((response) => response.data),
  });
}

export function useAttendance(enrollmentId: string, page: number) {
  return useQuery<GuardianAttendance, ApiError>({
    queryKey: guardianKeys.attendance(enrollmentId, page),
    queryFn: () =>
      client
        .get<GuardianAttendance>(GUARDIAN_ENDPOINTS.attendance(enrollmentId), {
          params: { [PAGE_PARAMS.default]: page },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
  });
}

export function useBoard(unreadPage: number, readPage: number) {
  return useQuery<GuardianBoard, ApiError>({
    queryKey: guardianKeys.board(unreadPage, readPage),
    queryFn: () =>
      client
        .get<GuardianBoard>(GUARDIAN_ENDPOINTS.board, {
          params: {
            [PAGE_PARAMS.unread]: unreadPage,
            [PAGE_PARAMS.read]: readPage,
          },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
    staleTime: GUARDIAN_FRESH_FOR_MS,
  });
}

export function useAnnouncement(announcementId: string) {
  return useQuery<GuardianAnnouncement, ApiError>({
    queryKey: guardianKeys.announcement(announcementId),
    queryFn: () =>
      client
        .get<GuardianAnnouncement>(GUARDIAN_ENDPOINTS.announcement(announcementId))
        .then((response) => response.data),
  });
}
