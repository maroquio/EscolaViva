import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Page } from '@escolaviva/contracts/page';
import type {
  AcademicYearInList,
  NetworkDashboard,
  SchoolInList,
  UserInList,
} from '@escolaviva/contracts/network';
import type { SchoolOption } from '@escolaviva/contracts/options';
import { type ApiError, client, PAGE_PARAMS } from '../../shared/api';
import { NETWORK_API, NETWORK_QUERY_KEYS } from './constants';

const keepTheRowsUntilTheNextPageArrives = keepPreviousData;

const bodyOf = <T>(path: string): Promise<T> =>
  client.get<T>(path).then((response) => response.data);

const pageOf = <T>(path: string, page: number): Promise<Page<T>> =>
  client
    .get<Page<T>>(path, { params: { [PAGE_PARAMS.default]: page } })
    .then((response) => response.data);

export function useNetworkDashboard() {
  return useQuery<NetworkDashboard, ApiError>({
    queryKey: NETWORK_QUERY_KEYS.dashboard,
    queryFn: () => bodyOf<NetworkDashboard>(NETWORK_API.dashboard),
  });
}

export function useSchools(page: number) {
  return useQuery<Page<SchoolInList>, ApiError>({
    queryKey: NETWORK_QUERY_KEYS.schoolsPage(page),
    queryFn: () => pageOf<SchoolInList>(NETWORK_API.schools, page),
    placeholderData: keepTheRowsUntilTheNextPageArrives,
  });
}

export function useNetworkUsers(page: number) {
  return useQuery<Page<UserInList>, ApiError>({
    queryKey: NETWORK_QUERY_KEYS.usersPage(page),
    queryFn: () => pageOf<UserInList>(NETWORK_API.users, page),
    placeholderData: keepTheRowsUntilTheNextPageArrives,
  });
}

export function useAcademicYears(page: number) {
  return useQuery<Page<AcademicYearInList>, ApiError>({
    queryKey: NETWORK_QUERY_KEYS.academicYearsPage(page),
    queryFn: () => pageOf<AcademicYearInList>(NETWORK_API.academicYears, page),
    placeholderData: keepTheRowsUntilTheNextPageArrives,
  });
}

export function useSchoolOptions() {
  return useQuery<readonly SchoolOption[], ApiError>({
    queryKey: NETWORK_QUERY_KEYS.schoolOptions,
    queryFn: () => bodyOf<readonly SchoolOption[]>(NETWORK_API.schoolOptions),
  });
}
