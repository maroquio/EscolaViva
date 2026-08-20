import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { type ApiError, client, useSubmission } from '../../../shared/api';
import type { Written } from '../../network/mutations';
import { CLASS_GROUPS_ENDPOINT, SUBJECTS_ENDPOINT, classGroupSubjectsEndpoint } from './constants';
import { classGroupKeys } from './queries';
import type { AssignmentValues, ClassGroupValues, SubjectValues } from './schemas';

type Created = { readonly id: string };

const refreshEveryFilteredClassGroupList = (queries: QueryClient): Promise<void> =>
  queries.invalidateQueries({ queryKey: classGroupKeys.lists });

const refreshSubjectsWhereverTheyAppear = async (queries: QueryClient): Promise<void> => {
  await Promise.all([
    queries.invalidateQueries({ queryKey: classGroupKeys.subjectLists }),
    queries.invalidateQueries({ queryKey: classGroupKeys.subjectOptions }),
  ]);
};

export function useRegisterClassGroup() {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<Created>, ApiError, ClassGroupValues>({
    mutationFn: (values) =>
      client
        .post<Written<Created>>(CLASS_GROUPS_ENDPOINT, values, submission.attempt())
        .then((response) => response.data),
    onSuccess: () => {
      submission.accepted();
      return refreshEveryFilteredClassGroupList(queries);
    },
  });
}

export function useAssignTeacher(classGroupId: string) {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<Created>, ApiError, AssignmentValues>({
    mutationFn: (values) =>
      client
        .post<Written<Created>>(
          classGroupSubjectsEndpoint(classGroupId),
          values,
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: () => {
      submission.accepted();
      return queries.invalidateQueries({ queryKey: classGroupKeys.recordsOf(classGroupId) });
    },
  });
}

export function useRegisterSubject() {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<Created>, ApiError, SubjectValues>({
    mutationFn: (values) =>
      client
        .post<Written<Created>>(SUBJECTS_ENDPOINT, values, submission.attempt())
        .then((response) => response.data),
    onSuccess: () => {
      submission.accepted();
      return refreshSubjectsWhereverTheyAppear(queries);
    },
  });
}
