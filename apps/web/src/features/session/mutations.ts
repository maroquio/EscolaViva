import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';
import { type ApiError, client } from '../../shared/api';
import { PASSWORD_ENDPOINT, SESSION_ENDPOINT } from './constants';
import { sessionKey } from './queries';

export type SignInInput = {
  readonly networkSlug: string;
  readonly cpf: string;
  readonly password: string;
};

export type ChangePasswordInput = {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly passwordConfirmation: string;
};

export function useSignIn() {
  const queries = useQueryClient();
  return useMutation<SessionUserAsJson, ApiError, SignInInput>({
    mutationFn: (input) =>
      client
        .post<{ user: SessionUserAsJson }>(SESSION_ENDPOINT, input)
        .then((response) => response.data.user),
    onSuccess: (signedInUser) => queries.setQueryData(sessionKey, signedInUser),
  });
}

export function useSignOut() {
  const queries = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => client.delete(SESSION_ENDPOINT).then(() => undefined),
    onSettled: () => queries.clear(),
  });
}

export function useChangePassword() {
  return useMutation<void, ApiError, ChangePasswordInput>({
    mutationFn: (input) => client.put(PASSWORD_ENDPOINT, input).then(() => undefined),
  });
}
