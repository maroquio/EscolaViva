import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { AcceptedInvitation, CreatedResource } from '@escolaviva/contracts/network';
import { type ApiError, client, useSubmission } from '../../shared/api';
import { NETWORK_API, NETWORK_QUERY_KEYS, REPEATED_MARK } from './constants';
import type { AcademicYearValues, SchoolValues, UserValues } from './schemas';

export type Repeated = { readonly repeated: true; readonly location: string };

export type Written<T> = T | Repeated;

export const wasRepeated = <T>(written: Written<T>): written is Repeated =>
  typeof written === 'object' && written !== null && REPEATED_MARK in written;

const refetchTheListAndTheCounters = async (
  queries: QueryClient,
  list: QueryKey,
): Promise<void> => {
  await Promise.all([
    queries.invalidateQueries({ queryKey: list }),
    queries.invalidateQueries({ queryKey: NETWORK_QUERY_KEYS.dashboard }),
  ]);
};

const refetchTheFormsThatPickASchool = (queries: QueryClient): Promise<void> =>
  queries.invalidateQueries({ queryKey: NETWORK_QUERY_KEYS.schoolOptions });

export function useCreateSchool() {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<CreatedResource>, ApiError, SchoolValues>({
    mutationFn: (values) =>
      client
        .post<Written<CreatedResource>>(
          NETWORK_API.schools,
          {
            name: values.name,
            inepCode: values.inepCode === '' ? null : values.inepCode,
          },
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: async () => {
      submission.accepted();
      await Promise.all([
        refetchTheListAndTheCounters(queries, NETWORK_QUERY_KEYS.schoolsList),
        refetchTheFormsThatPickASchool(queries),
      ]);
    },
  });
}

export function useInviteUser() {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<AcceptedInvitation>, ApiError, UserValues>({
    mutationFn: (values) =>
      client
        .post<Written<AcceptedInvitation>>(
          NETWORK_API.users,
          {
            name: values.name,
            email: values.email,
            cpf: values.cpf,
            phone: values.phone === '' ? null : values.phone,
            roleAssignments: values.roleAssignments,
          },
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: () => {
      submission.accepted();
      return refetchTheListAndTheCounters(queries, NETWORK_QUERY_KEYS.usersList);
    },
  });
}

export function useDefineAcademicYear() {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<CreatedResource>, ApiError, AcademicYearValues>({
    mutationFn: (values) =>
      client
        .post<Written<CreatedResource>>(
          NETWORK_API.academicYears,
          {
            year: values.year,
            startDate: values.startDate,
            endDate: values.endDate,
          },
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: () => {
      submission.accepted();
      return refetchTheListAndTheCounters(queries, NETWORK_QUERY_KEYS.academicYearsList);
    },
  });
}
