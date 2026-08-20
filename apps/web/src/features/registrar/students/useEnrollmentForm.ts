import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import type { BaseSyntheticEvent } from 'react';
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { applyRefusal } from '../../../shared/api';
import { useNotices } from '../../../shared/ui/notices';
import { REGISTRAR_NOTICES } from '../constants';
import { useEnroll } from '../mutations';
import { ENROLLMENT_FIELDS, enrollmentSchema, type EnrollmentValues } from '../schemas';
import { studentRecordAddress } from './addresses';

const BLANK_ENROLLMENT: EnrollmentValues = {
  classGroupId: '',
  academicYearId: '',
  enrollmentDate: '',
};

export type NewEnrollment = {
  readonly register: UseFormRegister<EnrollmentValues>;
  readonly errors: FieldErrors<EnrollmentValues>;
  readonly warning: string | undefined;
  readonly isEnrolling: boolean;
  readonly submit: (event: BaseSyntheticEvent) => void;
};

export function useEnrollmentForm(studentId: string): NewEnrollment {
  const navigate = useNavigate();
  const notices = useNotices();
  const enroll = useEnroll(studentId);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EnrollmentValues>({
    resolver: standardSchemaResolver(enrollmentSchema),
    defaultValues: BLANK_ENROLLMENT,
  });

  const enrollStudent = handleSubmit((values) => {
    enroll.mutate(values, {
      onSuccess: () => {
        notices.success(REGISTRAR_NOTICES.studentEnrolled);
        void navigate(studentRecordAddress(studentId));
      },
      onError: (failure) => {
        applyRefusal(failure, setError, ENROLLMENT_FIELDS);
      },
    });
  });

  return {
    register,
    errors,
    warning: errors.root?.message,
    isEnrolling: enroll.isPending,
    submit: (event) => void enrollStudent(event),
  };
}
