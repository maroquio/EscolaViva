import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { ApplicationError, ErrorBody } from '@escolaviva/contracts/errors';
import {
  API_PREFIX,
  HEADERS,
  JSON_CONTENT_TYPE,
  NETWORK_UNREACHABLE_CODE,
  REQUESTED_BY,
  SESSION_PATH,
  UNREACHABLE_SERVER,
} from './constants';
import { ApiError } from './error';

const SAME_ORIGIN = '';
const NO_CORRELATION_ID = '';
const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const KEYED_METHOD = 'post';
const DELETE_METHOD = 'delete';
const DEFAULT_METHOD = 'get';
const SESSION_EXPIRED_STATUS = 401;
const NO_RESPONSE_STATUS = 0;

export const IDEMPOTENCY_HEADER = HEADERS.idempotencyKey;

const NETWORK_ERROR: ApplicationError = {
  code: NETWORK_UNREACHABLE_CODE,
  message: UNREACHABLE_SERVER,
};

export const baseUrl = `${import.meta.env.VITE_API_URL ?? SAME_ORIGIN}${API_PREFIX}`;

export const client = axios.create({
  baseURL: baseUrl,
  withCredentials: true,
});

const keepJsonContentTypeEvenWithoutABody = (request: InternalAxiosRequestConfig): void => {
  request.data ??= {};
  request.headers.set(HEADERS.contentType, JSON_CONTENT_TYPE);
};

const mintKeyOnlyWhenTheCallerBroughtNone = (request: InternalAxiosRequestConfig): void => {
  if (request.headers.has(IDEMPOTENCY_HEADER)) return;
  request.headers.set(IDEMPOTENCY_HEADER, crypto.randomUUID());
};

client.interceptors.request.use((request) => {
  const method = (request.method ?? DEFAULT_METHOD).toLowerCase();
  if (!WRITE_METHODS.has(method)) return request;

  request.headers.set(HEADERS.requestedBy, REQUESTED_BY);
  if (method !== DELETE_METHOD) keepJsonContentTypeEvenWithoutABody(request);
  if (method === KEYED_METHOD) mintKeyOnlyWhenTheCallerBroughtNone(request);
  return request;
});

let notifyTheRouterOfExpiry: () => void = () => undefined;

export const onSessionExpired = (navigateToTheSignInScreen: () => void): void => {
  notifyTheRouterOfExpiry = navigateToTheSignInScreen;
};

const isAskingWhoIsSignedIn = (url: string | undefined): boolean =>
  url !== undefined && url.endsWith(SESSION_PATH);

const correlationIdOf = (body: Partial<ErrorBody>, echoedOnTheHeader: unknown): string =>
  body.correlationId ?? String(echoedOnTheHeader ?? NO_CORRELATION_ID);

client.interceptors.response.use(
  (response) => response,
  (failure: unknown) => {
    if (!axios.isAxiosError(failure) || failure.response === undefined) {
      return Promise.reject(new ApiError(NO_RESPONSE_STATUS, [NETWORK_ERROR], NO_CORRELATION_ID));
    }

    const { status, config, headers } = failure.response;
    const body = failure.response.data as Partial<ErrorBody>;

    if (status === SESSION_EXPIRED_STATUS && !isAskingWhoIsSignedIn(config.url)) {
      notifyTheRouterOfExpiry();
    }

    const correlationId = correlationIdOf(body, headers[HEADERS.correlationId]);
    return Promise.reject(new ApiError(status, body.errors ?? [], correlationId));
  },
);
