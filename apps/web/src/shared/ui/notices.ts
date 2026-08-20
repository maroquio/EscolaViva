import { notifications } from '@mantine/notifications';
import {
  AGREEMENT_COLOUR,
  ALERT_ROLE,
  DISMISS_NOTICE_LABEL,
  REFUSAL_COLOUR,
  STATUS_ROLE,
} from './constants';

const A_REFUSAL_NEVER_CLOSES_ON_ITS_OWN = false;
const NAMED_DISMISS_BUTTON = { closeButtonProps: { 'aria-label': DISMISS_NOTICE_LABEL } };

export type Notices = {
  success(message: string): void;
  error(message: string): void;
  clear(): void;
};

export const notices: Notices = {
  success: (message) => {
    notifications.show({
      ...NAMED_DISMISS_BUTTON,
      message,
      color: AGREEMENT_COLOUR,
      role: STATUS_ROLE,
    });
  },
  error: (message) => {
    notifications.show({
      ...NAMED_DISMISS_BUTTON,
      message,
      color: REFUSAL_COLOUR,
      autoClose: A_REFUSAL_NEVER_CLOSES_ON_ITS_OWN,
      role: ALERT_ROLE,
    });
  },
  clear: () => {
    notifications.clean();
  },
};

export function useNotices(): Notices {
  return notices;
}
