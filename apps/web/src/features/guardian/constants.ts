import type { FinalStatus } from '@escolaviva/contracts/guardian';
import { EXCUSE_LABEL, PRESENT_LABEL } from '../../shared/labels/constants';
import { AGREEMENT_COLOUR, NOTICE_COLOUR, REFUSAL_COLOUR } from '../../shared/ui/constants';

const BOARD = '/guardian/board';
const ENROLLMENTS = '/guardian/enrollments';

export const GUARDIAN_ENDPOINTS = {
  dashboard: '/guardian/dashboard',
  board: BOARD,
  announcement: (announcementId: string): string => `${BOARD}/${announcementId}`,
  markAsRead: (announcementId: string): string => `${BOARD}/${announcementId}/read`,
  reportCard: (enrollmentId: string): string => `${ENROLLMENTS}/${enrollmentId}/report-card`,
  attendance: (enrollmentId: string): string => `${ENROLLMENTS}/${enrollmentId}/attendance`,
} as const;

const MINUTES_FRESH = 5;
const MILLISECONDS_PER_MINUTE = 60_000;

export const GUARDIAN_FRESH_FOR_MS = MINUTES_FRESH * MILLISECONDS_PER_MINUTE;

export const GUARDIAN_OVERLINE = 'Acompanhamento';
export const BOARD_OVERLINE = 'Acompanhamento · Mural';
export const BOARD_TITLE = 'Mural';

export const BACK_TO_MY_STUDENTS = 'Voltar para meus alunos';
export const BACK_TO_BOARD = 'Voltar para o mural';

const GUARDIAN_KEY = ['guardian'] as const;
const DASHBOARD_KEY = [...GUARDIAN_KEY, 'dashboard'] as const;
const BOARD_KEY = [...GUARDIAN_KEY, 'board'] as const;

export const GUARDIAN_QUERY_KEYS = {
  all: GUARDIAN_KEY,
  dashboards: DASHBOARD_KEY,
  dashboard: (page: number) => [...DASHBOARD_KEY, page] as const,
  reportCard: (enrollmentId: string) => [...GUARDIAN_KEY, 'report-card', enrollmentId] as const,
  attendance: (enrollmentId: string, page: number) =>
    [...GUARDIAN_KEY, 'attendance', enrollmentId, page] as const,
  boards: BOARD_KEY,
  board: (unreadPage: number, readPage: number) =>
    [...BOARD_KEY, unreadPage, readPage] as const,
  announcement: (announcementId: string) =>
    [...GUARDIAN_KEY, 'announcement', announcementId] as const,
};

export const FINAL_STATUS_LABELS: Record<FinalStatus, string> = {
  in_progress: 'Em andamento',
  passed: 'Aprovado',
  failed: 'Reprovado',
};

export const FINAL_STATUS_COLOURS: Record<FinalStatus, string> = {
  in_progress: NOTICE_COLOUR,
  passed: AGREEMENT_COLOUR,
  failed: REFUSAL_COLOUR,
};

export const ATTENDANCE_COLUMNS = {
  day: 'Dia',
  presence: 'Presença',
  excuse: EXCUSE_LABEL,
} as const;

export const PRESENCE_LABELS = { present: PRESENT_LABEL, absent: 'Falta' } as const;

export const KEEPS_THE_LINE_BREAKS = 'pre-wrap';

export const MARKED_AS_READ = 'Comunicado marcado como lido.';
