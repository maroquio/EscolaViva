import { FORBIDDEN_LOG_KEYS, LOG } from '../constants';

export type LogFields = Record<string, unknown>;

export { FORBIDDEN_LOG_KEYS } from '../constants';

const FORBIDDEN = new Set(FORBIDDEN_LOG_KEYS.map((key) => key.toLowerCase()));

export function redact(fields: LogFields): LogFields {
  return redactBranch(fields, 1, new WeakSet<object>());
}

function redactBranch(
  object: Record<string, unknown>,
  depth: number,
  visited: WeakSet<object>,
): LogFields {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    output[key] = FORBIDDEN.has(key.toLowerCase())
      ? LOG.redactedValue
      : redactValue(value, depth, visited);
  }
  return output;
}

function redactValue(value: unknown, depth: number, visited: WeakSet<object>): unknown {
  if (!isList(value) && !isPlainObject(value)) return value;
  if (depth >= LOG.maxDepth) return LOG.redactedValue;
  if (visited.has(value)) return LOG.redactedValue;

  visited.add(value);
  const redacted = isList(value)
    ? value.map((item) => redactValue(item, depth + 1, visited))
    : redactBranch(value, depth + 1, visited);
  visited.delete(value);
  return redacted;
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
