import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Page } from '@escolaviva/contracts/page';
import type {
  GuardianInList,
  RegistrarDashboard,
  StudentInList,
  StudentRecord,
  TransferView,
} from '@escolaviva/contracts/students';
import type {
  AcademicYearOption,
  ClassGroupOption,
} from '@escolaviva/contracts/options';
import type { SimpleOption } from '@escolaviva/contracts/shared';
import { type ApiError, client, PAGE_PARAMS } from '../../shared/api';
import {
  OPTIONS_API,
  REGISTRAR_API,
  REGISTRAR_QUERY_KEYS,
  SEARCH_TERM_PARAM,
} from './constants';

const NO_TERM = '';

export const registrarKeys = REGISTRAR_QUERY_KEYS;

export function useRegistrarDashboard(page: number) {
  return useQuery<RegistrarDashboard, ApiError>({
    queryKey: registrarKeys.dashboard(page),
    queryFn: () =>
      client
        .get<RegistrarDashboard>(REGISTRAR_API.dashboard, {
          params: { [PAGE_PARAMS.default]: page },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
  });
}

export function useStudentSearch(term: string, page: number) {
  return useQuery<Page<StudentInList>, ApiError>({
    queryKey: registrarKeys.studentSearch(term, page),
    queryFn: () =>
      client
        .get<Page<StudentInList>>(REGISTRAR_API.students, {
          params: { [SEARCH_TERM_PARAM]: term, [PAGE_PARAMS.default]: page },
        })
        .then((response) => response.data),
    enabled: term !== NO_TERM,
    placeholderData: keepPreviousData,
  });
}

export function useStudentRecord(
  studentId: string,
  guardiansPage: number,
  enrollmentsPage: number,
) {
  return useQuery<StudentRecord, ApiError>({
    queryKey: registrarKeys.studentRecord(studentId, guardiansPage, enrollmentsPage),
    queryFn: () =>
      client
        .get<StudentRecord>(REGISTRAR_API.student(studentId), {
          params: {
            [PAGE_PARAMS.guardians]: guardiansPage,
            [PAGE_PARAMS.enrollments]: enrollmentsPage,
          },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
  });
}

export function useAvailableGuardians(studentId: string) {
  return useQuery<readonly SimpleOption[], ApiError>({
    queryKey: registrarKeys.availableGuardians(studentId),
    queryFn: () =>
      client
        .get<readonly SimpleOption[]>(REGISTRAR_API.availableGuardians(studentId))
        .then((response) => response.data),
  });
}

export function useGuardians(page: number) {
  return useQuery<Page<GuardianInList>, ApiError>({
    queryKey: registrarKeys.guardians(page),
    queryFn: () =>
      client
        .get<Page<GuardianInList>>(REGISTRAR_API.guardians, {
          params: { [PAGE_PARAMS.default]: page },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
  });
}

export function useTransferView(enrollmentId: string) {
  return useQuery<TransferView, ApiError>({
    queryKey: registrarKeys.transfer(enrollmentId),
    queryFn: () =>
      client
        .get<TransferView>(REGISTRAR_API.enrollmentTransfer(enrollmentId))
        .then((response) => response.data),
  });
}

export function useClassGroupOptions() {
  return useQuery<readonly ClassGroupOption[], ApiError>({
    queryKey: registrarKeys.classGroupOptions,
    queryFn: () =>
      client
        .get<readonly ClassGroupOption[]>(OPTIONS_API.classGroups)
        .then((response) => response.data),
  });
}

export function useAcademicYearOptions() {
  return useQuery<readonly AcademicYearOption[], ApiError>({
    queryKey: registrarKeys.academicYearOptions,
    queryFn: () =>
      client
        .get<readonly AcademicYearOption[]>(OPTIONS_API.academicYears)
        .then((response) => response.data),
  });
}
