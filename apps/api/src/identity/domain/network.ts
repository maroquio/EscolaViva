import { ACTIVE_NETWORK_STATUS, INTERNAL_ERRORS } from '../constants';

export const NETWORK_STATUSES = ['active', 'suspended', 'cancelled'] as const;

export type NetworkStatus = (typeof NETWORK_STATUSES)[number];

export type Network = { id: string; name: string; slug: string; status: NetworkStatus };

function isNetworkStatus(value: string): value is NetworkStatus {
  return (NETWORK_STATUSES as readonly string[]).includes(value);
}

export function toNetworkStatus(value: string): NetworkStatus {
  if (!isNetworkStatus(value)) throw new Error(INTERNAL_ERRORS.networkStatusOutOfDomain(value));
  return value;
}

export function isNetworkActive(network: Network): boolean {
  return network.status === ACTIVE_NETWORK_STATUS;
}
