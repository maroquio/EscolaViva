import { cleanNotifications } from '@mantine/notifications';
import '@testing-library/jest-dom/vitest';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

export const server = setupServer();

const A_REQUEST_NO_HANDLER_DECLARES_FAILS_LOUDLY = { onUnhandledRequest: 'error' } as const;

beforeAll(() => server.listen(A_REQUEST_NO_HANDLER_DECLARES_FAILS_LOUDLY));
afterAll(() => server.close());

const cleanTheNoticeQueueUnmountingLeavesBehind = (): void => cleanNotifications();

afterEach(() => {
  server.resetHandlers();
  cleanTheNoticeQueueUnmountingLeavesBehind();
});

const aMediaQueryThatNeverMatches = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});

class AnObserverThatNeverFires {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const stubWhatJsdomLacksAndMantineUses = (): void => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: aMediaQueryThatNeverMatches,
  });
  window.ResizeObserver = AnObserverThatNeverFires;
};

stubWhatJsdomLacksAndMantineUses();
