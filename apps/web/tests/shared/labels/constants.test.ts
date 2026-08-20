import { describe, expect, test } from 'vitest';
import { ENROLLMENT_STATUSES, SHIFTS } from '@escolaviva/contracts/enumerations';
import { SHIFT_LABELS, STATUS_COLOURS, STATUS_LABELS } from '../../../src/shared/labels/constants';

describe('the words a screen shows in place of the value the API sends', () => {
  test('every enrollment status has a label, so no screen ever shows a person the word transferred', () => {
    for (const status of ENROLLMENT_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }

    expect(Object.keys(STATUS_LABELS)).toHaveLength(ENROLLMENT_STATUSES.length);
  });

  test('every shift has a label, so no screen ever shows a person the word full_time', () => {
    for (const shift of SHIFTS) {
      expect(SHIFT_LABELS[shift]).toBeTruthy();
    }

    expect(Object.keys(SHIFT_LABELS)).toHaveLength(SHIFTS.length);
  });

  test('every enrollment status has a colour, so a badge never falls back to the brand palette', () => {
    for (const status of ENROLLMENT_STATUSES) {
      expect(STATUS_COLOURS[status]).toBeTruthy();
    }

    expect(Object.keys(STATUS_COLOURS)).toHaveLength(ENROLLMENT_STATUSES.length);
  });
});
