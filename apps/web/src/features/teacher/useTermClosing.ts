import { useState } from 'react';
import type { ApplicationError } from '@escolaviva/contracts/errors';
import { ApiError } from '../../shared/api';
import { useNotices } from '../../shared/ui/notices';
import { termClosed } from './constants';
import { useCloseTerm } from './mutations';

export type TermClosing = {
  readonly refusals: readonly ApplicationError[];
  readonly anyClosingRuns: boolean;
  readonly closeTerm: (term: number) => void;
};

export function useTermClosing(classGroupId: string): TermClosing {
  const notices = useNotices();
  const [refusals, setRefusals] = useState<readonly ApplicationError[]>([]);
  const close = useCloseTerm(classGroupId);

  const closeTerm = (term: number): void => {
    setRefusals([]);
    close.mutate(
      { term },
      {
        onSuccess: () => notices.success(termClosed(term)),
        onError: (failure) => {
          setRefusals(failure instanceof ApiError ? failure.errors : []);
        },
      },
    );
  };

  return { refusals, anyClosingRuns: close.isPending, closeTerm };
}
