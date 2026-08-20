import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubmission } from '../../../src/shared/api/submission';

const keyOf = (attempt: { headers?: unknown }): string =>
  ((attempt.headers ?? {}) as Record<string, string>)['Idempotency-Key'] ?? '';

describe('useSubmission — the key outlives the request and dies with the submission, because the guardian on bad 4G who taps submit twice sends two requests, and a key minted per request never repeats, so the server sees two keys and creates two records (I4)', () => {
  test('every attempt at one submission carries the same key', () => {
    const { result } = renderHook(() => useSubmission());

    const first = keyOf(result.current.attempt());
    const second = keyOf(result.current.attempt());

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  test('the key survives a re-render, which is what a second tap gets', () => {
    const { result, rerender } = renderHook(() => useSubmission());
    const before = keyOf(result.current.attempt());

    rerender();

    expect(keyOf(result.current.attempt())).toBe(before);
  });

  test('once the server accepted one, the next submission is a different one', () => {
    const { result } = renderHook(() => useSubmission());
    const accepted = keyOf(result.current.attempt());

    act(() => {
      result.current.accepted();
    });

    expect(keyOf(result.current.attempt())).not.toBe(accepted);
  });
});
