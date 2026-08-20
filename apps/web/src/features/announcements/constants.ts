import { ANNOUNCEMENT_LABEL } from '../../shared/labels/constants';

export const ANNOUNCEMENT_ENDPOINTS = {
  announcements: '/announcements',
  recipients: '/announcements/recipients',
} as const;

export const SCHOOL_PARAM = 'schoolId';

export const NO_SCHOOL = '';

export const SCHOOL_AUDIENCE = 'unidade';
export const SELECTED_AUDIENCE = 'selecionados';

export const ANNOUNCEMENT_FIELD = {
  schoolId: 'schoolId',
  title: 'title',
  body: 'body',
  audience: 'audience',
  recipients: 'recipients',
} as const;

export const ANNOUNCEMENT_MESSAGES = {
  schoolId: 'Escolha a unidade.',
  title: 'Informe o título.',
  body: 'Escreva o comunicado.',
  audience: 'Escolha quem recebe.',
  recipients: 'Escolha ao menos um responsável.',
} as const;

export const ANNOUNCEMENT_SENT = 'Comunicado enviado.';

export const WHOLE_NETWORK = 'Toda a rede';

export const ANNOUNCEMENT_COLUMNS = {
  announcement: ANNOUNCEMENT_LABEL,
  sentAt: 'Enviado em',
  recipients: 'Destinatários',
  reads: 'Leituras',
  rate: 'Taxa',
} as const;
