export const BATCH_PROBLEMS = {
  outsideTheSet: 'outside_the_set',
  duplicate: 'duplicate',
} as const;

export type BatchProblem = (typeof BATCH_PROBLEMS)[keyof typeof BATCH_PROBLEMS];

export function batchProblem(
  allowed: ReadonlySet<string>,
  submitted: readonly string[],
): BatchProblem | null {
  if (submitted.some((identifier) => !allowed.has(identifier))) {
    return BATCH_PROBLEMS.outsideTheSet;
  }
  if (new Set(submitted).size !== submitted.length) return BATCH_PROBLEMS.duplicate;
  return null;
}
