import { MESSAGES } from '../constants';
import { TERMS } from './grade';

export type TermClosing = { term: number; closedAt: string };

export type TermClosingState = { term: number; closed: boolean; closedAt: string | null };

type ClosingPendingItem = { subjectName: string; missing: number };

export function closingStates(closed: readonly TermClosing[]): TermClosingState[] {
  return TERMS.map((term) => {
    const closing = closed.find((record) => record.term === term);
    return closing === undefined
      ? { term, closed: false, closedAt: null }
      : { term, closed: true, closedAt: closing.closedAt };
  });
}

export function allTermsClosed(states: readonly TermClosingState[]): boolean {
  return states.length === TERMS.length && states.every((state) => state.closed);
}

export function closingPendingItems(
  subjects: readonly { id: string; subjectName: string }[],
  activeEnrollments: number,
  postedBySubject: ReadonlyMap<string, number>,
): ClosingPendingItem[] {
  return subjects
    .map((subject) => ({
      subjectName: subject.subjectName,
      missing: activeEnrollments - (postedBySubject.get(subject.id) ?? 0),
    }))
    .filter((pendingItem) => pendingItem.missing > 0);
}

export function pendingItemsMessage(pendingItems: readonly ClosingPendingItem[]): string {
  const total = pendingItems.reduce((sum, pendingItem) => sum + pendingItem.missing, 0);
  const detail = pendingItems
    .map((pendingItem) => MESSAGES.closing.pendingItem(pendingItem.subjectName, pendingItem.missing))
    .join(MESSAGES.closing.pendingItemsSeparator);
  return total === 1
    ? MESSAGES.closing.singlePendingItem(detail)
    : MESSAGES.closing.manyPendingItems(total, detail);
}
