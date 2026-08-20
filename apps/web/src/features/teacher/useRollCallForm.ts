import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useEffect, type BaseSyntheticEvent } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormRegister } from 'react-hook-form';
import type { RollCallScreen } from '@escolaviva/contracts/teacher';
import { WHOLE_FORM, applyErrors } from '../../shared/api';
import { useNotices } from '../../shared/ui/notices';
import type { AttendanceRowOnScreen } from './AttendanceGrid';
import { ATTENDANCE_RECORDED, ROLL_CALL_FIELD, type IsoDay } from './constants';
import { useRecordRollCall } from './mutations';
import { rollCallSchema, type RollCallValues } from './schemas';

const NOTHING_WRITTEN = '';

const asNote = (excuse: string): string | null => {
  const written = excuse.trim();
  return written === NOTHING_WRITTEN ? null : written;
};

export type RollCallForm = {
  readonly rows: readonly AttendanceRowOnScreen[];
  readonly register: UseFormRegister<RollCallValues>;
  readonly warning: string | undefined;
  readonly isRecording: boolean;
  readonly submit: (event: BaseSyntheticEvent) => void;
};

export function useRollCallForm(
  classGroupId: string,
  dayInTheAddress: IsoDay,
  answer: RollCallScreen | undefined,
): RollCallForm {
  const notices = useNotices();
  const record = useRecordRollCall(classGroupId);

  const {
    control,
    handleSubmit,
    register,
    setError,
    reset,
    formState: { errors },
  } = useForm<RollCallValues>({
    resolver: standardSchemaResolver(rollCallSchema),
    defaultValues: { rows: [] },
  });

  const { fields } = useFieldArray({ control, name: ROLL_CALL_FIELD.rows });
  const ticks = useWatch({ control, name: ROLL_CALL_FIELD.rows });

  useEffect(() => {
    if (answer === undefined) return;
    reset({
      rows: answer.rows.map((row) => ({
        enrollmentId: row.enrollmentId,
        studentName: row.studentName,
        present: row.present,
        excuse: row.excuse ?? NOTHING_WRITTEN,
      })),
    });
  }, [answer, reset]);

  const recordAttendance = handleSubmit((values) => {
    record.mutate(
      {
        date: answer?.date ?? dayInTheAddress,
        rows: values.rows.map((row) => ({
          enrollmentId: row.enrollmentId,
          present: row.present,
          excuse: asNote(row.excuse),
        })),
      },
      {
        onSuccess: () => notices.success(ATTENDANCE_RECORDED),
        onError: (failure) =>
          applyErrors(failure, setError, (message) => setError(WHOLE_FORM, { message }), []),
      },
    );
  });

  return {
    rows: fields.map((field, index) => ({
      id: field.id,
      studentName: field.studentName,
      absent: ticks?.[index]?.present === false,
    })),
    register,
    warning: errors.root?.message,
    isRecording: record.isPending,
    submit: (event) => void recordAttendance(event),
  };
}
