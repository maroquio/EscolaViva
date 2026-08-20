import { useCallback, useRef } from 'react';
import type { AxiosRequestConfig } from 'axios';
import { IDEMPOTENCY_HEADER } from './client';

export type Submission = {
  readonly attempt: () => AxiosRequestConfig;
  readonly accepted: () => void;
};

export function useSubmission(): Submission {
  const keyOfTheSubmission = useRef<string>(crypto.randomUUID());

  const attempt = useCallback(
    (): AxiosRequestConfig => ({ headers: { [IDEMPOTENCY_HEADER]: keyOfTheSubmission.current } }),
    [],
  );

  const accepted = useCallback((): void => {
    keyOfTheSubmission.current = crypto.randomUUID();
  }, []);

  return { attempt, accepted };
}
