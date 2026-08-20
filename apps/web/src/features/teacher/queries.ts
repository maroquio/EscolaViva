import { useQuery } from '@tanstack/react-query';
import type {
  ClosingState,
  GradesScreen,
  RollCallScreen,
  TeacherClassGroup,
} from '@escolaviva/contracts/teacher';
import { ApiError, client, isNotFound } from '../../shared/api';
import {
  DAY_PARAM,
  NO_DAY_IN_THE_ADDRESS,
  TEACHER_ENDPOINTS,
  TEACHER_QUERY_KEYS,
  TERM_PARAM,
  type IsoDay,
} from './constants';

export const teacherKeys = TEACHER_QUERY_KEYS;

export const isNotYours = isNotFound;

const SERVER_CHOOSES_TODAY = {};

const dayParams = (day: IsoDay): Record<string, string> =>
  day === NO_DAY_IN_THE_ADDRESS ? SERVER_CHOOSES_TODAY : { [DAY_PARAM]: day };

export function useTeacherClassGroups() {
  return useQuery<readonly TeacherClassGroup[], ApiError>({
    queryKey: teacherKeys.classGroups,
    queryFn: () =>
      client
        .get<readonly TeacherClassGroup[]>(TEACHER_ENDPOINTS.classGroups)
        .then((response) => response.data),
  });
}

export function useGrades(classGroupSubjectId: string, term: number) {
  return useQuery<GradesScreen, ApiError>({
    queryKey: teacherKeys.grades(classGroupSubjectId, term),
    queryFn: () =>
      client
        .get<GradesScreen>(TEACHER_ENDPOINTS.grades(classGroupSubjectId), {
          params: { [TERM_PARAM]: term },
        })
        .then((response) => response.data),
  });
}

export function useRollCall(classGroupId: string, day: IsoDay) {
  return useQuery<RollCallScreen, ApiError>({
    queryKey: teacherKeys.rollCall(classGroupId, day),
    queryFn: () =>
      client
        .get<RollCallScreen>(TEACHER_ENDPOINTS.rollCall(classGroupId), { params: dayParams(day) })
        .then((response) => response.data),
  });
}

export function useClosingState(classGroupId: string) {
  return useQuery<readonly ClosingState[], ApiError>({
    queryKey: teacherKeys.closing(classGroupId),
    queryFn: () =>
      client
        .get<readonly ClosingState[]>(TEACHER_ENDPOINTS.closing(classGroupId))
        .then((response) => response.data),
  });
}
