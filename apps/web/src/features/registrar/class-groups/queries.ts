import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  ClassGroupInList,
  ClassGroupRecord,
  SubjectInList,
} from '@escolaviva/contracts/classGroups';
import type { Page } from '@escolaviva/contracts/page';
import type { SimpleOption } from '@escolaviva/contracts/shared';
import { type ApiError, client, PAGE_PARAMS } from '../../../shared/api';
import {
  CLASS_GROUPS_ENDPOINT,
  CLASS_GROUP_FILTER_PARAMS,
  NO_FILTER,
  SCHOOL_ID_PARAM,
  SUBJECTS_ENDPOINT,
  SUBJECT_OPTIONS_ENDPOINT,
  TEACHER_OPTIONS_ENDPOINT,
  UNKNOWN_SCHOOL,
} from './constants';

export type ClassGroupFilters = {
  readonly school: string;
  readonly year: string;
};

const CLASS_GROUP_LISTS = ['registrar', 'class-groups'] as const;
const CLASS_GROUP_RECORDS = ['registrar', 'class-group'] as const;
const SUBJECT_LISTS = ['registrar', 'subjects'] as const;
const SUBJECT_OPTIONS = ['options', 'subjects'] as const;
const TEACHER_OPTIONS = ['options', 'teachers'] as const;

export const classGroupKeys = {
  lists: CLASS_GROUP_LISTS,
  list: (filters: ClassGroupFilters, page: number) =>
    [...CLASS_GROUP_LISTS, filters.school, filters.year, page] as const,
  recordsOf: (id: string) => [...CLASS_GROUP_RECORDS, id] as const,
  record: (id: string, subjectsPage: number, enrollmentsPage: number) =>
    [...CLASS_GROUP_RECORDS, id, subjectsPage, enrollmentsPage] as const,
  subjectLists: SUBJECT_LISTS,
  subjectList: (page: number) => [...SUBJECT_LISTS, page] as const,
  subjectOptions: SUBJECT_OPTIONS,
  teacherOptions: (schoolId: string) => [...TEACHER_OPTIONS, schoolId] as const,
};

const chosenFilterParams = (filters: ClassGroupFilters): Record<string, string> => ({
  ...(filters.school === NO_FILTER ? {} : { [CLASS_GROUP_FILTER_PARAMS.school]: filters.school }),
  ...(filters.year === NO_FILTER ? {} : { [CLASS_GROUP_FILTER_PARAMS.year]: filters.year }),
});

const schoolIsKnown = (schoolId: string): boolean => schoolId !== UNKNOWN_SCHOOL;

export function useClassGroups(filters: ClassGroupFilters, page: number) {
  return useQuery<Page<ClassGroupInList>, ApiError>({
    queryKey: classGroupKeys.list(filters, page),
    queryFn: () =>
      client
        .get<Page<ClassGroupInList>>(CLASS_GROUPS_ENDPOINT, {
          params: { ...chosenFilterParams(filters), [PAGE_PARAMS.default]: page },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
  });
}

export function useClassGroupRecord(id: string, subjectsPage: number, enrollmentsPage: number) {
  return useQuery<ClassGroupRecord, ApiError>({
    queryKey: classGroupKeys.record(id, subjectsPage, enrollmentsPage),
    queryFn: () =>
      client
        .get<ClassGroupRecord>(`${CLASS_GROUPS_ENDPOINT}/${id}`, {
          params: {
            [PAGE_PARAMS.subjects]: subjectsPage,
            [PAGE_PARAMS.enrollments]: enrollmentsPage,
          },
        })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
  });
}

export function useSubjects(page: number) {
  return useQuery<Page<SubjectInList>, ApiError>({
    queryKey: classGroupKeys.subjectList(page),
    queryFn: () =>
      client
        .get<Page<SubjectInList>>(SUBJECTS_ENDPOINT, { params: { [PAGE_PARAMS.default]: page } })
        .then((response) => response.data),
    placeholderData: keepPreviousData,
  });
}

export function useSubjectOptions() {
  return useQuery<readonly SimpleOption[], ApiError>({
    queryKey: classGroupKeys.subjectOptions,
    queryFn: () =>
      client.get<readonly SimpleOption[]>(SUBJECT_OPTIONS_ENDPOINT).then((response) => response.data),
  });
}

export function useTeacherOptions(schoolId: string) {
  return useQuery<readonly SimpleOption[], ApiError>({
    queryKey: classGroupKeys.teacherOptions(schoolId),
    queryFn: () =>
      client
        .get<readonly SimpleOption[]>(TEACHER_OPTIONS_ENDPOINT, {
          params: { [SCHOOL_ID_PARAM]: schoolId },
        })
        .then((response) => response.data),
    enabled: schoolIsKnown(schoolId),
  });
}
