export const ENROLLMENT_STATUSES = ['active', 'transferred', 'cancelled', 'completed'] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ACTIVE_ENROLLMENT_STATUS: EnrollmentStatus = ENROLLMENT_STATUSES[0];

export type Enrollment = {
  id: string;
  networkId: string;
  studentId: string;
  studentName: string;
  classGroupId: string;
  classGroupName: string;
  schoolId: string;
  academicYearId: string;
  year: number;
  enrollmentDate: string;
  status: EnrollmentStatus;
};

export function isValidEnrollmentStatus(value: string): value is EnrollmentStatus {
  return ENROLLMENT_STATUSES.some((status) => status === value);
}

export function canTransfer(enrollment: Enrollment): boolean {
  return enrollment.status === ACTIVE_ENROLLMENT_STATUS;
}
