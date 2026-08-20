export const SHIFTS = ['morning', 'afternoon', 'evening', 'full_time'] as const;

// magic-values: allowed — restated, not imported: contracts/ is bundled by the browser and may import nothing, so these mirror identity/ROLE and tests/api/contracts.test.ts asserts they stay equal.
export const ROLES = ['network_admin', 'registrar', 'teacher', 'guardian'] as const;

export const TERMS = [1, 2, 3, 4] as const;

// magic-values: allowed — restated, not imported: contracts/ is bundled by the browser and may import nothing, so these mirror academics/ENROLLMENT_STATUSES and tests/api/contracts.test.ts asserts they stay equal.
export const ENROLLMENT_STATUSES = ['active', 'transferred', 'cancelled', 'completed'] as const;

export type Shift = (typeof SHIFTS)[number];
export type Role = (typeof ROLES)[number];
export type Term = (typeof TERMS)[number];
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
