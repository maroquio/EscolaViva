import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { GradesSaved, TermClosed } from '@escolaviva/contracts/teacher';
import { type ApiError, client, useSubmission } from '../../shared/api';
import { TEACHER_ENDPOINTS, type IsoDay } from './constants';
import { teacherKeys } from './queries';

export type GradePosting = {
  readonly term: number;
  readonly grades: readonly { readonly enrollmentId: string; readonly value: number | null }[];
};

export type RollCallPosting = {
  readonly date: IsoDay;
  readonly rows: readonly {
    readonly enrollmentId: string;
    readonly present: boolean;
    readonly excuse: string | null;
  }[];
};

const refreshWhatTheClosingFreezes = async (
  queries: QueryClient,
  classGroupId: string,
): Promise<void> => {
  await Promise.all([
    queries.invalidateQueries({ queryKey: teacherKeys.closing(classGroupId) }),
    queries.invalidateQueries({ queryKey: teacherKeys.everyGradeGrid }),
  ]);
};

export function usePostGrades(classGroupSubjectId: string) {
  const queries = useQueryClient();
  return useMutation<GradesSaved, ApiError, GradePosting>({
    mutationFn: (posting) =>
      client
        .put<GradesSaved>(TEACHER_ENDPOINTS.grades(classGroupSubjectId), posting)
        .then((response) => response.data),
    onSuccess: (_saved, posting) =>
      queries.invalidateQueries({
        queryKey: teacherKeys.grades(classGroupSubjectId, posting.term),
      }),
  });
}

export function useRecordRollCall(classGroupId: string) {
  const queries = useQueryClient();
  return useMutation<void, ApiError, RollCallPosting>({
    mutationFn: (posting) =>
      client.put(TEACHER_ENDPOINTS.rollCall(classGroupId), posting).then(() => undefined),
    onSuccess: (_nothing, posting) =>
      queries.invalidateQueries({ queryKey: teacherKeys.rollCall(classGroupId, posting.date) }),
  });
}

export function useCloseTerm(classGroupId: string) {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<TermClosed, ApiError, { readonly term: number }>({
    mutationFn: (posting) =>
      client
        .post<TermClosed>(TEACHER_ENDPOINTS.closing(classGroupId), posting, submission.attempt())
        .then((response) => response.data),
    onSuccess: async () => {
      submission.accepted();
      await refreshWhatTheClosingFreezes(queries, classGroupId);
    },
  });
}
