import { useQuery } from '@tanstack/react-query';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';
import { type ApiError, client } from '../../shared/api';
import { SESSION_ENDPOINT, SESSION_FRESH_FOR_MS, SESSION_QUERY_KEY } from './constants';

export const sessionKey = SESSION_QUERY_KEY;

export function useSession() {
  return useQuery<SessionUserAsJson, ApiError>({
    queryKey: sessionKey,
    queryFn: () =>
      client
        .get<{ user: SessionUserAsJson }>(SESSION_ENDPOINT)
        .then((response) => response.data.user),
    retry: false,
    staleTime: SESSION_FRESH_FOR_MS,
  });
}
