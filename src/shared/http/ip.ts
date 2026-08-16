import { FORWARDED_SEPARATOR, HEADERS } from '../constants';

const forwardedChain = (req: Request): string[] =>
  (req.headers.get(HEADERS.forwarded) ?? '')
    .split(FORWARDED_SEPARATOR)
    .map((address) => address.trim())
    .filter((address) => address.length > 0);

export function clientIp(
  req: Request,
  remoteAddress: string | undefined,
  trustedProxies: string[],
): string {
  const remote = remoteAddress ?? '';
  if (trustedProxies.length === 0) return remote;

  const trusted = new Set(trustedProxies.map((proxy) => proxy.trim()));
  const chain = forwardedChain(req);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const candidate = chain[i];
    if (candidate !== undefined && !trusted.has(candidate)) return candidate;
  }
  return remote;
}
