import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  CreatedRecord,
  InvitedGuardian,
  LinkedGuardian,
} from '@escolaviva/contracts/students';
import { type ApiError, FIRST_PAGE, client, useSubmission } from '../../shared/api';
import type { Written } from '../network/mutations';
import { REGISTRAR_API } from './constants';
import { registrarKeys } from './queries';
import type {
  EnrollmentValues,
  GuardianLinkValues,
  GuardianValues,
  StudentValues,
  TransferValues,
} from './schemas';

const omitIfBlank = (value: string): string | undefined => (value === '' ? undefined : value);

const invitation = (values: GuardianValues) => ({
  name: values.name,
  email: values.email,
  cpf: values.cpf,
  phone: omitIfBlank(values.phone),
  schoolId: omitIfBlank(values.schoolId),
});

const refreshStudentSearches = (queries: QueryClient): Promise<void> =>
  queries.invalidateQueries({ queryKey: registrarKeys.allStudentSearches });

const refreshOneStudentRecord = (queries: QueryClient, studentId: string): Promise<void> =>
  queries.invalidateQueries({ queryKey: registrarKeys.studentRecords(studentId) });

const refreshEveryStudentRecord = (queries: QueryClient): Promise<void> =>
  queries.invalidateQueries({ queryKey: registrarKeys.allStudentRecords });

const refreshAvailableGuardians = (queries: QueryClient, studentId: string): Promise<void> =>
  queries.invalidateQueries({ queryKey: registrarKeys.availableGuardians(studentId) });

const refreshFirstPageOfGuardians = (queries: QueryClient): Promise<void> =>
  queries.invalidateQueries({ queryKey: registrarKeys.guardians(FIRST_PAGE) });

const refreshTransferView = (queries: QueryClient, enrollmentId: string): Promise<void> =>
  queries.invalidateQueries({ queryKey: registrarKeys.transfer(enrollmentId) });

export function useRegisterStudent() {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<CreatedRecord>, ApiError, StudentValues>({
    mutationFn: (values) =>
      client
        .post<Written<CreatedRecord>>(REGISTRAR_API.students, values, submission.attempt())
        .then((response) => response.data),
    onSuccess: () => {
      submission.accepted();
      return refreshStudentSearches(queries);
    },
  });
}

export function useLinkGuardian(studentId: string) {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<LinkedGuardian>, ApiError, GuardianLinkValues>({
    mutationFn: (values) =>
      client
        .post<Written<LinkedGuardian>>(
          REGISTRAR_API.studentGuardians(studentId),
          values,
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: async () => {
      submission.accepted();
      await Promise.all([
        refreshOneStudentRecord(queries, studentId),
        refreshAvailableGuardians(queries, studentId),
      ]);
    },
  });
}

export function useInviteGuardian() {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<InvitedGuardian>, ApiError, GuardianValues>({
    mutationFn: (values) =>
      client
        .post<Written<InvitedGuardian>>(
          REGISTRAR_API.guardians,
          invitation(values),
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: () => {
      submission.accepted();
      return refreshFirstPageOfGuardians(queries);
    },
  });
}

export function useEnroll(studentId: string) {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<CreatedRecord>, ApiError, EnrollmentValues>({
    mutationFn: (values) =>
      client
        .post<Written<CreatedRecord>>(
          REGISTRAR_API.enrollments,
          { ...values, studentId },
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: async () => {
      submission.accepted();
      await Promise.all([
        refreshOneStudentRecord(queries, studentId),
        refreshStudentSearches(queries),
      ]);
    },
  });
}

export function useTransfer(enrollmentId: string) {
  const queries = useQueryClient();
  const submission = useSubmission();
  return useMutation<Written<CreatedRecord>, ApiError, TransferValues>({
    mutationFn: (values) =>
      client
        .post<Written<CreatedRecord>>(
          REGISTRAR_API.enrollmentTransfer(enrollmentId),
          values,
          submission.attempt(),
        )
        .then((response) => response.data),
    onSuccess: async () => {
      submission.accepted();
      await Promise.all([
        refreshEveryStudentRecord(queries),
        refreshStudentSearches(queries),
        refreshTransferView(queries, enrollmentId),
      ]);
    },
  });
}
